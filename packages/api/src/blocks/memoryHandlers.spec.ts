import { encodeBlockId } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createBlocksHandlers } from './handlers';
import type { BlocksHandlersDeps } from './handlers';

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function buildHandlers(overrides: Partial<BlocksHandlersDeps> = {}) {
  const deps = {
    getAllBlockMemories: jest.fn().mockResolvedValue([]),
    addBlockMemory: jest.fn(),
    deleteBlockMemory: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as BlocksHandlersDeps;
  return { handlers: createBlocksHandlers(deps), deps };
}

const request = (partial: Partial<ServerRequest>): ServerRequest =>
  ({ user: { id: 'user-1' }, params: {}, body: {}, ...partial }) as ServerRequest;

const BLOCK_ID = encodeBlockId('convo-1', '2026-01-02T10:00:00.000Z');

describe('block memory handlers', () => {
  describe('getMemory', () => {
    it('groups a flat entry list by block id', async () => {
      const { handlers } = buildHandlers({
        getAllBlockMemories: jest.fn().mockResolvedValue([
          {
            id: 'a',
            conversationId: 'convo-1',
            detectedAt: '2026-01-02T10:00:00.000Z',
            text: 'erster eintrag',
            tokenCount: 3,
            source: 'user',
            createdAt: '2026-01-02T10:05:00.000Z',
          },
          {
            id: 'b',
            conversationId: 'convo-1',
            detectedAt: '2026-01-02T10:00:00.000Z',
            text: 'zweiter eintrag',
            tokenCount: 4,
            source: 'user',
            createdAt: '2026-01-02T10:06:00.000Z',
          },
          {
            id: 'c',
            conversationId: 'convo-2',
            detectedAt: '2026-01-03T09:00:00.000Z',
            text: 'anderer block',
            tokenCount: 2,
            source: 'assistant',
            createdAt: '2026-01-03T09:01:00.000Z',
          },
        ]),
      });
      const res = mockResponse();

      await handlers.getMemory(request({}), res);

      expect(res.status).toHaveBeenCalledWith(200);
      const { memories } = res.json.mock.calls[0][0];
      expect(Object.keys(memories)).toHaveLength(2);
      expect(memories[BLOCK_ID].map((entry: { id: string }) => entry.id)).toEqual(['a', 'b']);
      expect(memories[encodeBlockId('convo-2', '2026-01-03T09:00:00.000Z')]).toHaveLength(1);
    });

    it('rejects an unauthenticated request', async () => {
      const { handlers, deps } = buildHandlers();
      const res = mockResponse();

      await handlers.getMemory(request({ user: undefined }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(deps.getAllBlockMemories).not.toHaveBeenCalled();
    });
  });

  describe('addMemory', () => {
    it('stores trimmed text with a server-side token count', async () => {
      const addBlockMemory = jest.fn().mockImplementation((_userId, params) =>
        Promise.resolve({
          id: 'new',
          conversationId: params.conversationId,
          detectedAt: params.detectedAt,
          text: params.text,
          tokenCount: params.tokenCount,
          source: params.source,
          createdAt: '2026-01-02T11:00:00.000Z',
        }),
      );
      const { handlers } = buildHandlers({ addBlockMemory });
      const res = mockResponse();

      await handlers.addMemory(
        request({ params: { blockId: BLOCK_ID }, body: { text: '  etwas zu merken  ' } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(201);
      const [userId, params] = addBlockMemory.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(params.conversationId).toBe('convo-1');
      expect(params.detectedAt).toBe('2026-01-02T10:00:00.000Z');
      expect(params.text).toBe('etwas zu merken');
      /* Die Tokenzahl kommt vom Server, nicht vom Client. */
      expect(params.tokenCount).toBeGreaterThan(0);
      expect(params.source).toBe('user');
    });

    it('rejects blank text', async () => {
      const { handlers, deps } = buildHandlers();
      const res = mockResponse();

      await handlers.addMemory(
        request({ params: { blockId: BLOCK_ID }, body: { text: '   ' } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(deps.addBlockMemory).not.toHaveBeenCalled();
    });

    it('rejects text beyond the length limit', async () => {
      const { handlers, deps } = buildHandlers();
      const res = mockResponse();

      await handlers.addMemory(
        request({ params: { blockId: BLOCK_ID }, body: { text: 'a'.repeat(2001) } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(deps.addBlockMemory).not.toHaveBeenCalled();
    });

    it('rejects a malformed block id', async () => {
      const { handlers, deps } = buildHandlers();
      const res = mockResponse();

      await handlers.addMemory(
        request({ params: { blockId: 'nonsense' }, body: { text: 'hallo' } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(deps.addBlockMemory).not.toHaveBeenCalled();
    });
  });

  describe('deleteMemory', () => {
    it('passes the user id through so foreign entries cannot be removed', async () => {
      const deleteBlockMemory = jest.fn().mockResolvedValue(true);
      const { handlers } = buildHandlers({ deleteBlockMemory });
      const res = mockResponse();

      await handlers.deleteMemory(
        request({ params: { blockId: BLOCK_ID, entryId: 'entry-9' } }),
        res,
      );

      expect(deleteBlockMemory).toHaveBeenCalledWith('user-1', 'entry-9');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('reports 404 when nothing was deleted', async () => {
      const { handlers } = buildHandlers({
        deleteBlockMemory: jest.fn().mockResolvedValue(false),
      });
      const res = mockResponse();

      await handlers.deleteMemory(
        request({ params: { blockId: BLOCK_ID, entryId: 'missing' } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
