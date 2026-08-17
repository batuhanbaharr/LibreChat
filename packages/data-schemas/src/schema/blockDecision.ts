import { Schema } from 'mongoose';
import type { IBlockDecision } from '~/types/blockDecision';

const blockDecisionSchema: Schema<IBlockDecision> = new Schema(
  {
    anchorMessageId: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      required: true,
    },
    sameTopic: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true },
);

// pro nachrichten-paar reicht eine gecachte entscheidung
blockDecisionSchema.index({ anchorMessageId: 1, messageId: 1 }, { unique: true });

export default blockDecisionSchema;
