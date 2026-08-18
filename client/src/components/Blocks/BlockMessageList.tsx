import { useNavigate, useParams } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { Star, ArrowRight, MessageSquarePlus, RotateCcw } from 'lucide-react';
import type { TBlockMessage, TBlockJoinReasoning, TBlockJoinReason } from 'librechat-data-provider';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '~/utils';
import store from '~/store';
import { useStarBlockMessageMutation } from '~/data-provider';

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

// wie lange es her ist, seit die letzte nachricht in diesem block dran war - nur für
// reactivated_block interessant, sonst ist der abstand eh nur ein paar sekunden
function formatGap(fromISO: string, toISO: string): string {
  const minutes = Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 60_000);
  if (minutes < 60) {
    return `${minutes} Min.`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} Std.`;
  }
  const days = Math.round(hours / 24);
  return `${days} Tag${days === 1 ? '' : 'e'}`;
}

// welches icon/farbe zu welchem grund gehört, plus eine laienverständliche erklärung
// als hover-tooltip auf dem badge selbst - "Fortsetzung"/"Aufgegriffen" sind sonst nicht
// unbedingt selbsterklärend
const REASON_META: Record<
  TBlockJoinReason,
  { icon: LucideIcon; className: string; meaning: string }
> = {
  same_block: {
    icon: ArrowRight,
    className: 'bg-surface-active text-text-secondary',
    meaning: 'Setzt das gleiche Thema fort wie die Nachricht davor.',
  },
  new_block: {
    icon: MessageSquarePlus,
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    meaning: 'Weicht thematisch genug ab, um einen neuen Block zu starten.',
  },
  reactivated_block: {
    icon: RotateCcw,
    className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    meaning: 'Statt eines neuen Themas wurde ein früher besprochenes Thema wieder aufgegriffen.',
  },
};

// der badge-text selbst - bei reactivated_block steht direkt drin, zu welchem block es
// zurückgeht, sonst reicht der kurze kategorie-name (der satz daneben liefert das "warum")
function badgeLabel(reasoning: TBlockJoinReasoning, blockTitle: string | undefined): string {
  if (reasoning.reason === 'reactivated_block') {
    const title = blockTitle ? `„${blockTitle}“` : 'einem früheren Thema';
    return `Aufgegriffen: zurück zu ${title}`;
  }
  if (reasoning.reason === 'new_block') {
    return 'Neues Thema';
  }
  return 'Fortsetzung';
}

// laienverständliche erklärung für die history-ansicht, ohne zahlen im haupttext -
// der score und der tie-breaker-hinweis stecken stattdessen im ⓘ tooltip, siehe unten.
// bei reactivated_block nennt schon der badge-text den block, hier steht dann nur noch
// der zeitliche abstand
function describeReasoning(
  reasoning: TBlockJoinReasoning,
  blockTitle: string | undefined,
  createdAt: string,
  previousCreatedAt: string | undefined,
): string {
  const title = blockTitle ? `„${blockTitle}“` : 'diesem Thema';

  if (reasoning.reason === 'new_block') {
    return `Startet das Thema ${title}.`;
  }

  if (reasoning.reason === 'reactivated_block') {
    if (!previousCreatedAt) {
      return 'War hier zuletzt aktiv.';
    }
    return `Zuletzt vor ${formatGap(previousCreatedAt, createdAt)} zu diesem Thema unterwegs.`;
  }

  return `Gehört weiter zu ${title}.`;
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
  createdAt,
  previousCreatedAt,
}: {
  reasoning: TBlockJoinReasoning;
  blockTitle: string | undefined;
  createdAt: string;
  previousCreatedAt: string | undefined;
}) {
  const tooltip = buildScoreTooltip(reasoning);
  const meta = REASON_META[reasoning.reason];
  const Icon = meta.icon;

  return (
    <div className="mt-2 flex flex-wrap items-start gap-2 text-xs text-text-secondary">
      <span
        title={meta.meaning}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium',
          meta.className,
        )}
      >
        <Icon size={11} />
        {badgeLabel(reasoning, blockTitle)}
      </span>
      <span className="pt-0.5">
        {describeReasoning(reasoning, blockTitle, createdAt, previousCreatedAt)}
        {tooltip && (
          <span className="cursor-help" title={tooltip}>
            {' '}
            ⓘ
          </span>
        )}
      </span>
    </div>
  );
}

interface BlockMessageListProps {
  messages: TBlockMessage[];
  emptyText: string;
  // zeigt zusätzlich die block-entscheidung in einfacher sprache an, nur für die history-ansicht gedacht
  showReasoning?: boolean;
  blockTitle?: string;
  // wenn gesetzt, sind die einträge klickbar und springen zur nachricht im echten chat
  conversationId?: string;
  // zeigt nur die ersten zwei sätze + "…" statt dem vollen text - für "Alle Nachrichten"
  preview?: boolean;
  // zeigt einen stern zum markieren an, markierte nachrichten wandern nach oben -
  // nur für "Alle Nachrichten" und "Alle Prompts" gedacht, nicht für die history
  enableStarring?: boolean;
}

export default function BlockMessageList({
  messages,
  emptyText,
  showReasoning,
  blockTitle,
  conversationId,
  preview,
  enableStarring,
}: BlockMessageListProps) {
  const navigate = useNavigate();
  const { blockId } = useParams();
  // eine alte submission (vom letzten echten chat-turn) bleibt sonst im recoil state
  // hängen und wird von useResumableSSE beim neu-mounten der chatview als "neue anfrage"
  // nochmal losgeschickt - genau das macht useNavigateToConvo beim normalen
  // konversationswechsel auch, siehe dort
  const setSubmission = useSetRecoilState(store.submissionByIndex(0));
  const { mutate: setStarred } = useStarBlockMessageMutation(blockId);

  if (messages.length === 0) {
    return <p className="text-sm text-text-secondary">{emptyText}</p>;
  }

  // markierte nachrichten nach oben, sonst reihenfolge wie bisher (stabiler sort)
  const sortedMessages = enableStarring
    ? [...messages].sort((a, b) => Number(b.starred) - Number(a.starred))
    : messages;

  const handleStarClick = (event: MouseEvent, message: TBlockMessage) => {
    event.stopPropagation();
    setStarred({ messageId: message.messageId, starred: !message.starred });
  };

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
      {sortedMessages.map((message, index) => (
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
            {enableStarring && (
              <button
                type="button"
                aria-label={message.starred ? 'Markierung entfernen' : 'Nachricht markieren'}
                onClick={(event) => handleStarClick(event, message)}
                onKeyDown={(event) => event.stopPropagation()}
                className={cn(
                  'ml-auto text-text-secondary hover:text-yellow-500',
                  message.starred && 'text-yellow-500',
                )}
              >
                <Star size={16} className={cn(message.starred && 'fill-current')} />
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap">
            {preview ? previewText(message.text) : message.text}
          </p>
          {showReasoning && message.reasoning && (
            <ReasoningLine
              reasoning={message.reasoning}
              blockTitle={blockTitle}
              createdAt={message.createdAt}
              previousCreatedAt={index > 0 ? sortedMessages[index - 1].createdAt : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}
