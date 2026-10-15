import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const model = () => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  groupBy: vi.fn(),
});

const db = vi.hoisted(() => ({}) as Record<string, unknown>);
const auth = vi.hoisted(() => ({ requireEntitlement: vi.fn() }));
const storage = vi.hoisted(() => ({ deleteGeneratedFiles: vi.fn() }));

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));
vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  accountScope: (ctx: { account: { id: string } }) => ({ accountId: ctx.account.id }),
  auditLogData: (event: Row) => event,
  requireEntitlement: auth.requireEntitlement,
}));
vi.mock('../../../packages/storage/src/index.ts', () => ({
  deleteGeneratedFiles: storage.deleteGeneratedFiles,
  DOCUMENT_TYPES: ['text/plain', 'text/csv', 'application/pdf'],
}));

const projects = await import('../../../apps/web/server/writer/projects');
const nodes = await import('../../../apps/web/server/writer/nodes');
const versions = await import('../../../apps/web/server/writer/versions');
const { AppError } = await import('../../../packages/validation/src/errors');

const ctx = {
  user: { id: 'user_1', email: 'a@example.com', name: null, role: 'USER' as const },
  account: { id: 'acct_1' },
  membership: { role: 'OWNER' as const },
  session: { id: 'sess_1', expiresAt: new Date('2026-10-10T00:00:00.000Z') },
} as never;

type Model = ReturnType<typeof model>;
const m = (name: string) => db[name] as Model;

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['writerProject', 'writerNode', 'writerVersion', 'writerResearchItem', 'writerReference', 'writerExport', 'auditLog']) {
    db[name] = model();
  }
  db.$transaction = vi.fn(async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : arg));
  auth.requireEntitlement.mockResolvedValue(undefined);
  m('writerProject').update.mockResolvedValue({});
  m('writerVersion').create.mockResolvedValue({ id: 'v_new', versionNumber: 1 });
});

/** Every `where` passed to a model method includes the signed-in account. */
function expectScoped(target: Model) {
  for (const method of ['findMany', 'findFirst', 'count', 'updateMany', 'deleteMany', 'groupBy'] as const) {
    for (const [args] of target[method].mock.calls) {
      expect((args as { where: Row }).where).toMatchObject({ accountId: 'acct_1' });
    }
  }
}

describe('Writer projects', () => {
  it('needs the writer entitlement to create, and writes nothing without it', async () => {
    auth.requireEntitlement.mockRejectedValue(new AppError('TRIAL_EXPIRED'));
    await expect(
      projects.createProject(ctx, { title: 'Book', documentType: 'BOOK', language: 'en' }, 'req_1'),
    ).rejects.toMatchObject({ code: 'TRIAL_EXPIRED' });
    expect(auth.requireEntitlement).toHaveBeenCalledWith(ctx, 'writer', 'req_1');
    expect(m('writerProject').create).not.toHaveBeenCalled();
  });

  it('creates a project in the session account and audits it without the title', async () => {
    m('writerProject').count.mockResolvedValue(0);
    m('writerProject').create.mockResolvedValue({ id: 'p1' });
    await projects.createProject(ctx, { title: 'Secret Memoir', documentType: 'NOVEL', language: 'en' }, 'req_1');
    expect(m('writerProject').create.mock.calls[0]![0].data).toMatchObject({ accountId: 'acct_1', createdById: 'user_1' });
    const audit = m('auditLog').create.mock.calls[0]![0].data;
    expect(audit).toMatchObject({ action: 'CREATE', accountId: 'acct_1', resourceId: 'p1' });
    expect(JSON.stringify(audit)).not.toContain('Secret Memoir');
    expectScoped(m('writerProject'));
  });

  it('lists and reads only the account’s projects; another account’s project is not found', async () => {
    m('writerProject').findMany.mockResolvedValue([]);
    await projects.listProjects(ctx);
    m('writerProject').findFirst.mockResolvedValue(null);
    await expect(projects.getProject(ctx, 'p_other')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(m('writerProject').findFirst.mock.calls[0]![0].where).toMatchObject({
      id: 'p_other',
      accountId: 'acct_1',
      deletedAt: null,
    });
    expectScoped(m('writerProject'));
  });

  it('refuses edits to an archived project', async () => {
    m('writerProject').updateMany.mockResolvedValue({ count: 0 });
    m('writerProject').count.mockResolvedValue(1);
    await expect(projects.updateProject(ctx, { projectId: 'p1', title: 'New' }, 'req_1')).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'WRITER_PROJECT_ARCHIVED',
    });
    expect(m('writerProject').updateMany.mock.calls[0]![0].where).toMatchObject({ status: 'ACTIVE', accountId: 'acct_1' });
  });

  it('archives without the entitlement, so the account can organise work after the trial', async () => {
    m('writerProject').updateMany.mockResolvedValue({ count: 1 });
    await expect(projects.setProjectArchived(ctx, { projectId: 'p1', archived: true }, 'req_1')).resolves.toEqual({
      id: 'p1',
      status: 'ARCHIVED',
    });
    expect(auth.requireEntitlement).not.toHaveBeenCalled();
  });

  it('deletes a project with everything that depends on it, scoped to the account, then its exported files', async () => {
    m('writerProject').updateMany.mockResolvedValue({ count: 1 });
    m('writerExport').findMany.mockResolvedValue([{ fileId: 'f1' }, { fileId: 'f2' }]);
    for (const name of ['writerExport', 'writerVersion', 'writerNode', 'writerResearchItem', 'writerReference']) {
      m(name).deleteMany.mockResolvedValue({ count: 1 });
    }
    await projects.deleteProject(ctx, 'p1', 'req_1');
    for (const name of ['writerExport', 'writerVersion', 'writerNode', 'writerResearchItem', 'writerReference']) {
      expect(m(name).deleteMany).toHaveBeenCalledWith({ where: { accountId: 'acct_1', projectId: 'p1' } });
    }
    expect(m('writerProject').updateMany.mock.calls[0]![0].data).toMatchObject({ status: 'DELETED', description: null });
    expect(storage.deleteGeneratedFiles).toHaveBeenCalledWith(ctx, ['f1', 'f2'], 'req_1');
  });

  it('does not delete another account’s project', async () => {
    m('writerProject').updateMany.mockResolvedValue({ count: 0 });
    await expect(projects.deleteProject(ctx, 'p_other', 'req_1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(m('writerNode').deleteMany).not.toHaveBeenCalled();
    expect(storage.deleteGeneratedFiles).not.toHaveBeenCalled();
  });
});

describe('Writer content saves', () => {
  const stored = { id: 'n1', projectId: 'p1', title: 'Ch 1', content: 'Old', revision: 3 };

  it('refuses a save based on an older revision and changes nothing', async () => {
    m('writerNode').findFirst.mockResolvedValue(stored);
    await expect(
      nodes.saveContent(ctx, { nodeId: 'n1', content: 'Mine', baseRevision: 2 }, 'req_1'),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'WRITER_STALE_REVISION' });
    expect(m('writerNode').updateMany).not.toHaveBeenCalled();
  });

  it('loses cleanly to a concurrent save', async () => {
    m('writerNode').findFirst.mockResolvedValue(stored);
    m('writerNode').updateMany.mockResolvedValue({ count: 0 });
    await expect(
      nodes.saveContent(ctx, { nodeId: 'n1', content: 'Mine', baseRevision: 3 }, 'req_1'),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'WRITER_STALE_REVISION' });
    expect(m('writerNode').updateMany.mock.calls[0]![0].where).toMatchObject({ id: 'n1', accountId: 'acct_1', revision: 3 });
  });

  it('saves with counts and a new revision, keeping a version before an AI suggestion', async () => {
    m('writerNode').findFirst.mockResolvedValue(stored);
    m('writerNode').updateMany.mockResolvedValue({ count: 1 });
    m('writerVersion').findFirst.mockResolvedValue({ versionNumber: 4, createdAt: new Date(), content: 'Old' });
    const result = await nodes.saveContent(
      ctx,
      { nodeId: 'n1', content: 'Two new words', baseRevision: 3, keepVersion: 'AI' },
      'req_1',
    );
    expect(result).toMatchObject({ revision: 4, wordCount: 3, charCount: 13 });
    const version = m('writerVersion').create.mock.calls[0]![0].data;
    expect(version).toMatchObject({ source: 'AI', content: 'Old', accountId: 'acct_1', versionNumber: 5 });
    expect(m('writerVersion').create.mock.invocationCallOrder[0]!).toBeLessThan(
      m('writerNode').updateMany.mock.invocationCallOrder[0]!,
    );
    expectScoped(m('writerNode'));
  });

  it('refuses saves in an archived project and needs the entitlement', async () => {
    m('writerNode').findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ project: { status: 'ARCHIVED' } });
    await expect(nodes.saveContent(ctx, { nodeId: 'n1', content: 'x', baseRevision: 1 }, 'req_1')).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'WRITER_PROJECT_ARCHIVED',
    });

    auth.requireEntitlement.mockRejectedValue(new AppError('SUBSCRIPTION_REQUIRED'));
    await expect(nodes.saveContent(ctx, { nodeId: 'n1', content: 'x', baseRevision: 1 }, 'req_1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('reads another account’s part as not found', async () => {
    m('writerNode').findFirst.mockResolvedValue(null);
    await expect(nodes.getNode(ctx, 'n_other')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(m('writerNode').findFirst.mock.calls[0]![0].where).toMatchObject({ id: 'n_other', accountId: 'acct_1', deletedAt: null });
  });
});

describe('Writer structure changes', () => {
  it('never moves a part inside itself', async () => {
    m('writerNode').findFirst.mockResolvedValue({ id: 'p1', projectId: 'pr', parentId: null, kind: 'PART', title: 'P', position: 0 });
    m('writerNode').findMany.mockResolvedValue([
      { id: 'p1', parentId: null },
      { id: 'c1', parentId: 'p1' },
    ]);
    await expect(nodes.moveNode(ctx, { nodeId: 'p1', parentId: 'c1', index: 0 }, 'req_1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      reason: 'WRITER_INVALID_HIERARCHY',
    });
    expect(m('writerNode').update).not.toHaveBeenCalled();
  });

  it('keeps the documented hierarchy: a section cannot be at the top level', async () => {
    m('writerNode').findFirst.mockResolvedValue({ id: 's1', projectId: 'pr', parentId: 'c1', kind: 'SECTION', title: 'S', position: 0 });
    await expect(nodes.moveNode(ctx, { nodeId: 's1', parentId: null, index: 0 }, 'req_1')).rejects.toMatchObject({
      reason: 'WRITER_INVALID_HIERARCHY',
    });
    expect(m('writerNode').update).not.toHaveBeenCalled();
  });

  it('reorders siblings and renumbers both lists', async () => {
    m('writerNode').findFirst.mockResolvedValue({ id: 'b', projectId: 'pr', parentId: null, kind: 'CHAPTER', title: 'B', position: 1 });
    m('writerNode').findMany.mockResolvedValue([
      { id: 'a', parentId: null, kind: 'CHAPTER', title: 'A', position: 0 },
      { id: 'b', parentId: null, kind: 'CHAPTER', title: 'B', position: 1 },
    ]);
    await nodes.moveNode(ctx, { nodeId: 'b', parentId: null, index: 0 }, 'req_1');
    expect(m('writerNode').update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { parentId: null, position: 0 } });
    expect(m('writerNode').update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { position: 1 } });
    expectScoped(m('writerNode'));
  });
});

describe('Writer version restore', () => {
  const version = { id: 'v2', nodeId: 'n1', versionNumber: 2, title: 'Ch 1', content: 'Earlier text here' };
  const node = { id: 'n1', projectId: 'p1', title: 'Ch 1', content: 'Current', revision: 7 };

  it('keeps the current text, restores and audits in one transaction', async () => {
    m('writerVersion').findFirst.mockResolvedValueOnce(version).mockResolvedValueOnce({ versionNumber: 5 });
    m('writerNode').findFirst.mockResolvedValue(node);
    m('writerNode').updateMany.mockResolvedValue({ count: 1 });
    const result = await versions.restoreVersion(ctx, { versionId: 'v2', baseRevision: 7 }, 'req_1');
    expect(result).toMatchObject({ revision: 8, content: 'Earlier text here', wordCount: 3 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(m('writerVersion').create.mock.calls[0]![0].data).toMatchObject({ source: 'RESTORE', content: 'Current', versionNumber: 6 });
    expect(m('writerNode').updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'n1', accountId: 'acct_1', revision: 7 },
      data: { content: 'Earlier text here' },
    });
    const audit = m('auditLog').create.mock.calls[0]![0].data;
    expect(audit).toMatchObject({ action: 'UPDATE', resourceId: 'v2' });
    expect(JSON.stringify(audit)).not.toContain('Earlier text');
  });

  it('never restores over text the user has not seen', async () => {
    m('writerVersion').findFirst.mockResolvedValue(version);
    m('writerNode').findFirst.mockResolvedValue(node);
    await expect(versions.restoreVersion(ctx, { versionId: 'v2', baseRevision: 6 }, 'req_1')).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'WRITER_STALE_REVISION',
    });
    expect(m('writerVersion').create).not.toHaveBeenCalled();
    expect(m('writerNode').updateMany).not.toHaveBeenCalled();
  });

  it('cannot restore another account’s version', async () => {
    m('writerVersion').findFirst.mockResolvedValue(null);
    await expect(versions.restoreVersion(ctx, { versionId: 'v_other', baseRevision: 1 }, 'req_1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(m('writerVersion').findFirst.mock.calls[0]![0].where).toMatchObject({ id: 'v_other', accountId: 'acct_1' });
  });
});
