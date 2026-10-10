import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ resolveAccountContext: vi.fn(), withinRateLimits: vi.fn() }));
const projects = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  setProjectArchived: vi.fn(),
  deleteProject: vi.fn(),
}));
const nodes = vi.hoisted(() => ({
  getNode: vi.fn(),
  createNode: vi.fn(),
  updateNode: vi.fn(),
  saveContent: vi.fn(),
  moveNode: vi.fn(),
  duplicateNode: vi.fn(),
  trashNode: vi.fn(),
  listTrash: vi.fn(),
  restoreNode: vi.fn(),
  purgeNode: vi.fn(),
}));
const versions = vi.hoisted(() => ({ listVersions: vi.fn(), getVersion: vi.fn(), createVersion: vi.fn(), restoreVersion: vi.fn() }));
const research = vi.hoisted(() => ({ listResearch: vi.fn(), createResearch: vi.fn(), updateResearch: vi.fn(), deleteResearch: vi.fn() }));
const references = vi.hoisted(() => ({ listReferences: vi.fn(), attachReference: vi.fn(), detachReference: vi.fn() }));
const search = vi.hoisted(() => ({ search: vi.fn() }));
const exportsService = vi.hoisted(() => ({ createExport: vi.fn(), listExports: vi.fn(), downloadExport: vi.fn(), deleteExport: vi.fn() }));

vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  resolveAccountContext: auth.resolveAccountContext,
  withinRateLimits: auth.withinRateLimits,
}));
vi.mock('../../../apps/web/server/writer/projects.ts', () => projects);
vi.mock('../../../apps/web/server/writer/nodes.ts', () => nodes);
vi.mock('../../../apps/web/server/writer/versions.ts', () => versions);
vi.mock('../../../apps/web/server/writer/research.ts', () => research);
vi.mock('../../../apps/web/server/writer/references.ts', () => references);
vi.mock('../../../apps/web/server/writer/search.ts', () => search);
vi.mock('../../../apps/web/server/writer/export/service.ts', () => exportsService);

const { createTRPCRouter } = await import('../../../apps/web/server/api/trpc');
const { writerRouter } = await import('../../../apps/web/server/api/routers/writer');
const { AppError } = await import('../../../packages/validation/src/errors');

const router = createTRPCRouter({ writer: writerRouter });
const ctx = { account: { id: 'acct_1' }, user: { id: 'user_1' } };
const KEY = '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90';

function caller(resolveAccount = () => Promise.resolve(ctx)) {
  return router.createCaller({ requestId: 'req_1', resolveAccount: resolveAccount as never });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.withinRateLimits.mockResolvedValue(true);
});

describe('writer router', () => {
  it('requires a signed-in account for every procedure', async () => {
    const signedOut = caller(() => Promise.reject(new AppError('UNAUTHENTICATED')));
    const calls = [
      () => signedOut.writer.projects.list(),
      () => signedOut.writer.projects.get({ projectId: 'p1' }),
      () => signedOut.writer.projects.create({ title: 'T', documentType: 'BOOK' }),
      () => signedOut.writer.projects.delete({ projectId: 'p1' }),
      () => signedOut.writer.nodes.get({ nodeId: 'n1' }),
      () => signedOut.writer.nodes.save({ nodeId: 'n1', content: 'x', baseRevision: 1 }),
      () => signedOut.writer.versions.restore({ versionId: 'v1', baseRevision: 1 }),
      () => signedOut.writer.research.list({ projectId: 'p1' }),
      () => signedOut.writer.references.attach({ projectId: 'p1', fileId: 'f1' }),
      () => signedOut.writer.search({ query: 'river' }),
      () => signedOut.writer.exports.create({ projectId: 'p1', format: 'PDF', requestKey: KEY }),
      () => signedOut.writer.exports.download({ exportId: 'e1' }),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }

    for (const service of [projects, nodes, versions, research, references, search, exportsService]) {
      for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it('passes the session account, never client input, to the services', async () => {
    projects.listProjects.mockResolvedValue([]);
    nodes.saveContent.mockResolvedValue({ revision: 2 });
    exportsService.createExport.mockResolvedValue({ id: 'e1' });
    await caller().writer.projects.list();
    await caller().writer.nodes.save({ nodeId: 'n1', content: 'Text', baseRevision: 1 });
    await caller().writer.exports.create({ projectId: 'p1', format: 'DOCX', requestKey: KEY });
    expect(projects.listProjects).toHaveBeenCalledWith(ctx);
    expect(nodes.saveContent).toHaveBeenCalledWith(ctx, { nodeId: 'n1', content: 'Text', baseRevision: 1 }, 'req_1');
    expect(exportsService.createExport).toHaveBeenCalledWith(
      ctx,
      { projectId: 'p1', format: 'DOCX', requestKey: KEY },
      'req_1',
    );
  });

  it('rejects an account id or other unknown fields in the input', async () => {
    await expect(caller().writer.projects.get({ projectId: 'p1', accountId: 'acct_2' } as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      caller().writer.nodes.save({ nodeId: 'n1', content: 'x', baseRevision: 1, accountId: 'acct_2' } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(projects.getProject).not.toHaveBeenCalled();
    expect(nodes.saveContent).not.toHaveBeenCalled();
  });

  it('validates input before calling a service', async () => {
    await expect(caller().writer.nodes.move({ nodeId: 'n1', parentId: '../p', index: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller().writer.exports.create({ projectId: 'p1', format: 'PDF', requestKey: 'k' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(nodes.moveNode).not.toHaveBeenCalled();
    expect(exportsService.createExport).not.toHaveBeenCalled();
  });

  it('maps service errors: another account’s project is NOT_FOUND, a stale save is CONFLICT, no entitlement is PAYMENT_REQUIRED', async () => {
    projects.getProject.mockRejectedValue(new AppError('NOT_FOUND'));
    nodes.saveContent.mockRejectedValue(new AppError('CONFLICT', { reason: 'WRITER_STALE_REVISION' }));
    projects.createProject.mockRejectedValue(new AppError('TRIAL_EXPIRED'));
    await expect(caller().writer.projects.get({ projectId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller().writer.nodes.save({ nodeId: 'n1', content: 'x', baseRevision: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(caller().writer.projects.create({ title: 'T', documentType: 'BOOK' })).rejects.toMatchObject({
      code: 'PAYMENT_REQUIRED',
    });
  });
});
