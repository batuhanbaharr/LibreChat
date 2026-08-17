import { getOrGenerateBlockSummary } from './summary';
import type { BlockSummaryDeps, CachedBlockSummary, BlockSummarizer } from './summary';
import type { TopicTieBreaker } from './tieBreaker';

const MESSAGE_TEXT = 'hallo wie geht es dir heute';
const CREATED_AT = new Date('2026-01-01T09:00:00Z');

function fakeMessages() {
  return [
    { messageId: 'm1', text: MESSAGE_TEXT, isCreatedByUser: true, createdAt: CREATED_AT },
    {
      messageId: 'm2',
      text: 'mir geht es gut, danke der nachfrage',
      isCreatedByUser: false,
      createdAt: new Date(CREATED_AT.getTime() + 60_000),
    },
  ];
}

function createDeps(options: {
  cached?: CachedBlockSummary | null;
  summarizeResult?: string | null;
}): BlockSummaryDeps & { summarizer: BlockSummarizer & { summarize: jest.Mock } } {
  const tieBreaker: TopicTieBreaker = { isSameTopic: jest.fn().mockResolvedValue(true) };
  const result =
    options.summarizeResult === undefined ? 'kurze zusammenfassung' : options.summarizeResult;
  const summarizer: BlockSummarizer & { summarize: jest.Mock } = {
    summarize: jest.fn().mockResolvedValue(result),
  };

  return {
    getConvosByCursor: jest.fn(),
    getMessages: jest.fn().mockResolvedValue(fakeMessages()),
    getEmbedding: jest.fn().mockResolvedValue([1, 0]),
    saveEmbedding: jest.fn().mockResolvedValue(undefined),
    tieBreaker,
    getBlockDecision: jest.fn().mockResolvedValue(null),
    saveBlockDecision: jest.fn().mockResolvedValue(undefined),
    summarizer,
    getBlockSummary: jest.fn().mockResolvedValue(options.cached ?? null),
    saveBlockSummary: jest.fn().mockResolvedValue(undefined),
  };
}

describe('getOrGenerateBlockSummary', () => {
  it('generiert eine neue zusammenfassung wenn noch nichts gecacht ist', async () => {
    const deps = createDeps({ cached: null });

    const result = await getOrGenerateBlockSummary('u1', 'c1', CREATED_AT.toISOString(), deps);

    expect(result).toEqual({ status: 'ok', summary: 'kurze zusammenfassung' });
    expect(deps.summarizer.summarize).toHaveBeenCalledTimes(1);
    expect(deps.saveBlockSummary).toHaveBeenCalledWith('c1', CREATED_AT.toISOString(), {
      summary: 'kurze zusammenfassung',
      lastMessageId: 'm2',
      messageCount: 2,
    });
  });

  it('nutzt den cache wenn sich der block nicht verändert hat', async () => {
    const deps = createDeps({
      cached: { summary: 'alte zusammenfassung', lastMessageId: 'm2', messageCount: 2 },
    });

    const result = await getOrGenerateBlockSummary('u1', 'c1', CREATED_AT.toISOString(), deps);

    expect(result).toEqual({ status: 'ok', summary: 'alte zusammenfassung' });
    expect(deps.summarizer.summarize).not.toHaveBeenCalled();
  });

  it('generiert neu wenn der block seit dem cache gewachsen ist', async () => {
    const deps = createDeps({
      cached: { summary: 'alte zusammenfassung', lastMessageId: 'm1', messageCount: 1 },
    });

    const result = await getOrGenerateBlockSummary('u1', 'c1', CREATED_AT.toISOString(), deps);

    expect(result).toEqual({ status: 'ok', summary: 'kurze zusammenfassung' });
    expect(deps.summarizer.summarize).toHaveBeenCalledTimes(1);
  });

  it('fällt auf die alte zusammenfassung zurück wenn das llm gerade nicht antwortet', async () => {
    const deps = createDeps({
      cached: { summary: 'alte zusammenfassung', lastMessageId: 'm1', messageCount: 1 },
      summarizeResult: null,
    });

    const result = await getOrGenerateBlockSummary('u1', 'c1', CREATED_AT.toISOString(), deps);

    expect(result).toEqual({ status: 'ok', summary: 'alte zusammenfassung' });
    expect(deps.saveBlockSummary).not.toHaveBeenCalled();
  });

  it('meldet "unavailable" wenn das llm nicht antwortet und noch nichts gecacht ist', async () => {
    const deps = createDeps({ cached: null, summarizeResult: null });

    const result = await getOrGenerateBlockSummary('u1', 'c1', CREATED_AT.toISOString(), deps);

    expect(result).toEqual({ status: 'unavailable' });
    expect(deps.saveBlockSummary).not.toHaveBeenCalled();
  });

  it('meldet "not_found" wenn der block nicht existiert', async () => {
    const deps = createDeps({ cached: null });

    const result = await getOrGenerateBlockSummary('u1', 'c1', '2020-01-01T00:00:00.000Z', deps);

    expect(result).toEqual({ status: 'not_found' });
    expect(deps.summarizer.summarize).not.toHaveBeenCalled();
  });
});
