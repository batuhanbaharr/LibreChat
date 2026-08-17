import { cosineSimilarity, startCentroid, addToCentroid, centroidVector } from './similarity';

describe('cosineSimilarity', () => {
  it('gibt 1 für identische vektoren', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('gibt 0 für orthogonale vektoren', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('gibt -1 für komplett entgegengesetzte vektoren', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('ist symmetrisch', () => {
    const a = [0.2, 0.8, 0.1];
    const b = [0.5, 0.1, 0.9];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
  });
});

describe('centroid', () => {
  it('ist bei einem einzigen vektor einfach der vektor selbst', () => {
    const centroid = startCentroid([2, 4, 6]);
    expect(centroidVector(centroid)).toEqual([2, 4, 6]);
  });

  it('ist der durchschnitt von allen vektoren die reingesteckt wurden', () => {
    let centroid = startCentroid([1, 0]);
    centroid = addToCentroid(centroid, [0, 1]);
    centroid = addToCentroid(centroid, [2, 2]);
    expect(centroidVector(centroid)).toEqual([1, 1]);
  });

  it('zieht eine einzelne abweichende nachricht nicht komplett vom thema weg', () => {
    // simuliert: nachricht 1 und 3 sind zum gleichen thema, nachricht 2 ist ein kurzer ausflug
    const centroid = addToCentroid(startCentroid([1, 0]), [0, 1]);
    const backToTopic = [1, 0];

    // letzte-nachricht-vergleich würde hier bei 0 landen -> fälschlich neuer block
    expect(cosineSimilarity([0, 1], backToTopic)).toBeCloseTo(0);
    // der centroid hält noch genug vom ursprünglichen thema, bleibt über einem sinnvollen threshold
    expect(cosineSimilarity(centroidVector(centroid), backToTopic)).toBeGreaterThan(0.65);
  });
});
