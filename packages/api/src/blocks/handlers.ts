import { logger } from '@librechat/data-schemas';
import { decodeBlockId } from 'librechat-data-provider';
import type { Response } from 'express';
import type { MessageMethods } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { getDetectedBlocksForUser, getBlockMessages } from './service';
import { getOrGenerateBlockSummary } from './summary';
import type { BlockSummaryDeps } from './summary';
import type { BlockTitleDeps } from './title';

export type BlocksHandlersDeps = BlockSummaryDeps &
  BlockTitleDeps & {
    setMessageStarred: MessageMethods['setMessageStarred'];
  };

export function createBlocksHandlers(deps: BlocksHandlersDeps): {
  getBlocks: (req: ServerRequest, res: Response) => Promise<Response>;
  getMessages: (req: ServerRequest, res: Response) => Promise<Response>;
  getSummary: (req: ServerRequest, res: Response) => Promise<Response>;
  setStarred: (req: ServerRequest, res: Response) => Promise<Response>;
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

  return { getBlocks, getMessages, getSummary, setStarred };
}
