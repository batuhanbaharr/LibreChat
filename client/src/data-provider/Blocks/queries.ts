import { useMemo } from 'react';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type {
  BlocksResponse,
  TDetectedBlock,
  BlockMessagesResponse,
  BlockSummaryResponse,
  BlockMemoriesResponse,
} from 'librechat-data-provider';

export const useGetBlocksQuery = (
  config?: UseQueryOptions<BlocksResponse>,
): QueryObserverResult<BlocksResponse> => {
  return useQuery<BlocksResponse>([QueryKeys.blocks], () => dataService.getBlocks(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    ...config,
  });
};

export const useBlockMessagesQuery = (
  blockId: string | undefined,
  config?: UseQueryOptions<BlockMessagesResponse>,
): QueryObserverResult<BlockMessagesResponse> => {
  return useQuery<BlockMessagesResponse>(
    [QueryKeys.blockMessages, blockId],
    () => dataService.getBlockMessages(blockId as string),
    {
      enabled: Boolean(blockId),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

// wird erst geladen wenn die zusammenfassungs-seite wirklich besucht wird, löst dann
// bei bedarf die llm generierung im backend aus (gecacht solange der block nicht wächst)
export const useBlockSummaryQuery = (
  blockId: string | undefined,
  config?: UseQueryOptions<BlockSummaryResponse>,
): QueryObserverResult<BlockSummaryResponse> => {
  return useQuery<BlockSummaryResponse>(
    [QueryKeys.blockSummary, blockId],
    () => dataService.getBlockSummary(blockId as string),
    {
      enabled: Boolean(blockId),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      ...config,
    },
  );
};

// gruppiert die blocks nach conversationId, damit die sidebar nicht selbst nochmal /api/blocks holen muss
export const useBlocksByConversation = (): Map<string, TDetectedBlock[]> => {
  const { data } = useGetBlocksQuery();

  return useMemo(() => {
    const map = new Map<string, TDetectedBlock[]>();
    for (const block of data?.blocks ?? []) {
      const existing = map.get(block.conversationId);
      if (existing) {
        existing.push(block);
      } else {
        map.set(block.conversationId, [block]);
      }
    }
    return map;
  }, [data?.blocks]);
};

// alle gedächtnis-einträge aller blöcke in einem request, nach blockId gruppiert.
// wird beim öffnen des panels geladen und nach jeder mutation invalidiert - block-
// erkennung selbst ist teuer, hier hängt aber nur gespeicherter nutzerinhalt dran
export const useBlockMemoriesQuery = (
  config?: UseQueryOptions<BlockMemoriesResponse>,
): QueryObserverResult<BlockMemoriesResponse> => {
  return useQuery<BlockMemoriesResponse>(
    [QueryKeys.blockMemories],
    () => dataService.getBlockMemories(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};
