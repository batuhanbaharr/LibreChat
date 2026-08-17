import type { TBlockMessage } from 'librechat-data-provider';

function formatTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface BlockMessageListProps {
  messages: TBlockMessage[];
  emptyText: string;
  showRole?: boolean;
}

export default function BlockMessageList({ messages, emptyText, showRole }: BlockMessageListProps) {
  if (messages.length === 0) {
    return <p className="text-sm text-text-secondary">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) => (
        <div key={message.messageId} className="rounded-lg bg-surface-hover p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 text-xs text-text-secondary">
            <span>{formatTime(message.createdAt)} Uhr</span>
            {showRole && <span>· {message.isCreatedByUser ? 'Nutzer' : 'Assistent'}</span>}
          </div>
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
      ))}
    </div>
  );
}
