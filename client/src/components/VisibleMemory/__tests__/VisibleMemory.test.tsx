import React from 'react';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/extend-expect';
import { encodeBlockId } from 'librechat-data-provider';
import { radiusForTokens, radiusScaleFor, hueForKey, TOKEN_REFERENCE } from '../palette';
import { useBlockOrbs } from '../useBlockOrbs';
import MemoryGalaxy from '../MemoryGalaxy';

const mockAdd = jest.fn();
const mockDelete = jest.fn();
let mockBlocksData: unknown = { blocks: [] };
let mockMemoriesData: unknown = { memories: {} };

jest.mock('~/data-provider', () => ({
  useGetBlocksQuery: () => ({ data: mockBlocksData, isLoading: false, error: null }),
  useBlockMemoriesQuery: () => ({ data: mockMemoriesData, isLoading: false, error: null }),
  useAddBlockMemoryMutation: () => ({ mutate: mockAdd, isLoading: false }),
  useDeleteBlockMemoryMutation: () => ({ mutate: mockDelete, isLoading: false }),
}));

jest.mock('@librechat/client', () => ({
  // eine jest.mock factory läuft, bevor die Imports des Moduls initialisiert sind
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ThemeContext: require('react').createContext({ theme: 'light' }),
  isDark: (theme: string) => theme === 'dark',
  useMediaQuery: () => false,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

/* Gegen den echten englischen Katalog interpolieren, damit ein fehlender oder
 * falsch geschriebener Übersetzungsschlüssel den Test fallen lässt. */
jest.mock('~/hooks', () => {
  const en: Record<string, string> = jest.requireActual('~/locales/en/translation.json');
  return {
    useLocalize: () => (key: string, params?: Record<string, unknown>) => {
      const template = en[key];
      if (template === undefined) {
        throw new Error(`Missing translation key: ${key}`);
      }
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params?.[name] ?? ''));
    },
  };
});

const BLOCK_A = { conversationId: 'convo-1', detectedAt: '2026-01-02T10:00:00.000Z' };
const BLOCK_B = { conversationId: 'convo-2', detectedAt: '2026-01-03T09:00:00.000Z' };
const ID_A = encodeBlockId(BLOCK_A.conversationId, BLOCK_A.detectedAt);
const ID_B = encodeBlockId(BLOCK_B.conversationId, BLOCK_B.detectedAt);

const entry = (id: string, text: string, tokenCount: number) => ({
  id,
  text,
  tokenCount,
  source: 'user' as const,
  createdAt: '2026-01-02T11:00:00.000Z',
});

beforeEach(() => {
  mockBlocksData = {
    blocks: [
      { ...BLOCK_A, title: 'Sidebar umbauen', messageCount: 6, messageIds: [] },
      { ...BLOCK_B, title: 'Speicher verbinden', messageCount: 3, messageIds: [] },
    ],
  };
  mockMemoriesData = {
    memories: {
      [ID_A]: [entry('e1', 'Orbs sollen in der Sidebar leben.', 8)],
    },
  };
});

const orbs = () =>
  screen.getAllByRole('button').filter((node) => node.getAttribute('aria-haspopup') === 'dialog');

const orbFor = (title: string) =>
  orbs().find((node) => node.getAttribute('aria-label')?.startsWith(`${title}:`));

describe('radiusForTokens', () => {
  const scale = { min: 10, max: 40 };

  it('encodes tokens by area, not by diameter', () => {
    /* Viermal so viele Tokens müssen den doppelten Radius über dem Minimum
     * ergeben, sonst überzeichnet das Bild das Wachstum. */
    const quarter = radiusForTokens(TOKEN_REFERENCE / 4, scale) - scale.min;
    const full = radiusForTokens(TOKEN_REFERENCE, scale) - scale.min;
    expect(full / quarter).toBeCloseTo(2, 5);
  });

  it('clamps instead of growing without bound', () => {
    expect(radiusForTokens(TOKEN_REFERENCE * 10, scale)).toBe(scale.max);
    expect(radiusForTokens(0, scale)).toBe(scale.min);
  });
});

describe('radiusScaleFor', () => {
  it('shrinks the orbs as the block count grows, so the panel stays readable', () => {
    const few = radiusScaleFor(340, 220, 3);
    const many = radiusScaleFor(340, 220, 30);
    expect(many.max).toBeLessThan(few.max);
  });

  it('adapts when the sidebar is widened', () => {
    const narrow = radiusScaleFor(340, 220, 8);
    const wide = radiusScaleFor(700, 220, 8);
    expect(wide.max).toBeGreaterThan(narrow.max);
  });
});

describe('hueForKey', () => {
  it('follows the block identity rather than its position', () => {
    expect(hueForKey(ID_A, false)).toBe(hueForKey(ID_A, false));
    const light = ['#2a78d6', '#eb6834', '#1baf7a'];
    const dark = ['#3987e5', '#d95926', '#199e70'];
    expect(dark.indexOf(hueForKey(ID_B, true))).toBe(light.indexOf(hueForKey(ID_B, false)));
  });
});

describe('useBlockOrbs', () => {
  it('joins detected blocks with their stored entries', () => {
    const { result } = renderHook(() => useBlockOrbs());

    expect(result.current.orbs).toHaveLength(2);
    const [first, second] = result.current.orbs;
    expect(first.title).toBe('Sidebar umbauen');
    expect(first.tokenCount).toBe(8);
    expect(first.orphaned).toBe(false);
    /* Ein Block ohne Einträge verschwindet nicht - er ist nur leer. */
    expect(second.entries).toHaveLength(0);
    expect(second.tokenCount).toBe(0);
  });

  it('keeps entries whose block is no longer recognized', () => {
    mockMemoriesData = {
      memories: {
        [ID_A]: [entry('e1', 'Bleibt sichtbar.', 5)],
        'convo-9%3A%3A2026-01-01T00%3A00%3A00.000Z': [entry('e2', 'Verwaister Eintrag.', 4)],
      },
    };
    const { result } = renderHook(() => useBlockOrbs());

    const orphans = result.current.orbs.filter((orb) => orb.orphaned);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].entries[0].text).toBe('Verwaister Eintrag.');
  });
});

describe('MemoryGalaxy', () => {
  it('renders one orb per recognized block', () => {
    render(<MemoryGalaxy />);
    expect(orbs()).toHaveLength(2);
    expect(orbFor('Sidebar umbauen')).toBeInTheDocument();
    expect(orbFor('Speicher verbinden')).toBeInTheDocument();
  });

  it('reflects stored tokens in the orb label', () => {
    render(<MemoryGalaxy />);
    expect(orbFor('Sidebar umbauen')!.getAttribute('aria-label')).toContain('1 entries, 8 tokens');
    expect(orbFor('Speicher verbinden')!.getAttribute('aria-label')).toContain(
      '0 entries, 0 tokens',
    );
  });

  it('grows the orb when the stored data grows', () => {
    const { rerender } = render(<MemoryGalaxy />);
    expect(orbFor('Sidebar umbauen')!.getAttribute('aria-label')).toContain('8 tokens');

    mockMemoriesData = {
      memories: {
        [ID_A]: [
          entry('e1', 'Orbs sollen in der Sidebar leben.', 8),
          entry('e2', 'Noch etwas.', 20),
        ],
      },
    };
    rerender(<MemoryGalaxy />);

    expect(orbFor('Sidebar umbauen')!.getAttribute('aria-label')).toContain('2 entries, 28 tokens');
  });

  it('dispatches a real add mutation with the block id', async () => {
    const user = userEvent.setup();
    render(<MemoryGalaxy />);

    await user.click(orbFor('Speicher verbinden')!);
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Add a new entry to this block'), 'Neue Notiz');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][0]).toEqual({ blockId: ID_B, text: 'Neue Notiz' });
  });

  it('dispatches a real delete mutation for the chosen entry', async () => {
    const user = userEvent.setup();
    render(<MemoryGalaxy />);

    await user.click(orbFor('Sidebar umbauen')!);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Delete entry:/ }));

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0][0]).toEqual({ blockId: ID_A, entryId: 'e1' });
  });

  it('removes the orb once the block and its entries are gone', async () => {
    const { rerender } = render(<MemoryGalaxy />);
    expect(orbs()).toHaveLength(2);

    mockBlocksData = {
      blocks: [{ ...BLOCK_A, title: 'Sidebar umbauen', messageCount: 6, messageIds: [] }],
    };
    rerender(<MemoryGalaxy />);

    /* Der Orb bleibt montiert solange er ausanimiert, dann verschwindet er. */
    await waitFor(() => expect(orbFor('Speicher verbinden')).toBeUndefined(), { timeout: 3000 });
    expect(orbs()).toHaveLength(1);
  });

  it('tells screen readers which block is focused', async () => {
    const user = userEvent.setup();
    render(<MemoryGalaxy />);

    await user.tab();
    await user.tab();
    const caption = screen.getByText(/Sidebar umbauen · 1 entries · 8 tokens/);
    expect(caption).toHaveAttribute('aria-live', 'polite');
  });
});
