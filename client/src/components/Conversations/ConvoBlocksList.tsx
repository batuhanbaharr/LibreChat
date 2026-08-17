import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { encodeBlockId } from 'librechat-data-provider';
import type { TDetectedBlock } from 'librechat-data-provider';

interface ConvoBlocksListProps {
  blocks: TDetectedBlock[];
}

function ConvoBlocksList({ blocks }: ConvoBlocksListProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-0.5 py-0.5 pl-9 pr-2">
      {blocks.map((block) => (
        <button
          key={block.conversationId + block.detectedAt}
          type="button"
          onClick={() =>
            navigate(`/blocks/${encodeBlockId(block.conversationId, block.detectedAt)}`)
          }
          className="truncate rounded-md px-2 py-1 text-left text-xs text-text-secondary outline-none hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        >
          {block.title}
        </button>
      ))}
    </div>
  );
}

export default memo(ConvoBlocksList);
