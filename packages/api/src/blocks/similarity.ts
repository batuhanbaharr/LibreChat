/** 1 = fast gleicher text, 0 = kein zusammenhang, -1 = komplett gegensätzlich */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
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

/** läuft mit über alle embeddings eines blocks, damit man den mittelpunkt kennt */
export interface Centroid {
  sum: number[];
  count: number;
}

export function startCentroid(embedding: number[]): Centroid {
  return { sum: [...embedding], count: 1 };
}

export function addToCentroid(centroid: Centroid, embedding: number[]): Centroid {
  return {
    sum: centroid.sum.map((value, i) => value + embedding[i]),
    count: centroid.count + 1,
  };
}

export function centroidVector(centroid: Centroid): number[] {
  return centroid.sum.map((value) => value / centroid.count);
}
