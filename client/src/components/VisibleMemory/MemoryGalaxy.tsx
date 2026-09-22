import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ThemeContext, isDark, useMediaQuery } from '@librechat/client';
import { Orbit } from 'lucide-react';
import { hueForKey, radiusForTokens, radiusScaleFor } from './palette';
import { useOrbSimulation } from './useOrbSimulation';
import MemoryInspector from './MemoryInspector';
import { useBlockOrbs } from './useBlockOrbs';
import MemoryOrb from './MemoryOrb';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Das Orb-Feld für die Sidebar: misst sich selbst, speist die Simulation und
 * rendert einen Orb pro erkanntem Block. Neu gerendert wird nur, wenn sich die
 * Blockdaten ändern - die Bewegung pro Frame läuft über Motion Values und
 * fasst React nicht an.
 */
export default function MemoryGalaxy() {
  const localize = useLocalize();
  const { orbs, isLoading, error } = useBlockOrbs();
  const { theme: appTheme } = useContext(ThemeContext);
  const isDarkMode = isDark(appTheme);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const stageRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [orbit, setOrbit] = useState(true);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBounds({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* Der Maßstab hängt an Panelgröße und Orb-Anzahl, weil die Sidebar in der
   * Breite verstellbar ist und die Blockzahl mit der Nutzung wächst. */
  const scale = useMemo(
    () => radiusScaleFor(bounds.width, bounds.height, orbs.length),
    [bounds.width, bounds.height, orbs.length],
  );

  const specs = useMemo(
    () => orbs.map((orb) => ({ id: orb.id, radius: radiusForTokens(orb.tokenCount, scale) })),
    [orbs, scale],
  );

  const { handles, pruneHandles } = useOrbSimulation(specs, {
    bounds,
    orbit,
    reducedMotion: prefersReducedMotion,
  });

  /* stabil, damit der Escape-Listener des Inspectors nicht bei jedem Render
   * neu registriert wird */
  const handleClose = useCallback(() => setActiveId(null), []);

  const activeOrb = orbs.find((orb) => orb.id === activeId) ?? null;
  const captionOrb = orbs.find((orb) => orb.id === hoverId) ?? null;

  return (
    <section aria-label={localize('com_ui_vismem_title')} className="mt-4 shrink-0">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          {localize('com_ui_vismem_title')}
        </h3>
        <button
          type="button"
          onClick={() => setOrbit((value) => !value)}
          aria-pressed={orbit}
          aria-label={localize(orbit ? 'com_ui_vismem_orbit_on' : 'com_ui_vismem_orbit_off')}
          className={cn(
            'ml-auto rounded-lg border border-border-medium p-1 text-text-secondary',
            'hover:bg-surface-hover hover:text-text-primary',
            orbit && 'bg-surface-hover text-text-primary',
          )}
        >
          <Orbit className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative h-[220px] w-full shrink-0 overflow-hidden rounded-xl border border-border-light bg-surface-secondary"
      >
        {isLoading && (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-text-secondary">
            {localize('com_ui_vismem_loading')}
          </p>
        )}

        {!isLoading && error != null && (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-text-secondary">
            {localize('com_ui_vismem_error')}
          </p>
        )}

        {!isLoading && error == null && orbs.length === 0 && (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-text-secondary">
            {localize('com_ui_vismem_empty')}
          </p>
        )}

        {!isLoading && error == null && orbs.length > 0 && (
          <AnimatePresence onExitComplete={() => pruneHandles(specs.map((spec) => spec.id))}>
            {orbs.map((orb) => {
              const handle = handles.get(orb.id);
              if (!handle) {
                return null;
              }
              return (
                <MemoryOrb
                  key={orb.id}
                  orb={orb}
                  handle={handle}
                  radius={radiusForTokens(orb.tokenCount, scale)}
                  hue={hueForKey(orb.id, isDarkMode)}
                  bounds={bounds}
                  isActive={activeId === orb.id}
                  onHoverChange={setHoverId}
                  onInspect={() => setActiveId((current) => (current === orb.id ? null : orb.id))}
                />
              );
            })}
          </AnimatePresence>
        )}

        <MemoryInspector
          orb={activeOrb}
          hue={activeOrb ? hueForKey(activeOrb.id, isDarkMode) : 'transparent'}
          onClose={handleClose}
        />
      </div>

      {/* Bildunterschrift statt schwebender Tooltips: In einer 360px-Sidebar
          würde ein Overlay neben dem Orb über den Rand hinauslaufen. */}
      <p
        className="mt-1 min-h-[1.25rem] truncate text-[11px] text-text-secondary"
        aria-live="polite"
      >
        {captionOrb
          ? localize('com_ui_vismem_caption', {
              title: captionOrb.title,
              entries: captionOrb.entries.length,
              tokens: captionOrb.tokenCount,
            })
          : localize('com_ui_vismem_hint')}
      </p>
    </section>
  );
}
