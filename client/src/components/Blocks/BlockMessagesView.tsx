import { useParams, Link } from 'react-router-dom';
import { decodeBlockId } from 'librechat-data-provider';
import { useBlockMessagesQuery } from '~/data-provider';
import BlockMessageList from './BlockMessageList';

export default function BlockMessagesView() {
  const { blockId } = useParams();
  const { data, isLoading, error } = useBlockMessagesQuery(blockId);

  const responses = (data?.messages ?? []).filter((m) => !m.isCreatedByUser);
  const conversationId = blockId ? decodeBlockId(blockId)?.conversationId : undefined;

  return (
    <div className="mx-auto max-w-2xl p-8 text-text-primary">
      <Link
        to={`/blocks/${blockId}`}
        className="mb-6 inline-block text-sm text-text-secondary hover:text-text-primary"
      >
        ← Zurück zum Block
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">Alle Nachrichten</h1>

      {isLoading && <p className="text-sm text-text-secondary">Nachrichten werden geladen...</p>}
      {error != null && <p className="text-sm text-red-500">Fehler beim Laden.</p>}

      {!isLoading && error == null && (
        <BlockMessageList
          messages={responses}
          emptyText="Keine Nachrichten in diesem Block."
          conversationId={conversationId}
          preview
        />
      )}
    </div>
  );
}
