// baut aus conversationId + detectedAt eine id für die /blocks/:blockId route,
// weil ein block selbst keine eigene id hat. wird von frontend und backend genutzt
const SEPARATOR = '::';

export function encodeBlockId(conversationId: string, detectedAt: string): string {
  return encodeURIComponent(`${conversationId}${SEPARATOR}${detectedAt}`);
}

export function decodeBlockId(
  blockId: string,
): { conversationId: string; detectedAt: string } | null {
  const [conversationId, detectedAt] = decodeURIComponent(blockId).split(SEPARATOR);
  if (!conversationId || !detectedAt) {
    return null;
  }
  return { conversationId, detectedAt };
}
