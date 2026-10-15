import Link from 'next/link';
import type { TrialSummary } from '@aila/auth/server';
import { WRITER_DOCUMENT_TYPE_LABELS } from '@aila/validation';
import type { ProjectDetail } from '../../server/writer/projects';
import { OrnamentRule } from '../brand/ornament-rule';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ArchivedNotice, ReadOnlyNotice, formatNumber } from './common';
import { ExportsPanel, type ExportEntry } from './exports-panel';
import { OutlinePanel } from './outline-panel';
import { ProjectActions } from './project-actions';
import { ProjectDetails } from './project-details';
import { ReferencesPanel, type AttachableDocument, type ReferenceEntry } from './references-panel';
import { ResearchPanel, type ResearchEntry } from './research-panel';
import { SearchBox } from './search-box';
import { TrashPanel, type TrashEntry } from './trash-panel';

export type WriterProjectData = {
  readonly project: ProjectDetail & { readonly updated: string };
  readonly research: readonly ResearchEntry[];
  readonly references: readonly ReferenceEntry[];
  readonly attachableFiles: readonly AttachableDocument[];
  readonly exports: readonly ExportEntry[];
  readonly trash: readonly TrashEntry[];
  /** Server-resolved `writer` entitlement; display only. */
  readonly canWrite: boolean;
  readonly trial: TrialSummary;
  readonly granted: boolean;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border p-3">
      <dt className="label-caps text-muted-foreground">{label}</dt>
      <dd className="font-serif text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Goal({ label, value, goal, percent }: { label: string; value: number; goal: number; percent: number }) {
  return (
    <div className="grid gap-1">
      <p className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {formatNumber(value)} of {formatNumber(goal)} ({percent}%)
        </span>
      </p>
      <progress value={Math.min(value, goal)} max={goal} aria-label={`${label}: ${percent}% of goal`} className="w-full accent-primary" />
    </div>
  );
}

/** A Writer project: outline, statistics, context, research, references, export and publishing checks. */
export function ProjectView({
  project,
  research,
  references,
  attachableFiles,
  exports,
  trash,
  canWrite,
  trial,
  granted,
}: WriterProjectData) {
  const archived = project.status === 'ARCHIVED';
  const editable = canWrite && !archived;
  const { stats } = project;

  return (
    <div className="grid gap-6">
      <div className="grid gap-5">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link href="/writer" className="text-primary underline decoration-brass underline-offset-4">
            Aila Writer
          </Link>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-3xl font-medium tracking-[0.02em] break-words sm:text-4xl">{project.title}</h1>
            {project.subtitle ? <p className="text-lg text-muted-foreground">{project.subtitle}</p> : null}
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{WRITER_DOCUMENT_TYPE_LABELS[project.documentType]}</Badge>
              {archived ? <Badge variant="secondary">Archived</Badge> : null}
              Updated {project.updated}
            </p>
          </div>
          <ProjectActions projectId={project.id} title={project.title} archived={archived} />
        </div>
        <OrnamentRule />
      </div>

      {archived ? <ArchivedNotice /> : null}
      {canWrite ? null : (
        <ReadOnlyNotice trial={trial} granted={granted}>
          This project stays available to read and download. Editing, AI help and new exports need Aila Pro.
        </ReadOnlyNotice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid h-fit min-w-0 gap-6">
          <Card role="region" aria-labelledby="outline-heading">
            <CardHeader>
              <CardTitle id="outline-heading">Outline</CardTitle>
              <CardDescription>Open a part to write. Chapters can hold sections; parts can hold chapters.</CardDescription>
            </CardHeader>
            <CardContent>
              <OutlinePanel projectId={project.id} outline={project.outline} editable={editable} />
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="research-heading" id="research">
            <CardHeader>
              <CardTitle id="research-heading">Research</CardTitle>
            </CardHeader>
            <CardContent>
              <ResearchPanel projectId={project.id} items={research} editable={editable} />
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="details-heading">
            <CardHeader>
              <CardTitle id="details-heading">Project details and context</CardTitle>
              <CardDescription>Aila uses this context in every suggestion for this project.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectDetails key={project.updatedAt} project={project} editable={editable} />
            </CardContent>
          </Card>
        </div>

        <div className="grid h-fit min-w-0 gap-6">
          <Card role="region" aria-labelledby="stats-heading">
            <CardHeader>
              <CardTitle id="stats-heading">Statistics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-2">
                <Stat label="Words" value={formatNumber(stats.words)} />
                <Stat label="Characters" value={formatNumber(stats.characters)} />
                <Stat label="Chapters" value={formatNumber(stats.chapters)} />
                <Stat label="Sections" value={formatNumber(stats.sections)} />
                {stats.parts > 0 ? <Stat label="Parts" value={formatNumber(stats.parts)} /> : null}
                {stats.documents > 0 ? <Stat label="Documents" value={formatNumber(stats.documents)} /> : null}
              </dl>
              <p className="text-sm text-muted-foreground">
                Reading time about {formatNumber(Math.max(stats.words > 0 ? 1 : 0, Math.round(stats.words / 230)))} min ·{' '}
                {formatNumber(stats.finalCount)} of {formatNumber(project.outline.length)} marked Final
              </p>
              {stats.wordGoal && stats.wordGoalPercent !== null ? (
                <Goal label="Word goal" value={stats.words} goal={stats.wordGoal} percent={stats.wordGoalPercent} />
              ) : null}
              {stats.chapterGoal && stats.chapterGoalPercent !== null ? (
                <Goal
                  label="Chapter goal"
                  value={stats.chapters}
                  goal={stats.chapterGoal}
                  percent={stats.chapterGoalPercent}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="search-heading">
            <CardHeader>
              <CardTitle id="search-heading">Search</CardTitle>
            </CardHeader>
            <CardContent>
              <SearchBox projectId={project.id} />
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="export-heading">
            <CardHeader>
              <CardTitle id="export-heading">Export</CardTitle>
              <CardDescription>PDF, Word or EPUB, of the whole project or one part.</CardDescription>
            </CardHeader>
            <CardContent>
              <ExportsPanel projectId={project.id} exports={exports} outline={project.outline} canExport={canWrite} />
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="checklist-heading">
            <CardHeader>
              <CardTitle id="checklist-heading">Publishing preparation</CardTitle>
              <CardDescription>Checks to help you get ready. Nothing is published from Aila.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3">
                {project.checklist.map((item) => (
                  <li key={item.id} className="grid gap-1">
                    <p className="flex items-start gap-2">
                      <span aria-hidden="true" className={item.done ? 'text-primary' : 'text-muted-foreground'}>
                        {item.done ? '✓' : '○'}
                      </span>
                      <span>
                        {item.label}
                        <span className="sr-only">{item.done ? ': done' : ': not yet'}</span>
                      </span>
                    </p>
                    {item.detail ? <p className="pl-6 text-sm text-muted-foreground">{item.detail}</p> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="references-heading">
            <CardHeader>
              <CardTitle id="references-heading">Reference files</CardTitle>
            </CardHeader>
            <CardContent>
              <ReferencesPanel
                projectId={project.id}
                references={references}
                attachable={attachableFiles}
                editable={editable}
              />
            </CardContent>
          </Card>

          <Card role="region" aria-labelledby="trash-heading">
            <CardHeader>
              <CardTitle id="trash-heading">Trash</CardTitle>
            </CardHeader>
            <CardContent>
              <TrashPanel items={trash} editable={editable} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
