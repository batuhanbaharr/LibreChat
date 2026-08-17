import { useParams, Link } from 'react-router-dom';
import { decodeBlockId } from 'librechat-data-provider';
import { useBlockMessagesQuery, useGetBlocksQuery } from '~/data-provider';
import BlockMessageList from './BlockMessageList';

export default function BlockHistoryView() {
  const { blockId } = useParams();
  const { data, isLoading, error } = useBlockMessagesQuery(blockId);
  const { data: blocksData } = useGetBlocksQuery();

  const decoded = blockId ? decodeBlockId(blockId) : null;
  const blockTitle = decoded
    ? blocksData?.blocks.find(
        (b) => b.conversationId === decoded.conversationId && b.detectedAt === decoded.detectedAt,
      )?.title
    : undefined;

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
          showReasoning
          blockTitle={blockTitle}
        />
      )}
    </div>
  );
}
