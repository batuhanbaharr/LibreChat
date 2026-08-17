import { useParams, Link } from 'react-router-dom';
import { useBlockMessagesQuery } from '~/data-provider';
import BlockMessageList from './BlockMessageList';

export default function BlockHistoryView() {
  const { blockId } = useParams();
  const { data, isLoading, error } = useBlockMessagesQuery(blockId);

  return (
    <div className="mx-auto max-w-2xl p-8 text-text-primary">
      <Link
        to={`/blocks/${blockId}`}
        className="mb-6 inline-block text-sm text-text-secondary hover:text-text-primary"
      >
        ← Zurück zum Block
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">History</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Zeigt, wie der Block über die Zeit gewachsen ist.
      </p>

      {isLoading && <p className="text-sm text-text-secondary">History wird geladen...</p>}
      {error != null && <p className="text-sm text-red-500">Fehler beim Laden.</p>}

      {!isLoading && error == null && (
        <BlockMessageList
          messages={data?.messages ?? []}
          emptyText="Keine History für diesen Block."
          showRole
        />
      )}
    </div>
  );
}
