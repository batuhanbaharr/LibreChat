import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const HIGHLIGHT_CLASSES = ['ring-2', 'ring-blue-500'];
const HIGHLIGHT_DURATION_MS = 2000;

/**
 * Springt zu der nachricht, deren id im url-hash steht (z.b. /c/<conversationId>#<messageId>,
 * so verlinkt die blocks-ansicht auf eine einzelne nachricht) und hebt sie kurz hervor.
 * Nutzt die id, die MessageRender.tsx schon auf jede nachricht setzt.
 */
export default function useScrollToHashMessage(messagesReady: boolean) {
  const { hash } = useLocation();

  useEffect(() => {
    const messageId = hash.slice(1);
    if (!messagesReady || !messageId) {
      return;
    }

    const el = document.getElementById(messageId);
    if (!el) {
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add(...HIGHLIGHT_CLASSES);
    const timeout = setTimeout(
      () => el.classList.remove(...HIGHLIGHT_CLASSES),
      HIGHLIGHT_DURATION_MS,
    );

    return () => clearTimeout(timeout);
  }, [hash, messagesReady]);
}
