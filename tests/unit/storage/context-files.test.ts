import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ file: { findMany: vi.fn() } }));
const client = vi.hoisted(() => ({ readStart: vi.fn() }));

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));
vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  accountScope: (ctx: { account: { id: string } }) => ({ accountId: ctx.account.id }),
  auditLogData: vi.fn(),
  recordAuditEvent: vi.fn(),
  requireEntitlement: vi.fn(),
  withinRateLimits: vi.fn(),
}));
vi.mock('../../../packages/storage/src/client.ts', () => ({
  head: vi.fn(),
  presignGet: vi.fn(),
  presignPut: vi.fn(),
  readStart: client.readStart,
  remove: vi.fn(),
}));

const { readContextFiles, MAX_CONTEXT_IMAGE_BYTES } = await import('../../../packages/storage/src/files');

const ctx = {
  user: { id: 'user_1', email: 'a@example.com', name: null, role: 'USER' as const },
  account: { id: 'acct_1' },
  membership: { role: 'OWNER' as const },
  session: { id: 'sess_1', expiresAt: new Date('2026-10-10T00:00:00.000Z') },
};

const pdf = new Uint8Array(readFileSync(new URL('../../fixtures/two-pages.pdf', import.meta.url)));
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function row(id: string, mimeType: string, sizeBytes: number, name = `${id}.file`) {
  return { id, name, mimeType, sizeBytes: BigInt(sizeBytes), storageKey: `accounts/acct_1/files/${id}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('readContextFiles', () => {
  it('looks files up only within the signed-in account, ready and not deleted', async () => {
    db.file.findMany.mockResolvedValue([]);
    expect(await readContextFiles(ctx, ['other-account-file'], 1000)).toEqual([]);
    expect(db.file.findMany.mock.calls[0]![0].where).toMatchObject({
      id: { in: ['other-account-file'] },
      accountId: 'acct_1',
      status: 'READY',
      deletedAt: null,
    });
    expect(client.readStart).not.toHaveBeenCalled();
  });

  it('extracts PDF text, keeps the requested order and leaves missing files out', async () => {
    db.file.findMany.mockResolvedValue([row('p1', 'application/pdf', pdf.length, 'report.pdf'), row('t1', 'text/plain', 5)]);
    client.readStart.mockImplementation(async (key: string) =>
      key.endsWith('p1') ? pdf : new TextEncoder().encode('hello'),
    );
    const files = await readContextFiles(ctx, ['t1', 'gone', 'p1'], 1000);
    expect(files.map((file) => file.id)).toEqual(['t1', 'p1']);
    expect(files[1]).toMatchObject({ kind: 'text', name: 'report.pdf', truncated: false });
    expect(files[1]!.kind === 'text' && files[1]!.text).toContain('Lagos office');
  });

  it('reads at most four bytes per allowed character of plain text', async () => {
    db.file.findMany.mockResolvedValue([row('t1', 'text/plain', 10_000_000)]);
    client.readStart.mockResolvedValue(new TextEncoder().encode('x'.repeat(400)));
    const [file] = await readContextFiles(ctx, ['t1'], 100);
    expect(client.readStart).toHaveBeenCalledWith('accounts/acct_1/files/t1', 400);
    expect(file).toMatchObject({ kind: 'text', truncated: true });
    expect(file!.kind === 'text' && file!.text).toHaveLength(100);
  });

  it('returns images as inline data and refuses oversized ones without reading them', async () => {
    db.file.findMany.mockResolvedValue([
      row('i1', 'image/png', png.length),
      row('i2', 'image/jpeg', MAX_CONTEXT_IMAGE_BYTES + 1),
    ]);
    client.readStart.mockResolvedValue(png);
    const files = await readContextFiles(ctx, ['i1', 'i2'], 1000);
    expect(files[0]).toEqual({
      kind: 'image',
      id: 'i1',
      name: 'i1.file',
      dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
    });
    expect(files[1]).toMatchObject({ kind: 'unreadable', reason: 'too_large' });
    expect(client.readStart).toHaveBeenCalledTimes(1);
  });

  it('marks damaged documents unreadable without logging their content', async () => {
    db.file.findMany.mockResolvedValue([row('p1', 'application/pdf', 20)]);
    client.readStart.mockResolvedValue(new TextEncoder().encode('%PDF-1.4 secret text'));
    const [file] = await readContextFiles(ctx, ['p1'], 1000);
    expect(file).toMatchObject({ kind: 'unreadable', reason: 'unreadable' });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret');
  });
});
