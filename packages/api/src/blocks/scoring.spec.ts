import { isTooShortToEmbed, minutesBetween, hybridScore } from './scoring';

describe('isTooShortToEmbed', () => {
  it('erkennt kurze antworten wie ok oder danke', () => {
    expect(isTooShortToEmbed('ok')).toBe(true);
    expect(isTooShortToEmbed('danke!')).toBe(true);
    expect(isTooShortToEmbed('  ja genau  ')).toBe(true);
  });

  it('lässt normale fragen durch', () => {
    expect(isTooShortToEmbed('wie debugge ich react hooks?')).toBe(false);
  });
});

describe('minutesBetween', () => {
  it('rechnet millisekunden richtig in minuten um', () => {
    const a = new Date('2026-01-01T09:00:00Z');
    const b = new Date('2026-01-01T09:10:00Z');
    expect(minutesBetween(a, b)).toBeCloseTo(10);
  });

  it('ist unabhängig von der reihenfolge', () => {
    const a = new Date('2026-01-01T09:10:00Z');
    const b = new Date('2026-01-01T09:00:00Z');
    expect(minutesBetween(a, b)).toBeCloseTo(10);
  });
});

describe('hybridScore', () => {
  it('bleibt bei kleinem zeitabstand unverändert', () => {
    expect(hybridScore(0.9, 2)).toBeCloseTo(0.9);
  });

  it('sinkt langsam zwischen 5 und 20 minuten', () => {
    const score = hybridScore(0.9, 12);
    expect(score).toBeLessThan(0.9);
    expect(score).toBeGreaterThan(0.7);
  });

  it('malus wächst nicht mehr weiter nach 20 minuten', () => {
    expect(hybridScore(0.9, 20)).toBeCloseTo(hybridScore(0.9, 60));
  });

  it('eine wirklich starke übereinstimmung übersteht auch eine lange pause', () => {
    // echte gemini similarity für "kommen wir nochmal auf X zurück" nach 25 min: 0.7498
    expect(hybridScore(0.7498, 25)).toBeGreaterThanOrEqual(0.65);
  });

  it('eine schwache/mittlere übereinstimmung nach langer pause reicht nicht mehr', () => {
    // echte gemini similarity für zwei verwandte, aber unterschiedliche react-fragen: 0.684
    expect(hybridScore(0.684, 25)).toBeLessThan(0.65);
    // ohne die pause hätte es noch für den threshold gereicht
    expect(hybridScore(0.684, 1)).toBeGreaterThanOrEqual(0.65);
  });
});
