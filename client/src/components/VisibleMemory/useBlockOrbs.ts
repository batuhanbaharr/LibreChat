import { useMemo } from 'react';
import { encodeBlockId, decodeBlockId } from 'librechat-data-provider';
import { useGetBlocksQuery, useBlockMemoriesQuery } from '~/data-provider';
import type { BlockOrb } from './types';

interface BlockOrbsResult {
  orbs: BlockOrb[];
  isLoading: boolean;
  error: unknown;
}

const sumTokens = (entries: { tokenCount: number }[]) =>
  entries.reduce((total, entry) => total + (entry.tokenCount ?? 0), 0);

/**
 * Verbindet die erkannten Blöcke mit den daran gespeicherten Einträgen.
 *
 * Beide Abfragen laufen beim Öffnen des Panels und werden nach jeder Mutation
 * invalidiert - die Block-Erkennung selbst ist serverseitig teuer, deshalb wird
 * sie nicht periodisch gepollt.
 */
export function useBlockOrbs(): BlockOrbsResult {
  const blocksQuery = useGetBlocksQuery();
  const memoriesQuery = useBlockMemoriesQuery();

  const blocks = blocksQuery.data?.blocks;
  const memories = memoriesQuery.data?.memories;

  const orbs = useMemo<BlockOrb[]>(() => {
    const byBlockId = memories ?? {};
    const seen = new Set<string>();

    const detected = (blocks ?? []).map((block) => {
      const id = encodeBlockId(block.conversationId, block.detectedAt);
      seen.add(id);
      const entries = byBlockId[id] ?? [];
      return {
        id,
        title: block.title,
        conversationId: block.conversationId,
        detectedAt: block.detectedAt,
        messageCount: block.messageCount,
        entries,
        tokenCount: sumTokens(entries),
        orphaned: false,
      };
    });

    /* Einträge ohne passenden Block: die Erkennung hat neu geclustert. Sie
     * bleiben sichtbar, damit selbst geschriebener Inhalt nicht still verschwindet. */
    const orphans = Object.entries(byBlockId)
      .filter(([id, entries]) => !seen.has(id) && entries.length > 0)
      .map(([id, entries]) => {
        const decoded = decodeBlockId(id);
        return {
          id,
          title: entries[0].text.slice(0, 40),
          conversationId: decoded?.conversationId ?? '',
          detectedAt: decoded?.detectedAt ?? '',
          messageCount: 0,
          entries,
          tokenCount: sumTokens(entries),
          orphaned: true,
        };
      });

    return [...detected, ...orphans];
  }, [blocks, memories]);

  return {
    orbs,
    isLoading: blocksQuery.isLoading || memoriesQuery.isLoading,
    error: blocksQuery.error ?? memoriesQuery.error,
  };
}
