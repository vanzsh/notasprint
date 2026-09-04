// Pure circuit mutations. Every edit — human or agent — routes through here, so locks are enforced once.
import { archetypeById, type ArchetypeId } from "./archetypes";
import { analyze, buildGeometry, type Circuit, type Turn } from "./circuit";

export type Intensity = "subtle" | "moderate" | "strong";
export const DESIGN_MOVES = ["tighten_turn", "open_turn", "create_overtaking_zone", "add_chicane_after", "add_esses_after", "add_hairpin_after", "remove_turn"] as const;
export type DesignMove = (typeof DESIGN_MOVES)[number];
export const SECTOR_INTENTS = ["faster", "more_technical", "more_overtaking"] as const;
export type SectorIntent = (typeof SECTOR_INTENTS)[number];

export class LockedError extends Error {}

const uid = () => Math.random().toString(36).slice(2, 8);
const idx = (c: Circuit, turn: number) => {
  if (!Number.isInteger(turn) || turn < 1 || turn > c.turns.length) throw new Error(`Turn ${turn} does not exist (circuit has ${c.turns.length} turns).`);
  return turn - 1;
};
const assertUnlocked = (t: Turn, i: number) => {
  if (t.locked) throw new LockedError(`Turn ${i + 1}${t.name ? ` (${t.name})` : ""} is locked by the designer and cannot be changed. Work around it.`);
};
const withTurns = (c: Circuit, turns: Turn[]): Circuit => ({ ...c, turns });
const level = (i: Intensity | undefined, a: number, b: number, d: number) => (i === "subtle" ? a : i === "strong" ? d : b);

export type TurnEdit = { turn: number; x?: number; y?: number; radius?: number; name?: string };

export function editTurns(c: Circuit, edits: TurnEdit[]) {
  const turns = c.turns.slice();
  const changed: string[] = [];
  for (const e of edits) {
    const i = idx(c, e.turn);
    assertUnlocked(turns[i], i);
    const t = { ...turns[i] };
    if (e.x !== undefined) t.x = e.x;
    if (e.y !== undefined) t.y = e.y;
    if (e.radius !== undefined) t.radius = Math.max(8, e.radius);
    if (e.name !== undefined) t.name = e.name || undefined;
    turns[i] = t;
    changed.push(t.id);
  }
  return { circuit: withTurns(c, turns), changed };
}

export function setLocks(c: Circuit, turnNumbers: number[], locked: boolean) {
  const turns = c.turns.slice();
  for (const n of turnNumbers) { const i = idx(c, n); turns[i] = { ...turns[i], locked }; }
  return { circuit: withTurns(c, turns), changed: turnNumbers.map((n) => c.turns[n - 1].id) };
}

export function insertTurns(c: Circuit, afterIndex: number, points: Omit<Turn, "id" | "sector">[]) {
  const base = c.turns[afterIndex];
  const added = points.map((p) => ({ ...p, id: uid(), sector: base.sector }));
  const turns = [...c.turns.slice(0, afterIndex + 1), ...added, ...c.turns.slice(afterIndex + 1)];
  return { circuit: withTurns(c, turns), changed: added.map((t) => t.id) };
}

export function deleteTurn(c: Circuit, i: number) {
  if (c.turns.length <= 4) throw new Error("A circuit needs at least 4 turns.");
  assertUnlocked(c.turns[i], i);
  return { circuit: withTurns(c, c.turns.filter((_, k) => k !== i)), changed: [] as string[] };
}

// Segment i runs from turn i to turn i+1.
function segment(c: Circuit, i: number) {
  const a = c.turns[i], b = c.turns[(i + 1) % c.turns.length];
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const d = { x: dx / L, y: dy / L };
  const cx = c.turns.reduce((s, t) => s + t.x, 0) / c.turns.length, cy = c.turns.reduce((s, t) => s + t.y, 0) / c.turns.length;
  let nrm = { x: -d.y, y: d.x };
  const mx = a.x + dx / 2, my = a.y + dy / 2;
  if ((mx - cx) * nrm.x + (my - cy) * nrm.y < 0) nrm = { x: -nrm.x, y: -nrm.y }; // nrm points away from the circuit centroid
  const at = (f: number, off: number) => ({ x: a.x + dx * f + nrm.x * off, y: a.y + dy * f + nrm.y * off });
  return { a, b, L, d, nrm, at };
}

export function applyDesignMove(c: Circuit, move: DesignMove, turn: number, intensity: Intensity = "moderate") {
  const i = idx(c, turn);
  const t = c.turns[i];
  const n = c.turns.length;
  switch (move) {
    case "tighten_turn":
      return editTurns(c, [{ turn, radius: Math.max(15, t.radius * level(intensity, 0.75, 0.55, 0.4)) }]);
    case "open_turn":
      return editTurns(c, [{ turn, radius: t.radius * level(intensity, 1.3, 1.6, 2.1) }]);
    case "remove_turn":
      return deleteTurn(c, i);
    case "add_chicane_after": {
      const { L, at } = segment(c, i);
      if (L < 160) throw new Error(`The straight after Turn ${turn} is only ${Math.round(L)} m — too short for a chicane.`);
      const off = level(intensity, 14, 20, 26), r = level(intensity, 40, 30, 22);
      return insertTurns(c, i, [{ ...at(0.44, off), radius: r }, { ...at(0.56, -off), radius: r }]);
    }
    case "add_esses_after": {
      const { L, at } = segment(c, i);
      if (L < 240) throw new Error(`The straight after Turn ${turn} is only ${Math.round(L)} m — too short for esses.`);
      const off = level(intensity, 30, 45, 60), r = level(intensity, 110, 85, 65);
      return insertTurns(c, i, [{ ...at(0.3, off), radius: r }, { ...at(0.5, -off), radius: r }, { ...at(0.7, off), radius: r }]);
    }
    case "add_hairpin_after": {
      const { L, at } = segment(c, i);
      if (L < 200) throw new Error(`The straight after Turn ${turn} is only ${Math.round(L)} m — too short for a hairpin loop.`);
      const out = level(intensity, 140, 200, 280), half = 45 / L;
      return insertTurns(c, i, [{ ...at(0.5 - half, out), radius: 28 }, { ...at(0.5 + half, out), radius: 28 }]);
    }
    case "create_overtaking_zone": {
      // Heavy braking zone: slow the corner, then lengthen its approach straight.
      assertUnlocked(t, i);
      const a = analyze(c);
      const targetR = level(intensity, 45, 34, 26);
      let out = editTurns(c, [{ turn, radius: Math.min(t.radius, targetR) }]);
      const approach = a.turns[i].approach;
      const prevI = (i - 1 + n) % n, prev = c.turns[prevI];
      if (approach < 420) {
        if (!prev.locked && a.turns[prevI].angle < 55 && n > 5) {
          // Straighten the approach by removing a shallow preceding corner.
          out = { circuit: withTurns(out.circuit, out.circuit.turns.filter((_, k) => k !== prevI)), changed: out.changed };
        } else {
          // Push the corner further down its approach line.
          const dx = t.x - prev.x, dy = t.y - prev.y, L = Math.hypot(dx, dy) || 1;
          const push = Math.min(160, 420 - approach);
          out = editTurns(out.circuit, [{ turn: out.circuit.turns.findIndex((x) => x.id === t.id) + 1, x: t.x + (dx / L) * push, y: t.y + (dy / L) * push }]);
        }
      }
      return out;
    }
  }
}

export function reshapeSector(c: Circuit, sector: 1 | 2 | 3, intent: SectorIntent, intensity: Intensity = "moderate") {
  const inSector = c.turns.map((t, i) => ({ t, i })).filter(({ t }) => t.sector === sector);
  if (!inSector.length) throw new Error(`Sector ${sector} has no turns.`);
  const free = inSector.filter(({ t }) => !t.locked);
  if (!free.length) throw new Error(`Every turn in Sector ${sector} is locked.`);
  let out = { circuit: c, changed: [] as string[] };
  const merge = (r: { circuit: Circuit; changed: string[] }) => { out = { circuit: r.circuit, changed: [...out.changed, ...r.changed] }; };
  switch (intent) {
    case "faster": {
      merge(editTurns(c, free.map(({ t, i }) => ({ turn: i + 1, radius: t.radius * level(intensity, 1.25, 1.5, 1.9) }))));
      if (intensity === "strong") {
        const a = analyze(out.circuit);
        const kink = a.turns.find((x) => x.sector === sector && !x.locked && x.type === "kink");
        if (kink && out.circuit.turns.length > 5) merge(deleteTurn(out.circuit, kink.turn - 1));
      }
      return fitRadii(out, c);
    }
    case "more_technical": {
      merge(editTurns(c, free.map(({ t, i }) => ({ turn: i + 1, radius: Math.max(18, t.radius * level(intensity, 0.8, 0.65, 0.5)) }))));
      const g = buildGeometry(out.circuit.turns);
      const straights = out.circuit.turns.map((t, i) => ({ i, len: g.corners[i].straightAfter, sector: t.sector })).filter((s) => s.sector === sector && s.len >= 220).sort((p, q) => q.len - p.len);
      if (straights[0]) merge(applyDesignMove(out.circuit, "add_chicane_after", straights[0].i + 1, intensity));
      if (intensity === "strong" && straights[1] && straights[1].len >= 300) {
        const j = out.circuit.turns.findIndex((t) => t.id === c.turns[straights[1].i].id);
        merge(applyDesignMove(out.circuit, "add_esses_after", j + 1, "subtle"));
      }
      return fitRadii(out, c);
    }
    case "more_overtaking": {
      const a = analyze(c);
      const cand = a.turns.filter((x) => x.sector === sector && !x.locked && x.overtaking < 70 && x.type !== "kink").sort((p, q) => q.approach - p.approach)[0];
      if (!cand) throw new Error(`No unlocked turn in Sector ${sector} can become an overtaking zone.`);
      return fitRadii(applyDesignMove(c, "create_overtaking_zone", cand.turn, intensity), c);
    }
  }
}

export type InspirationScope = 1 | 2 | 3 | "circuit";

type Result = { circuit: Circuit; changed: string[] };

// Shrink requested radii to what the neighbouring fillets allow, so nothing is silently clamped. Corners that existed
// in `base` never drop below their base radius (opening is best-effort, tightening is kept); new corners take what fits.
// If opening two neighbours would leave no usable straight between them, roll those openings back to the base radii.
function fitRadii(r: Result, base: Circuit): Result {
  const g = buildGeometry(r.circuit.turns);
  let turns = r.circuit.turns.map((t, i) => {
    const c = g.corners[i];
    if (!r.changed.includes(t.id) || c.requestedRadius - c.radius <= 5) return t;
    const b = base.turns.find((x) => x.id === t.id);
    return { ...t, radius: Math.max(b ? Math.min(b.radius, t.radius) : 12, Math.round(c.radius)) };
  });
  for (let pass = 0; pass < 2; pass++) {
    const fitted = buildGeometry(turns);
    let repaired = false;
    turns = turns.map((t, i) => {
      const previous = fitted.corners[(i - 1 + turns.length) % turns.length];
      const current = fitted.corners[i];
      const tooClose = (previous.straightAfter < 25 && previous.straightAfter + previous.arcLength < 60)
        || (current.straightAfter < 25 && current.straightAfter + current.arcLength < 60);
      const b = base.turns.find((x) => x.id === t.id);
      if (!tooClose || !b || !r.changed.includes(t.id) || t.radius <= b.radius) return t;
      repaired = true;
      return { ...t, radius: b.radius };
    });
    if (!repaired) break;
  }
  return { circuit: withTurns(r.circuit, turns), changed: r.changed };
}

// Gentle linked esses placed inside the actual straight (between the neighbouring arcs, not the polygon edge), with the
// lateral offset scaled to the straight so the direction changes stay medium-speed rather than becoming a chicane.
function flowingEsses(c: Circuit, i: number, intensity: Intensity) {
  const g = buildGeometry(c.turns);
  const a = g.corners[i].end, b = g.corners[(i + 1) % c.turns.length].start;
  const dx = b.x - a.x, dy = b.y - a.y, S = Math.hypot(dx, dy) || 1;
  const cx = c.turns.reduce((s, t) => s + t.x, 0) / c.turns.length, cy = c.turns.reduce((s, t) => s + t.y, 0) / c.turns.length;
  let nrm = { x: -dy / S, y: dx / S };
  if ((a.x + dx / 2 - cx) * nrm.x + (a.y + dy / 2 - cy) * nrm.y < 0) nrm = { x: -nrm.x, y: -nrm.y };
  const off = Math.max(1.2 * c.trackWidth, S * level(intensity, 0.05, 0.065, 0.08));
  const r = level(intensity, 120, 95, 75);
  const at = (f: number, o: number) => ({ x: Math.round(a.x + dx * f + nrm.x * o), y: Math.round(a.y + dy * f + nrm.y * o), radius: r });
  return insertTurns(c, i, [at(0.3, off), at(0.5, -off), at(0.7, off)]);
}

/**
 * Apply a design archetype to a sector or the whole circuit. Composes the primitives above, so locked turns are
 * refused by the same assertUnlocked every other edit goes through; the design is reshaped around them instead.
 * The start/finish straight (last turn → Turn 1) is never used for insertions.
 */
export function applyInspiration(c: Circuit, id: ArchetypeId, scope: InspirationScope, intensity: Intensity = "moderate"): Result {
  const arch = archetypeById(id);
  if (!arch) throw new Error(`Unknown design inspiration "${id}".`);
  const inScope = (t: Turn) => scope === "circuit" || t.sector === scope;
  const where = scope === "circuit" ? "The circuit" : `Sector ${scope}`;
  if (!c.turns.some(inScope)) throw new Error(`${where} has no turns.`);
  const free = c.turns.map((t, i) => ({ t, i })).filter(({ t }) => inScope(t) && !t.locked);
  if (!free.length) throw new Error(`Every turn in ${where} is locked. Unlock one or choose another scope.`);
  const features = scope === "circuit" ? level(intensity, 1, 2, 3) : level(intensity, 1, 1, 2);
  let out: Result = { circuit: c, changed: [] };
  const merge = (r: Result) => { out = { circuit: r.circuit, changed: [...out.changed, ...r.changed] }; };
  const used = new Set<string>();
  const indexOf = (turnId: string) => out.circuit.turns.findIndex((t) => t.id === turnId);
  // Longest unused straight in scope, excluding the start/finish straight.
  const longestStraight = (min: number) => {
    const g = buildGeometry(out.circuit.turns);
    const n = out.circuit.turns.length;
    return out.circuit.turns
      .map((t, i) => ({ id: t.id, i, len: g.corners[i].straightAfter }))
      .filter((s) => s.i !== n - 1 && inScope(out.circuit.turns[s.i]) && !used.has(s.id) && s.len >= min)
      .sort((p, q) => q.len - p.len)[0];
  };
  const insert = (min: number, fn: (i: number) => Result) => {
    for (let k = 0; k < features; k++) {
      const s = longestStraight(min);
      if (!s) break;
      used.add(s.id);
      merge(fn(s.i));
    }
  };
  switch (arch.id) {
    case "high-speed": {
      // Open everything except existing heavy braking zones: they are the point of a high-speed circuit.
      const before = analyze(c).turns;
      merge(editTurns(c, free.filter(({ i }) => before[i].overtaking < 70).map(({ t, i }) => ({ turn: i + 1, radius: Math.round(t.radius * level(intensity, 1.25, 1.5, 1.9)) }))));
      // Fewer interruptions: drop shallow kinks that break up straights.
      const kinks = before.filter((x) => inScope(c.turns[x.turn - 1]) && !x.locked && x.type === "kink").slice(0, level(intensity, 0, 1, 2));
      for (const k of kinks) if (out.circuit.turns.length > 5) merge(deleteTurn(out.circuit, indexOf(k.id)));
      // Heavy braking zones: until the scope has `features` strong ones, the corner at the end of the longest approach becomes a big stop.
      const turns = analyze(out.circuit).turns.filter((x) => inScope(out.circuit.turns[x.turn - 1]) && x.type !== "kink");
      const missing = features - turns.filter((x) => x.overtaking >= 70).length;
      const stops = turns.filter((x) => !x.locked && x.overtaking < 70 && x.approach >= 300).sort((p, q) => q.approach - p.approach).slice(0, Math.max(0, missing));
      const target = level(intensity, 45, 34, 26);
      if (stops.length) merge(editTurns(out.circuit, stops.map((x) => ({ turn: indexOf(x.id) + 1, radius: Math.min(out.circuit.turns[indexOf(x.id)].radius, target) }))));
      break;
    }
    case "street-technical": {
      merge(editTurns(c, free.map(({ t, i }) => ({ turn: i + 1, radius: Math.max(16, Math.round(t.radius * level(intensity, 0.75, 0.6, 0.45))) }))));
      insert(200, (i) => applyDesignMove(out.circuit, "add_chicane_after", i + 1, intensity));
      break;
    }
    case "flowing-technical": {
      // Rhythm: pull radii toward the medium/fast band so consecutive corners share a speed range.
      const [lo, hi, k] = [70, 140, level(intensity, 0.4, 0.7, 1)];
      merge(editTurns(c, free.map(({ t, i }) => ({ turn: i + 1, radius: Math.round(t.radius + (Math.min(hi, Math.max(lo, t.radius)) - t.radius) * k) }))));
      insert(260, (i) => flowingEsses(out.circuit, i, intensity));
      break;
    }
  }
  return fitRadii(out, c);
}

// Human canvas actions
export const moveTurn = (c: Circuit, id: string, x: number, y: number) => {
  const i = c.turns.findIndex((t) => t.id === id);
  return editTurns(c, [{ turn: i + 1, x, y }]).circuit;
};
export const insertTurnOnSegment = (c: Circuit, afterIndex: number, x: number, y: number) =>
  insertTurns(c, afterIndex, [{ x, y, radius: 60 }]).circuit;
