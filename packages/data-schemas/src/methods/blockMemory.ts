import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { IBlockMemory } from '~/types/blockMemory';
import logger from '~/config/winston';

export interface BlockMemoryEntry {
  id: string;
  conversationId: string;
  detectedAt: string;
  text: string;
  tokenCount: number;
  source: 'user' | 'assistant';
  createdAt: string;
}

export interface AddBlockMemoryParams {
  conversationId: string;
  detectedAt: string;
  text: string;
  tokenCount: number;
  source?: 'user' | 'assistant';
}

export interface BlockMemoryMethods {
  /** Alle Einträge eines Nutzers auf einmal - die Orb-Ansicht braucht sie gesammelt. */
  getAllBlockMemories: (userId: string) => Promise<BlockMemoryEntry[]>;
  addBlockMemory: (userId: string, params: AddBlockMemoryParams) => Promise<BlockMemoryEntry>;
  deleteBlockMemory: (userId: string, entryId: string) => Promise<boolean>;
}

function toEntry(doc: IBlockMemory): BlockMemoryEntry {
  return {
    id: String(doc._id),
    conversationId: doc.conversationId,
    detectedAt: doc.detectedAt,
    text: doc.text,
    tokenCount: doc.tokenCount ?? 0,
    source: doc.source ?? 'user',
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

export function createBlockMemoryMethods(mongoose: typeof import('mongoose')): BlockMemoryMethods {
  function model(): Model<IBlockMemory> {
    return mongoose.models.BlockMemory as Model<IBlockMemory>;
  }

  async function getAllBlockMemories(userId: string): Promise<BlockMemoryEntry[]> {
    const docs = await model().find({ userId }).sort({ createdAt: 1 }).lean<IBlockMemory[]>();
    return docs.map(toEntry);
  }

  async function addBlockMemory(
    userId: string,
    params: AddBlockMemoryParams,
  ): Promise<BlockMemoryEntry> {
    const doc = await model().create({
      userId: new Types.ObjectId(userId),
      conversationId: params.conversationId,
      detectedAt: params.detectedAt,
      text: params.text,
      tokenCount: params.tokenCount,
      source: params.source ?? 'user',
    });
    return toEntry(doc);
  }

  async function deleteBlockMemory(userId: string, entryId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(entryId)) {
      return false;
    }
    try {
      // userId mit im filter, damit niemand fremde einträge löschen kann
      const result = await model().deleteOne({ _id: entryId, userId });
      return result.deletedCount === 1;
    } catch (err) {
      logger.error('Error deleting block memory:', err);
      return false;
    }
  }

  return { getAllBlockMemories, addBlockMemory, deleteBlockMemory };
}
