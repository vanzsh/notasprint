// Hypothetical race-flow simulation on the live circuit. A handful of point-mass cars follow the circuit's own speed
// profile on a single racing line, with per-driver variance, following distance, overtaking attempts in braking
// zones and occasional contact. The output is a set of DESIGN SIGNALS — where cars bunch, where they pass, where
// speed differentials pile up — not a prediction of real racing. Pure and deterministic for a given seed.
import { accelAt, analyze, buildGeometry, CAR, fingerprint, KMH, speedProfile, type Circuit } from "./circuit";

export type SimParams = {
  cars: number; // 2–24
  laps: number; // 1–20
  variance: number; // 0–1 driver skill / lap-to-lap spread
  aggression: number; // 0–1 willingness to attempt a pass, and to keep pushing when it is marginal
  seed: number;
};
export const DEFAULT_SIM: SimParams = { cars: 12, laps: 5, variance: 0.5, aggression: 0.5, seed: 1 };

export type TurnSignal = {
  turn: number; id: string; name?: string; sector: 1 | 2 | 3;
  arrivals: number; // car arrivals at the braking zone
  packed: number; // arrivals within 1 s of the car ahead
  congestion: number; // arrivals held up behind a slower car
  contacts: number; // simulated contact events
  overtakes: number; // completed passes
  closingKmh: number; // mean speed a held-up car was giving up on arrival
  overtakingScore: number; // the analysis' static 0–100 score, for comparison
};
export type SectorSignal = { sector: 1 | 2 | 3; congestion: number; contacts: number; overtakes: number; note: string };
export type Finding = {
  kind: "bunching" | "contact" | "speed-differential" | "packed" | "no-passing" | "overtaking" | "spread";
  severity: "high" | "medium" | "info";
  turns: number[];
  sector?: 1 | 2 | 3;
  text: string;
};
export type SimTotals = { congestion: number; contacts: number; overtakes: number; avgGapS: number; spreadS: number; strongZones: number; lapTimeS: number };
export type SimResult = {
  id: string;
  circuitId: string;
  circuitName: string;
  fingerprint: string; // of the circuit at run time; compare with fingerprint(current) to detect a stale result
  params: SimParams;
  totals: SimTotals;
  turns: TurnSignal[];
  sectors: SectorSignal[];
  findings: Finding[];
  limitations: string[];
  frames: { step: number; s: number[][] }; // playback only: per frame, each car's cumulative lap distance in metres (NaN once finished); never serialised
};

export const SIM_LIMITATIONS = [
  "Simulated design signal from a point-mass car on a single racing line; not a lap-time, safety or real-racing prediction.",
  "Overtaking and contact are heuristic outcomes weighted by the analysis' overtaking score, closing speed and driver aggression.",
  "No tyre, aero, fuel, weather or elevation model. Results are for comparing design changes against each other.",
];

// Deterministic PRNG (mulberry32) so a seed reproduces a run exactly.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clampInt = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

export function normalizeParams(p: Partial<SimParams> = {}): SimParams {
  return {
    cars: clampInt(Number(p.cars ?? DEFAULT_SIM.cars) || DEFAULT_SIM.cars, 2, 24),
    laps: clampInt(Number(p.laps ?? DEFAULT_SIM.laps) || DEFAULT_SIM.laps, 1, 20),
    variance: clamp01(Number(p.variance ?? DEFAULT_SIM.variance)),
    aggression: clamp01(Number(p.aggression ?? DEFAULT_SIM.aggression)),
    seed: Math.floor(Number(p.seed ?? DEFAULT_SIM.seed)) || DEFAULT_SIM.seed,
  };
}

export function simulate(circuit: Circuit, params: Partial<SimParams> = {}): SimResult {
  const p = normalizeParams(params);
  const g = buildGeometry(circuit.turns);
  const a = analyze(circuit, g);
  const prof = speedProfile(circuit, g);
  const m = prof.v.length, L = m * CAR.ds, n = circuit.turns.length;
  const rnd = rng(p.seed);
  const mod = (x: number) => ((x % L) + L) % L;

  // Braking window of each corner: from where a car must start braking (plus a little) to just inside the arc.
  const arcStart = new Array<number>(n).fill(-1);
  for (let k = 0; k < m; k++) if (prof.who[k] >= 0 && arcStart[prof.who[k]] < 0) arcStart[prof.who[k]] = k * CAR.ds;
  const windows = a.turns.map((t, i) => {
    const entry = t.entrySpeed / KMH, apex = t.apexSpeed / KMH;
    const from = arcStart[i] - Math.max(0, (entry * entry - apex * apex) / (2 * CAR.aBrk)) - 25;
    return { from: mod(from), len: arcStart[i] + 6 - from };
  });
  const inWindow = (i: number, pos: number) => mod(pos - windows[i].from) < windows[i].len;

  type Car = { total: number; v: number; skill: number; aggr: number; lapFactor: number; lap: number; lastAttempt: number[]; finishT: number };
  const cars: Car[] = Array.from({ length: p.cars }, (_, i) => ({
    total: -6 - i * 10, v: 15, skill: 1 - p.variance * 0.07 * rnd(), aggr: clamp01(p.aggression + (rnd() - 0.5) * 0.5),
    lapFactor: 1, lap: -1, lastAttempt: new Array<number>(n).fill(-9), finishT: -1,
  }));
  const sig = a.turns.map((t) => ({ arrivals: 0, packed: 0, congestion: 0, contacts: 0, overtakes: 0, closing: 0, closingN: 0, t }));
  const finishAt = p.laps * L;
  const dt = 0.1, frameEvery = 2, maxT = p.laps * a.lapTime * 1.6 + 60;
  const frames: number[][] = [];

  for (let tick = 0, t = 0; t < maxT && cars.some((c) => c.finishT < 0); tick++, t += dt) {
    const live = cars.filter((c) => c.finishT < 0).sort((x, y) => mod(x.total) - mod(y.total));
    const prevV = new Map(live.map((c) => [c, c.v]));
    for (let j = 0; j < live.length; j++) {
      const c = live[j];
      const ahead = live.length > 1 ? live[(j + 1) % live.length] : null;
      const pos = mod(c.total);
      const gap = ahead ? (j === live.length - 1 ? mod(ahead.total) + L - pos : mod(ahead.total) - pos) : Infinity;
      const desired = prof.v[Math.min(m - 1, Math.floor(pos / CAR.ds))] * c.skill * c.lapFactor;
      let v = c.v < desired ? Math.min(desired, c.v + accelAt(c.v) * dt) : desired;
      const vAhead = ahead ? prevV.get(ahead)! : Infinity;
      const blocked = ahead !== null && gap < 7 + 0.4 * v && desired > vAhead + 1.5;
      if (ahead && gap < 7 + 0.4 * v) v = Math.min(v, gap < 7 ? vAhead * 0.97 : vAhead);
      const next = c.total + v * dt;
      // Arrival at a braking window this tick: the moment a design either lets cars race or stacks them up.
      for (let i = 0; i < n; i++) {
        if (!inWindow(i, mod(next)) || inWindow(i, pos)) continue;
        const s = sig[i];
        s.arrivals++;
        if (ahead && gap / Math.max(v, 10) < 1) s.packed++;
        if (!blocked || !ahead) break;
        s.congestion++;
        const diff = desired - vAhead;
        s.closing += diff; s.closingN++;
        if (diff > 3 && c.lastAttempt[i] !== c.lap) {
          c.lastAttempt[i] = c.lap;
          const ot = s.t.overtaking / 100;
          const pPass = (0.08 + 0.55 * ot) * (0.5 + c.aggr) * Math.min(1, diff / 10);
          const pContact = 0.12 * (1 - ot) * (0.3 + c.aggr) * Math.min(1, diff / 12);
          const r = rnd();
          if (r < pPass) { c.total = ahead.total + 3; ahead.v *= 0.95; s.overtakes++; v = Math.max(v, vAhead + 2); }
          else if (r < pPass + pContact) { v *= 0.7; ahead.v *= 0.7; s.contacts++; }
        }
        break;
      }
      c.v = v;
      c.total = Math.max(c.total, next); // a completed pass may already have moved the car ahead of `next`
      const lap = Math.floor(c.total / L);
      if (lap !== c.lap) { c.lap = lap; c.lapFactor = 1 - p.variance * 0.025 * rnd(); }
      if (c.total >= finishAt) c.finishT = t + dt - (c.total - finishAt) / Math.max(v, 1); // crossed the line this tick
    }
    if (tick % frameEvery === 0) frames.push(cars.map((c) => (c.finishT >= 0 ? NaN : Math.round(c.total * 10) / 10))); // NaN: finished, off the track
  }

  // Field spread at the end: time gaps between consecutive finishers (cars still running are placed by distance).
  const finishers = [...cars].sort((x, y) => (x.finishT < 0 || y.finishT < 0 ? y.total - x.total : x.finishT - y.finishT));
  const gaps = finishers.slice(1).map((c, i) => (c.finishT >= 0 && finishers[i].finishT >= 0 ? c.finishT - finishers[i].finishT : (finishers[i].total - c.total) / Math.max(10, c.v)));
  const turns: TurnSignal[] = sig.map((s, i) => ({
    turn: i + 1, id: circuit.turns[i].id, name: circuit.turns[i].name, sector: circuit.turns[i].sector,
    arrivals: s.arrivals, packed: s.packed, congestion: s.congestion, contacts: s.contacts, overtakes: s.overtakes,
    closingKmh: s.closingN ? Math.round((s.closing / s.closingN) * KMH) : 0, overtakingScore: s.t.overtaking,
  }));
  const sectors: SectorSignal[] = ([1, 2, 3] as const).map((sec) => {
    const ts = turns.filter((t) => t.sector === sec);
    const sum = (k: "congestion" | "contacts" | "overtakes") => ts.reduce((x, t) => x + t[k], 0);
    const [cg, ct, ov] = [sum("congestion"), sum("contacts"), sum("overtakes")];
    const note = !ts.length ? "—" : ov >= 3 && ov >= cg / 4 ? "Racing" : cg >= p.cars * p.laps * 0.4 && ov <= 1 ? "Packed, little passing" : ct >= 3 ? "Contact-prone" : cg >= p.cars * p.laps * 0.2 ? "Congested" : "Free-flowing";
    return { sector: sec, congestion: cg, contacts: ct, overtakes: ov, note };
  });
  const totals: SimTotals = {
    congestion: turns.reduce((x, t) => x + t.congestion, 0), contacts: turns.reduce((x, t) => x + t.contacts, 0), overtakes: turns.reduce((x, t) => x + t.overtakes, 0),
    avgGapS: gaps.length ? Math.round((gaps.reduce((x, y) => x + y, 0) / gaps.length) * 10) / 10 : 0,
    spreadS: Math.round(gaps.reduce((x, y) => x + y, 0) * 10) / 10,
    strongZones: a.overtakingOpportunities.length, lapTimeS: Math.round(a.lapTime * 10) / 10,
  };
  return {
    id: `sim-${fingerprint(circuit)}-${p.seed}-${p.cars}x${p.laps}`, circuitId: circuit.id, circuitName: circuit.name, fingerprint: fingerprint(circuit), params: p,
    totals, turns, sectors, findings: findings(turns, sectors, totals, p), limitations: SIM_LIMITATIONS, frames: { step: dt * frameEvery, s: frames },
  };
}

// Turn raw signals into a short, ranked list of hypothetical findings an agent or designer can act on.
function findings(turns: TurnSignal[], sectors: SectorSignal[], totals: SimTotals, p: SimParams): Finding[] {
  const out: Finding[] = [];
  const label = (t: TurnSignal) => `Turn ${t.turn}${t.name ? ` (${t.name})` : ""}`;
  const held = (t: TurnSignal) => (t.arrivals ? t.congestion / t.arrivals : 0);
  const passes = (k: number) => `${k} pass${k === 1 ? "" : "es"}`;
  for (const t of turns) {
    if (t.arrivals < 4) continue;
    const r = held(t);
    // Bunching: cars arrive held up and mostly stay held up.
    if (r >= 0.25 && t.overtakes <= t.congestion * 0.25)
      out.push({ kind: "bunching", severity: r >= 0.4 && t.overtakes <= t.congestion * 0.15 ? "high" : "medium", turns: [t.turn], sector: t.sector, text: `Repeated bunching before ${label(t)}: ${t.congestion} of ${t.arrivals} arrivals held up, only ${passes(t.overtakes)}.` });
    if (t.contacts >= 2) out.push({ kind: "contact", severity: t.contacts >= 4 ? "high" : "medium", turns: [t.turn], sector: t.sector, text: `${label(t)} produced ${t.contacts} simulated contact events.` });
    if (t.closingKmh >= 60 && r >= 0.2) out.push({ kind: "speed-differential", severity: "medium", turns: [t.turn], sector: t.sector, text: `High speed-differential braking zone into ${label(t)}: held-up cars arrived ~${t.closingKmh} km/h faster than the car ahead.` });
    if (t.overtakingScore >= 70 && t.overtakes === 0) out.push({ kind: "no-passing", severity: "medium", turns: [t.turn], sector: t.sector, text: `${label(t)} scores ${t.overtakingScore} for overtaking on paper but produced no simulated passes.` });
  }
  // Runs of three or more consecutive turns where the field arrives nose-to-tail and nobody gets by.
  const stuck = (t: TurnSignal) => t.arrivals >= 4 && t.packed / t.arrivals >= 0.5 && t.overtakes <= 1;
  for (let i = 0; i < turns.length; ) {
    let j = i;
    while (j < turns.length && stuck(turns[j])) j++;
    const run = turns.slice(i, j), k = run.reduce((x, t) => x + t.overtakes, 0);
    if (run.length >= 3) out.push({ kind: "packed", severity: "medium", turns: run.map((t) => t.turn), text: `Cars stayed closely packed through Turns ${run[0].turn}–${run[run.length - 1].turn} with little overtaking (${passes(k)}).` });
    i = j + 1;
  }
  const best = [...sectors].sort((x, y) => y.overtakes - x.overtakes)[0];
  if (best && best.overtakes > 0) out.push({ kind: "overtaking", severity: "info", turns: turns.filter((t) => t.sector === best.sector && t.overtakes > 0).map((t) => t.turn), sector: best.sector, text: `Sector ${best.sector} produced the strongest overtaking activity (${passes(best.overtakes)}).` });
  if (totals.overtakes === 0) out.push({ kind: "no-passing", severity: "high", turns: [], text: `No simulated passes in ${p.laps} laps: the field could not overtake anywhere.` });
  if (totals.spreadS < 1.5 * p.laps) out.push({ kind: "spread", severity: "info", turns: [], text: `Field finished within ${totals.spreadS.toFixed(1)} s after ${p.laps} laps: little separation.` });
  const rank = { high: 0, medium: 1, info: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

/** Before/after view of two runs. Deltas are signed after − before; fewer congestion/contacts and more passes read as better. */
export function compareSimulations(before: Pick<SimResult, "totals" | "params">, after: Pick<SimResult, "totals" | "params">) {
  const keys = ["congestion", "contacts", "overtakes", "avgGapS", "strongZones"] as const;
  const rows = keys.map((k) => ({ metric: k, before: before.totals[k], after: after.totals[k], delta: Math.round((after.totals[k] - before.totals[k]) * 10) / 10 }));
  const same = before.params.cars === after.params.cars && before.params.laps === after.params.laps && before.params.seed === after.params.seed;
  return {
    rows,
    comparable: same,
    summary: `Congestion ${before.totals.congestion} → ${after.totals.congestion} · Contacts ${before.totals.contacts} → ${after.totals.contacts} · Passes ${before.totals.overtakes} → ${after.totals.overtakes} · Strong zones ${before.totals.strongZones} → ${after.totals.strongZones}`,
  };
}

/** Result without playback frames: what the agent, the panel tables and version snapshots need. */
export function compactResult(r: SimResult) {
  const { frames: _frames, ...rest } = r;
  void _frames;
  return rest;
}
export type CompactSimResult = ReturnType<typeof compactResult>;
