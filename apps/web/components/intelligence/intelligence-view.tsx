import Link from 'next/link';
import type { TrialSummary } from '@aila/auth/server';
import { TrialStatus } from '../account/trial-status';
import { BillingLink } from '../billing/billing-link';
import { OrnamentRule } from '../brand/ornament-rule';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChatPanel, type AttachableFile, type ChatMessage } from './chat-panel';
import { ConversationHeader } from './conversation-header';
import { ConversationList, type ConversationListItem } from './conversation-list';

export type IntelligenceData = {
  readonly conversations: readonly ConversationListItem[];
  readonly conversation: {
    readonly id: string;
    readonly title: string;
    readonly messages: readonly ChatMessage[];
  } | null;
  readonly canSend: boolean;
  readonly advancedModels: boolean;
  readonly files: readonly AttachableFile[];
  readonly trial: TrialSummary;
  readonly granted: boolean;
};

/** The Aila Intelligence workspace (PRODUCT-SPEC §10): history beside the conversation. */
export function IntelligenceView({
  conversations,
  conversation,
  canSend,
  advancedModels,
  files,
  trial,
  granted,
}: IntelligenceData) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-5">
        <div className="grid gap-1">
          <h1 className="text-3xl font-medium tracking-[0.02em] sm:text-4xl">Aila Intelligence</h1>
          <p className="text-muted-foreground">Think through ideas, plans, research and analysis.</p>
        </div>
        <OrnamentRule />
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card aria-labelledby="history-heading" role="region" className="h-fit gap-4">
          <CardHeader>
            <CardTitle id="history-heading">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Button asChild variant={conversation ? 'outline' : 'default'} className="w-full">
              <Link href="/intelligence">New conversation</Link>
            </Button>
            <nav aria-label="Conversation history" className="max-h-[60vh] overflow-y-auto">
              <ConversationList conversations={conversations} activeId={conversation?.id ?? null} />
            </nav>
          </CardContent>
        </Card>

        <Card aria-label={conversation ? conversation.title : 'New conversation'} role="region" className="min-w-0">
          <CardContent className="grid gap-6">
            {conversation ? (
              <ConversationHeader
                key={`${conversation.id}:${conversation.title}`}
                conversationId={conversation.id}
                title={conversation.title}
              />
            ) : (
              <h2 className="text-2xl font-medium">New conversation</h2>
            )}

            {canSend ? null : (
              <div className="grid gap-3 border border-brass/60 p-4 text-sm text-muted-foreground">
                <TrialStatus trial={trial} granted={granted} />
                <p>Your conversations stay available to read. Sending new messages needs Aila Pro.</p>
                <BillingLink trial={trial} />
              </div>
            )}

            <ChatPanel
              key={conversation?.id ?? 'new'}
              conversationId={conversation?.id ?? null}
              initialMessages={conversation?.messages ?? []}
              canSend={canSend}
              advancedModels={advancedModels}
              files={files}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
