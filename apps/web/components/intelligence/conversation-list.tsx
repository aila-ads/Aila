import Link from 'next/link';
import { cn } from '../../lib/utils';

export type ConversationListItem = {
  readonly id: string;
  readonly title: string;
  readonly updated: string;
};

/** Conversation history, most recent first (AC-062). */
export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: readonly ConversationListItem[];
  activeId: string | null;
}) {
  if (conversations.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">No conversations yet.</p>;
  }

  return (
    <ul className="grid gap-1">
      {conversations.map((conversation) => {
        const current = conversation.id === activeId;

        return (
          <li key={conversation.id}>
            <Link
              href={`/intelligence/${conversation.id}`}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'grid gap-0.5 border-l-2 px-3 py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                current ? 'border-brass bg-accent text-accent-foreground' : 'border-transparent hover:bg-accent/60',
              )}
            >
              <span className="truncate font-medium" title={conversation.title}>
                {conversation.title}
              </span>
              <span className="text-xs text-muted-foreground">{conversation.updated}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
