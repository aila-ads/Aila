import type { TrialSummary } from '@aila/auth/server';
import { TrialStatus } from '../account/trial-status';
import { OrnamentRule } from '../brand/ornament-rule';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { FileUpload } from '../uploads/file-upload';
import { FileActions } from './file-actions';

export type FileRow = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: string;
  readonly uploaded: string;
};

export type FilesData = {
  readonly files: readonly FileRow[];
  /** Server-resolved `file_upload` entitlement; display only. */
  readonly canUpload: boolean;
  readonly trial: TrialSummary;
  readonly granted: boolean;
};

/** The account's private files (AILA-V1-SCOPE §17, PRODUCT-SPEC §8, §17). */
export function FilesView({ files, canUpload, trial, granted }: FilesData) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-5">
        <div className="grid gap-1">
          <h1 className="text-3xl font-medium tracking-[0.02em] sm:text-4xl">Files</h1>
          <p className="text-muted-foreground">Private to your account. Only you can download them.</p>
        </div>
        <OrnamentRule />
      </div>

      <Card aria-labelledby="upload-heading" role="region">
        <CardHeader>
          <CardTitle id="upload-heading">Upload</CardTitle>
        </CardHeader>
        <CardContent>
          {canUpload ? (
            <FileUpload />
          ) : (
            <div className="text-sm text-muted-foreground">
              <TrialStatus trial={trial} granted={granted} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card aria-labelledby="files-heading" role="region">
        <CardHeader>
          <CardTitle id="files-heading">Your files</CardTitle>
          {files.length === 0 ? (
            <CardDescription>No files yet. Files you upload will appear here.</CardDescription>
          ) : null}
        </CardHeader>
        {files.length > 0 ? (
          <CardContent>
            <ul className="divide-y border">
              {files.map((file) => (
                <li key={file.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid min-w-0 gap-1">
                    <p className="truncate font-medium" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="label-caps text-brass-ink">{file.type}</span> · {file.size} ·{' '}
                      {file.uploaded}
                    </p>
                  </div>
                  <FileActions fileId={file.id} name={file.name} />
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
