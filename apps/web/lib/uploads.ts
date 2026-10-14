import { FILE_TYPES_LABEL, MAX_FILE_BYTES, resolveFileType } from '@aila/validation';
import { api, apiErrorMessage } from './trpc/client';

/**
 * The browser side of the upload flow (PLATFORM-FOUNDATION §25): the file
 * goes straight to private storage through a short-lived signed link and
 * the server checks it before it becomes available.
 */

export const UPLOAD_FAILED = 'The upload did not finish. Check your connection and try again.';

export type UploadResult =
  | { readonly ok: true; readonly fileId: string; readonly mimeType: string }
  | { readonly ok: false; readonly message: string };

/** A message when the file cannot be uploaded at all, or null. */
export function uploadProblem(file: File): string | null {
  if (!resolveFileType(file.name, file.type)) {
    return `Upload a ${FILE_TYPES_LABEL} file.`;
  }

  if (file.size === 0) {
    return 'The file is empty.';
  }

  return file.size > MAX_FILE_BYTES ? 'Files can be up to 25 MB.' : null;
}

/** Uploads one file to the signed-in account's Files. */
export async function uploadFile(file: File): Promise<UploadResult> {
  const problem = uploadProblem(file);

  if (problem) {
    return { ok: false, message: problem };
  }

  try {
    const ticket = await api.files.createUpload.mutate({
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });

    let response: Response;

    try {
      response = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': ticket.contentType,
          'Content-Disposition': ticket.contentDisposition,
        },
        body: file,
      });
    } catch {
      return { ok: false, message: UPLOAD_FAILED };
    }

    if (!response.ok) {
      return { ok: false, message: UPLOAD_FAILED };
    }

    await api.files.completeUpload.mutate({ fileId: ticket.fileId });
    return { ok: true, fileId: ticket.fileId, mimeType: ticket.contentType };
  } catch (error) {
    return { ok: false, message: apiErrorMessage(error) };
  }
}
