import { Schema } from 'mongoose';
import type { IBlockSummary } from '~/types/blockSummary';

const blockSummarySchema: Schema<IBlockSummary> = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
    },
    detectedAt: {
      type: String,
      required: true,
    },
    lastMessageId: {
      type: String,
      required: true,
    },
    messageCount: {
      type: Number,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

// pro block reicht eine gecachte zusammenfassung
blockSummarySchema.index({ conversationId: 1, detectedAt: 1 }, { unique: true });

export default blockSummarySchema;
