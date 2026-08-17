import type { Document } from 'mongoose';

export interface IBlockDecision extends Document {
  anchorMessageId: string;
  messageId: string;
  sameTopic: boolean;
}
