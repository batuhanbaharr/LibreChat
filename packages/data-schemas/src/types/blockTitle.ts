import type { Document } from 'mongoose';

export interface IBlockTitle extends Document {
  conversationId: string;
  detectedAt: string;
  lastMessageId: string;
  messageCount: number;
  title: string;
}
