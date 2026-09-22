import { Schema } from 'mongoose';
import type { IBlockMemory } from '~/types/blockMemory';

const blockMemorySchema: Schema<IBlockMemory> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
    },
    // zusammen mit conversationId die block-identität, genau wie bei BlockSummary
    detectedAt: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    tokenCount: {
      type: Number,
      default: 0,
    },
    source: {
      type: String,
      enum: ['user', 'assistant'],
      default: 'user',
    },
  },
  { timestamps: true },
);

// ein block hat beliebig viele einträge, deshalb kein unique index wie bei
// BlockSummary - nur der lookup-pfad fürs laden aller einträge eines nutzers
blockMemorySchema.index({ userId: 1, conversationId: 1, detectedAt: 1 });

export default blockMemorySchema;
