// kurze nachrichten wie "ok" oder "danke" haben kein brauchbares embedding
const SHORT_MESSAGE_MAX_LENGTH = 15;

// bis 5 min kein malus, ab 20 min ist der malus voll da (aber gedeckelt, siehe unten)
const SAME_SESSION_GAP_MINUTES = 5;
const NEW_SESSION_GAP_MINUTES = 20;

// gedeckelt bei 0.08: getestet mit echten "ich komm nochmal auf X zurück" nachrichten nach
// 25 min pause, die lagen alle bei similarity 0.75-0.82. bei zu hohem malus würden die
// fälschlich als neuer block gelten, obwohl klar dasselbe thema ist
const MAX_TIME_PENALTY = 0.08;

export function isTooShortToEmbed(text: string): boolean {
  return text.trim().length < SHORT_MESSAGE_MAX_LENGTH;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

function timePenalty(gapMinutes: number): number {
  if (gapMinutes <= SAME_SESSION_GAP_MINUTES) {
    return 0;
  }
  if (gapMinutes >= NEW_SESSION_GAP_MINUTES) {
    return MAX_TIME_PENALTY;
  }
  const progress =
    (gapMinutes - SAME_SESSION_GAP_MINUTES) / (NEW_SESSION_GAP_MINUTES - SAME_SESSION_GAP_MINUTES);
  return progress * MAX_TIME_PENALTY;
}

// zeit drückt die similarity nur runter, macht sie nie kaputt - eine wirklich starke
// inhaltliche übereinstimmung übersteht also auch eine lange pause
export function hybridScore(similarity: number, gapMinutes: number): number {
  return similarity - timePenalty(gapMinutes);
}
