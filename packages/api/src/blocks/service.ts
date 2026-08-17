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

function startBlock(message: UserMessage, conversationId: string): TDetectedBlock {
  return {
    title: message.text.slice(0, 60),
    detectedAt: message.createdAt.toISOString(),
    conversationId,
    messageCount: 1,
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

export async function detectBlocksInConversation(
  conversationId: string,
  messages: BlockSourceMessage[],
  deps: BlockDetectionDeps,
): Promise<TDetectedBlock[]> {
  const userMessages = messages.filter(isUserMessageWithText);

  if (userMessages.length === 0) {
    return [];
  }

  const blocks: TDetectedBlock[] = [];
  let currentBlock = startBlock(userMessages[0], conversationId);
  let blockAnchor = userMessages[0];
  let lastMessageTime = userMessages[0].createdAt;

  // centroid ist null solange noch keine einzige "richtige" nachricht im block embedded wurde
  let centroid: Centroid | null = isTooShortToEmbed(userMessages[0].text)
    ? null
    : startCentroid(await getOrComputeEmbedding(userMessages[0], deps));

  for (let i = 1; i < userMessages.length; i++) {
    const message = userMessages[i];

    if (isTooShortToEmbed(message.text)) {
      // "ok", "danke" usw -> gehört einfach zum aktuellen block, kein embedding nötig
      currentBlock.messageCount += 1;
      lastMessageTime = message.createdAt;
      continue;
    }

    const embedding = await getOrComputeEmbedding(message, deps);
    const gapMinutes = minutesBetween(lastMessageTime, message.createdAt);
    const score = centroid
      ? hybridScore(cosineSimilarity(centroidVector(centroid), embedding), gapMinutes)
      : null;

    const staysInBlock = await decideSameBlock(score, blockAnchor, message, deps);

    if (staysInBlock) {
      currentBlock.messageCount += 1;
      centroid = centroid ? addToCentroid(centroid, embedding) : startCentroid(embedding);
    } else {
      blocks.push(currentBlock);
      currentBlock = startBlock(message, conversationId);
      blockAnchor = message;
      centroid = startCentroid(embedding);
    }

    lastMessageTime = message.createdAt;
  }

  blocks.push(currentBlock);
  return blocks;
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

function isInRange(createdAt: Date, start: Date, end: Date | null): boolean {
  if (createdAt < start) {
    return false;
  }
  return end === null || createdAt < end;
}

// holt alle echten nachrichten (user + bot) die zu einem block gehören. läuft die block-erkennung
// nochmal für die eine konversation (dank cache günstig) um die start/end zeit des blocks zu finden
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
  const blockIndex = blocks.findIndex((b) => b.detectedAt === detectedAt);
  if (blockIndex === -1) {
    return null;
  }

  const start = new Date(blocks[blockIndex].detectedAt);
  const end = blockIndex + 1 < blocks.length ? new Date(blocks[blockIndex + 1].detectedAt) : null;

  // BlockSourceMessage ist ein subset von IMessage, damit hasTextAndDate den typ richtig einengt
  const sourceMessages: BlockSourceMessage[] = messages;

  return sourceMessages
    .filter(hasTextAndDate)
    .filter((m) => isInRange(m.createdAt, start, end))
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
