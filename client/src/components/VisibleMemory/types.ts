import type { TBlockMemoryEntry } from 'librechat-data-provider';

/**
 * Ein erkannter Block plus die daran gespeicherten Gedächtnis-Einträge.
 * Der Block selbst wird bei jedem /api/blocks Aufruf neu berechnet und ist
 * nicht schreibbar - veränderbar sind nur die Einträge.
 */
export interface BlockOrb {
  /** encodeBlockId(conversationId, detectedAt) */
  id: string;
  title: string;
  conversationId: string;
  detectedAt: string;
  messageCount: number;
  entries: TBlockMemoryEntry[];
  tokenCount: number;
  /**
   * Einträge, deren Block die Erkennung nicht mehr findet. Die Block-Identität
   * (conversationId + detectedAt) überlebt ein Neu-Clustern nicht zwingend.
   * Verwaiste Einträge sind echter Nutzerinhalt und werden deshalb weiter
   * angezeigt statt still zu verschwinden.
   */
  orphaned: boolean;
}

export const orbTokens = (orb: BlockOrb): number => orb.tokenCount;
