import type { Document, Types } from 'mongoose';

/**
 * Ein vom Nutzer (oder vom Modell) an einen erkannten Block angehängter
 * Gedächtnis-Eintrag. Anders als BlockSummary ist das kein Cache, sondern
 * echter Nutzerinhalt - er darf nie stillschweigend verworfen werden.
 */
export interface IBlockMemory extends Document {
  userId: Types.ObjectId;
  conversationId: string;
  detectedAt: string;
  text: string;
  tokenCount: number;
  source: 'user' | 'assistant';
  createdAt?: Date;
  updatedAt?: Date;
}
