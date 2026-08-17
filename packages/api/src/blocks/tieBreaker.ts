import { logger } from '@librechat/data-schemas';
import { GoogleGenAI } from '@google/genai';

// flash-lite statt flash-latest: eigenes, viel höheres kontingent (~1000+/tag statt 20/tag),
// und fest statt "-latest" damit sich das kontingent nicht plötzlich unter uns ändert
const TIE_BREAKER_MODEL = 'gemini-3.5-flash-lite';

// unter der grenze eindeutig anderes thema, drüber eindeutig gleiches thema.
// nur dazwischen wird nachgefragt: embedding-similarity kann von gleichen satzmustern
// getäuscht werden, z.b. "welcher IT beruf..." vs "welcher maschinenbau beruf..." lag
// bei 0.82, obwohl die themen nichts miteinander zu tun haben
export const AMBIGUOUS_ZONE_LOW = 0.55;
export const AMBIGUOUS_ZONE_HIGH = 0.9;

export function isAmbiguous(score: number): boolean {
  return score >= AMBIGUOUS_ZONE_LOW && score < AMBIGUOUS_ZONE_HIGH;
}

export interface TopicTieBreaker {
  // null = konnte nicht gefragt werden (z.b. rate limit), aufrufer soll dann selbst entscheiden
  isSameTopic: (anchorText: string, newText: string) => Promise<boolean | null>;
}

export function createTopicTieBreaker(apiKey: string | undefined): TopicTieBreaker {
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

  async function isSameTopic(anchorText: string, newText: string): Promise<boolean | null> {
    const client = getClient();
    if (!client) {
      return null;
    }

    const prompt = `Zwei Chat-Nachrichten von einem Nutzer, kurz hintereinander gestellt.

Text 1: ${anchorText}
Text 2: ${newText}

Geht es in Text 2 inhaltlich um dieselbe Sache/denselben Bereich wie in Text 1? Nicht nur eine ähnlich aufgebaute Frage, sondern wirklich derselbe Gegenstand. Antworte nur mit einem Wort: ja oder nein.`;

    try {
      const response = await client.models.generateContent({
        model: TIE_BREAKER_MODEL,
        contents: prompt,
      });
      const answer = response.text?.trim().toLowerCase();
      return answer ? answer.startsWith('ja') : null;
    } catch (error) {
      logger.error('[Blocks] tie-breaker request failed:', error);
      return null;
    }
  }

  return { isSameTopic };
}
