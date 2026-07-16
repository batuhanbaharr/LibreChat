import { Link } from 'react-router-dom';
import { dummyBlocks } from './blocksData';

export default function BlocksView() {
  return (
    <div className="mx-auto max-w-3xl p-8 text-text-primary">
      <h1 className="mb-6 text-2xl font-semibold">Erkannte Blöcke</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {dummyBlocks.map((block) => (
          <Link
            key={block.id}
            to={`/blocks/${block.id}`}
            className="flex flex-col rounded-xl border border-border-medium p-5 hover:bg-surface-hover"
          >
            <span className="text-base font-medium">{block.title}</span>
            <span className="mt-2 text-sm text-text-secondary">
              Erkannt um {block.detectedAt} Uhr
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