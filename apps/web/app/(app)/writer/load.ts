import { TRPCError } from '@trpc/server';
import { notFound } from 'next/navigation';
import { DOCUMENT_TYPES } from '@aila/storage';
import { FILE_TYPE_LABELS, isAppError } from '@aila/validation';
import type { WriterEditorData } from '../../../components/writer/editor-view';
import type { WriterHomeData } from '../../../components/writer/writer-home';
import type { WriterProjectData } from '../../../components/writer/project-view';
import { loadPageData, type PageData } from '../../../server/api/caller';

function isNotFound(error: unknown): boolean {
  const cause = error instanceof TRPCError ? error.cause : error;
  return isAppError(cause) && cause.code === 'NOT_FOUND';
}

/** Turns a NOT_FOUND from the API into the 404 page; other errors go to loadPageData. */
async function orMissing<T>(promise: Promise<T>, missing: { value: boolean }): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isNotFound(error)) {
      missing.value = true;
      return null;
    }
    throw error;
  }
}

function formatter(settings: { readonly locale: string; readonly timezone: string }) {
  const format = new Intl.DateTimeFormat(settings.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: settings.timezone,
  });
  return (iso: string) => format.format(new Date(iso));
}

/** Writer home: the account's projects (WRITER §6). Access is decided on the server. */
export async function loadWriterHome(): Promise<PageData<WriterHomeData>> {
  return loadPageData('/writer', async (api) => {
    const [overview, projects, entitlements, trial] = await Promise.all([
      api.account.me(),
      api.writer.projects.list(),
      api.account.entitlements(),
      api.account.trial(),
    ]);
    const format = formatter(overview.settings);

    return {
      projects: projects.map((project) => ({ ...project, updated: format(project.updatedAt) })),
      canWrite: entitlements.keys.includes('writer'),
      trial,
      granted: entitlements.source === 'GRANT',
    } satisfies WriterHomeData;
  });
}

/** One project: details, outline, research, references, exports and trash. */
export async function loadWriterProject(projectId: string): Promise<PageData<WriterProjectData>> {
  const missing = { value: false };
  const result = await loadPageData(`/writer/${projectId}`, async (api) => {
    const project = await orMissing(api.writer.projects.get({ projectId }), missing);

    if (!project) {
      return null;
    }

    const [overview, entitlements, trial, research, references, exports, trash, files] = await Promise.all([
      api.account.me(),
      api.account.entitlements(),
      api.account.trial(),
      api.writer.research.list({ projectId }),
      api.writer.references.list({ projectId }),
      api.writer.exports.list({ projectId }),
      api.writer.nodes.listTrash({ projectId }),
      api.files.list(),
    ]);
    const format = formatter(overview.settings);
    const attached = new Set(references.map((reference) => reference.fileId));

    return {
      project: { ...project, updated: format(project.updatedAt) },
      research: research.map((item) => ({ ...item, updated: format(item.updatedAt) })),
      references,
      attachableFiles: files.flatMap((file) =>
        DOCUMENT_TYPES.includes(file.mimeType) && !attached.has(file.id)
          ? [{ id: file.id, name: file.name, type: FILE_TYPE_LABELS[file.mimeType] ?? 'File' }]
          : [],
      ),
      exports: exports.map((item) => ({ ...item, created: format(item.createdAt) })),
      trash: trash.map((item) => ({ ...item, deleted: format(item.deletedAt) })),
      canWrite: entitlements.keys.includes('writer'),
      trial,
      granted: entitlements.source === 'GRANT',
    } satisfies WriterProjectData;
  });

  if (missing.value) {
    notFound();
  }

  return result as PageData<WriterProjectData>;
}

/** The editor for one part of a project. */
export async function loadWriterEditor(projectId: string, nodeId: string): Promise<PageData<WriterEditorData>> {
  const missing = { value: false };
  const result = await loadPageData(`/writer/${projectId}/${nodeId}`, async (api) => {
    const node = await orMissing(api.writer.nodes.get({ nodeId }), missing);

    if (!node || node.projectId !== projectId) {
      missing.value = true;
      return null;
    }

    const [overview, project, entitlements, trial, versions, references] = await Promise.all([
      api.account.me(),
      api.writer.projects.get({ projectId }),
      api.account.entitlements(),
      api.account.trial(),
      api.writer.versions.list({ nodeId }),
      api.writer.references.list({ projectId }),
    ]);
    const format = formatter(overview.settings);

    return {
      node,
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        outline: project.outline.map(({ id, parentId, kind, title, depth, wordCount }) => ({
          id,
          parentId,
          kind,
          title,
          depth,
          wordCount,
        })),
      },
      versions: versions.map((version) => ({ ...version, created: format(version.createdAt) })),
      references: references.map(({ fileId, name, type }) => ({ fileId, name, type })),
      canWrite: entitlements.keys.includes('writer'),
      advancedModels: entitlements.keys.includes('advanced_models'),
      trial,
      granted: entitlements.source === 'GRANT',
      settings: { locale: overview.settings.locale, timezone: overview.settings.timezone },
    } satisfies WriterEditorData;
  });

  if (missing.value) {
    notFound();
  }

  return result as PageData<WriterEditorData>;
}
