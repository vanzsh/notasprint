// Seeded generator for custom circuit concepts. Builds a star-shaped polygon around a centre (so the lap never crosses
// itself), stretches it, cuts bays and hairpins into it, then picks corner radii the way the discipline would: Formula 1
// puts heavy braking at the end of long runs, Formula E stays compact and stop-start, MotoGP keeps wide arcs a bike can
// lean through. Deterministic for a seed; different seeds give genuinely different layouts, not jitter.
import { buildGeometry, type Circuit, type Turn } from "./circuit";
import { SERIES, type SeriesId } from "./series";
import { rng } from "./simulation";

const TAU = Math.PI * 2;

export function generateCircuit(seriesId: SeriesId, seed: number): Circuit {
  const s = SERIES[seriesId], G = s.generator, rnd = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const n = Math.round(between(G.turns[0], G.turns[1]));

  // Angular spacing: uneven gaps, with one deliberately long gap that becomes the main straight.
  const gaps = Array.from({ length: n }, () => 0.6 + rnd() * 0.8);
  gaps[0] *= 1.6 + G.straightBias * 2.2;
  const total = gaps.reduce((a, b) => a + b, 0);
  const angles: number[] = [];
  for (let i = 0, acc = 0; i < n; i++) { angles.push((acc / total) * TAU); acc += gaps[i]; }

  // Radial profile: three harmonics for an organic outline, an x-stretch so it reads as a circuit rather than a ring.
  const h = [1, 2, 3].map((k) => ({ k, amp: between(0.04, k === 2 ? 0.3 : 0.16), phase: rnd() * TAU }));
  const stretch = between(1.25, 1.9), rot = rnd() * TAU;
  const pts = angles.map((th) => {
    let r = 1;
    for (const { k, amp, phase } of h) r += amp * Math.cos(k * th + phase);
    return { th, r: Math.max(0.45, r) };
  });
  // Bays: pull two or three vertices sharply inward → loops and hairpin-like sections. Star-shaped, so still simple.
  const bays = Math.round(between(2, 4));
  for (let b = 0; b < bays; b++) {
    const i = 1 + Math.floor(rnd() * (n - 2)); // never the main-straight endpoints
    pts[i] = { ...pts[i], r: pts[i].r * between(0.45, 0.65) };
  }
  // Drop vertices that landed too close to a neighbour, so no corner is starved of straight.
  let xy = pts.map(({ th, r }) => ({ x: Math.cos(th) * r * stretch, y: Math.sin(th) * r }));
  xy = xy.map((p) => ({ x: p.x * Math.cos(rot) - p.y * Math.sin(rot), y: p.x * Math.sin(rot) + p.y * Math.cos(rot) }));
  for (let i = 0; i < xy.length && xy.length > 8; i++) {
    const a = xy[i], b = xy[(i + 1) % xy.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.2) { xy.splice((i + 1) % xy.length, 1); i--; }
  }
  const m = xy.length;

  // Corner radii by discipline. Long approach → braking zone (small radius) with a probability the series sets;
  // big direction change → hairpin candidate; otherwise sample the discipline's radius palette.
  const edgeLen = xy.map((p, i) => { const q = xy[(i + 1) % m]; return Math.hypot(q.x - p.x, q.y - p.y); });
  const longEdge = [...edgeLen].sort((a, b) => b - a)[Math.floor(m * 0.3)];
  const small = G.radii.slice(0, Math.ceil(G.radii.length / 3)), large = G.radii.slice(-Math.ceil(G.radii.length / 3));
  const radii = xy.map((p, i) => {
    const prev = xy[(i - 1 + m) % m], next = xy[(i + 1) % m];
    const a = Math.atan2(prev.y - p.y, prev.x - p.x), b = Math.atan2(next.y - p.y, next.x - p.x);
    const interior = Math.abs(((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI);
    const turnDeg = (180 * (Math.PI - interior)) / Math.PI;
    if (turnDeg > 120 && rnd() < G.hairpin * 3) return small[0];
    if (edgeLen[(i - 1 + m) % m] >= longEdge && rnd() < 0.55 + G.straightBias * 0.4) return pick(small);
    if (turnDeg < 45) return pick(large);
    return pick(G.radii);
  });

  // Scale so the lap lands in the discipline's length band, then let the fillet geometry cap radii that do not fit.
  const target = between(G.length[0], G.length[1]);
  const mk = (k: number, rs: number[]): Turn[] => xy.map((p, i) => {
    const x = Math.round(p.x * k), y = Math.round(p.y * k);
    return { id: `${x}_${y}`, x, y, radius: Math.round(rs[i]), sector: (Math.min(2, Math.floor((i * 3) / m)) + 1) as 1 | 2 | 3 };
  });
  let k = target / buildGeometry(mk(1000, radii)).length * 1000;
  let turns = mk(k, radii);
  for (let pass = 0; pass < 3; pass++) {
    const g = buildGeometry(turns);
    const fitted = g.corners.map((c) => (c.requestedRadius - c.radius > 3 ? Math.max(s.vehicle.minRadius, Math.floor(c.radius)) : c.requestedRadius));
    k *= target / g.length;
    turns = mk(k, fitted);
  }
  // Recentre so the layout starts near the origin like the authored references.
  const minX = Math.min(...turns.map((t) => t.x)) - 60, minY = Math.min(...turns.map((t) => t.y)) - 60;
  turns = turns.map((t) => ({ ...t, x: t.x - minX, y: t.y - minY, id: `${t.x - minX}_${t.y - minY}` }));

  const code = (seed >>> 0).toString(36).toUpperCase().slice(-4).padStart(4, "0");
  return {
    id: `custom-${seriesId}-${seed}`, series: seriesId, custom: seed,
    name: `${s.short} Concept ${code}`,
    tagline: `Generated ${s.name} concept · seed ${seed}. ${s.emphasis}`,
    trackWidth: G.width, turns,
  };
}

/** A fresh seed for "create another"; time-based so two clicks never repeat, but every seed stays reproducible. */
export const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffff)) >>> 0 & 0xfffff;
