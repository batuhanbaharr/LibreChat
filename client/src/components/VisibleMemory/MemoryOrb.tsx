import { useRef } from 'react';
import { motion, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { BlockOrb } from './types';
import type { OrbHandle } from './useOrbSimulation';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MemoryOrbProps {
  orb: BlockOrb;
  handle: OrbHandle;
  hue: string;
  radius: number;
  bounds: { width: number; height: number };
  isActive: boolean;
  onInspect: () => void;
  onHoverChange: (id: string | null) => void;
}

/** Unterhalb dieses Radius wird die Zahl im Orb unleserlich. */
const COUNT_MIN_RADIUS = 15;

/**
 * Ein erkannter Block als ziehbarer Orb.
 *
 * Zwei verschachtelte Elemente mit Absicht: ein Positionierer ohne Größe, der
 * das x/y der Simulation trägt (die Transform ist damit der Mittelpunkt,
 * unabhängig von der Größe), und der sichtbare Kreis darin mit dem animierten
 * Durchmesser. Getrennte Elemente heißt: Wachstumsfeder und Positionsstrom
 * streiten sich nie um dieselbe Transform.
 *
 * Im schmalen Panel trägt der Orb kein dauerhaftes Label - bei 360px Breite
 * würden sich die Beschriftungen gegenseitig überdecken. Der Name erscheint
 * beim Hovern und in der Bildunterschrift des Panels.
 */
export default function MemoryOrb({
  orb,
  handle,
  hue,
  radius,
  bounds,
  isActive,
  onInspect,
  onHoverChange,
}: MemoryOrbProps) {
  const localize = useLocalize();
  /* Framer feuert onDragStart erst oberhalb seiner Schwelle - damit lässt sich
   * ein Klick zum Öffnen sauber vom Ende eines Ziehens trennen. */
  const didDrag = useRef(false);

  const size = useTransform(handle.r, (r) => r * 2);
  const countSize = useTransform(handle.r, (r) => Math.round(Math.min(14, Math.max(9, r * 0.5))));

  const edge = radius + 3;
  const constraints = {
    left: edge,
    right: Math.max(edge, bounds.width - edge),
    top: edge,
    bottom: Math.max(edge, bounds.height - edge),
  };

  const label = orb.orphaned
    ? localize('com_ui_vismem_orb_label_orphan', {
        title: orb.title,
        entries: orb.entries.length,
        tokens: orb.tokenCount,
      })
    : localize('com_ui_vismem_orb_label', {
        title: orb.title,
        entries: orb.entries.length,
        tokens: orb.tokenCount,
      });

  return (
    <motion.div
      className="absolute left-0 top-0 h-0 w-0"
      style={{ x: handle.x, y: handle.y }}
      drag
      dragMomentum={false}
      dragElastic={0.08}
      dragConstraints={constraints}
      onPointerDown={() => {
        didDrag.current = false;
      }}
      onDragStart={() => {
        didDrag.current = true;
        handle.startDrag();
      }}
      onDrag={() => handle.moveDrag()}
      onDragEnd={(_event: unknown, info: PanInfo) => handle.endDrag(info.velocity)}
    >
      <motion.button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isActive}
        style={{ width: size, height: size, backgroundColor: hue }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.25 }}
        transition={{ duration: 0.24 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onHoverStart={() => onHoverChange(orb.id)}
        onHoverEnd={() => onHoverChange(null)}
        onFocus={() => onHoverChange(orb.id)}
        onBlur={() => onHoverChange(null)}
        onClick={() => {
          if (didDrag.current) {
            return;
          }
          onInspect();
        }}
        className={cn(
          'absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none',
          'items-center justify-center rounded-full active:cursor-grabbing',
          'focus-visible:ring-text-primary/50 focus:outline-none focus-visible:ring-2',
        )}
      >
        {/* Kugelschattierung plus 2px-Ring in Flächenfarbe, damit überlappende
            Orbs als getrennte Marken lesbar bleiben. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            backgroundImage:
              'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.5), rgba(255,255,255,0) 54%), radial-gradient(circle at 70% 84%, rgba(0,0,0,0.3), rgba(0,0,0,0) 60%)',
            boxShadow: isActive
              ? '0 0 0 2px var(--surface-primary), 0 0 0 4px currentColor, 0 6px 16px -6px rgba(0,0,0,0.5)'
              : '0 0 0 2px var(--surface-primary), 0 6px 16px -8px rgba(0,0,0,0.5)',
            color: hue,
            /* Verwaiste Einträge: gestrichelter Rand statt eigener Farbe, damit
               die Farbpalette ihre geprüfte Trennschärfe behält. */
            outline: orb.orphaned ? '2px dashed var(--text-secondary)' : undefined,
            outlineOffset: orb.orphaned ? '2px' : undefined,
          }}
        />
        {radius >= COUNT_MIN_RADIUS && orb.tokenCount > 0 && (
          <motion.span
            className="relative font-semibold tabular-nums text-white"
            style={{ fontSize: countSize, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
          >
            {orb.tokenCount}
          </motion.span>
        )}
      </motion.button>
    </motion.div>
  );
}
