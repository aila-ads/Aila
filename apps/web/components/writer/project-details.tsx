'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  WRITER_DOCUMENT_TYPES,
  WRITER_DOCUMENT_TYPE_LABELS,
  WRITER_MAX_CHAPTER_GOAL,
  WRITER_MAX_CONTEXT_CHARS,
  WRITER_MAX_DESCRIPTION_CHARS,
  WRITER_MAX_SHORT_TEXT_CHARS,
  WRITER_MAX_TITLE_CHARS,
  WRITER_MAX_WORD_GOAL,
  type WriterDocumentType,
} from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { Button } from '../ui/button';
import { ErrorNotice, fieldClass, useAction } from './common';
import { languageOptions } from './languages';

export type ProjectDetailsValues = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly documentType: WriterDocumentType;
  readonly language: string;
  readonly audience: string | null;
  readonly authorName: string | null;
  readonly goals: string | null;
  readonly styleInstructions: string | null;
  readonly terminology: string | null;
  readonly contextNotes: string | null;
  readonly wordGoal: number | null;
  readonly chapterGoal: number | null;
};

type TextKey = 'subtitle' | 'description' | 'audience' | 'authorName' | 'goals' | 'styleInstructions' | 'terminology' | 'contextNotes';

const LINES: ReadonlyArray<{ key: TextKey; label: string; max: number; help?: string }> = [
  { key: 'subtitle', label: 'Subtitle', max: WRITER_MAX_TITLE_CHARS },
  { key: 'authorName', label: 'Author name', max: WRITER_MAX_TITLE_CHARS, help: 'Shown on the title page of exports.' },
  { key: 'audience', label: 'Target audience', max: WRITER_MAX_SHORT_TEXT_CHARS },
];

const TEXTS: ReadonlyArray<{ key: TextKey; label: string; max: number; help: string }> = [
  { key: 'description', label: 'Description', max: WRITER_MAX_DESCRIPTION_CHARS, help: 'A short summary of the work.' },
  { key: 'goals', label: 'Writing goals', max: WRITER_MAX_CONTEXT_CHARS, help: 'What the work should achieve.' },
  {
    key: 'styleInstructions',
    label: 'Style instructions',
    max: WRITER_MAX_CONTEXT_CHARS,
    help: 'Voice, point of view, tense, formality. Aila follows these in every suggestion.',
  },
  {
    key: 'terminology',
    label: 'Terminology',
    max: WRITER_MAX_CONTEXT_CHARS,
    help: 'Names, terms and spellings to keep consistent.',
  },
  {
    key: 'contextNotes',
    label: 'Project notes',
    max: WRITER_MAX_CONTEXT_CHARS,
    help: 'Characters, settings, facts or anything else Aila should keep in mind.',
  },
];

const goalValue = (text: string): number | null => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Project details, context and goals (WRITER §7.1, §22, §30). */
export function ProjectDetails({ project, editable }: { project: ProjectDetailsValues; editable: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [documentType, setDocumentType] = useState(project.documentType);
  const [language, setLanguage] = useState(project.language);
  const [texts, setTexts] = useState<Record<TextKey, string>>({
    subtitle: project.subtitle ?? '',
    description: project.description ?? '',
    audience: project.audience ?? '',
    authorName: project.authorName ?? '',
    goals: project.goals ?? '',
    styleInstructions: project.styleInstructions ?? '',
    terminology: project.terminology ?? '',
    contextNotes: project.contextNotes ?? '',
  });
  const [wordGoal, setWordGoal] = useState(project.wordGoal?.toString() ?? '');
  const [chapterGoal, setChapterGoal] = useState(project.chapterGoal?.toString() ?? '');
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();

  const setText = (key: TextKey, value: string) => {
    setSaved(false);
    setTexts((current) => ({ ...current, [key]: value }));
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    run(
      () =>
        api.writer.projects.update.mutate({
          projectId: project.id,
          title,
          documentType,
          language,
          ...Object.fromEntries(Object.entries(texts).map(([key, value]) => [key, value.trim() ? value : null])),
          wordGoal: goalValue(wordGoal),
          chapterGoal: goalValue(chapterGoal),
        }),
      () => {
        setSaved(true);
        router.refresh();
      },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <fieldset disabled={!editable || pending} className="grid gap-4">
        <div className="grid gap-1">
          <label htmlFor="project-title">Title</label>
          <input
            id="project-title"
            required
            value={title}
            maxLength={WRITER_MAX_TITLE_CHARS}
            onChange={(event) => {
              setSaved(false);
              setTitle(event.target.value);
            }}
          />
        </div>
        {LINES.map((field) => (
          <div key={field.key} className="grid gap-1">
            <label htmlFor={`project-${field.key}`}>{field.label}</label>
            <input
              id={`project-${field.key}`}
              value={texts[field.key]}
              maxLength={field.max}
              onChange={(event) => setText(field.key, event.target.value)}
              aria-describedby={field.help ? `project-${field.key}-help` : undefined}
            />
            {field.help ? (
              <p id={`project-${field.key}-help`} className="text-xs text-muted-foreground">
                {field.help}
              </p>
            ) : null}
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor="project-type">Type</label>
            <select
              id="project-type"
              value={documentType}
              onChange={(event) => {
                setSaved(false);
                setDocumentType(event.target.value as WriterDocumentType);
              }}
            >
              {WRITER_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {WRITER_DOCUMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor="project-language">Language</label>
            <select
              id="project-language"
              value={language}
              onChange={(event) => {
                setSaved(false);
                setLanguage(event.target.value);
              }}
            >
              {languageOptions(project.language).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {TEXTS.map((field) => (
          <div key={field.key} className="grid gap-1">
            <label htmlFor={`project-${field.key}`}>{field.label}</label>
            <textarea
              id={`project-${field.key}`}
              rows={field.key === 'description' ? 3 : 4}
              value={texts[field.key]}
              maxLength={field.max}
              onChange={(event) => setText(field.key, event.target.value)}
              aria-describedby={`project-${field.key}-help`}
              className={fieldClass}
            />
            <p id={`project-${field.key}-help`} className="text-xs text-muted-foreground">
              {field.help}
            </p>
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor="project-word-goal">Word goal</label>
            <input
              id="project-word-goal"
              type="number"
              inputMode="numeric"
              min={1}
              max={WRITER_MAX_WORD_GOAL}
              value={wordGoal}
              onChange={(event) => {
                setSaved(false);
                setWordGoal(event.target.value);
              }}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="project-chapter-goal">Chapter goal</label>
            <input
              id="project-chapter-goal"
              type="number"
              inputMode="numeric"
              min={1}
              max={WRITER_MAX_CHAPTER_GOAL}
              value={chapterGoal}
              onChange={(event) => {
                setSaved(false);
                setChapterGoal(event.target.value);
              }}
            />
          </div>
        </div>
      </fieldset>
      <ErrorNotice error={error} />
      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !title.trim()}>
            {pending ? 'Saving…' : 'Save details'}
          </Button>
          {saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Saved.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
