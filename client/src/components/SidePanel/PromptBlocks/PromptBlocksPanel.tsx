import { useState } from 'react';
import { FileText, MessageSquare, Sparkles, History } from 'lucide-react';
interface PromptBlock {
  id: string;
  title: string;
  detectedAt: string;
  messageCount: number;
}
// fake daten später durch echte erkennung ersetzen
const dummyBlocks: PromptBlock[] = [
  { id: '1', title: 'React Hooks Debugging', detectedAt: '09:14', messageCount: 6 },
  { id: '2', title: 'LibreChat Setup', detectedAt: '09:42', messageCount: 12 },
  { id: '3', title: 'MongoDB Verbindung', detectedAt: '10:05', messageCount: 4 },
];
export default function PromptBlocksPanel() {
  const [selectedBlock, setSelectedBlock] = useState<PromptBlock | null>(null);

  if (selectedBlock) {
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
          Erkannt um {selectedBlock.detectedAt} Uhr · {selectedBlock.messageCount} Nachrichten
        </p>

        <div className="flex flex-col gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover">
            <Sparkles size={16} />
            Zusammenfassung generieren
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover">
            <MessageSquare size={16} />
            Alle Nachrichten
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover">
            <FileText size={16} />
            Alle Prompts
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm hover:bg-surface-hover">
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

      <div className="flex flex-col gap-2">
        {dummyBlocks.map((block) => (
          <button
            key={block.id}
            onClick={() => setSelectedBlock(block)}
            className="flex flex-col items-start rounded-lg border border-border-medium p-3 text-left hover:bg-surface-hover"
          >
            <span className="text-sm font-medium">{block.title}</span>
            <span className="mt-1 text-xs text-text-secondary">
              {block.detectedAt} Uhr · {block.messageCount} Nachrichten
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}