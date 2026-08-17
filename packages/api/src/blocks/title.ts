import { logger } from '@librechat/data-schemas';
import { GoogleGenAI } from '@google/genai';
import type { TDetectedBlock } from 'librechat-data-provider';
import type { BlocksServiceDeps, BlockMessage } from './service';

// gleicher grund wie beim tie-breaker und der zusammenfassung: flash-lite statt
// flash-latest, viel höheres kontingent
const TITLE_MODEL = 'gemini-3.5-flash-lite';

// ein zusammenhängender austausch ist meistens user-frage + bot-antwort = 2 nachrichten.
// 4 entspricht also etwa zwei vollen austauschen, bevor der titel nochmal geprüft wird.
// das gibt der llm genug neuen inhalt um zu beurteilen ob sich das thema wirklich
// weiterentwickelt hat, filtert aber kurze zwischennachrichten wie "ok" oder "danke"
// raus, die messageCount zwar erhöhen aber inhaltlich nichts zum thema beitragen. bei
// jeder einzelnen nachricht neu zu generieren wäre unnötig teuer und würde den titel
// ständig leicht anders formulieren, ohne dass sich am thema etwas geändert hat
export const TITLE_REGEN_INTERVAL = 4;

// titel sind jetzt eine kurze phrase statt nur 2-3 wörtern (siehe prompt unten),
// deshalb etwas mehr platz als vorher - bleibt aber eine harte grenze falls die llm
// die längenvorgabe im prompt mal ignoriert
const MAX_TITLE_LENGTH = 100;

// der google genai client wartet standardmäßig bis zu 60s und wiederholt bei einem
// timeout sogar noch - bei mehreren blocks in einer anfrage summiert sich das schnell
// zu minuten. titel sind nur "nice to have" (fallback existiert ja), deshalb hier hart
// nach ein paar sekunden abbrechen statt die ganze anfrage hängen zu lassen
const TITLE_REQUEST_TIMEOUT_MS = 8000;

// unterhalb dieser zeichenzahl gilt der user-anteil eines blocks als "dünn" - z.b. ein
// reines "fass zusammen"-prompt ohne eigene inhaltliche stichworte. bug gewesen: bei so
// einem block hatte das llm (flash-lite, siehe oben - reagiert empfindlicher auf sowas als
// ein stärkeres modell) mangels echtem inhalt das beispiel aus der anweisung selbst als
// thema übernommen. deshalb bekommt das llm in diesem fall zusätzlich die titel der
// anderen blocks der unterhaltung als echten anhaltspunkt (siehe otherBlocksHint unten)
const THIN_CONTENT_LENGTH = 150;

function stripQuotes(text: string): string {
  return text.replace(/^["'„“]+|["'„“]+$/g, '').trim();
}

// reiner text-baustein, losgelöst vom eigentlichen llm-aufruf - lässt sich dadurch ohne
// netzwerk/api-key testen (siehe title.spec.ts)
export function buildTitlePrompt(
  conversation: string,
  previousTitle: string | null,
  otherBlockTitles: string[],
): string {
  const previousTitleHint = previousTitle
    ? `\n\nBisheriger Titel: "${previousTitle}". Bleib bei diesem Titel, wenn er weiterhin passt, höchstens die Formulierung leicht anpassen. Wechsle nur zu einem wirklich anderen Titel, wenn die Nachrichten klar zeigen, dass der bisherige Titel falsch oder zu eng gefasst war.`
    : '';

  // nur bei dünnem inhalt anhängen - bei einem inhaltlich klaren abschnitt würden die
  // themen der anderen blocks nur ablenken/verwirren statt zu helfen
  const otherBlocksHint =
    conversation.length < THIN_CONTENT_LENGTH && otherBlockTitles.length > 0
      ? `\n\nDieser Abschnitt hat kaum eigenen Inhalt. Das hier sind die Titel der ANDEREN Abschnitte, die bereits in dieser Unterhaltung vorkamen (nur zur Einordnung, NICHT der Titel für DIESEN Abschnitt):\n${otherBlockTitles.map((t) => `- ${t}`).join('\n')}`
      : '';

  return `Hier sind die Nutzer-Nachrichten aus einem zusammenhängenden Gesprächsabschnitt, alle zum gleichen Thema.

${conversation}

Gib einen kurzen Titel für diesen Abschnitt. Kein knappes Themen-Label wie "[Thema]", sondern eine kurze Phrase oder ein Satzteil, der erkennen lässt worum es inhaltlich wirklich ging, z.B. "[Thema]: [konkretes Detail dazu]". Trotzdem kompakt bleiben: eine Zeile, kein ganzer Satz mit Punkt, ohne Anführungszeichen.${previousTitleHint}${otherBlocksHint}

Nur der Titel, keine Einleitung.`;
}

export interface BlockTitleGenerator {
  generateTitle: (
    messages: BlockMessage[],
    previousTitle: string | null,
    otherBlockTitles: string[],
  ) => Promise<string | null>;
}

export function createBlockTitleGenerator(apiKey: string | undefined): BlockTitleGenerator {
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

  async function generateTitle(
    messages: BlockMessage[],
    previousTitle: string | null,
    otherBlockTitles: string[],
  ): Promise<string | null> {
    const client = getClient();
    if (!client) {
      return null;
    }

    const conversation = messages
      .filter((m) => m.isCreatedByUser)
      .map((m) => m.text)
      .join('\n');

    const prompt = buildTitlePrompt(conversation, previousTitle, otherBlockTitles);

    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), TITLE_REQUEST_TIMEOUT_MS);

    try {
      const response = await client.models.generateContent({
        model: TITLE_MODEL,
        contents: prompt,
        config: { abortSignal: timeoutController.signal },
      });
      const rawTitle = response.text?.trim();
      return rawTitle ? stripQuotes(rawTitle).slice(0, MAX_TITLE_LENGTH) : null;
    } catch (error) {
      logger.error('[Blocks] title request failed:', error);
      return null;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  return { generateTitle };
}

export interface CachedBlockTitle {
  title: string;
  lastMessageId: string;
  messageCount: number;
}

export interface BlockTitleDeps extends BlocksServiceDeps {
  titleGenerator: BlockTitleGenerator;
  getBlockTitle: (conversationId: string, detectedAt: string) => Promise<CachedBlockTitle | null>;
  saveBlockTitle: (
    conversationId: string,
    detectedAt: string,
    data: CachedBlockTitle,
  ) => Promise<void>;
}

// holt für alle ANDEREN blocks derselben unterhaltung ihren aktuell besten titel - den
// gecachten, falls schon vorhanden, sonst den fallback-titel (anfang der ankernachricht,
// siehe startWorkingBlock in service.ts). dient als kontext für generateTitle bei
// inhaltlich dünnen blocks, siehe THIN_CONTENT_LENGTH oben
export async function getSiblingBlockTitles(
  block: Pick<TDetectedBlock, 'conversationId' | 'detectedAt'>,
  allBlocksInConversation: Pick<TDetectedBlock, 'conversationId' | 'detectedAt' | 'title'>[],
  deps: Pick<BlockTitleDeps, 'getBlockTitle'>,
): Promise<string[]> {
  const siblings = allBlocksInConversation.filter(
    (b) => b.conversationId === block.conversationId && b.detectedAt !== block.detectedAt,
  );

  return Promise.all(
    siblings.map(async (sibling) => {
      const cached = await deps.getBlockTitle(sibling.conversationId, sibling.detectedAt);
      return cached?.title ?? sibling.title;
    }),
  );
}

// nur neu generieren wenn der block seit dem letzten cache-eintrag um mindestens
// TITLE_REGEN_INTERVAL nachrichten gewachsen ist. `members` kommt hier schon fertig
// gefiltert rein (siehe getBlockMemberMessages in service.ts) - kein zweiter
// datenbank-call nötig, weil getDetectedBlocksForUser die nachrichten der conversation
// eh schon geladen hat
export async function resolveBlockTitle(
  members: BlockMessage[],
  block: Pick<TDetectedBlock, 'conversationId' | 'detectedAt' | 'title'>,
  deps: BlockTitleDeps,
  otherBlockTitles: string[] = [],
): Promise<string> {
  if (members.length === 0) {
    return block.title;
  }

  const lastMessage = members[members.length - 1];
  const cached = await deps.getBlockTitle(block.conversationId, block.detectedAt);
  const needsRegeneration = !cached || members.length - cached.messageCount >= TITLE_REGEN_INTERVAL;

  if (cached && !needsRegeneration) {
    return cached.title;
  }

  const title = await deps.titleGenerator.generateTitle(
    members,
    cached?.title ?? null,
    otherBlockTitles,
  );
  if (!title) {
    // llm gerade nicht erreichbar -> lieber den letzten guten titel behalten, oder falls
    // es noch nie einen gab, die einfache kürzung, statt die anfrage scheitern zu lassen
    return cached?.title ?? block.title;
  }

  await deps.saveBlockTitle(block.conversationId, block.detectedAt, {
    title,
    lastMessageId: lastMessage.messageId,
    messageCount: members.length,
  });

  return title;
}
