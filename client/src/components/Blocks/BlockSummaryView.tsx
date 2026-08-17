import { useParams, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useBlockSummaryQuery } from '~/data-provider';

// backend schickt bei 404/503 schon eine passende deutsche meldung mit, die zeigen wir direkt
function getErrorMessage(error: unknown): string {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message ?? 'Zusammenfassung konnte gerade nicht erstellt werden.';
}

export default function BlockSummaryView() {
  const { blockId } = useParams();
  const { data, isLoading, error } = useBlockSummaryQuery(blockId);

  return (
    <div className="mx-auto max-w-2xl p-8 text-text-primary">
      <Link
        to={`/blocks/${blockId}`}
        className="mb-6 inline-block text-sm text-text-secondary hover:text-text-primary"
      >
        ← Zurück zum Block
      </Link>

      <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold">
        <Sparkles size={22} />
        Zusammenfassung
      </h1>

      {isLoading && <p className="text-sm text-text-secondary">Zusammenfassung wird erstellt...</p>}

      {error != null && <p className="text-sm text-red-500">{getErrorMessage(error)}</p>}

      {!isLoading && error == null && (
        <p className="whitespace-pre-wrap rounded-lg bg-surface-hover p-4 text-sm">
          {data?.summary}
        </p>
      )}
    </div>
  );
}
