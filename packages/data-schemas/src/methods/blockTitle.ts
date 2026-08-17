import type { Model } from 'mongoose';
import type { IBlockTitle } from '~/types/blockTitle';
import logger from '~/config/winston';

export interface CachedBlockTitle {
  title: string;
  lastMessageId: string;
  messageCount: number;
}

export interface BlockTitleMethods {
  getBlockTitle: (conversationId: string, detectedAt: string) => Promise<CachedBlockTitle | null>;
  saveBlockTitle: (
    conversationId: string,
    detectedAt: string,
    data: CachedBlockTitle,
  ) => Promise<void>;
}

export function createBlockTitleMethods(mongoose: typeof import('mongoose')): BlockTitleMethods {
  async function getBlockTitle(
    conversationId: string,
    detectedAt: string,
  ): Promise<CachedBlockTitle | null> {
    const BlockTitle = mongoose.models.BlockTitle as Model<IBlockTitle>;
    const doc = await BlockTitle.findOne({ conversationId, detectedAt }).lean();
    if (!doc) {
      return null;
    }
    return {
      title: doc.title,
      lastMessageId: doc.lastMessageId,
      messageCount: doc.messageCount,
    };
  }

  async function saveBlockTitle(
    conversationId: string,
    detectedAt: string,
    data: CachedBlockTitle,
  ): Promise<void> {
    try {
      const BlockTitle = mongoose.models.BlockTitle as Model<IBlockTitle>;
      await BlockTitle.findOneAndUpdate({ conversationId, detectedAt }, data, { upsert: true });
    } catch (err) {
      logger.error('Error saving block title:', err);
    }
  }

  return { getBlockTitle, saveBlockTitle };
}
