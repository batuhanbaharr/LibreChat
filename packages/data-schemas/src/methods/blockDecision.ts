import type { Model } from 'mongoose';
import type { IBlockDecision } from '~/types/blockDecision';
import logger from '~/config/winston';

export interface BlockDecisionMethods {
  // null = noch nicht gecacht, muss neu gefragt werden
  getBlockDecision: (anchorMessageId: string, messageId: string) => Promise<boolean | null>;
  saveBlockDecision: (
    anchorMessageId: string,
    messageId: string,
    sameTopic: boolean,
  ) => Promise<void>;
}

export function createBlockDecisionMethods(
  mongoose: typeof import('mongoose'),
): BlockDecisionMethods {
  async function getBlockDecision(
    anchorMessageId: string,
    messageId: string,
  ): Promise<boolean | null> {
    const BlockDecision = mongoose.models.BlockDecision as Model<IBlockDecision>;
    const decision = await BlockDecision.findOne({ anchorMessageId, messageId }).lean();
    return decision ? decision.sameTopic : null;
  }

  async function saveBlockDecision(
    anchorMessageId: string,
    messageId: string,
    sameTopic: boolean,
  ): Promise<void> {
    try {
      const BlockDecision = mongoose.models.BlockDecision as Model<IBlockDecision>;
      await BlockDecision.findOneAndUpdate(
        { anchorMessageId, messageId },
        { sameTopic },
        { upsert: true },
      );
    } catch (err) {
      // cache schreiben darf die block-erkennung nicht kaputt machen
      logger.error('Error saving block decision:', err);
    }
  }

  return { getBlockDecision, saveBlockDecision };
}
