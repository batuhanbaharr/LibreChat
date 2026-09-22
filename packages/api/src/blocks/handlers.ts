import { logger } from '@librechat/data-schemas';
import { decodeBlockId, encodeBlockId } from 'librechat-data-provider';
import type { Response } from 'express';
import type { BlockMemoryMethods, MessageMethods } from '@librechat/data-schemas';
import type { TBlockMemoryEntry } from 'librechat-data-provider';
import Tokenizer from '~/utils/tokenizer';
import type { ServerRequest } from '~/types';
import { getDetectedBlocksForUser, getBlockMessages } from './service';
import { getOrGenerateBlockSummary } from './summary';
import type { BlockSummaryDeps } from './summary';
import type { BlockTitleDeps } from './title';

export type BlocksHandlersDeps = BlockSummaryDeps &
  BlockTitleDeps &
  BlockMemoryMethods & {
    setMessageStarred: MessageMethods['setMessageStarred'];
  };

// der client will alle einträge auf einmal, gruppiert nach block - sonst müsste
// die orb-ansicht pro block einzeln nachladen
const MAX_MEMORY_LENGTH = 2000;

export function createBlocksHandlers(deps: BlocksHandlersDeps): {
  getBlocks: (req: ServerRequest, res: Response) => Promise<Response>;
  getMessages: (req: ServerRequest, res: Response) => Promise<Response>;
  getSummary: (req: ServerRequest, res: Response) => Promise<Response>;
  setStarred: (req: ServerRequest, res: Response) => Promise<Response>;
  getMemory: (req: ServerRequest, res: Response) => Promise<Response>;
  addMemory: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteMemory: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  async function getBlocks(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const blocks = await getDetectedBlocksForUser(userId, deps);
      return res.status(200).json({ blocks });
    } catch (error) {
      logger.error('[Blocks] detection failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async function getMessages(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const decoded = decodeBlockId((req.params as { blockId?: string }).blockId ?? '');
    if (!decoded) {
      return res.status(400).json({ message: 'Invalid blockId' });
    }

    try {
      const messages = await getBlockMessages(
        userId,
        decoded.conversationId,
        decoded.detectedAt,
        deps,
      );
      if (!messages) {
        return res.status(404).json({ message: 'Block not found' });
      }
      return res.status(200).json({ messages });
    } catch (error) {
      logger.error('[Blocks] getMessages failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async function getSummary(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const decoded = decodeBlockId((req.params as { blockId?: string }).blockId ?? '');
    if (!decoded) {
      return res.status(400).json({ message: 'Invalid blockId' });
    }

    try {
      const result = await getOrGenerateBlockSummary(
        userId,
        decoded.conversationId,
        decoded.detectedAt,
        deps,
      );
      if (result.status === 'not_found') {
        return res.status(404).json({ message: 'Block not found' });
      }
      if (result.status === 'unavailable') {
        return res.status(503).json({
          message: 'Zusammenfassung momentan nicht verfügbar, bitte später erneut versuchen.',
        });
      }
      return res.status(200).json({ summary: result.summary });
    } catch (error) {
      logger.error('[Blocks] getSummary failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async function setStarred(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { messageId } = req.params as { messageId?: string };
    const { starred } = req.body as { starred?: boolean };
    if (!messageId || typeof starred !== 'boolean') {
      return res.status(400).json({ message: 'Invalid request' });
    }

    try {
      await deps.setMessageStarred(userId, { messageId, starred });
      return res.status(200).json({ messageId, starred });
    } catch (error) {
      logger.error('[Blocks] setStarred failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async function getMemory(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const entries = await deps.getAllBlockMemories(userId);
      const memories: Record<string, TBlockMemoryEntry[]> = {};
      for (const entry of entries) {
        const blockId = encodeBlockId(entry.conversationId, entry.detectedAt);
        (memories[blockId] ??= []).push({
          id: entry.id,
          text: entry.text,
          tokenCount: entry.tokenCount,
          source: entry.source,
          createdAt: entry.createdAt,
        });
      }
      return res.status(200).json({ memories });
    } catch (error) {
      logger.error('[Blocks] getMemory failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async function addMemory(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const decoded = decodeBlockId((req.params as { blockId?: string }).blockId ?? '');
    if (!decoded) {
      return res.status(400).json({ message: 'Invalid blockId' });
    }

    const { text } = (req.body ?? {}) as { text?: unknown };
    if (typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ message: 'Text is required' });
    }
    if (text.length > MAX_MEMORY_LENGTH) {
      return res.status(400).json({
        message: `Text exceeds maximum length of ${MAX_MEMORY_LENGTH} characters.`,
      });
    }

    try {
      const trimmed = text.trim();
      const entry = await deps.addBlockMemory(userId, {
        conversationId: decoded.conversationId,
        detectedAt: decoded.detectedAt,
        text: trimmed,
        tokenCount: Tokenizer.getTokenCount(trimmed, 'o200k_base'),
        source: 'user',
      });
      return res.status(201).json({
        entry: {
          id: entry.id,
          text: entry.text,
          tokenCount: entry.tokenCount,
          source: entry.source,
          createdAt: entry.createdAt,
        },
      });
    } catch (error) {
      logger.error('[Blocks] addMemory failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async function deleteMemory(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { entryId } = req.params as { entryId?: string };
    if (!entryId) {
      return res.status(400).json({ message: 'Invalid entryId' });
    }

    try {
      const deleted = await deps.deleteBlockMemory(userId, entryId);
      if (!deleted) {
        return res.status(404).json({ message: 'Memory entry not found' });
      }
      return res.status(200).json({ entryId });
    } catch (error) {
      logger.error('[Blocks] deleteMemory failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return { getBlocks, getMessages, getSummary, setStarred, getMemory, addMemory, deleteMemory };
}
