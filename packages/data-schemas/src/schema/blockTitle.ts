import { Schema } from 'mongoose';
import type { IBlockTitle } from '~/types/blockTitle';

const blockTitleSchema: Schema<IBlockTitle> = new Schema(
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
    title: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

// pro block reicht ein gecachter titel
blockTitleSchema.index({ conversationId: 1, detectedAt: 1 }, { unique: true });

export default blockTitleSchema;
