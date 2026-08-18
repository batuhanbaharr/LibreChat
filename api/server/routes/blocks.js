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
});

router.get('/', requireJwtAuth, handlers.getBlocks);
router.get('/:blockId/messages', requireJwtAuth, handlers.getMessages);
router.get('/:blockId/summary', requireJwtAuth, handlers.getSummary);
router.patch('/messages/:messageId/star', requireJwtAuth, handlers.setStarred);

module.exports = router;
