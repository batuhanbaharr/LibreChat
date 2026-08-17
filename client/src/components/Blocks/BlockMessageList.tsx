import { useNavigate } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import type { TBlockMessage, TBlockJoinReasoning } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import { cn } from '~/utils';
import store from '~/store';

function formatTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

// findet die ersten zwei sätze (satzende = . ! oder ? gefolgt von leerzeichen/zeilenende) -
// bewusst simpel gehalten, keine erkennung von abkürzungen o.ä., das reicht für eine kurze vorschau
const SENTENCE_END = /[.!?]+(?=\s|$)/g;

function previewText(text: string): string {
  const matches = [...text.matchAll(SENTENCE_END)];
  if (matches.length < 2) {
    // kein sauberes zweites satzende gefunden - lieber den ganzen text zeigen statt
    // mittendrin abzuschneiden
    return text;
  }

  const secondSentenceEnd = matches[1];
  const cutoff = (secondSentenceEnd.index ?? 0) + secondSentenceEnd[0].length;
  const preview = text.slice(0, cutoff).trim();
  const hasMoreAfter = text.slice(cutoff).trim().length > 0;
  return hasMoreAfter ? `${preview}…` : preview;
}

// laienverständliche erklärung für die history-ansicht, ohne zahlen im haupttext -
// der score und der tie-breaker-hinweis stecken stattdessen im ⓘ tooltip, siehe unten
function describeReasoning(reasoning: TBlockJoinReasoning, blockTitle: string | undefined): string {
  const title = blockTitle ? `„${blockTitle}“` : 'diesem Thema';

  if (reasoning.reason === 'new_block') {
    return `Neues Thema: Hier ging es um ${title}.`;
  }

  if (reasoning.reason === 'reactivated_block') {
    return `Zurück zum Thema ${title} von weiter oben im Gespräch.`;
  }

  return `Gehört noch zum Thema ${title}.`;
}

// baut den text für den ⓘ tooltip - score und tie-breaker-info sind hier versteckt,
// weil das für den haupttext zu technisch ist, aber neugierige es trotzdem sehen können sollen
function buildScoreTooltip(reasoning: TBlockJoinReasoning): string | null {
  if (reasoning.score === null) {
    return null;
  }

  const scoreText = `Ähnlichkeit: ${formatScore(reasoning.score)}`;
  if (!reasoning.tieBreakerUsed) {
    return scoreText;
  }

  return `${scoreText}. Der Wert allein war nicht eindeutig genug, ein zusätzlicher KI-Check hat bei der Entscheidung geholfen.`;
}

function ReasoningLine({
  reasoning,
  blockTitle,
}: {
  reasoning: TBlockJoinReasoning;
  blockTitle: string | undefined;
}) {
  const tooltip = buildScoreTooltip(reasoning);
  return (
    <p className="mt-2 flex items-start gap-1 text-xs italic text-text-secondary">
      <span>{describeReasoning(reasoning, blockTitle)}</span>
      {tooltip && (
        <span className="cursor-help not-italic" title={tooltip}>
          ⓘ
        </span>
      )}
    </p>
  );
}

interface BlockMessageListProps {
  messages: TBlockMessage[];
  emptyText: string;
  showRole?: boolean;
  // zeigt zusätzlich die block-entscheidung in einfacher sprache an, nur für die history-ansicht gedacht
  showReasoning?: boolean;
  blockTitle?: string;
  // wenn gesetzt, sind die einträge klickbar und springen zur nachricht im echten chat
  conversationId?: string;
  // zeigt nur die ersten zwei sätze + "…" statt dem vollen text - für "Alle Nachrichten"
  preview?: boolean;
}

export default function BlockMessageList({
  messages,
  emptyText,
  showRole,
  showReasoning,
  blockTitle,
  conversationId,
  preview,
}: BlockMessageListProps) {
  const navigate = useNavigate();
  // eine alte submission (vom letzten echten chat-turn) bleibt sonst im recoil state
  // hängen und wird von useResumableSSE beim neu-mounten der chatview als "neue anfrage"
  // nochmal losgeschickt - genau das macht useNavigateToConvo beim normalen
  // konversationswechsel auch, siehe dort
  const setSubmission = useSetRecoilState(store.submissionByIndex(0));

  if (messages.length === 0) {
    return <p className="text-sm text-text-secondary">{emptyText}</p>;
  }

  const goToMessage = (messageId: string) => {
    if (!conversationId) {
      return;
    }
    setSubmission(null);
    navigate(`/c/${conversationId}#${messageId}`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, messageId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToMessage(messageId);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) => (
        <div
          key={message.messageId}
          className={cn(
            'rounded-lg bg-surface-hover p-3 text-sm',
            conversationId && 'cursor-pointer hover:bg-surface-active',
          )}
          role={conversationId ? 'button' : undefined}
          tabIndex={conversationId ? 0 : undefined}
          onClick={conversationId ? () => goToMessage(message.messageId) : undefined}
          onKeyDown={
            conversationId ? (event) => handleKeyDown(event, message.messageId) : undefined
          }
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-text-secondary">
            <span>{formatTime(message.createdAt)} Uhr</span>
            {showRole && <span>· {message.isCreatedByUser ? 'Nutzer' : 'Assistent'}</span>}
          </div>
          <p className="whitespace-pre-wrap">
            {preview ? previewText(message.text) : message.text}
          </p>
          {showReasoning && message.reasoning && (
            <ReasoningLine reasoning={message.reasoning} blockTitle={blockTitle} />
          )}
        </div>
      ))}
    </div>
  );
}
