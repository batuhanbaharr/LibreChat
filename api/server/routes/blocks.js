const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { getEmbedding, cosineSimilarity } = require('~/server/services/embeddingService');
const db = require('~/models');

const router = express.Router();
router.use(requireJwtAuth);

// ab diesem wert gilt es als neues thema, kann später angepasst werden
const SIMILARITY_THRESHOLD = 0.75;

// baut aus den nachrichten einer conversation die blocks
// vergleicht immer die letzte user nachricht mit der neuen
async function detectBlocksInConversation(conversation, messages) {
  const userMessages = messages.filter((m) => m.isCreatedByUser && m.text);

  if (userMessages.length === 0) {
    return [];
  }

  const blocks = [];
  let currentBlock = {
    title: userMessages[0].text.slice(0, 60),
    detectedAt: userMessages[0].createdAt,
    conversationId: conversation.conversationId,
    messageCount: 1,
  };
  let lastEmbedding = await getEmbedding(userMessages[0].text);

  for (let i = 1; i < userMessages.length; i++) {
    const currentText = userMessages[i].text;
    const currentEmbedding = await getEmbedding(currentText);
    const similarity = cosineSimilarity(lastEmbedding, currentEmbedding);

    if (similarity < SIMILARITY_THRESHOLD) {
      // thema hat sich geändert, alten block speichern und neuen starten
      blocks.push(currentBlock);
      currentBlock = {
        title: currentText.slice(0, 60),
        detectedAt: userMessages[i].createdAt,
        conversationId: conversation.conversationId,
        messageCount: 1,
      };
    } else {
      currentBlock.messageCount += 1;
    }

    lastEmbedding = currentEmbedding;
  }

  blocks.push(currentBlock);
  return blocks;
}

router.get('/', async (req, res) => {
  try {
    const user = req.user.id;
    const { conversations } = await db.getConvosByCursor(user, { limit: 10 });

    const allBlocks = [];

    for (const conversation of conversations) {
      const messages = await db.getMessages({
        conversationId: conversation.conversationId,
        user,
      });

      if (!messages || messages.length === 0) {
        continue;
      }

      const blocksForConvo = await detectBlocksInConversation(conversation, messages);
      allBlocks.push(...blocksForConvo);
    }

    res.status(200).json({ blocks: allBlocks });
  } catch (error) {
    logger.error('Error detecting blocks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;