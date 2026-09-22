const express = require('express');
const {
  createBlocksHandlers,
  createEmbeddingClient,
  createTopicTieBreaker,
  createBlockSummarizer,
  createBlockTitleGenerator,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getConvosByCursor,
  getMessages,
  setMessageBlockEmbedding,
  getBlockDecision,
  saveBlockDecision,
  getBlockSummary,
  saveBlockSummary,
  getBlockTitle,
  saveBlockTitle,
  setMessageStarred,
  getAllBlockMemories,
  addBlockMemory,
  deleteBlockMemory,
} = require('~/models');

const router = express.Router();

const { getEmbedding } = createEmbeddingClient(process.env.GOOGLE_KEY);
const tieBreaker = createTopicTieBreaker(process.env.GOOGLE_KEY);
const summarizer = createBlockSummarizer(process.env.GOOGLE_KEY);
const titleGenerator = createBlockTitleGenerator(process.env.GOOGLE_KEY);

const handlers = createBlocksHandlers({
  getConvosByCursor,
  getMessages,
  getEmbedding,
  saveEmbedding: setMessageBlockEmbedding,
  tieBreaker,
  getBlockDecision,
  saveBlockDecision,
  summarizer,
  getBlockSummary,
  saveBlockSummary,
  titleGenerator,
  getBlockTitle,
  saveBlockTitle,
  setMessageStarred,
  getAllBlockMemories,
  addBlockMemory,
  deleteBlockMemory,
});

const memoryPayloadLimit = express.json({ limit: '32kb' });

router.get('/', requireJwtAuth, handlers.getBlocks);
// vor /:blockId/... registriert, damit "memory" nicht als blockId durchgeht
router.get('/memory', requireJwtAuth, handlers.getMemory);
router.get('/:blockId/messages', requireJwtAuth, handlers.getMessages);
router.get('/:blockId/summary', requireJwtAuth, handlers.getSummary);
router.post('/:blockId/memory', requireJwtAuth, memoryPayloadLimit, handlers.addMemory);
router.delete('/:blockId/memory/:entryId', requireJwtAuth, handlers.deleteMemory);
router.patch('/messages/:messageId/star', requireJwtAuth, handlers.setStarred);

module.exports = router;
