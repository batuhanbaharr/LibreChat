import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  BlockMessagesResponse,
  BlockMemoriesResponse,
  AddBlockMemoryResponse,
} from 'librechat-data-provider';

// markiert/entmarkiert eine nachricht, aktualisiert den cache sofort damit der stern
// direkt umspringt statt auf die server-antwort zu warten
export const useStarBlockMessageMutation = (
  blockId: string | undefined,
): UseMutationResult<
  { messageId: string; starred: boolean },
  unknown,
  { messageId: string; starred: boolean }
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ messageId, starred }: { messageId: string; starred: boolean }) =>
      dataService.setBlockMessageStarred(messageId, starred),
    {
      onMutate: ({ messageId, starred }) => {
        queryClient.setQueryData<BlockMessagesResponse>(
          [QueryKeys.blockMessages, blockId],
          (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              messages: prev.messages.map((message) =>
                message.messageId === messageId ? { ...message, starred } : message,
              ),
            };
          },
        );
      },
      onError: () => {
        queryClient.invalidateQueries([QueryKeys.blockMessages, blockId]);
      },
    },
  );
};

// fügt einen eintrag hinzu. der cache wird erst bei onSuccess geschrieben, weil die
// tokenzahl vom server kommt - optimistisch schätzen würde den orb erst auf die falsche
// größe springen lassen und danach nochmal korrigieren
export const useAddBlockMemoryMutation = (): UseMutationResult<
  AddBlockMemoryResponse,
  unknown,
  { blockId: string; text: string }
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ blockId, text }: { blockId: string; text: string }) =>
      dataService.addBlockMemory(blockId, text),
    {
      onSuccess: (data, { blockId }) => {
        queryClient.setQueryData<BlockMemoriesResponse>([QueryKeys.blockMemories], (prev) => {
          const memories = { ...(prev?.memories ?? {}) };
          memories[blockId] = [...(memories[blockId] ?? []), data.entry];
          return { memories };
        });
      },
    },
  );
};

// beim löschen ist schon vorher klar was wegfällt, also optimistisch - der orb
// schrumpft sofort und wird bei einem fehler zurückgerollt
export const useDeleteBlockMemoryMutation = (): UseMutationResult<
  { entryId: string },
  unknown,
  { blockId: string; entryId: string },
  { previous?: BlockMemoriesResponse }
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ blockId, entryId }: { blockId: string; entryId: string }) =>
      dataService.deleteBlockMemory(blockId, entryId),
    {
      onMutate: async ({ blockId, entryId }) => {
        await queryClient.cancelQueries([QueryKeys.blockMemories]);
        const previous = queryClient.getQueryData<BlockMemoriesResponse>([QueryKeys.blockMemories]);

        queryClient.setQueryData<BlockMemoriesResponse>([QueryKeys.blockMemories], (prev) => {
          if (!prev) {
            return prev;
          }
          const memories = { ...prev.memories };
          const remaining = (memories[blockId] ?? []).filter((entry) => entry.id !== entryId);
          if (remaining.length > 0) {
            memories[blockId] = remaining;
          } else {
            delete memories[blockId];
          }
          return { memories };
        });

        return { previous };
      },
      onError: (_error, _variables, context) => {
        if (context?.previous) {
          queryClient.setQueryData([QueryKeys.blockMemories], context.previous);
        }
      },
    },
  );
};
