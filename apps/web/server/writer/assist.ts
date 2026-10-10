import { accountScope, type AccountContext } from '@aila/auth/server';
import { stream, type AiStreamEvent, type AiWebSearchOutcome } from '@aila/ai';
import { getDb } from '@aila/db';
import { readContextFiles, type ContextFile } from '@aila/storage';
import { AppError, isAppError, type WebSource, type WriterAssistInput } from '@aila/validation';
import { buildAssistMessages, clip, PREVIOUS_PART_CHARS, REFERENCE_CHARS, type OutlineEntry } from './prompt';
import { projectReferenceIds } from './references';
import { logWriterError, nodeNotFound, requireWriter, visibleNode } from './shared';
import { readingOrder } from './structure';

/**
 * Writer AI assistance (docs/products/WRITER.md §16-20, §43-44). The flow is
 * the documented one: Writer service → Aila AI Gateway (entitlement, usage
 * and rate limits, model routing, provider) → stream back. The result is a
 * suggestion only: nothing is written to the document here, so a failed or
 * cancelled request can never corrupt it (§19). The gateway records usage.
 */

export type AssistEvent =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'done';
      readonly webSearch: AiWebSearchOutcome;
      readonly sources: readonly WebSource[];
    }
  | { readonly type: 'error'; readonly appCode: string; readonly reason: string | null; readonly message: string };

/** Operations that use the project outline. */
const OUTLINE_OPERATIONS = new Set(['outline', 'brainstorm', 'continuity', 'continue', 'structure', 'research']);

function referenceError(file: ContextFile | undefined): AppError {
  if (!file) {
    return new AppError('NOT_FOUND', { message: 'A reference file is no longer available. Remove it and try again.' });
  }

  return new AppError('VALIDATION_ERROR', {
    reason: 'WRITER_REFERENCE_UNREADABLE',
    message:
      file.kind === 'unreadable' && file.reason === 'no_text'
        ? `We could not find any text in ${JSON.stringify(file.name)}. Scanned documents are not supported yet.`
        : `We could not read ${JSON.stringify(file.name)}. Check that it opens and is not password-protected.`,
  });
}

/**
 * Starts an AI request for a part of a project. Authorization, entitlement,
 * reference checks and the gateway's own checks all run before this
 * resolves; then the reply streams. A closed connection cancels the
 * provider request (§44).
 */
export async function assist(
  ctx: AccountContext,
  input: WriterAssistInput,
  options: { readonly requestId: string; readonly signal?: AbortSignal },
): Promise<AsyncGenerator<AssistEvent>> {
  const { requestId, signal } = options;
  await requireWriter(ctx, requestId);
  const db = getDb();

  const node = await db.writerNode.findFirst({
    where: visibleNode(ctx, input.nodeId),
    select: {
      id: true,
      projectId: true,
      parentId: true,
      kind: true,
      title: true,
      summary: true,
      content: true,
      position: true,
      project: {
        select: {
          title: true,
          subtitle: true,
          description: true,
          documentType: true,
          language: true,
          audience: true,
          authorName: true,
          goals: true,
          styleInstructions: true,
          terminology: true,
          contextNotes: true,
        },
      },
    },
  });

  if (!node) {
    throw nodeNotFound();
  }

  // Only files attached to this project, in this account (WRITER §27).
  const fileIds = await projectReferenceIds(ctx, node.projectId, input.fileIds);

  if (fileIds.length !== input.fileIds.length) {
    throw new AppError('NOT_FOUND', { message: 'That file is not attached to this project.' });
  }

  const files = await readContextFiles(ctx, fileIds, REFERENCE_CHARS);

  for (const id of fileIds) {
    const file = files.find((item) => item.id === id);

    if (!file || file.kind !== 'text') {
      throw referenceError(file);
    }
  }

  let outline: OutlineEntry[] = [];
  let previousEnding: string | null = null;

  if (OUTLINE_OPERATIONS.has(input.operation)) {
    const nodes = await db.writerNode.findMany({
      where: { ...accountScope(ctx), projectId: node.projectId, deletedAt: null },
      select: { id: true, parentId: true, kind: true, title: true, summary: true, position: true, wordCount: true },
    });
    outline = readingOrder(nodes);

    if (input.operation === 'continue' || input.operation === 'continuity') {
      // The closest earlier part with writing, in reading order.
      const index = outline.findIndex((entry) => entry.id === node.id);
      const earlier = outline.slice(0, Math.max(0, index)).reverse().find((entry) => entry.wordCount > 0);

      if (earlier) {
        const previous = await db.writerNode.findFirst({
          where: { id: earlier.id, ...accountScope(ctx), deletedAt: null },
          select: { content: true },
        });
        previousEnding = previous?.content.trim() ? clip(previous.content, PREVIOUS_PART_CHARS, 'end') : null;
      }
    }
  }

  const messages = buildAssistMessages({
    input,
    project: node.project,
    node,
    outline,
    previousEnding,
    files,
  });

  const events = await stream(
    ctx,
    {
      product: 'writer',
      capability: input.capability,
      messages,
      idempotencyKey: `writer:${input.requestKey}`,
      ...(input.operation === 'research' && input.webSearch === 'on' ? { webSearch: 'required' as const } : {}),
    },
    { requestId, signal },
  );
  const iterator = events[Symbol.asyncIterator]();

  async function* run(): AsyncGenerator<AssistEvent> {
    let finished = false;

    try {
      for (;;) {
        const next: IteratorResult<AiStreamEvent> = await iterator.next();

        if (next.done) {
          throw new AppError('INTERNAL_ERROR');
        }

        const event = next.value;

        if (event.type === 'text') {
          yield { type: 'text', text: event.text };
          continue;
        }

        finished = true;
        yield { type: 'done', webSearch: event.webSearch, sources: event.sources };
        return;
      }
    } catch (error) {
      finished = true;

      if (signal?.aborted) {
        return;
      }

      if (!isAppError(error)) {
        logWriterError('assist', requestId, error);
      }

      const appError = isAppError(error) ? error : new AppError('INTERNAL_ERROR');
      yield { type: 'error', appCode: appError.code, reason: appError.reason ?? null, message: appError.message };
    } finally {
      if (!finished) {
        // The reader went away: stop the provider request.
        await iterator.return?.(undefined);
      }
    }
  }

  return run();
}
