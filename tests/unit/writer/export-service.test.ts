import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const model = () => ({ findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() });
const db = vi.hoisted(() => ({}) as Record<string, unknown>);
const auth = vi.hoisted(() => ({ requireEntitlement: vi.fn() }));
const storage = vi.hoisted(() => ({ storeGeneratedFile: vi.fn(), deleteGeneratedFiles: vi.fn(), getDownloadUrl: vi.fn() }));

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));
vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  accountScope: (ctx: { account: { id: string } }) => ({ accountId: ctx.account.id }),
  auditLogData: (event: Row) => event,
  requireEntitlement: auth.requireEntitlement,
}));
vi.mock('../../../packages/storage/src/index.ts', () => storage);

const { createExport } = await import('../../../apps/web/server/writer/export/service');
const { AppError } = await import('../../../packages/validation/src/errors');

const ctx = { user: { id: 'user_1' }, account: { id: 'acct_1' } } as never;
const KEY = '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90';
const m = (name: string) => db[name] as ReturnType<typeof model>;
const project = { id: 'p1', title: 'River', subtitle: null, authorName: 'A. Writer', description: null, language: 'en', documentType: 'NOVEL' };
const row = { id: 'e1', format: 'EPUB', status: 'PROCESSING', fileName: 'River.epub', sizeBytes: null, nodeId: null, createdAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  for (const name of ['writerExport', 'writerProject', 'writerNode', 'usageRecord', 'auditLog']) db[name] = model();
  db.$transaction = vi.fn(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : arg));
  auth.requireEntitlement.mockResolvedValue(undefined);
  m('writerExport').findFirst.mockResolvedValue(null);
  m('writerProject').findFirst.mockResolvedValue(project);
  m('usageRecord').count.mockResolvedValue(0);
  m('writerNode').findMany.mockResolvedValue([
    { id: 'c1', parentId: null, kind: 'CHAPTER', title: 'One', position: 0, content: 'The rain came early.' },
  ]);
  m('writerExport').create.mockResolvedValue(row);
  m('writerExport').update.mockImplementation(async ({ data }: { data: Row }) => ({ ...row, ...data }));
  m('usageRecord').create.mockResolvedValue({});
  m('auditLog').create.mockResolvedValue({});
  storage.storeGeneratedFile.mockResolvedValue('f1');
  storage.deleteGeneratedFiles.mockResolvedValue(undefined);
});

describe('Writer exports', () => {
  it('needs the writer entitlement', async () => {
    auth.requireEntitlement.mockRejectedValue(new AppError('TRIAL_EXPIRED'));
    await expect(createExport(ctx, { projectId: 'p1', format: 'EPUB', requestKey: KEY }, 'req_1')).rejects.toMatchObject({
      code: 'TRIAL_EXPIRED',
    });
    expect(m('writerExport').create).not.toHaveBeenCalled();
  });

  it('returns the same export for a repeated request', async () => {
    m('writerExport').findFirst.mockResolvedValue({ ...row, status: 'READY' });
    const result = await createExport(ctx, { projectId: 'p1', format: 'EPUB', requestKey: KEY }, 'req_1');
    expect(result).toMatchObject({ id: 'e1', status: 'READY' });
    expect(m('writerExport').findFirst.mock.calls[0]![0].where).toEqual({ accountId: 'acct_1', requestKey: KEY });
    expect(storage.storeGeneratedFile).not.toHaveBeenCalled();
  });

  it('cannot export another account’s project or go over the daily limit', async () => {
    m('writerProject').findFirst.mockResolvedValueOnce(null);
    await expect(createExport(ctx, { projectId: 'p_other', format: 'PDF', requestKey: KEY }, 'req_1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(m('writerProject').findFirst.mock.calls[0]![0].where).toMatchObject({ id: 'p_other', accountId: 'acct_1' });

    m('usageRecord').count.mockResolvedValue(50);
    await expect(createExport(ctx, { projectId: 'p1', format: 'PDF', requestKey: KEY }, 'req_1')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      reason: 'WRITER_EXPORT_LIMIT_REACHED',
    });
    expect(m('writerExport').create).not.toHaveBeenCalled();
  });

  it('generates, validates and stores a private file, then records usage and an audit event', async () => {
    const result = await createExport(ctx, { projectId: 'p1', format: 'EPUB', requestKey: KEY }, 'req_1');
    expect(result).toMatchObject({ id: 'e1', status: 'READY', fileId: 'f1' });
    const [, file] = storage.storeGeneratedFile.mock.calls[0]!;
    expect(file).toMatchObject({ name: 'River.epub', mimeType: 'application/epub+zip' });
    expect(m('usageRecord').create.mock.calls[0]![0].data).toMatchObject({ usageType: 'EXPORT', accountId: 'acct_1' });
    expect(m('auditLog').create.mock.calls[0]![0].data).toMatchObject({ action: 'EXPORT', resourceId: 'e1' });
  });

  it('marks a failed export FAILED, removes a stored file and never touches the writing', async () => {
    m('usageRecord').create.mockRejectedValue(new Error('db down'));
    await expect(createExport(ctx, { projectId: 'p1', format: 'DOCX', requestKey: KEY }, 'req_1')).rejects.toMatchObject({
      reason: 'WRITER_EXPORT_FAILED',
    });
    expect(storage.deleteGeneratedFiles).toHaveBeenCalledWith(ctx, ['f1'], 'req_1');
    expect(m('writerExport').update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'e1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(m('writerNode').update).not.toHaveBeenCalled();
  });
});
