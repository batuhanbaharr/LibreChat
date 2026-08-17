import { GoogleGenAI } from '@google/genai';

// text-embedding-004 geht nicht mehr, gemini-embedding-001 ist aktuell das richtige model
const EMBEDDING_MODEL = 'gemini-embedding-001';

export interface EmbeddingClient {
  getEmbedding: (text: string) => Promise<number[]>;
}

export function createEmbeddingClient(apiKey: string | undefined): EmbeddingClient {
  // erst bei der ersten echten anfrage bauen, sonst warnt das sdk schon beim server start
  let ai: GoogleGenAI | undefined;

  function getClient(): GoogleGenAI {
    if (!apiKey) {
      throw new Error('GOOGLE_KEY ist nicht gesetzt, blocks feature kann keine embeddings holen');
    }
    if (!ai) {
      ai = new GoogleGenAI({ apiKey });
    }
    return ai;
  }

  async function getEmbedding(text: string): Promise<number[]> {
    const response = await getClient().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    });

    const values = response.embeddings?.[0]?.values;
    if (!values) {
      throw new Error('kein embedding vom gemini api zurückbekommen');
    }

    return values;
  }

  return { getEmbedding };
}
