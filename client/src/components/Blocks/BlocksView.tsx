import { Link } from 'react-router-dom';
import { useBlocks } from './useBlock';

export default function BlocksView() {
  const { blocks, loading, error } = useBlocks();

  return (
    <div className="mx-auto max-w-3xl p-8 text-text-primary">
      <h1 className="mb-6 text-2xl font-semibold">Erkannte Blöcke</h1>

      {loading && <p className="text-sm text-text-secondary">Blöcke werden erkannt...</p>}

      {error && (
        <p className="text-sm text-red-500">Fehler beim Laden der Blöcke: {error}</p>
      )}

      {!loading && !error && blocks.length === 0 && (
        <p className="text-sm text-text-secondary">Noch keine Blöcke erkannt.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {blocks.map((block, index) => (
          <Link
            key={index}
            to={`/c/${block.conversationId}`}
            className="flex flex-col rounded-xl border border-border-medium p-5 hover:bg-surface-hover"
          >
            <span className="text-base font-medium">{block.title}</span>
            <span className="mt-2 text-sm text-text-secondary">
              Erkannt um {new Date(block.detectedAt).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })} Uhr
            </span>
            <span className="mt-1 text-sm text-text-secondary">
              {block.messageCount} Nachrichten
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}