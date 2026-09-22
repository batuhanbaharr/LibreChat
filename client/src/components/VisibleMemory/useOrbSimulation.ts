import { useCallback, useEffect, useMemo, useRef } from 'react';
import { animate, motionValue } from 'framer-motion';
import { forceCollide, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { MotionValue } from 'framer-motion';
import type { Simulation, SimulationNodeDatum } from 'd3-force';

/**
 * Orb-Physik auf einer d3-force Simulation, deren Positionen in Framer
 * `MotionValue`s geschrieben werden.
 *
 * Entscheidend: Die Simulation setzt keinen React-State. Sechzig Ticks pro
 * Sekunde landen direkt in Motion Values, die Framer außerhalb des Render-
 * Zyklus auf das DOM anwendet - die Leerlaufbewegung kostet null Re-Renders.
 * React rendert nur neu, wenn sich die Blockdaten wirklich ändern.
 *
 * Die Kräfte sind auf den Sidebar-Container ausgelegt (ab 360px Breite):
 * eine kreisförmige Umlaufbahn passt in eine schmale Box nicht, deshalb
 * schwache x/y-Zentrierung plus tangentiale Drift statt eines Radialrings.
 */

const IDLE_ALPHA = 0.05; /* kommt nie ganz zur Ruhe, damit die Orbs weiter treiben */
const DRAG_ALPHA = 0.3;
const ORB_GAP = 4;
const EDGE_PADDING = 3;
const BOUNCE = 0.4;
const ORBIT_STRENGTH = 1.6;
const CENTER_STRENGTH = 0.014;
/** px pro Tick; ein harter Wurf darf den Orb nicht aus dem Panel schießen. */
const MAX_FLING = 14;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface OrbSpec {
  id: string;
  radius: number;
}

interface OrbNode extends SimulationNodeDatum {
  id: string;
  /** Lebender Radius, pro Tick aus der Feder gelesen, damit Kollision ihr folgt. */
  r: number;
  targetR: number;
  dragging: boolean;
}

export interface OrbHandle {
  x: MotionValue<number>;
  y: MotionValue<number>;
  r: MotionValue<number>;
  startDrag: () => void;
  moveDrag: () => void;
  endDrag: (velocity: { x: number; y: number }) => void;
}

interface Bounds {
  width: number;
  height: number;
}

interface Options {
  bounds: Bounds;
  /** Tangentiale Drift um die Mitte - das "Sonnensystem"-Verhalten. */
  orbit?: boolean;
  /** Wenn true kommt das Feld zur Ruhe; Ziehen funktioniert weiterhin. */
  reducedMotion?: boolean;
}

function createOrbitForce(getBounds: () => Bounds, getStrength: () => number) {
  let nodes: OrbNode[] = [];
  const force = (alpha: number) => {
    const strength = getStrength();
    if (!strength) {
      return;
    }
    const { width, height } = getBounds();
    if (!width || !height) {
      return;
    }
    const cx = width / 2;
    const cy = height / 2;
    for (const node of nodes) {
      if (node.dragging) {
        continue;
      }
      const dx = (node.x ?? 0) - cx;
      const dy = (node.y ?? 0) - cy;
      const distance = Math.hypot(dx, dy) || 1;
      /* Senkrecht zum Radiusvektor: schiebt den Orb seitwärts, nicht nach außen. */
      node.vx = (node.vx ?? 0) + (-dy / distance) * strength * alpha;
      node.vy = (node.vy ?? 0) + (dx / distance) * strength * alpha;
    }
  };
  force.initialize = (n: OrbNode[]) => {
    nodes = n;
  };
  return force;
}

function createBoundsForce(getBounds: () => Bounds) {
  let nodes: OrbNode[] = [];
  const force = () => {
    const { width, height } = getBounds();
    if (!width || !height) {
      return;
    }
    for (const node of nodes) {
      if (node.dragging) {
        continue;
      }
      const edge = node.r + EDGE_PADDING;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      if (x < edge) {
        node.x = edge;
        node.vx = Math.abs(node.vx ?? 0) * BOUNCE;
      } else if (x > width - edge) {
        node.x = width - edge;
        node.vx = -Math.abs(node.vx ?? 0) * BOUNCE;
      }
      if (y < edge) {
        node.y = edge;
        node.vy = Math.abs(node.vy ?? 0) * BOUNCE;
      } else if (y > height - edge) {
        node.y = height - edge;
        node.vy = -Math.abs(node.vy ?? 0) * BOUNCE;
      }
    }
  };
  force.initialize = (n: OrbNode[]) => {
    nodes = n;
  };
  return force;
}

export function useOrbSimulation(
  specs: OrbSpec[],
  { bounds, orbit = true, reducedMotion = false }: Options,
) {
  const simulationRef = useRef<Simulation<OrbNode, undefined> | null>(null);
  const nodesRef = useRef<OrbNode[]>([]);
  const handlesRef = useRef(new Map<string, OrbHandle>());

  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const motionRef = useRef({ orbit, reducedMotion });
  motionRef.current = { orbit, reducedMotion };

  const idleAlpha = useCallback(() => (motionRef.current.reducedMotion ? 0 : IDLE_ALPHA), []);
  const findNode = useCallback((id: string) => nodesRef.current.find((node) => node.id === id), []);

  /* Handles entstehen während des Renderns, damit ein Orb schon an seiner
   * endgültigen Position montiert wird statt einen Frame im Ursprung zu blitzen. */
  const signature = specs.map((spec) => spec.id).join('|');
  const handles = useMemo(() => {
    const map = handlesRef.current;
    for (const spec of specs) {
      if (map.has(spec.id)) {
        continue;
      }
      const { width, height } = boundsRef.current;
      const cx = (width || 340) / 2;
      const cy = (height || 240) / 2;
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.min(cx, cy) * 0.5;

      const handle: OrbHandle = {
        x: motionValue(cx + Math.cos(angle) * distance),
        y: motionValue(cy + Math.sin(angle) * distance),
        /* Startet klein und federt hoch, damit ein neuer Block aufblüht. */
        r: motionValue(spec.radius * 0.35),
        startDrag: () => {
          const node = findNode(spec.id);
          if (!node) {
            return;
          }
          node.dragging = true;
          node.fx = node.x;
          node.fy = node.y;
          simulationRef.current?.alphaTarget(DRAG_ALPHA).restart();
        },
        moveDrag: () => {
          const node = findNode(spec.id);
          if (!node) {
            return;
          }
          /* Während der Geste gehören x/y Framer; hier gespiegelt, damit die
           * anderen Orbs gegen den gezogenen kollidieren. */
          const x = handle.x.get();
          const y = handle.y.get();
          node.fx = x;
          node.fy = y;
          node.x = x;
          node.y = y;
        },
        endDrag: (velocity) => {
          const node = findNode(spec.id);
          if (!node) {
            return;
          }
          node.dragging = false;
          node.fx = null;
          node.fy = null;
          node.x = handle.x.get();
          node.y = handle.y.get();
          /* Framer meldet px/s, d3 integriert pro Tick - der Wurf wird
           * übergeben, damit ein losgelassener Orb ausrollt statt zu stoppen. */
          node.vx = clamp(velocity.x / 60, -MAX_FLING, MAX_FLING);
          node.vy = clamp(velocity.y / 60, -MAX_FLING, MAX_FLING);
          simulationRef.current?.alphaTarget(idleAlpha()).alpha(0.4).restart();
        },
      };
      map.set(spec.id, handle);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, findNode, idleAlpha]);

  /* Simulation einmal aufbauen; die Kräfte lesen lebende Werte über Refs. */
  useEffect(() => {
    const getBounds = () => boundsRef.current;
    const hasBounds = () => Boolean(boundsRef.current.width && boundsRef.current.height);

    const simulation = forceSimulation<OrbNode>([])
      .velocityDecay(0.26)
      .alphaTarget(IDLE_ALPHA)
      .force(
        'charge',
        forceManyBody<OrbNode>().strength((node) => -node.r * 0.5),
      )
      .force(
        'collide',
        forceCollide<OrbNode>()
          .radius((node) => node.r + ORB_GAP)
          .strength(0.92)
          .iterations(2),
      )
      /* Zentrierung in x/y statt Radialring: hält das Feld in einer breiten,
       * flachen Box zusammen, ohne einen Kreis erzwingen zu wollen. */
      .force(
        'centerX',
        forceX<OrbNode>(() => getBounds().width / 2).strength(() =>
          hasBounds() ? CENTER_STRENGTH : 0,
        ),
      )
      .force(
        'centerY',
        forceY<OrbNode>(() => getBounds().height / 2).strength(() =>
          hasBounds() ? CENTER_STRENGTH * 1.6 : 0,
        ),
      )
      .force(
        'orbit',
        createOrbitForce(getBounds, () =>
          motionRef.current.orbit && !motionRef.current.reducedMotion ? ORBIT_STRENGTH : 0,
        ),
      )
      .force('bounds', createBoundsForce(getBounds))
      .on('tick', () => {
        for (const node of nodesRef.current) {
          const handle = handlesRef.current.get(node.id);
          if (!handle) {
            continue;
          }
          /* Der Kollisionsradius folgt der Wachstumsfeder, ein größer werdender
           * Orb schiebt seine Nachbarn also schon während der Animation weg. */
          node.r = handle.r.get();
          if (node.dragging) {
            continue;
          }
          handle.x.set(node.x ?? 0);
          handle.y.set(node.y ?? 0);
        }
      });

    simulationRef.current = simulation;
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, []);

  /* Nach einer Größenänderung des Panels neu aufheizen, damit sich das Feld
   * an die neuen Wände und die neue Mitte anpasst. */
  useEffect(() => {
    if (!bounds.width || !bounds.height) {
      return;
    }
    const simulation = simulationRef.current;
    simulation?.alpha(Math.max(simulation.alpha(), 0.3)).restart();
  }, [bounds.width, bounds.height]);

  /* Knoten anlegen und entfernen, wenn Blöcke auftauchen oder verschwinden. */
  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return;
    }
    const existing = new Map(nodesRef.current.map((node) => [node.id, node]));
    const nodes = specs.map((spec) => {
      const node = existing.get(spec.id);
      if (node) {
        node.targetR = spec.radius;
        return node;
      }
      const handle = handlesRef.current.get(spec.id);
      return {
        id: spec.id,
        r: handle?.r.get() ?? spec.radius,
        targetR: spec.radius,
        dragging: false,
        x: handle?.x.get() ?? 0,
        y: handle?.y.get() ?? 0,
        vx: 0,
        vy: 0,
      } satisfies OrbNode;
    });

    nodesRef.current = nodes;
    simulation.nodes(nodes);
    simulation.alphaTarget(idleAlpha()).alpha(0.6).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, idleAlpha]);

  /* Jeden Radius auf sein Ziel federn, sobald sich die gespeicherten Daten ändern. */
  const radiusSignature = specs.map((spec) => `${spec.id}:${Math.round(spec.radius)}`).join('|');
  useEffect(() => {
    for (const spec of specs) {
      const handle = handlesRef.current.get(spec.id);
      if (!handle) {
        continue;
      }
      const node = findNode(spec.id);
      if (node) {
        node.targetR = spec.radius;
      }
      if (Math.abs(handle.r.get() - spec.radius) < 0.4) {
        continue;
      }
      animate(handle.r, spec.radius, {
        type: 'spring',
        stiffness: 140,
        damping: 15,
        mass: 0.8,
        /* Eine Größenänderung schubst die Nachbarn zur Seite. */
        onPlay: () => simulationRef.current?.alpha(0.5).restart(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusSignature, findNode]);

  /* Leerlaufdrift anhalten oder fortsetzen, wenn sich die Bewegungsvorliebe ändert. */
  useEffect(() => {
    simulationRef.current?.alphaTarget(reducedMotion ? 0 : IDLE_ALPHA).restart();
  }, [reducedMotion, orbit]);

  /* Handles überleben ihre Knoten, damit ein entfernter Orb noch ausanimieren
   * kann. Nach Abschluss der Exit-Animation hier aufräumen. */
  const pruneHandles = useCallback((keepIds: string[]) => {
    const keep = new Set(keepIds);
    for (const id of Array.from(handlesRef.current.keys())) {
      if (!keep.has(id)) {
        handlesRef.current.delete(id);
      }
    }
  }, []);

  return { handles, pruneHandles };
}
