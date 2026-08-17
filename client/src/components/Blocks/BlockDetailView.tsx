import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sparkles, MessageSquare, FileText, History, MessageCircle } from 'lucide-react';
import { decodeBlockId } from 'librechat-data-provider';
import { useGetBlocksQuery } from '~/data-provider';

function formatTime(detectedAt: string): string {
  return new Date(detectedAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BlockDetailView() {
  const { blockId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useGetBlocksQuery();

  const decoded = blockId ? decodeBlockId(blockId) : null;
  const block = decoded
    ? data?.blocks.find(
        (b) => b.conversationId === decoded.conversationId && b.detectedAt === decoded.detectedAt,
      )
    : undefined;

  if (isLoading) {
    return (
      <div className="p-8 text-text-primary">
        <p className="text-sm text-text-secondary">Block wird geladen...</p>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="p-8 text-text-primary">
        <p>Block nicht gefunden.</p>
        <Link to="/blocks" className="text-sm text-blue-500">
          Zurück zu allen Blöcken
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8 text-text-primary">
      <Link
        to="/blocks"
        className="mb-6 inline-block text-sm text-text-secondary hover:text-text-primary"
      >
        ← Zurück zu allen Blöcken
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">{block.title}</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Erkannt um {formatTime(block.detectedAt)} Uhr · {block.messageCount} Nachrichten
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => navigate(`/c/${block.conversationId}`)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white hover:bg-blue-700"
        >
          <MessageCircle size={16} />
          Zum Chat
        </button>

        <button
          onClick={() => navigate(`/blocks/${blockId}/summary`)}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <Sparkles size={16} />
          Zusammenfassung generieren
        </button>
        <button
          onClick={() => navigate(`/blocks/${blockId}/messages`)}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <MessageSquare size={16} />
          Alle Nachrichten
        </button>
        <button
          onClick={() => navigate(`/blocks/${blockId}/prompts`)}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <FileText size={16} />
          Alle Prompts
        </button>
        <button
          onClick={() => navigate(`/blocks/${blockId}/history`)}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <History size={16} />
          History
        </button>
      </div>
    </div>
  );
}
