/**
 * Visuelle Kodierung der Block-Orbs.
 *
 * 1. Die Größe kodiert gespeicherte Tokens über die FLÄCHE, nicht den
 *    Durchmesser. Der Maßstab hängt am Container und an der Anzahl der Orbs,
 *    weil die Sidebar in der Breite verstellbar ist - ein fester Maßstab wäre
 *    im schmalen Panel entweder unsichtbar oder überfüllt.
 * 2. Der Farbton folgt der Block-Identität (Hash der blockId), nie der
 *    Position in einer sortierten Liste. Orbs sortieren sich beim Wachsen
 *    ständig um, die Farbe darf dabei nicht springen.
 */

/**
 * Drei Farbtöne, all-pairs gegen Farbfehlsichtigkeit geprüft - auf hellem wie
 * dunklem Hintergrund. Orbs überlappen sich frei, deshalb muss jedes Paar
 * unterscheidbar sein, nicht nur benachbarte. Ab dem vierten Thema wiederholen
 * sich die Töne: Die Identität trägt das Label, die Farbe ist nur Merkhilfe.
 */
export const ORB_HUES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
export const ORB_HUES_DARK = ['#3987e5', '#d95926', '#199e70'] as const;

/** Tokenzahl, ab der ein Orb seine volle Größe erreicht. Darüber wird geklemmt. */
export const TOKEN_REFERENCE = 240;

/** Anteil der Panel-Fläche, den alle Orbs zusammen höchstens einnehmen dürfen. */
const AREA_BUDGET = 0.3;

export interface RadiusScale {
  min: number;
  max: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Leitet die Radius-Spanne aus der Panel-Größe und der Anzahl Orbs ab, damit
 * das Feld in einer 360px-Sidebar genauso funktioniert wie in einer breiten.
 */
export function radiusScaleFor(width: number, height: number, orbCount: number): RadiusScale {
  if (!width || !height || orbCount <= 0) {
    return { min: 10, max: 18 };
  }
  const perOrbArea = (width * height * AREA_BUDGET) / orbCount;
  const max = clamp(Math.sqrt(perOrbArea / Math.PI), 14, 46);
  return { min: clamp(max * 0.45, 8, 20), max };
}

/** Flächenproportionaler Radius innerhalb der Spanne. */
export function radiusForTokens(tokens: number, scale: RadiusScale): number {
  const ratio = clamp(Math.max(0, tokens) / TOKEN_REFERENCE, 0, 1);
  return scale.min + (scale.max - scale.min) * Math.sqrt(ratio);
}

/** Stabile, reihenfolgeunabhängige Farbzuordnung (djb2). */
export function hueForKey(key: string, isDark: boolean): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  const hues = isDark ? ORB_HUES_DARK : ORB_HUES_LIGHT;
  return hues[Math.abs(hash) % hues.length];
}
