'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { TrialSummary } from '@aila/auth/server';
import {
  WRITER_DOCUMENT_TYPES,
  WRITER_DOCUMENT_TYPE_LABELS,
  WRITER_MAX_DESCRIPTION_CHARS,
  WRITER_MAX_TITLE_CHARS,
  type WriterDocumentType,
} from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { OrnamentRule } from '../brand/ornament-rule';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ErrorNotice, ReadOnlyNotice, fieldClass, plural, useAction } from './common';
import { LANGUAGE_OPTIONS } from './languages';
import { SearchBox } from './search-box';

export type WriterProjectSummary = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly documentType: WriterDocumentType;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly words: number;
  readonly updated: string;
};

export type WriterHomeData = {
  readonly projects: readonly WriterProjectSummary[];
  /** Server-resolved `writer` entitlement; display only. */
  readonly canWrite: boolean;
  readonly trial: TrialSummary;
  readonly granted: boolean;
};

function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState<WriterDocumentType>('BOOK');
  const [language, setLanguage] = useState('en');
  const [description, setDescription] = useState('');
  const { pending, error, run } = useAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      const created = await api.writer.projects.create.mutate({
        title,
        documentType,
        language,
        ...(description.trim() ? { description } : {}),
      });
      router.push(`/writer/${created.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1">
        <label htmlFor="new-project-title">Title</label>
        <input
          id="new-project-title"
          required
          value={title}
          maxLength={WRITER_MAX_TITLE_CHARS}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor="new-project-type">Type</label>
          <select
            id="new-project-type"
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value as WriterDocumentType)}
          >
            {WRITER_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {WRITER_DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="new-project-language">Language</label>
          <select id="new-project-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1">
        <label htmlFor="new-project-description">Description (optional)</label>
        <textarea
          id="new-project-description"
          rows={3}
          value={description}
          maxLength={WRITER_MAX_DESCRIPTION_CHARS}
          onChange={(event) => setDescription(event.target.value)}
          className={fieldClass}
        />
      </div>
      <ErrorNotice error={error} />
      <Button type="submit" className="w-fit" disabled={pending || !title.trim()}>
        {pending ? 'Creating…' : 'Create project'}
      </Button>
    </form>
  );
}

function ProjectList({ projects }: { projects: readonly WriterProjectSummary[] }) {
  return (
    <ul className="grid gap-3">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/writer/${project.id}`}
            className="grid gap-1 border p-4 outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-lg font-semibold">{project.title}</span>
              <Badge variant="outline">{WRITER_DOCUMENT_TYPE_LABELS[project.documentType]}</Badge>
              {project.status === 'ARCHIVED' ? <Badge variant="secondary">Archived</Badge> : null}
            </span>
            {project.subtitle ? <span className="text-muted-foreground">{project.subtitle}</span> : null}
            <span className="text-sm text-muted-foreground">
              {plural(project.words, 'word', 'words')} · Updated {project.updated}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Writer home (WRITER §6): projects, a new project and search. */
export function WriterHome({ projects, canWrite, trial, granted }: WriterHomeData) {
  const active = projects.filter((project) => project.status === 'ACTIVE');
  const archived = projects.filter((project) => project.status === 'ARCHIVED');

  return (
    <div className="grid gap-6">
      <div className="grid gap-5">
        <div className="grid gap-1">
          <h1 className="text-3xl font-medium tracking-[0.02em] sm:text-4xl">Aila Writer</h1>
          <p className="text-muted-foreground">Plan, write, revise and export books and long-form documents.</p>
        </div>
        <OrnamentRule />
      </div>

      {canWrite ? null : (
        <ReadOnlyNotice trial={trial} granted={granted}>
          Your projects stay available to read and export. Creating and editing needs Aila Pro.
        </ReadOnlyNotice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid h-fit gap-6">
          <Card role="region" aria-labelledby="writer-projects-heading">
            <CardHeader>
              <CardTitle id="writer-projects-heading">Projects</CardTitle>
              <CardDescription>Your writing projects are private to your account.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {active.length === 0 ? (
                <p className="text-muted-foreground">
                  {canWrite ? 'No projects yet. Create your first one to start writing.' : 'No active projects.'}
                </p>
              ) : (
                <ProjectList projects={active} />
              )}
              {archived.length > 0 ? (
                <details className="grid gap-3">
                  <summary className="label-caps cursor-pointer text-muted-foreground">
                    Archived ({archived.length.toLocaleString()})
                  </summary>
                  <div className="pt-3">
                    <ProjectList projects={archived} />
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          {projects.length > 0 ? (
            <Card role="region" aria-labelledby="writer-search-heading">
              <CardHeader>
                <CardTitle id="writer-search-heading">Search</CardTitle>
              </CardHeader>
              <CardContent>
                <SearchBox />
              </CardContent>
            </Card>
          ) : null}
        </div>

        {canWrite ? (
          <Card role="region" aria-labelledby="writer-new-heading" className="h-fit">
            <CardHeader>
              <CardTitle id="writer-new-heading">New project</CardTitle>
              <CardDescription>A book, report, thesis, guide or any long-form work.</CardDescription>
            </CardHeader>
            <CardContent>
              <NewProjectForm />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
