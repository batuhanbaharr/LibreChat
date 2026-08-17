import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { FileText, MessageSquare, Sparkles, History, ArrowRight } from 'lucide-react';
import { encodeBlockId } from 'librechat-data-provider';
import { useGetBlocksQuery } from '~/data-provider';
import type { TDetectedBlock } from 'librechat-data-provider';
import store from '~/store';

function formatTime(detectedAt: string): string {
  return new Date(detectedAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PromptBlocksPanel() {
  const navigate = useNavigate();
  // eine alte submission (vom letzten echten chat-turn) bleibt sonst im recoil state
  // hängen und wird von useResumableSSE beim neu-mounten der chatview als "neue anfrage"
  // nochmal losgeschickt - genau das macht useNavigateToConvo beim normalen
  // konversationswechsel auch, siehe dort
  const setSubmission = useSetRecoilState(store.submissionByIndex(0));
  const { data, isLoading, error } = useGetBlocksQuery();
  const blocks = data?.blocks ?? [];

  const [selectedBlock, setSelectedBlock] = useState<TDetectedBlock | null>(null);

  if (selectedBlock) {
    const blockId = encodeBlockId(selectedBlock.conversationId, selectedBlock.detectedAt);

    return (
      <div className="flex h-full flex-col p-4 text-text-primary">
        <button
          onClick={() => setSelectedBlock(null)}
          className="mb-4 text-left text-sm text-text-secondary hover:text-text-primary"
        >
          ← Zurück zu allen Blöcken
        </button>

        <h3 className="mb-1 text-lg font-semibold">{selectedBlock.title}</h3>
        <p className="mb-4 text-xs text-text-secondary">
          Erkannt um {formatTime(selectedBlock.detectedAt)} Uhr · {selectedBlock.messageCount}{' '}
          Nachrichten
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              setSubmission(null);
              navigate(`/c/${selectedBlock.conversationId}`);
            }}
            className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover"
          >
            <MessageSquare size={16} />
            Zum Chat
            <ArrowRight size={14} className="ml-auto" />
          </button>

          <button
            onClick={() => navigate(`/blocks/${blockId}/summary`)}
            className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover"
          >
            <Sparkles size={16} />
            Zusammenfassung generieren
          </button>
          <button
            onClick={() => navigate(`/blocks/${blockId}/messages`)}
            className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover"
          >
            <MessageSquare size={16} />
            Alle Nachrichten
          </button>
          <button
            onClick={() => navigate(`/blocks/${blockId}/prompts`)}
            className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover"
          >
            <FileText size={16} />
            Alle Prompts
          </button>
          <button
            onClick={() => navigate(`/blocks/${blockId}/history`)}
            className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover"
          >
            <History size={16} />
            History
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4 text-text-primary">
      <h3 className="mb-3 text-lg font-semibold">Erkannte Blöcke</h3>

      {isLoading && <p className="text-sm text-text-secondary">Blöcke werden erkannt...</p>}

      {error != null && <p className="text-sm text-red-500">Fehler beim Laden der Blöcke.</p>}

      {!isLoading && error == null && blocks.length === 0 && (
        <p className="text-sm text-text-secondary">Noch keine Blöcke erkannt.</p>
      )}

      <div className="flex flex-col gap-2">
        {blocks.map((block) => (
          <button
            key={block.conversationId + block.detectedAt}
            onClick={() => setSelectedBlock(block)}
            className="flex flex-col items-start rounded-lg border border-border-medium p-3 text-left hover:bg-surface-hover"
          >
            <span className="text-sm font-medium">{block.title}</span>
            <span className="mt-1 text-xs text-text-secondary">
              {formatTime(block.detectedAt)} Uhr · {block.messageCount} Nachrichten
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
