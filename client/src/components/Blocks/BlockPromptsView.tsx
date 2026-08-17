import { useParams, Link } from 'react-router-dom';
import { useBlockMessagesQuery } from '~/data-provider';
import BlockMessageList from './BlockMessageList';

export default function BlockPromptsView() {
  const { blockId } = useParams();
  const { data, isLoading, error } = useBlockMessagesQuery(blockId);

  const prompts = (data?.messages ?? []).filter((m) => m.isCreatedByUser);

  return (
    <div className="mx-auto max-w-2xl p-8 text-text-primary">
      <Link
        to={`/blocks/${blockId}`}
        className="mb-6 inline-block text-sm text-text-secondary hover:text-text-primary"
      >
        ← Zurück zum Block
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">Alle Prompts</h1>

      {isLoading && <p className="text-sm text-text-secondary">Prompts werden geladen...</p>}
      {error != null && <p className="text-sm text-red-500">Fehler beim Laden.</p>}

      {!isLoading && error == null && (
        <BlockMessageList messages={prompts} emptyText="Keine Prompts in diesem Block." />
      )}
    </div>
  );
}
