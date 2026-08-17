import { logger } from '@librechat/data-schemas';
import { GoogleGenAI } from '@google/genai';
import { getBlockMessages } from './service';
import type { BlocksServiceDeps, BlockMessage } from './service';

// gleicher grund wie beim tie-breaker: flash-lite statt flash-latest, viel höheres kontingent
const SUMMARY_MODEL = 'gemini-3.5-flash-lite';

export interface BlockSummarizer {
  summarize: (messages: BlockMessage[]) => Promise<string | null>;
}

export function createBlockSummarizer(apiKey: string | undefined): BlockSummarizer {
  let ai: GoogleGenAI | undefined;

  function getClient(): GoogleGenAI | null {
    if (!apiKey) {
      return null;
    }
    if (!ai) {
      ai = new GoogleGenAI({ apiKey });
    }
    return ai;
  }

  async function summarize(messages: BlockMessage[]): Promise<string | null> {
    const client = getClient();
    if (!client) {
      return null;
    }

    const conversation = messages
      .map((m) => `${m.isCreatedByUser ? 'Nutzer' : 'Assistent'}: ${m.text}`)
      .join('\n');

    const prompt = `Hier ist ein ausschnitt aus einem chat, alles zum gleichen thema.

${conversation}

Fass in 2-3 kurzen sätzen auf deutsch zusammen worum es hier ging. Direkt die zusammenfassung, keine einleitung wie "hier ist die zusammenfassung".`;

    try {
      const response = await client.models.generateContent({
        model: SUMMARY_MODEL,
        contents: prompt,
      });
      return response.text?.trim() || null;
    } catch (error) {
      logger.error('[Blocks] summary request failed:', error);
      return null;
    }
  }

  return { summarize };
}

export interface CachedBlockSummary {
  summary: string;
  lastMessageId: string;
  messageCount: number;
}

export interface BlockSummaryDeps extends BlocksServiceDeps {
  summarizer: BlockSummarizer;
  getBlockSummary: (
    conversationId: string,
    detectedAt: string,
  ) => Promise<CachedBlockSummary | null>;
  saveBlockSummary: (
    conversationId: string,
    detectedAt: string,
    data: CachedBlockSummary,
  ) => Promise<void>;
}

// block existiert nicht vs. llm ist gerade nicht erreichbar sind zwei unterschiedliche
// dinge, damit das frontend dem nutzer die richtige meldung zeigen kann statt einer
// generischen fehlerseite
export type BlockSummaryResult =
  | { status: 'ok'; summary: string }
  | { status: 'not_found' }
  | { status: 'unavailable' };

// nur neu generieren wenn sich der block seit dem letzten mal wirklich verändert hat
export async function getOrGenerateBlockSummary(
  userId: string,
  conversationId: string,
  detectedAt: string,
  deps: BlockSummaryDeps,
): Promise<BlockSummaryResult> {
  const messages = await getBlockMessages(userId, conversationId, detectedAt, deps);
  if (!messages || messages.length === 0) {
    return { status: 'not_found' };
  }

  const lastMessage = messages[messages.length - 1];
  const cached = await deps.getBlockSummary(conversationId, detectedAt);
  if (
    cached &&
    cached.messageCount === messages.length &&
    cached.lastMessageId === lastMessage.messageId
  ) {
    return { status: 'ok', summary: cached.summary };
  }

  const summary = await deps.summarizer.summarize(messages);
  if (!summary) {
    // llm gerade nicht erreichbar -> lieber eine alte zusammenfassung zeigen als gar keine
    if (cached) {
      return { status: 'ok', summary: cached.summary };
    }
    return { status: 'unavailable' };
  }

  await deps.saveBlockSummary(conversationId, detectedAt, {
    summary,
    lastMessageId: lastMessage.messageId,
    messageCount: messages.length,
  });

  return { status: 'ok', summary };
}
