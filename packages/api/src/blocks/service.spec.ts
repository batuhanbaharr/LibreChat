import { detectBlocksInConversation, getDetectedBlocksForUser, getBlockMessages } from './service';
import type { BlocksServiceDeps } from './service';
import type { TopicTieBreaker } from './tieBreaker';

// simuliert echte gemini embeddings: ähnliche texte -> ähnliche vektoren
const EMBEDDINGS: Record<string, number[]> = {
  'wie debugge ich react hooks': [1, 0, 0],
  'und wenn der hook zweimal feuert': [0.95, 0.1, 0],
  'wie verbinde ich mongodb': [0, 1, 0],
  // für den centroid-test: msg2 ist noch nah an msg1, msg3 allein wäre zu weit von msg2
  // weg (0.588), aber der centroid aus msg1+msg2 hält den block zusammen (0.682)
  'frage eins zum thema a': [1, 0],
  'frage zwei noch zum thema a': [0.97, 0.242],
  'frage drei wieder zum thema a': [0.766, -0.643],
  // die beiden hier sind auf echte gemini similarity kalibriert, siehe die tests unten
  'was ist useeffect in react': [1, 0],
  'nochmal zu useeffect zurück nach der pause': [0.7498, 0.6617], // echt gemessen: 0.7498
  'was ist der unterschied zu usestate': [0.684, 0.7295], // echt gemessen: 0.684
  // echte fehlerfälle: gleiches satzmuster, komplett anderes thema
  'wie kann man ein auto reparieren': [1, 0],
  'wie kann man einen schrank anbauen': [0.6597, 0.7515], // echt gemessen: 0.6597
  'welcher it beruf wird am häufigsten gesucht': [1, 0],
  'welcher maschinenbau beruf wird am häufigsten gesucht': [0.8178, 0.5755], // echt gemessen: 0.8178
  // referenzkette (soll NIE kaputtgehen): natürliche vertiefung eines themas.
  // echt gemessen: msg1->msg2 0.8397, msg3 vs centroid(msg1,msg2) 0.6178
  'wann endete der kalte krieg': [1, 0],
  'wer hat den kalten krieg gewonnen': [0.8397, 0.5431],
  'welche armee ist aktuell die stärkste der welt': [0.3699, 0.9291],
};

function fakeGetEmbedding(text: string): Promise<number[]> {
  const vector = EMBEDDINGS[text];
  if (!vector) {
    throw new Error(`kein test vektor für "${text}"`);
  }
  return Promise.resolve(vector);
}

// baut eine testnachricht, messageId = text macht die fixtures einfacher zu lesen
function msg(text: string, isCreatedByUser: boolean, createdAt: Date) {
  return { messageId: text, text, isCreatedByUser, createdAt };
}

interface TestDepsOptions {
  getEmbedding?: jest.Mock;
  // key ist "anchorText|||newText"
  tieBreakerAnswers?: Record<string, boolean | null>;
}

function createTestDeps(options: TestDepsOptions = {}) {
  const decisionCache = new Map<string, boolean>();

  const tieBreaker: TopicTieBreaker = {
    isSameTopic: jest.fn(async (anchor: string, text: string) => {
      const key = `${anchor}|||${text}`;
      // key nicht konfiguriert -> default "gleiches thema", konfigurierter wert (auch null) zählt
      return key in (options.tieBreakerAnswers ?? {}) ? options.tieBreakerAnswers![key] : true;
    }),
  };

  const getBlockDecision = jest.fn(async (anchorId: string, id: string) => {
    return decisionCache.get(`${anchorId}|||${id}`) ?? null;
  });
  const saveBlockDecision = jest.fn(async (anchorId: string, id: string, sameTopic: boolean) => {
    decisionCache.set(`${anchorId}|||${id}`, sameTopic);
  });

  return {
    getEmbedding: options.getEmbedding ?? jest.fn(fakeGetEmbedding),
    saveEmbedding: jest.fn().mockResolvedValue(undefined),
    tieBreaker,
    getBlockDecision,
    saveBlockDecision,
  };
}

describe('detectBlocksInConversation', () => {
  it('gruppiert ähnliche folgefragen in einen block', async () => {
    const messages = [
      msg('wie debugge ich react hooks', true, new Date('2026-01-01T09:00:00Z')),
      msg('irgendeine antwort', false, new Date('2026-01-01T09:01:00Z')),
      msg('und wenn der hook zweimal feuert', true, new Date('2026-01-01T09:02:00Z')),
    ];

    const blocks = await detectBlocksInConversation('c1', messages, createTestDeps());

    expect(blocks).toHaveLength(1);
    expect(blocks[0].messageCount).toBe(2);
    expect(blocks[0].conversationId).toBe('c1');
  });

  it('startet einen neuen block bei themenwechsel', async () => {
    const messages = [
      msg('wie debugge ich react hooks', true, new Date()),
      msg('wie verbinde ich mongodb', true, new Date()),
    ];

    const blocks = await detectBlocksInConversation('c1', messages, createTestDeps());

    expect(blocks).toHaveLength(2);
    expect(blocks[0].messageCount).toBe(1);
    expect(blocks[1].messageCount).toBe(1);
  });

  it('ignoriert nachrichten ohne text und die nicht vom user sind', async () => {
    const messages = [
      { messageId: 'm1', text: undefined, isCreatedByUser: true, createdAt: new Date() },
      msg('antwort vom bot', false, new Date()),
    ];

    const blocks = await detectBlocksInConversation('c1', messages, createTestDeps());

    expect(blocks).toEqual([]);
  });

  it('gibt leeres array für eine konversation ohne user nachrichten', async () => {
    const blocks = await detectBlocksInConversation('c1', [], createTestDeps());
    expect(blocks).toEqual([]);
  });

  it('nutzt den centroid statt nur die letzte nachricht, damit ein einzelner ausflug nicht den block spaltet', async () => {
    const base = new Date('2026-01-01T09:00:00Z');
    const messages = [
      msg('frage eins zum thema a', true, base),
      msg('frage zwei noch zum thema a', true, new Date(base.getTime() + 60_000)),
      msg('frage drei wieder zum thema a', true, new Date(base.getTime() + 120_000)),
    ];

    const blocks = await detectBlocksInConversation('c1', messages, createTestDeps());

    expect(blocks).toHaveLength(1);
    expect(blocks[0].messageCount).toBe(3);
  });

  it('überspringt kurze bestätigungen beim embedding und zählt sie einfach zum block dazu', async () => {
    const base = new Date('2026-01-01T09:00:00Z');
    const deps = createTestDeps();
    const messages = [
      msg('wie debugge ich react hooks', true, base),
      msg('ok', true, new Date(base.getTime() + 60_000)),
      msg('und wenn der hook zweimal feuert', true, new Date(base.getTime() + 120_000)),
    ];

    const blocks = await detectBlocksInConversation('c1', messages, deps);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].messageCount).toBe(3);
    expect(deps.getEmbedding).not.toHaveBeenCalledWith('ok');
    expect(deps.getEmbedding).toHaveBeenCalledTimes(2);
  });

  it('bleibt trotz 25 minuten pause im selben block, wenn die nachricht klar ans alte thema anknüpft', async () => {
    const base = new Date('2026-01-01T09:00:00Z');
    const messages = [
      msg('was ist useeffect in react', true, base),
      msg(
        'nochmal zu useeffect zurück nach der pause',
        true,
        new Date(base.getTime() + 25 * 60_000),
      ),
    ];

    const blocks = await detectBlocksInConversation('c1', messages, createTestDeps());

    expect(blocks).toHaveLength(1);
  });

  it('startet nach 25 minuten pause einen neuen block, wenn der tie-breaker die anknüpfung verneint', async () => {
    const base = new Date('2026-01-01T09:00:00Z');
    const messages = [
      msg('was ist useeffect in react', true, base),
      msg('was ist der unterschied zu usestate', true, new Date(base.getTime() + 25 * 60_000)),
    ];
    const deps = createTestDeps({
      tieBreakerAnswers: {
        'was ist useeffect in react|||was ist der unterschied zu usestate': false,
      },
    });

    const blocks = await detectBlocksInConversation('c1', messages, deps);

    expect(blocks).toHaveLength(2);
  });

  describe('echte fehlerfälle: gleiches satzmuster, anderes thema', () => {
    it('lässt sich nicht mehr vom "wie kann man X" muster täuschen (auto reparieren vs schrank anbauen)', async () => {
      const messages = [
        msg('wie kann man ein auto reparieren', true, new Date()),
        msg('wie kann man einen schrank anbauen', true, new Date()),
      ];
      const deps = createTestDeps({
        tieBreakerAnswers: {
          'wie kann man ein auto reparieren|||wie kann man einen schrank anbauen': false,
        },
      });

      const blocks = await detectBlocksInConversation('c1', messages, deps);

      expect(blocks).toHaveLength(2);
      expect(deps.tieBreaker.isSameTopic).toHaveBeenCalledTimes(1);
    });

    it('lässt sich nicht mehr vom "welcher X beruf..." muster täuschen (IT vs Maschinenbau)', async () => {
      const messages = [
        msg('welcher it beruf wird am häufigsten gesucht', true, new Date()),
        msg('welcher maschinenbau beruf wird am häufigsten gesucht', true, new Date()),
      ];
      const deps = createTestDeps({
        tieBreakerAnswers: {
          'welcher it beruf wird am häufigsten gesucht|||welcher maschinenbau beruf wird am häufigsten gesucht': false,
        },
      });

      const blocks = await detectBlocksInConversation('c1', messages, deps);

      expect(blocks).toHaveLength(2);
    });
  });

  it('trennt im zweifel, wenn der tie-breaker nicht antworten kann (z.b. rate limit)', async () => {
    // score 0.8178 liegt über dem threshold - früher wurde dann trotzdem gemergt,
    // jetzt ist im unklaren fall lieber ein block zu viel als zwei themen gemischt
    const messages = [
      msg('welcher it beruf wird am häufigsten gesucht', true, new Date()),
      msg('welcher maschinenbau beruf wird am häufigsten gesucht', true, new Date()),
    ];
    const deps = createTestDeps({
      tieBreakerAnswers: {
        'welcher it beruf wird am häufigsten gesucht|||welcher maschinenbau beruf wird am häufigsten gesucht':
          null,
      },
    });

    const blocks = await detectBlocksInConversation('c1', messages, deps);

    expect(blocks).toHaveLength(2);
  });

  it('referenzkette: natürliche themenvertiefung bleibt ein block (darf durch keine änderung kaputtgehen)', async () => {
    const base = new Date('2026-01-01T09:00:00Z');
    const messages = [
      msg('wann endete der kalte krieg', true, base),
      msg('wer hat den kalten krieg gewonnen', true, new Date(base.getTime() + 30_000)),
      msg(
        'welche armee ist aktuell die stärkste der welt',
        true,
        new Date(base.getTime() + 60_000),
      ),
    ];

    const blocks = await detectBlocksInConversation('c1', messages, createTestDeps());

    expect(blocks).toHaveLength(1);
    expect(blocks[0].messageCount).toBe(3);
  });

  it('fragt den tie-breaker gar nicht erst bei eindeutigen scores', async () => {
    const messages = [
      msg('wie debugge ich react hooks', true, new Date()),
      msg('wie verbinde ich mongodb', true, new Date()),
    ];
    const deps = createTestDeps();

    await detectBlocksInConversation('c1', messages, deps);

    // similarity 0 ist eindeutig verschieden, braucht keine rückfrage
    expect(deps.tieBreaker.isSameTopic).not.toHaveBeenCalled();
  });

  it('nimmt ein bereits gespeichertes embedding statt es neu zu berechnen', async () => {
    const messages = [
      msg('wie debugge ich react hooks', true, new Date()),
      {
        ...msg('und wenn der hook zweimal feuert', true, new Date()),
        blockEmbedding: EMBEDDINGS['und wenn der hook zweimal feuert'],
      },
    ];
    const deps = createTestDeps();

    const blocks = await detectBlocksInConversation('c1', messages, deps);

    expect(blocks).toHaveLength(1);
    expect(deps.getEmbedding).not.toHaveBeenCalledWith('und wenn der hook zweimal feuert');
    expect(deps.saveEmbedding).not.toHaveBeenCalledWith(
      'und wenn der hook zweimal feuert',
      expect.anything(),
    );
  });

  it('speichert ein frisch berechnetes embedding am message-dokument', async () => {
    const messages = [msg('wie debugge ich react hooks', true, new Date())];
    const deps = createTestDeps();

    await detectBlocksInConversation('c1', messages, deps);

    expect(deps.saveEmbedding).toHaveBeenCalledWith(
      'wie debugge ich react hooks',
      EMBEDDINGS['wie debugge ich react hooks'],
    );
  });

  it('fragt den tie-breaker nicht nochmal, wenn die entscheidung schon gecacht ist', async () => {
    const messages = [
      msg('welcher it beruf wird am häufigsten gesucht', true, new Date()),
      msg('welcher maschinenbau beruf wird am häufigsten gesucht', true, new Date()),
    ];
    const deps = createTestDeps({
      tieBreakerAnswers: {
        'welcher it beruf wird am häufigsten gesucht|||welcher maschinenbau beruf wird am häufigsten gesucht': false,
      },
    });

    await detectBlocksInConversation('c1', messages, deps);
    expect(deps.tieBreaker.isSameTopic).toHaveBeenCalledTimes(1);

    // zweiter durchlauf mit den gleichen deps (cache ist jetzt gefüllt)
    const blocks = await detectBlocksInConversation('c1', messages, deps);

    expect(blocks).toHaveLength(2);
    expect(deps.tieBreaker.isSameTopic).toHaveBeenCalledTimes(1);
  });
});

describe('getDetectedBlocksForUser', () => {
  function createServiceDeps(overrides: Partial<BlocksServiceDeps> = {}): BlocksServiceDeps {
    return {
      getConvosByCursor: jest.fn().mockResolvedValue({
        conversations: [{ conversationId: 'c1' }],
        nextCursor: null,
      }),
      getMessages: jest
        .fn()
        .mockResolvedValue([msg('wie debugge ich react hooks', true, new Date())]),
      ...createTestDeps(),
      ...overrides,
    } as BlocksServiceDeps;
  }

  it('holt die konversationen des users und baut daraus blocks', async () => {
    const deps = createServiceDeps();

    const blocks = await getDetectedBlocksForUser('u1', deps);

    expect(deps.getConvosByCursor).toHaveBeenCalledWith('u1', { limit: 10 });
    expect(deps.getMessages).toHaveBeenCalledWith(
      { conversationId: 'c1', user: 'u1' },
      '+blockEmbedding',
    );
    expect(blocks).toHaveLength(1);
  });

  it('überspringt konversationen ohne nachrichten', async () => {
    const deps = createServiceDeps({ getMessages: jest.fn().mockResolvedValue([]) });

    const blocks = await getDetectedBlocksForUser('u1', deps);

    expect(blocks).toEqual([]);
  });
});

describe('getBlockMessages', () => {
  function createDeps(getMessages: jest.Mock): BlocksServiceDeps {
    return {
      getConvosByCursor: jest.fn(),
      getMessages,
      ...createTestDeps(),
    } as BlocksServiceDeps;
  }

  it('gibt nur die nachrichten zurück, die zeitlich in den block fallen (user + bot)', async () => {
    const t0 = new Date('2026-01-01T09:00:00Z');
    const t1 = new Date('2026-01-01T09:01:00Z');
    const t2 = new Date('2026-01-01T09:02:00Z'); // anderes thema -> neuer block
    const t3 = new Date('2026-01-01T09:03:00Z');

    const messages = [
      msg('wie debugge ich react hooks', true, t0),
      msg('hier eine antwort vom bot', false, t1),
      msg('wie verbinde ich mongodb', true, t2),
      msg('eine andere antwort', false, t3),
    ];
    const deps = createDeps(jest.fn().mockResolvedValue(messages));

    const block1 = await getBlockMessages('u1', 'c1', t0.toISOString(), deps);
    expect(block1?.map((m) => m.messageId)).toEqual([
      'wie debugge ich react hooks',
      'hier eine antwort vom bot',
    ]);

    const block2 = await getBlockMessages('u1', 'c1', t2.toISOString(), deps);
    expect(block2?.map((m) => m.messageId)).toEqual([
      'wie verbinde ich mongodb',
      'eine andere antwort',
    ]);
  });

  it('gibt null zurück wenn der block nicht existiert', async () => {
    const deps = createDeps(
      jest.fn().mockResolvedValue([msg('wie debugge ich react hooks', true, new Date())]),
    );

    const result = await getBlockMessages('u1', 'c1', '2020-01-01T00:00:00.000Z', deps);

    expect(result).toBeNull();
  });

  it('gibt null zurück wenn die konversation keine nachrichten hat', async () => {
    const deps = createDeps(jest.fn().mockResolvedValue([]));

    const result = await getBlockMessages('u1', 'c1', new Date().toISOString(), deps);

    expect(result).toBeNull();
  });
});
