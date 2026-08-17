import type { Document } from 'mongoose';

export interface IBlockSummary extends Document {
  conversationId: string;
  detectedAt: string;
  lastMessageId: string;
  messageCount: number;
  summary: string;
}
