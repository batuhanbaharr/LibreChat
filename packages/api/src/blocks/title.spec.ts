import { resolveBlockTitle, getSiblingBlockTitles, buildTitlePrompt, TITLE_REGEN_INTERVAL } from './title';
import type { BlockTitleDeps, CachedBlockTitle, BlockTitleGenerator } from './title';
import type { BlockMessage } from './service';
import type { TopicTieBreaker } from './tieBreaker';

const CREATED_AT = new Date('2026-01-01T09:00:00Z');
const FALLBACK_TITLE = 'nutzer nachricht 1 gekürzt';

const block = { conversationId: 'c1', detectedAt: CREATED_AT.toISOString(), title: FALLBACK_TITLE };

// baut abwechselnd user/bot-nachrichten, damit generateTitle echten input zum filtern hat
function fakeMembers(count: number): BlockMessage[] {
  const members: BlockMessage[] = [];
  for (let i = 0; i < count; i++) {
    members.push({
      messageId: `m${i + 1}`,
      text: i % 2 === 0 ? `nutzer nachricht ${i + 1}` : `bot antwort ${i + 1}`,
      isCreatedByUser: i % 2 === 0,
      createdAt: new Date(CREATED_AT.getTime() + i * 60_000).toISOString(),
      reasoning: null,
    });
  }
  return members;
}

function createDeps(options: {
  cached?: CachedBlockTitle | null;
  generateResult?: string | null;
}): BlockTitleDeps & { titleGenerator: BlockTitleGenerator & { generateTitle: jest.Mock } } {
  const tieBreaker: TopicTieBreaker = { isSameTopic: jest.fn() };
  const result = options.generateResult === undefined ? 'Neuer Titel' : options.generateResult;
  const titleGenerator: BlockTitleGenerator & { generateTitle: jest.Mock } = {
    generateTitle: jest.fn().mockResolvedValue(result),
  };

  return {
    // BlocksServiceDeps-felder werden von resolveBlockTitle selbst nicht angefasst, reichen als stubs
    getConvosByCursor: jest.fn(),
    getMessages: jest.fn(),
    getEmbedding: jest.fn(),
    saveEmbedding: jest.fn(),
    tieBreaker,
    getBlockDecision: jest.fn(),
    saveBlockDecision: jest.fn(),
    titleGenerator,
    getBlockTitle: jest.fn().mockResolvedValue(options.cached ?? null),
    saveBlockTitle: jest.fn().mockResolvedValue(undefined),
  };
}

describe('resolveBlockTitle', () => {
  it('generiert einen neuen titel wenn noch nichts gecacht ist', async () => {
    const deps = createDeps({ cached: null });
    const members = fakeMembers(2);

    const title = await resolveBlockTitle(members, block, deps);

    expect(title).toBe('Neuer Titel');
    expect(deps.titleGenerator.generateTitle).toHaveBeenCalledWith(members, null, []);
    expect(deps.saveBlockTitle).toHaveBeenCalledWith('c1', block.detectedAt, {
      title: 'Neuer Titel',
      lastMessageId: 'm2',
      messageCount: 2,
    });
  });

  it('bleibt beim gecachten titel wenn erst wenige neue nachrichten dazugekommen sind', async () => {
    const cached: CachedBlockTitle = { title: 'Alter Titel', lastMessageId: 'm2', messageCount: 2 };
    const deps = createDeps({ cached });
    // knapp unter dem schwellenwert - soll noch nicht neu generieren
    const members = fakeMembers(2 + (TITLE_REGEN_INTERVAL - 1));

    const title = await resolveBlockTitle(members, block, deps);

    expect(title).toBe('Alter Titel');
    expect(deps.titleGenerator.generateTitle).not.toHaveBeenCalled();
    expect(deps.saveBlockTitle).not.toHaveBeenCalled();
  });

  it('generiert neu sobald der schwellenwert erreicht ist, mit dem bisherigen titel als kontext', async () => {
    const cached: CachedBlockTitle = { title: 'Alter Titel', lastMessageId: 'm2', messageCount: 2 };
    const deps = createDeps({ cached, generateResult: 'Verfeinerter Titel' });
    const members = fakeMembers(2 + TITLE_REGEN_INTERVAL);

    const title = await resolveBlockTitle(members, block, deps);

    expect(title).toBe('Verfeinerter Titel');
    expect(deps.titleGenerator.generateTitle).toHaveBeenCalledWith(members, 'Alter Titel', []);
    expect(deps.saveBlockTitle).toHaveBeenCalledWith('c1', block.detectedAt, {
      title: 'Verfeinerter Titel',
      lastMessageId: `m${members.length}`,
      messageCount: members.length,
    });
  });

  it('fällt auf die einfache kürzung zurück wenn das llm nicht antwortet und noch nichts gecacht ist', async () => {
    const deps = createDeps({ cached: null, generateResult: null });
    const members = fakeMembers(2);

    const title = await resolveBlockTitle(members, block, deps);

    expect(title).toBe(FALLBACK_TITLE);
    expect(deps.saveBlockTitle).not.toHaveBeenCalled();
  });

  it('fällt auf den letzten gecachten titel zurück wenn das llm bei einer regenerierung nicht antwortet', async () => {
    const cached: CachedBlockTitle = { title: 'Alter Titel', lastMessageId: 'm2', messageCount: 2 };
    const deps = createDeps({ cached, generateResult: null });
    const members = fakeMembers(2 + TITLE_REGEN_INTERVAL);

    const title = await resolveBlockTitle(members, block, deps);

    expect(title).toBe('Alter Titel');
    expect(deps.saveBlockTitle).not.toHaveBeenCalled();
  });

  // regressionstest für den bug vom 2026-08-17: ein block mit nur einer einzigen, inhaltlich
  // leeren "fass zusammen"-nachricht bekam als titel das beispiel aus der prompt-anweisung
  // ("URL Shortener...") statt der echten themen der unterhaltung. members hier ist exakt die
  // echte "wrap up"-nachricht aus der betroffenen conversation
  it('reicht bei einem inhaltlich dünnen wrap-up-block die mitgegebenen sibling-titel an den generator weiter', async () => {
    const deps = createDeps({ cached: null, generateResult: 'Zusammenfassung der vier Kommunikationsanfragen' });
    const wrapUpMembers: BlockMessage[] = [
      {
        messageId: 'b632617d-132e-4cf6-96dd-2fb858542a19',
        text: 'Wrap up. Write a short summary of all four requests, so you could show it in a team meeting.',
        isCreatedByUser: true,
        createdAt: CREATED_AT.toISOString(),
        reasoning: null,
      },
      {
        messageId: '648b0e3d-6efb-456f-a41c-1f49fee12900',
        text: '',
        isCreatedByUser: false,
        createdAt: new Date(CREATED_AT.getTime() + 2000).toISOString(),
        reasoning: null,
      },
    ];
    const otherBlockTitles = [
      'Entwicklung eines Kampagnennamens und einer Botschaft zur Plastikreduktion auf dem Campus',
      'Konzeption eines Podcasts für die Schülervertretung zum Thema Schulleben',
      'Instagram-Beitragsreihe für die Universitätsbibliothek',
      'Konzeption eines Willkommensevents für internationale Studierende',
    ];

    const title = await resolveBlockTitle(wrapUpMembers, block, deps, otherBlockTitles);

    expect(title).toBe('Zusammenfassung der vier Kommunikationsanfragen');
    expect(deps.titleGenerator.generateTitle).toHaveBeenCalledWith(
      wrapUpMembers,
      null,
      otherBlockTitles,
    );
  });
});

describe('getSiblingBlockTitles', () => {
  it('holt für andere blocks derselben unterhaltung den gecachten titel, sonst den fallback-titel - eigener block und andere unterhaltungen ausgeschlossen', async () => {
    const target = {
      conversationId: 'c1',
      detectedAt: '2026-08-17T18:09:08.599Z',
      title: 'wrap up fallback',
    };
    const allBlocksInConversation = [
      { conversationId: 'c1', detectedAt: '2026-08-17T18:08:02.061Z', title: 'fallback campaign' },
      { conversationId: 'c1', detectedAt: '2026-08-17T18:08:17.455Z', title: 'fallback podcast' },
      target,
      // gleicher zeitstempel, aber eine ANDERE unterhaltung - darf nicht mitgezählt werden
      { conversationId: 'c2', detectedAt: '2026-08-17T18:09:08.599Z', title: 'komplett anderes gespräch' },
    ];

    const cachedTitles = new Map<string, string>([
      ['c1|2026-08-17T18:08:02.061Z', 'Entwicklung eines Kampagnennamens und einer Botschaft zur Plastikreduktion auf dem Campus'],
      // für den podcast-block existiert noch kein cache-eintrag -> muss auf den fallback zurückfallen
    ]);
    const getBlockTitle = jest.fn(async (conversationId: string, detectedAt: string) => {
      const cached = cachedTitles.get(`${conversationId}|${detectedAt}`);
      return cached ? { title: cached, lastMessageId: 'x', messageCount: 2 } : null;
    });

    const titles = await getSiblingBlockTitles(target, allBlocksInConversation, { getBlockTitle });

    expect(titles).toEqual([
      'Entwicklung eines Kampagnennamens und einer Botschaft zur Plastikreduktion auf dem Campus',
      'fallback podcast',
    ]);
    expect(getBlockTitle).not.toHaveBeenCalledWith('c1', target.detectedAt);
    expect(getBlockTitle).not.toHaveBeenCalledWith('c2', expect.anything());
  });
});

describe('buildTitlePrompt', () => {
  // dieselbe konversation wie im resolveBlockTitle-regressionstest oben, diesmal auf ebene
  // des tatsächlich gebauten prompt-texts geprüft
  const wrapUpText =
    'Wrap up. Write a short summary of all four requests, so you could show it in a team meeting.';
  const realOtherTitles = [
    'Entwicklung eines Kampagnennamens und einer Botschaft zur Plastikreduktion auf dem Campus',
    'Konzeption eines Podcasts für die Schülervertretung zum Thema Schulleben',
    'Instagram-Beitragsreihe für die Universitätsbibliothek',
    'Konzeption eines Willkommensevents für internationale Studierende',
  ];

  it('nimmt bei einem dünnen wrap-up-block die echten themen der anderen blocks statt sich auf das anweisungs-beispiel zu verlassen', () => {
    const prompt = buildTitlePrompt(wrapUpText, null, realOtherTitles);

    for (const title of realOtherTitles) {
      expect(prompt).toContain(title);
    }
    // der eigentliche bug: das beispiel in der anweisung enthielt "URL Shortener" als
    // konkretes thema, an dem sich das llm mangels echtem inhalt orientiert hat
    expect(prompt.toLowerCase()).not.toContain('url');
    expect(prompt.toLowerCase()).not.toContain('shortener');
  });

  it('lässt die anderen themen weg, wenn der block schon genug eigenen inhalt hat', () => {
    const richText =
      'Podcast idea. The student council wants a podcast about student life. Come up with a concept: ' +
      'who hosts it, what topics it covers each episode, and how long each episode should be.';

    const prompt = buildTitlePrompt(richText, null, realOtherTitles);

    for (const title of realOtherTitles) {
      expect(prompt).not.toContain(title);
    }
  });

  it('das beispiel in der anweisung ist ein generischer platzhalter ohne konkretes thema', () => {
    const prompt = buildTitlePrompt('ein beliebiger kurzer inhalt', null, []);

    expect(prompt.toLowerCase()).not.toContain('url');
    expect(prompt.toLowerCase()).not.toContain('shortener');
    expect(prompt).toContain('[Thema]');
  });
});
