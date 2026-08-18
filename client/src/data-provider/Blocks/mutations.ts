import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { BlockMessagesResponse } from 'librechat-data-provider';

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
