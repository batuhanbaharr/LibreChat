import { isAmbiguous } from './tieBreaker';

describe('isAmbiguous', () => {
  it('ist eindeutig anders bei niedrigem score', () => {
    expect(isAmbiguous(0.3)).toBe(false);
    expect(isAmbiguous(0.54)).toBe(false);
  });

  it('ist eindeutig gleich bei sehr hohem score', () => {
    expect(isAmbiguous(0.9)).toBe(false);
    expect(isAmbiguous(0.99)).toBe(false);
  });

  it('ist ambig in der grauzone dazwischen', () => {
    expect(isAmbiguous(0.55)).toBe(true);
    expect(isAmbiguous(0.7)).toBe(true);
    expect(isAmbiguous(0.89)).toBe(true);
  });

  it('deckt die echten fehlerfälle ab (siehe blocks doku)', () => {
    // auto reparieren vs schrank anbauen: 0.6597, IT vs Maschinenbau beruf: 0.8178
    expect(isAmbiguous(0.6597)).toBe(true);
    expect(isAmbiguous(0.8178)).toBe(true);
  });
});
