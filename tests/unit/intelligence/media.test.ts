import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const client = {
    conversation: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    message: { create: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: typeof client) => unknown)(client) : Promise.all(arg as unknown[]),
  );
  return client;
});
const auth = vi.hoisted(() => ({ requireEntitlement: vi.fn() }));
const ai = vi.hoisted(() => ({ stream: vi.fn() }));
const storage = vi.hoisted(() => ({ readContextFiles: vi.fn() }));

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));
vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  accountScope: (ctx: { account: { id: string } }) => ({ accountId: ctx.account.id }),
  auditLogData: (event: Row) => event,
  recordAuditEvent: vi.fn(),
  requireEntitlement: auth.requireEntitlement,
}));
vi.mock('../../../packages/ai/src/index.ts', () => ({ stream: ai.stream }));
vi.mock('../../../packages/storage/src/index.ts', () => ({
  readContextFiles: storage.readContextFiles,
  MAX_CONTEXT_IMAGE_BYTES: 8 * 1024 * 1024,
}));

const service = await import('../../../apps/web/server/intelligence/service');
const { aiMessageText } = await import('../../../packages/validation/src/ai');

const ctx = {
  user: { id: 'user_1', email: 'a@example.com', name: null, role: 'USER' as const },
  account: { id: 'acct_1' },
  membership: { role: 'OWNER' as const },
  session: { id: 'sess_1', expiresAt: new Date('2026-10-10T00:00:00.000Z') },
};
const KEY = '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90';
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: null, estimated: false };
const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

function done() {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'text', text: 'Seen' };
      yield { type: 'done', model: 'google/gemini-3.8-flash', finishReason: 'stop', usage };
    },
  };
}

function send(overrides: Record<string, unknown> = {}) {
  return service.sendMessage(
    ctx,
    { content: 'What is in this?', capability: 'balanced', fileIds: [], requestKey: KEY, ...overrides },
    { requestId: 'req_1' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  auth.requireEntitlement.mockResolvedValue({ keys: ['intelligence'], proAccess: { allowed: true, source: 'TRIAL' } });
  db.conversation.create.mockResolvedValue({ id: 'conv_new' });
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.message.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: data.role === 'USER' ? 'm_u' : 'm_r' }));
  ai.stream.mockResolvedValue(done());
});

describe('attachments in Intelligence', () => {
  it('sends attached images with the message and stores only the file reference', async () => {
    storage.readContextFiles.mockResolvedValue([{ kind: 'image', id: 'img1', name: 'receipt.png', dataUrl: IMAGE }]);
    for await (const _ of await send({ fileIds: ['img1'] })) {
      // drain
    }
    const messages = ai.stream.mock.calls[0]![1].messages;
    const last = messages.at(-1);
    expect(last.role).toBe('user');
    expect(last.content[0].text).toContain('What is in this?');
    expect(last.content[1]).toEqual({ type: 'image_url', image_url: { url: IMAGE } });
    const stored = db.message.create.mock.calls[0]![0].data;
    expect(stored.metadata).toEqual({ files: [{ id: 'img1', name: 'receipt.png' }] });
    expect(JSON.stringify(stored)).not.toContain('base64');
  });

  it('explains why an attached file cannot be used, before calling the AI', async () => {
    const cases = [
      [{ kind: 'unreadable', id: 'f', name: 'scan.pdf', reason: 'no_text' }, 'no text'],
      [{ kind: 'unreadable', id: 'f', name: 'locked.pdf', reason: 'unreadable' }, 'password-protected'],
      [{ kind: 'unreadable', id: 'f', name: 'huge.png', reason: 'too_large' }, '8 MB'],
    ] as const;
    for (const [file, text] of cases) {
      storage.readContextFiles.mockResolvedValue([file]);
      await expect(send({ fileIds: ['f'] })).rejects.toMatchObject({
        reason: 'INTELLIGENCE_FILE_UNSUPPORTED',
        message: expect.stringContaining(text),
      });
    }
    storage.readContextFiles.mockResolvedValue([]);
    await expect(send({ fileIds: ['another-accounts-file'] })).rejects.toMatchObject({
      reason: 'INTELLIGENCE_FILE_UNSUPPORTED',
    });
    expect(ai.stream).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it('quietly leaves out earlier files that can no longer be read', async () => {
    db.conversation.findFirst.mockResolvedValue({
      title: 'Plan',
      messages: [{ role: 'USER', content: { text: 'Earlier' }, metadata: { files: [{ id: 'old', name: 'old.pdf' }] } }],
    });
    storage.readContextFiles.mockResolvedValue([{ kind: 'unreadable', id: 'old', name: 'old.pdf', reason: 'unreadable' }]);
    for await (const _ of await send({ conversationId: 'c1' })) {
      // drain
    }
    expect(storage.readContextFiles).toHaveBeenCalledWith(ctx, ['old'], service.FILE_CHARS);
    expect(ai.stream).toHaveBeenCalledTimes(1);
  });
});

describe('context budget', () => {
  const big = (id: string) => ({ kind: 'text' as const, id, name: `${id}.pdf`, text: 'x'.repeat(90_000), truncated: false });

  it('caps file text at 100,000 characters in total and marks what was cut', () => {
    const context = service.fileContext([big('a'), big('b'), big('c')], service.FILE_CHARS)!;
    expect(context.content.length).toBeLessThanOrEqual(service.FILE_CHARS);
    expect(context.content).toContain('<file name="a.pdf">');
    expect(context.content).toContain('<file name="b.pdf" truncated="true">');
    expect(context.content).not.toContain('c.pdf');
  });

  it('keeps the whole request within the gateway limit, dropping history first', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? ('USER' as const) : ('ASSISTANT' as const),
      text: `${index}`.repeat(9_000),
      files: [],
    }));
    const prompt = 'p'.repeat(20_000);
    const messages = service.buildMessages(history, [big('a'), big('b')], prompt);
    const total = messages.reduce((sum, message) => sum + aiMessageText(message).length, 0);
    expect(total).toBeLessThanOrEqual(service.REQUEST_CHARS);
    expect(messages.at(-1)).toEqual({ role: 'user', content: prompt });
  });
});
