import type { IMessage, MessageMethods, ConversationMethods } from '@librechat/data-schemas';
import type { TDetectedBlock } from 'librechat-data-provider';
import { cosineSimilarity, startCentroid, addToCentroid, centroidVector } from './similarity';
import type { Centroid } from './similarity';
import { isTooShortToEmbed, minutesBetween, hybridScore } from './scoring';
import { isAmbiguous } from './tieBreaker';
import type { TopicTieBreaker } from './tieBreaker';

// 0.65 kam aus tests mit echten nachrichten raus, siehe blocks readme/commit für die zahlen
const SIMILARITY_THRESHOLD = 0.65;

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
  'messageId' | 'text' | 'isCreatedByUser' | 'createdAt' | 'blockEmbedding'
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

export async function detectBlocksInConversation(
  conversationId: string,
  messages: BlockSourceMessage[],
  deps: BlockDetectionDeps,
): Promise<TDetectedBlock[]> {
  const userMessages = messages.filter(isUserMessageWithText);

  if (userMessages.length === 0) {
    return [];
  }

  const blocks: WorkingBlock[] = [startWorkingBlock(userMessages[0], conversationId)];
  // welcher block bekommt gerade kurze/unklare nachrichten und ist der erste vergleichspunkt
  let currentBlockIndex = 0;
  let lastMessageTime = userMessages[0].createdAt;
  // messageId -> index in blocks, für collectMessageIds am ende
  const assignedBlock = new Map<string, number>([[userMessages[0].messageId, 0]]);

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
      lastMessageTime = message.createdAt;
      continue;
    }

    const embedding = await getOrComputeEmbedding(message, deps);
    const gapMinutes = minutesBetween(lastMessageTime, message.createdAt);
    const current = blocks[currentBlockIndex];
    const currentScore = current.centroid
      ? hybridScore(cosineSimilarity(centroidVector(current.centroid), embedding), gapMinutes)
      : null;

    const staysInCurrent = await decideSameBlock(currentScore, current.anchor, message, deps);

    if (staysInCurrent) {
      attachToBlock(current, embedding);
      assignedBlock.set(message.messageId, currentBlockIndex);
    } else {
      // aktueller block passt nicht mehr - vielleicht knüpft die nachricht statt an einen
      // neuen block an ein früheres thema an, das gerade wieder aufgegriffen wird
      const bestPast = findBestPastBlock(blocks, currentBlockIndex, embedding, gapMinutes);
      const reactivated =
        bestPast !== null &&
        (await decideSameBlock(bestPast.score, blocks[bestPast.index].anchor, message, deps));

      if (bestPast !== null && reactivated) {
        attachToBlock(blocks[bestPast.index], embedding);
        assignedBlock.set(message.messageId, bestPast.index);
        currentBlockIndex = bestPast.index;
      } else {
        blocks.push(startWorkingBlock(message, conversationId));
        currentBlockIndex = blocks.length - 1;
        blocks[currentBlockIndex].centroid = startCentroid(embedding);
        assignedBlock.set(message.messageId, currentBlockIndex);
      }
    }

    lastMessageTime = message.createdAt;
  }

  const messageIds = collectMessageIds(messages, assignedBlock, blocks.length);

  return blocks.map((block, index) => ({
    title: block.title,
    detectedAt: block.detectedAt,
    conversationId: block.conversationId,
    messageCount: block.messageCount,
    messageIds: messageIds[index],
  }));
}

export interface BlockMessage {
  messageId: string;
  text: string;
  isCreatedByUser: boolean;
  createdAt: string;
}

type MessageWithText = BlockSourceMessage & { text: string; createdAt: Date };

function hasTextAndDate(message: BlockSourceMessage): message is MessageWithText {
  return Boolean(message.text) && message.createdAt instanceof Date;
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

  const blocks = await detectBlocksInConversation(conversationId, messages, deps);
  const block = blocks.find((b) => b.detectedAt === detectedAt);
  if (!block) {
    return null;
  }

  const memberIds = new Set(block.messageIds);

  // BlockSourceMessage ist ein subset von IMessage, damit hasTextAndDate den typ richtig einengt
  const sourceMessages: BlockSourceMessage[] = messages;

  return sourceMessages
    .filter(hasTextAndDate)
    .filter((m) => memberIds.has(m.messageId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => ({
      messageId: m.messageId,
      text: m.text,
      isCreatedByUser: m.isCreatedByUser,
      createdAt: m.createdAt.toISOString(),
    }));
}

export async function getDetectedBlocksForUser(
  userId: string,
  deps: BlocksServiceDeps,
): Promise<TDetectedBlock[]> {
  const { conversations } = await deps.getConvosByCursor(userId, { limit: 10 });

  const allBlocks: TDetectedBlock[] = [];
  for (const conversation of conversations) {
    const messages = await deps.getMessages(
      { conversationId: conversation.conversationId, user: userId },
      '+blockEmbedding',
    );

    if (messages.length === 0) {
      continue;
    }

    const blocksForConvo = await detectBlocksInConversation(
      conversation.conversationId,
      messages,
      deps,
    );
    allBlocks.push(...blocksForConvo);
  }

  return allBlocks;
}
