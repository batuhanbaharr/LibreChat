import type { Model } from 'mongoose';
import type { IBlockSummary } from '~/types/blockSummary';
import logger from '~/config/winston';

export interface CachedBlockSummary {
  summary: string;
  lastMessageId: string;
  messageCount: number;
}

export interface BlockSummaryMethods {
  getBlockSummary: (conversationId: string, detectedAt: string) => Promise<CachedBlockSummary | null>;
  saveBlockSummary: (
    conversationId: string,
    detectedAt: string,
    data: CachedBlockSummary,
  ) => Promise<void>;
}

export function createBlockSummaryMethods(
  mongoose: typeof import('mongoose'),
): BlockSummaryMethods {
  async function getBlockSummary(
    conversationId: string,
    detectedAt: string,
  ): Promise<CachedBlockSummary | null> {
    const BlockSummary = mongoose.models.BlockSummary as Model<IBlockSummary>;
    const doc = await BlockSummary.findOne({ conversationId, detectedAt }).lean();
    if (!doc) {
      return null;
    }
    return {
      summary: doc.summary,
      lastMessageId: doc.lastMessageId,
      messageCount: doc.messageCount,
    };
  }

  async function saveBlockSummary(
    conversationId: string,
    detectedAt: string,
    data: CachedBlockSummary,
  ): Promise<void> {
    try {
      const BlockSummary = mongoose.models.BlockSummary as Model<IBlockSummary>;
      await BlockSummary.findOneAndUpdate({ conversationId, detectedAt }, data, { upsert: true });
    } catch (err) {
      logger.error('Error saving block summary:', err);
    }
  }

  return { getBlockSummary, saveBlockSummary };
}
