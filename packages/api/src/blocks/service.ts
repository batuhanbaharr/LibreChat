import type { IMessage, MessageMethods, ConversationMethods } from '@librechat/data-schemas';
import { ContentTypes } from 'librechat-data-provider';
import type { TDetectedBlock } from 'librechat-data-provider';
import { cosineSimilarity, startCentroid, addToCentroid, centroidVector } from './similarity';
import type { Centroid } from './similarity';
import { isTooShortToEmbed, minutesBetween, hybridScore } from './scoring';
import { isAmbiguous } from './tieBreaker';
import type { TopicTieBreaker } from './tieBreaker';
import { resolveBlockTitle, getSiblingBlockTitles } from './title';
import type { BlockTitleDeps } from './title';

// 0.65 kam aus tests mit echten nachrichten raus, siehe blocks readme/commit für die zahlen
const SIMILARITY_THRESHOLD = 0.65;

// erklärt für die history-ansicht, warum eine nachricht in ihrem block gelandet ist -
// same_block = normaler anschluss an den gerade aktiven block, new_block = thema war
// anders, reactivated_block = ein früherer (nicht mehr aktiver) block wurde wieder aufgegriffen
export type BlockJoinReason = 'new_block' | 'same_block' | 'reactivated_block';

export interface BlockJoinReasoning {
  reason: BlockJoinReason;
  // ähnlichkeit zum vergleichs-block (aktueller block bei same_block/new_block, der
  // wiederaufgenommene block bei reactivated_block). null wenn nichts verglichen wurde
  // (allererste nachricht der unterhaltung oder eine kurze bestätigung wie "ok")
  score: number | null;
  tieBreakerUsed: boolean;
}

export interface BlocksServiceDeps {
  getConvosByCursor: ConversationMethods['getConvosByCursor'];
  getMessages: MessageMethods['getMessages'];
  getEmbedding: (text: string) => Promise<number[]>;
  saveEmbedding: MessageMethods['setMessageBlockEmbedding'];
  tieBreaker: TopicTieBreaker;
  getBlockDecision: (anchorMessageId: string, messageId: string) => Promise<boolean | null>;
  saveBlockDecision: (
    anchorMessageId: string,
    messageId: string,
    sameTopic: boolean,
  ) => Promise<void>;
}

type BlockDetectionDeps = Pick<
  BlocksServiceDeps,
  'getEmbedding' | 'saveEmbedding' | 'tieBreaker' | 'getBlockDecision' | 'saveBlockDecision'
>;

type BlockSourceMessage = Pick<
  IMessage,
  'messageId' | 'text' | 'content' | 'isCreatedByUser' | 'createdAt' | 'blockEmbedding' | 'starred'
>;
type UserMessage = BlockSourceMessage & { text: string; createdAt: Date };

function isUserMessageWithText(message: BlockSourceMessage): message is UserMessage {
  return message.isCreatedByUser && Boolean(message.text) && message.createdAt instanceof Date;
}

// block während der erkennung noch "im bau" - anchor und centroid werden am ende
// wieder abgeschnitten, die landen nicht im TDetectedBlock nach außen
interface WorkingBlock {
  title: string;
  detectedAt: string;
  conversationId: string;
  messageCount: number;
  anchor: UserMessage;
  centroid: Centroid | null;
}

function startWorkingBlock(message: UserMessage, conversationId: string): WorkingBlock {
  return {
    title: message.text.slice(0, 60),
    detectedAt: message.createdAt.toISOString(),
    conversationId,
    messageCount: 1,
    anchor: message,
    centroid: null,
  };
}

// nutzt das gecachte embedding vom letzten mal, statt gemini nochmal zu fragen
async function getOrComputeEmbedding(
  message: UserMessage,
  deps: Pick<BlockDetectionDeps, 'getEmbedding' | 'saveEmbedding'>,
): Promise<number[]> {
  if (message.blockEmbedding && message.blockEmbedding.length > 0) {
    return message.blockEmbedding;
  }

  const embedding = await deps.getEmbedding(message.text);
  await deps.saveEmbedding(message.messageId, embedding);
  return embedding;
}

// score allein reicht bei satzmustern wie "welcher X wird am häufigsten gesucht" nicht -
// die täuschen eine hohe similarity vor, obwohl X komplett andere themen sind. deshalb wird
// in der grauzone der tie-breaker gefragt statt blind dem score zu vertrauen
async function decideSameBlock(
  score: number | null,
  anchor: UserMessage,
  message: UserMessage,
  deps: Pick<BlockDetectionDeps, 'tieBreaker' | 'getBlockDecision' | 'saveBlockDecision'>,
): Promise<boolean> {
  if (score === null) {
    // noch keine embedete nachricht im block (siehe oben) -> nichts womit man vergleichen könnte
    return true;
  }

  if (!isAmbiguous(score)) {
    return score >= SIMILARITY_THRESHOLD;
  }

  const cached = await deps.getBlockDecision(anchor.messageId, message.messageId);
  if (cached !== null) {
    return cached;
  }

  const sameTopic = await deps.tieBreaker.isSameTopic(anchor.text, message.text);
  if (sameTopic === null) {
    // tie-breaker konnte nicht antworten (z.b. rate limit) -> im zweifel lieber trennen,
    // eine falsche trennung ist weniger schlimm als zwei themen in einen block zu mischen
    return false;
  }

  await deps.saveBlockDecision(anchor.messageId, message.messageId, sameTopic);
  return sameTopic;
}

function attachToBlock(block: WorkingBlock, embedding: number[]): void {
  block.messageCount += 1;
  block.centroid = block.centroid
    ? addToCentroid(block.centroid, embedding)
    : startCentroid(embedding);
}

// sucht unter den ANDEREN bisherigen blocks (der aktuelle ist schon durchgefallen) den mit dem
// höchsten score zur neuen nachricht. blocks ohne centroid (noch keine "richtige" nachricht drin)
// fallen raus, die können eh nicht verglichen werden
function findBestPastBlock(
  blocks: WorkingBlock[],
  currentIndex: number,
  embedding: number[],
  gapMinutes: number,
): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null;

  for (let i = 0; i < blocks.length; i++) {
    if (i === currentIndex) {
      continue;
    }
    const centroid = blocks[i].centroid;
    if (!centroid) {
      continue;
    }
    const score = hybridScore(cosineSimilarity(centroidVector(centroid), embedding), gapMinutes);
    if (!best || score > best.score) {
      best = { index: i, score };
    }
  }

  return best;
}

// ordnet jeder nachricht (auch bot-antworten und kurze bestätigungen) die id ihres blocks zu.
// user-nachrichten mit bekannter zuordnung (assignedBlock) setzen den "aktiven" block, alles
// andere (bot-antworten usw) hängt sich einfach an den zuletzt aktiven block dran - genau wie
// eine bot-antwort chronologisch direkt auf die user-frage folgt, die sie beantwortet
function collectMessageIds(
  messages: BlockSourceMessage[],
  assignedBlock: Map<string, number>,
  blockCount: number,
): string[][] {
  const messageIds: string[][] = Array.from({ length: blockCount }, () => []);
  let activeIndex: number | null = null;

  for (const message of messages) {
    const assigned = assignedBlock.get(message.messageId);
    if (assigned !== undefined) {
      activeIndex = assigned;
    }
    if (activeIndex !== null) {
      messageIds[activeIndex].push(message.messageId);
    }
  }

  return messageIds;
}

interface DetectionRun {
  blocks: WorkingBlock[];
  assignedBlock: Map<string, number>;
  // messageId -> reasoning, nur für user-nachrichten die wirklich eine entscheidung durchlaufen
  // haben (bot-antworten tauchen hier nicht auf, siehe collectMessageIds)
  reasoningByMessage: Map<string, BlockJoinReasoning>;
}

// die eigentliche block-erkennung, arbeitet nur mit den schon gefilterten user-nachrichten.
// wird von detectBlocksInConversation und detectBlocksWithReasoning geteilt, damit die
// erkennungslogik an genau einer stelle steht
async function runDetection(
  conversationId: string,
  userMessages: UserMessage[],
  deps: BlockDetectionDeps,
): Promise<DetectionRun> {
  const blocks: WorkingBlock[] = [startWorkingBlock(userMessages[0], conversationId)];
  // welcher block bekommt gerade kurze/unklare nachrichten und ist der erste vergleichspunkt
  let currentBlockIndex = 0;
  let lastMessageTime = userMessages[0].createdAt;
  // messageId -> index in blocks, für collectMessageIds am ende
  const assignedBlock = new Map<string, number>([[userMessages[0].messageId, 0]]);
  // die allererste nachricht der unterhaltung eröffnet immer einen block, es gibt ja noch nichts womit man vergleichen könnte
  const reasoningByMessage = new Map<string, BlockJoinReasoning>([
    [userMessages[0].messageId, { reason: 'new_block', score: null, tieBreakerUsed: false }],
  ]);

  // centroid ist null solange noch keine einzige "richtige" nachricht im block embedded wurde
  blocks[0].centroid = isTooShortToEmbed(userMessages[0].text)
    ? null
    : startCentroid(await getOrComputeEmbedding(userMessages[0], deps));

  for (let i = 1; i < userMessages.length; i++) {
    const message = userMessages[i];

    if (isTooShortToEmbed(message.text)) {
      // "ok", "danke" usw -> gehört einfach zum aktuellen block, kein embedding nötig
      blocks[currentBlockIndex].messageCount += 1;
      assignedBlock.set(message.messageId, currentBlockIndex);
      reasoningByMessage.set(message.messageId, {
        reason: 'same_block',
        score: null,
        tieBreakerUsed: false,
      });
      lastMessageTime = message.createdAt;
      continue;
    }

    const embedding = await getOrComputeEmbedding(message, deps);
    const gapMinutes = minutesBetween(lastMessageTime, message.createdAt);
    const current = blocks[currentBlockIndex];
    const currentScore = current.centroid
      ? hybridScore(cosineSimilarity(centroidVector(current.centroid), embedding), gapMinutes)
      : null;
    // schon hier bestimmen, nicht erst wenn der aktuelle block durchfällt - sonst wird ein
    // früherer block, der klar besser passt, nie mit verglichen, nur weil der aktuelle block
    // zufällig zuerst gefragt wird und in der grauzone landet (siehe bug: "limits"-nachricht
    // hängte sich an den aktiven block statt an den deutlich besser passenden request-limit-block)
    const bestPast = findBestPastBlock(blocks, currentBlockIndex, embedding, gapMinutes);
    const currentIsBestMatch =
      bestPast === null || currentScore === null || currentScore >= bestPast.score;

    const staysInCurrent = currentIsBestMatch
      ? await decideSameBlock(currentScore, current.anchor, message, deps)
      : false;

    if (staysInCurrent) {
      attachToBlock(current, embedding);
      assignedBlock.set(message.messageId, currentBlockIndex);
      reasoningByMessage.set(message.messageId, {
        reason: 'same_block',
        score: currentScore,
        tieBreakerUsed: currentScore !== null && isAmbiguous(currentScore),
      });
    } else {
      // aktueller block passt nicht mehr - vielleicht knüpft die nachricht statt an einen
      // neuen block an ein früheres thema an, das gerade wieder aufgegriffen wird
      const reactivated =
        bestPast !== null &&
        (await decideSameBlock(bestPast.score, blocks[bestPast.index].anchor, message, deps));

      if (bestPast !== null && reactivated) {
        attachToBlock(blocks[bestPast.index], embedding);
        assignedBlock.set(message.messageId, bestPast.index);
        currentBlockIndex = bestPast.index;
        reasoningByMessage.set(message.messageId, {
          reason: 'reactivated_block',
          score: bestPast.score,
          tieBreakerUsed: isAmbiguous(bestPast.score),
        });
      } else {
        blocks.push(startWorkingBlock(message, conversationId));
        currentBlockIndex = blocks.length - 1;
        blocks[currentBlockIndex].centroid = startCentroid(embedding);
        assignedBlock.set(message.messageId, currentBlockIndex);
        reasoningByMessage.set(message.messageId, {
          reason: 'new_block',
          score: currentScore,
          tieBreakerUsed:
            (currentScore !== null && isAmbiguous(currentScore)) ||
            (bestPast !== null && isAmbiguous(bestPast.score)),
        });
      }
    }

    lastMessageTime = message.createdAt;
  }

  return { blocks, assignedBlock, reasoningByMessage };
}

interface DetectionWithReasoning {
  blocks: TDetectedBlock[];
  reasoningByMessage: Map<string, BlockJoinReasoning>;
}

// wie detectBlocksInConversation, gibt aber zusätzlich die reasoning-map raus - für
// getBlockMessages, das die begründung an jede nachricht dranhängen muss
async function detectBlocksWithReasoning(
  conversationId: string,
  messages: BlockSourceMessage[],
  deps: BlockDetectionDeps,
): Promise<DetectionWithReasoning> {
  const userMessages = messages.filter(isUserMessageWithText);

  if (userMessages.length === 0) {
    return { blocks: [], reasoningByMessage: new Map() };
  }

  const { blocks, assignedBlock, reasoningByMessage } = await runDetection(
    conversationId,
    userMessages,
    deps,
  );
  const messageIds = collectMessageIds(messages, assignedBlock, blocks.length);

  const detectedBlocks = blocks.map((block, index) => ({
    title: block.title,
    detectedAt: block.detectedAt,
    conversationId: block.conversationId,
    messageCount: block.messageCount,
    messageIds: messageIds[index],
  }));

  return { blocks: detectedBlocks, reasoningByMessage };
}

export async function detectBlocksInConversation(
  conversationId: string,
  messages: BlockSourceMessage[],
  deps: BlockDetectionDeps,
): Promise<TDetectedBlock[]> {
  const { blocks } = await detectBlocksWithReasoning(conversationId, messages, deps);
  return blocks;
}

export interface BlockMessage {
  messageId: string;
  text: string;
  isCreatedByUser: boolean;
  createdAt: string;
  // warum diese nachricht in ihrem block gelandet ist - null bei bot-antworten, die
  // treffen ja keine block-entscheidung, sie hängen sich nur an die user-frage davor
  reasoning: BlockJoinReasoning | null;
  starred?: boolean;
}

type MessageWithText = BlockSourceMessage & { text: string; createdAt: Date };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractPartText(part: unknown): string {
  if (!isRecord(part) || part.type !== ContentTypes.TEXT) {
    return '';
  }
  const value = part[ContentTypes.TEXT];
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value) && typeof value.value === 'string') {
    return value.value;
  }
  return '';
}

// bot-antworten vom agents-endpoint (heute der standard-chat-pfad) landen nicht im
// text-feld, sondern nur in content (siehe BaseClient.js, responseMessage.text wird dort
// explizit auf '' gesetzt). ohne diesen fallback wären bot-antworten hier immer leer,
// obwohl die nachricht selbst durchaus text hat
function resolveMessageText(message: BlockSourceMessage): string {
  if (message.text) {
    return message.text;
  }
  if (!Array.isArray(message.content)) {
    return '';
  }
  return message.content
    .map(extractPartText)
    .filter((text) => text.length > 0)
    .join('\n');
}

function hasTextAndDate(message: BlockSourceMessage): message is MessageWithText {
  return Boolean(resolveMessageText(message)) && message.createdAt instanceof Date;
}

// filtert aus allen nachrichten einer conversation die raus, die zu einem bestimmten
// block gehören (per messageIds). eigene funktion, damit getDetectedBlocksForUser sie
// für die titel-generierung wiederverwenden kann, ohne die nachrichten nochmal aus der
// datenbank zu laden - die conversation ist an der stelle eh schon geladen
function getBlockMemberMessages(
  messages: BlockSourceMessage[],
  block: Pick<TDetectedBlock, 'messageIds'>,
  reasoningByMessage: Map<string, BlockJoinReasoning> = new Map(),
): BlockMessage[] {
  const memberIds = new Set(block.messageIds);

  return messages
    .filter(hasTextAndDate)
    .filter((m) => memberIds.has(m.messageId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => ({
      messageId: m.messageId,
      text: resolveMessageText(m),
      isCreatedByUser: m.isCreatedByUser,
      createdAt: m.createdAt.toISOString(),
      reasoning: reasoningByMessage.get(m.messageId) ?? null,
      starred: Boolean(m.starred),
    }));
}

// holt alle echten nachrichten (user + bot) die zu einem block gehören. läuft die block-erkennung
// nochmal für die eine konversation (dank cache günstig) und nutzt die explizite messageIds-liste
// statt eines zeitfensters, weil ein wieder aufgegriffener block nicht mehr zusammenhängend ist
export async function getBlockMessages(
  userId: string,
  conversationId: string,
  detectedAt: string,
  deps: BlocksServiceDeps,
): Promise<BlockMessage[] | null> {
  const messages = await deps.getMessages({ conversationId, user: userId }, '+blockEmbedding');
  if (messages.length === 0) {
    return null;
  }

  const { blocks, reasoningByMessage } = await detectBlocksWithReasoning(
    conversationId,
    messages,
    deps,
  );
  const block = blocks.find((b) => b.detectedAt === detectedAt);
  if (!block) {
    return null;
  }

  return getBlockMemberMessages(messages, block, reasoningByMessage);
}

// block + seine mitglieder, wartet noch auf den titel - trennt die (sequentielle)
// erkennung von der (parallelen) titel-generierung weiter unten
interface BlockAwaitingTitle {
  block: TDetectedBlock;
  members: BlockMessage[];
}

// lädt nachrichten + erkennt blocks für eine conversation. eine konversation hängt
// nicht von einer anderen ab, deshalb kann getDetectedBlocksForUser das für alle
// konversationen gleichzeitig anstoßen statt nacheinander auf jede zu warten
async function detectBlocksForConversation(
  userId: string,
  conversationId: string,
  deps: BlockTitleDeps,
): Promise<BlockAwaitingTitle[]> {
  const messages = await deps.getMessages({ conversationId, user: userId }, '+blockEmbedding');
  if (messages.length === 0) {
    return [];
  }

  const blocksForConvo = await detectBlocksInConversation(conversationId, messages, deps);

  return blocksForConvo.map((block) => ({
    block,
    members: getBlockMemberMessages(messages, block),
  }));
}

export async function getDetectedBlocksForUser(
  userId: string,
  deps: BlockTitleDeps,
): Promise<TDetectedBlock[]> {
  const { conversations } = await deps.getConvosByCursor(userId, { limit: 10 });

  const blocksByConvo = await Promise.all(
    conversations.map((conversation) =>
      detectBlocksForConversation(userId, conversation.conversationId, deps),
    ),
  );
  const pendingBlocks = blocksByConvo.flat();

  // titel werden pro block einzeln beim llm angefragt - nacheinander würde sich die
  // wartezeit mit jedem block aufsummieren (siehe timeout-kommentar in title.ts), also
  // alle gleichzeitig anfragen statt einen nach dem anderen abzuwarten
  const allBlocks = pendingBlocks.map(({ block }) => block);

  return Promise.all(
    pendingBlocks.map(async ({ block, members }) => {
      const otherBlockTitles = await getSiblingBlockTitles(block, allBlocks, deps);
      const title = await resolveBlockTitle(members, block, deps, otherBlockTitles);
      return { ...block, title };
    }),
  );
}
