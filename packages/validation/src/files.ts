import { z } from 'zod';

/**
 * File upload rules (AILA-V1-ARCHITECTURE §23, AILA-V1-SCOPE §17,
 * PLATFORM-FOUNDATION §18, §26). One place for the allowed types and the
 * size limit, shared by the server checks and the upload control.
 */

/** Largest accepted file: 25 MB. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

type FileType = {
  /** The MIME type stored and sent to storage. */
  readonly mimeType: string;
  /** Other types browsers report for the same extension. */
  readonly aliases: readonly string[];
};

/** Allowed extensions (lower case) and their types. */
export const FILE_TYPES: Readonly<Record<string, FileType>> = {
  pdf: { mimeType: 'application/pdf', aliases: [] },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    aliases: [],
  },
  txt: { mimeType: 'text/plain', aliases: [] },
  // Windows browsers often report CSV files as Excel.
  csv: { mimeType: 'text/csv', aliases: ['application/vnd.ms-excel', 'text/plain'] },
  png: { mimeType: 'image/png', aliases: [] },
  jpg: { mimeType: 'image/jpeg', aliases: [] },
  jpeg: { mimeType: 'image/jpeg', aliases: [] },
  webp: { mimeType: 'image/webp', aliases: [] },
};

/** Value for an `<input type="file" accept>` attribute. */
export const FILE_ACCEPT = Object.keys(FILE_TYPES)
  .map((extension) => `.${extension}`)
  .join(',');

/** Short type labels for people, by stored MIME type. */
export const FILE_TYPE_LABELS: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WEBP',
};

/** Short list of allowed types for people, e.g. in the upload control. */
export const FILE_TYPES_LABEL = 'PDF, DOCX, TXT, CSV, PNG, JPEG or WEBP';

/** Display name without control characters or path separators, at most 255 characters. */
export function safeFileName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 255);
}

/** The lower-case extension of a file name, or null when there is none. */
export function fileExtension(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : null;
}

/**
 * The stored MIME type for a name and the type the browser reported, or
 * null when the extension is not allowed or the reported type does not
 * match it. An empty reported type is accepted: the content is checked
 * after upload.
 */
export function resolveFileType(name: string, reportedType: string): string | null {
  const extension = fileExtension(name);
  const type = extension ? FILE_TYPES[extension] : undefined;

  if (!type) {
    return null;
  }

  const reported = reportedType.trim().toLowerCase();
  return reported === '' || reported === type.mimeType || type.aliases.includes(reported)
    ? type.mimeType
    : null;
}

const FILE_TYPE_MESSAGE = `Upload a ${FILE_TYPES_LABEL} file.`;

export const createUploadSchema = z
  .strictObject({
    name: z
      .string()
      .transform(safeFileName)
      .pipe(z.string().min(1, { error: 'The file needs a name.' })),
    mimeType: z.string().max(255),
    sizeBytes: z
      .number()
      .int()
      .positive({ error: 'The file is empty.' })
      .max(MAX_FILE_BYTES, { error: 'Files can be up to 25 MB.' }),
  })
  .refine((input) => resolveFileType(input.name, input.mimeType) !== null, {
    error: FILE_TYPE_MESSAGE,
    path: ['name'],
  });

export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export const fileIdSchema = z.strictObject({
  fileId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/, { error: 'We could not find that file.' }),
});
