const fetch = require('node-fetch');

// gemini embedding api, wandelt text in vektor um
const EMBEDDING_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
async function getEmbedding(text) {
  const apiKey = process.env.GOOGLE_KEY;

  const response = await fetch(`${EMBEDDING_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`embedding request failed: ${errorText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

// misst wie ähnlich zwei vektoren sind, 1 = fast gleich, 0 = komplett anders
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = { getEmbedding, cosineSimilarity };