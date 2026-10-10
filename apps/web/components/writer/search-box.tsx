'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { WRITER_MAX_SEARCH_CHARS, WRITER_NODE_KIND_LABELS } from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { Button } from '../ui/button';
import { ErrorNotice, useAction } from './common';

type Results = Awaited<ReturnType<typeof api.writer.search.query>>;

function hrefOf(result: Results[number]): string {
  if (result.type === 'node') return `/writer/${result.projectId}/${result.nodeId}`;
  if (result.type === 'research') return `/writer/${result.projectId}#research`;
  return `/writer/${result.projectId}`;
}

function kindOf(result: Results[number]): string {
  if (result.type === 'node') return WRITER_NODE_KIND_LABELS[result.kind];
  if (result.type === 'research') return 'Research';
  return 'Project';
}

/** Search across the account's projects, or within one (WRITER §28). */
export function SearchBox({ projectId }: { projectId?: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const { pending, error, run } = useAction();
  const inputId = projectId ? 'writer-project-search' : 'writer-search';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      setResults(await api.writer.search.query({ query, ...(projectId ? { projectId } : {}) }));
    });
  }

  return (
    <div className="grid gap-3">
      <form role="search" onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <label htmlFor={inputId}>{projectId ? 'Search this project' : 'Search all projects'}</label>
          <input
            id={inputId}
            type="search"
            value={query}
            maxLength={WRITER_MAX_SEARCH_CHARS}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Titles, chapters, text and research"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending || query.trim().length < 2}>
          {pending ? 'Searching…' : 'Search'}
        </Button>
      </form>
      <ErrorNotice error={error} />
      {results ? (
        <div aria-live="polite" className="grid gap-2">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing matched “{query.trim()}”.</p>
          ) : (
            <ul className="grid gap-2">
              {results.map((result) => (
                <li key={`${result.type}:${'nodeId' in result ? result.nodeId : 'researchId' in result ? result.researchId : result.projectId}`}>
                  <Link
                    href={hrefOf(result)}
                    className="grid gap-1 border p-3 outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="label-caps text-brass-ink">
                      {kindOf(result)}
                      {projectId ? '' : ` · ${result.projectTitle}`}
                    </span>
                    <span className="font-medium">{result.type === 'project' ? result.projectTitle : result.title}</span>
                    {result.snippet ? <span className="text-sm text-muted-foreground">{result.snippet}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
