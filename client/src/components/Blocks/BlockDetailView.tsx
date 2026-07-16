import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sparkles, MessageSquare, FileText, History, MessageCircle } from 'lucide-react';
import { dummyBlocks } from './blocksData';

type ViewMode = 'none' | 'summary' | 'messages' | 'prompts' | 'history';

export default function BlockDetailView() {
  const { blockId } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('none');

  const block = dummyBlocks.find((b) => b.id === blockId);

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

  const toggleView = (mode: ViewMode) => {
    setViewMode((current) => (current === mode ? 'none' : mode));
  };

  return (
    <div className="mx-auto max-w-2xl p-8 text-text-primary">
      <Link to="/blocks" className="mb-6 inline-block text-sm text-text-secondary hover:text-text-primary">
        ← Zurück zu allen Blöcken
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">{block.title}</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Erkannt um {block.detectedAt} Uhr · {block.messageCount} Nachrichten
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => toggleView('summary')}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <Sparkles size={16} />
          Zusammenfassung generieren
        </button>

        {viewMode === 'summary' && (
          <div className="mb-2 rounded-lg bg-surface-hover p-4 text-sm">
            {block.summary}
          </div>
        )}

        <button
          onClick={() => toggleView('messages')}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <MessageSquare size={16} />
          Alle Nachrichten
        </button>

        {viewMode === 'messages' && (
          <div className="mb-2 flex flex-col gap-2">
            {block.responses.map((response, index) => (
              <div key={index} className="rounded-lg bg-surface-hover p-3 text-sm">
                {response}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => toggleView('prompts')}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <FileText size={16} />
          Alle Prompts
        </button>

        {viewMode === 'prompts' && (
          <div className="mb-2 flex flex-col gap-2">
            {block.prompts.map((prompt, index) => (
              <div key={index} className="rounded-lg bg-surface-hover p-3 text-sm">
                {prompt}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => toggleView('history')}
          className="flex items-center gap-2 rounded-lg border border-border-medium px-4 py-3 text-sm hover:bg-surface-hover"
        >
          <History size={16} />
          History
        </button>

        {viewMode === 'history' && (
          <div className="mb-2 rounded-lg bg-surface-hover p-4 text-sm text-text-secondary">
            Block erkannt um {block.detectedAt} Uhr · {block.messageCount} Nachrichten insgesamt
          </div>
        )}

        <button
          onClick={() => navigate('/c/new')}
          className="mt-4 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white hover:bg-blue-700"
        >
          <MessageCircle size={16} />
          Fokussierte Block-Chat erstellen
        </button>
      </div>
    </div>
  );
}