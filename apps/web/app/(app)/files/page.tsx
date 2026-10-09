import type { Metadata } from 'next';
import { PageError } from '../../../components/account/page-error';
import { FilesView, type FileRow } from '../../../components/files/files-view';
import { loadPageData } from '../../../server/api/caller';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Files · Aila' };

const TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WEBP',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FilesPage() {
  const result = await loadPageData('/files', async (api) => {
    const [overview, files, trial, entitlements] = await Promise.all([
      api.account.me(),
      api.files.list(),
      api.account.trial(),
      api.account.entitlements(),
    ]);
    return { overview, files, trial, entitlements };
  });

  if ('error' in result) {
    return <PageError title="Files" message={result.error} retryHref="/files" />;
  }

  const { overview, files, trial, entitlements } = result.data;
  const formatDate = new Intl.DateTimeFormat(overview.settings.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: overview.settings.timezone,
  });
  const rows: FileRow[] = files.map((file) => ({
    id: file.id,
    name: file.name,
    type: TYPE_LABELS[file.mimeType] ?? 'File',
    size: formatSize(file.sizeBytes),
    uploaded: formatDate.format(new Date(file.createdAt)),
  }));

  return (
    <FilesView
      files={rows}
      canUpload={entitlements.keys.includes('file_upload')}
      trial={trial}
      granted={entitlements.source === 'GRANT'}
    />
  );
}
