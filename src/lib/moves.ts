// Pure circuit mutations. Every edit — human or agent — routes through here, so locks are enforced once.
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
      return out;
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
      return out;
    }
    case "more_overtaking": {
      const a = analyze(c);
      const cand = a.turns.filter((x) => x.sector === sector && !x.locked && x.overtaking < 70 && x.type !== "kink").sort((p, q) => q.approach - p.approach)[0];
      if (!cand) throw new Error(`No unlocked turn in Sector ${sector} can become an overtaking zone.`);
      return applyDesignMove(c, "create_overtaking_zone", cand.turn, intensity);
    }
  }
}

// Human canvas actions
export const moveTurn = (c: Circuit, id: string, x: number, y: number) => {
  const i = c.turns.findIndex((t) => t.id === id);
  return editTurns(c, [{ turn: i + 1, x, y }]).circuit;
};
export const insertTurnOnSegment = (c: Circuit, afterIndex: number, x: number, y: number) =>
  insertTurns(c, afterIndex, [{ x, y, radius: 60 }]).circuit;
