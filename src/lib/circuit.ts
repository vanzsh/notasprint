// Circuit model, fillet geometry and deterministic design analysis.
// Pure TypeScript — no DOM — so the same code runs in the browser, in WebMCP tools and in scripts/check.ts.

export type Turn = {
  id: string;
  x: number; // metres
  y: number; // metres, +y is down (screen space)
  radius: number; // corner radius in metres
  sector: 1 | 2 | 3;
  locked?: boolean;
  name?: string;
};

export type Circuit = {
  id: string;
  name: string;
  tagline: string;
  trackWidth: number; // metres
  turns: Turn[];
};

// Point-mass car model. Deliberately simple; it exists to make metrics coherent, not to simulate racing.
export const CAR = {
  vMax: 94, // m/s ≈ 340 km/h
  aLat: 34, // m/s² lateral grip → apex speed = sqrt(aLat · r)
  aAcc: 12, // m/s² peak longitudinal acceleration, fading to 0 at vMax
  aBrk: 42, // m/s² braking
  ds: 4, // sampling step in metres
};

export const KMH = 3.6;

// ---------- geometry ----------

type Vec = { x: number; y: number };
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec) => Math.hypot(v.x, v.y);
const unit = (v: Vec): Vec => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

export type Corner = {
  index: number; // 0-based turn index
  turnAngle: number; // radians, 0 = straight on
  direction: "L" | "R";
  radius: number; // effective radius after clamping
  requestedRadius: number;
  tangent: number; // distance from vertex to tangent points
  start: Vec; // arc start (tangent point on incoming edge)
  end: Vec; // arc end
  center: Vec;
  arcLength: number;
  straightAfter: number; // straight length from this arc end to the next arc start
};

export type Geometry = {
  corners: Corner[];
  length: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  crossings: number; // self-intersections of the polygon (a figure-eight has one)
  path: string; // SVG path (metres)
};

export function buildGeometry(turns: Turn[]): Geometry {
  const n = turns.length;
  const at = (i: number) => turns[(i + n) % n];
  const ang: number[] = [];
  const dir: ("L" | "R")[] = [];
  const t: number[] = [];
  const edgeLen: number[] = [];
  for (let i = 0; i < n; i++) edgeLen[i] = len(sub(at(i + 1), at(i))); // edge i: turn i → i+1
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const a = unit(sub(at(i - 1), p));
    const b = unit(sub(at(i + 1), p));
    const interior = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    ang[i] = Math.PI - interior; // turning angle
    dir[i] = cross(a, b) < 0 ? "R" : "L"; // screen space (+y down): clockwise heading change = right-hander
    t[i] = interior < 1e-6 ? 0 : p.radius / Math.tan(interior / 2);
  }
  // Clamp tangent lengths so neighbouring fillets never overlap on a shared edge.
  const f = t.map((_, i) => {
    const fPrev = t[i] + t[(i - 1 + n) % n] > 0 ? edgeLen[(i - 1 + n) % n] / (t[i] + t[(i - 1 + n) % n]) : 1;
    const fNext = t[i] + t[(i + 1) % n] > 0 ? edgeLen[i] / (t[i] + t[(i + 1) % n]) : 1;
    return Math.min(1, fPrev, fNext);
  });
  const corners: Corner[] = turns.map((p, i) => {
    const tt = t[i] * f[i];
    const a = unit(sub(at(i - 1), p));
    const b = unit(sub(at(i + 1), p));
    const interior = Math.PI - ang[i];
    const r = interior < 1e-6 ? 0 : tt * Math.tan(interior / 2);
    const bis = unit({ x: a.x + b.x, y: a.y + b.y });
    const cd = interior < 1e-6 ? 0 : r / Math.sin(interior / 2);
    return {
      index: i,
      turnAngle: ang[i],
      direction: dir[i],
      radius: r,
      requestedRadius: p.radius,
      tangent: tt,
      start: { x: p.x + a.x * tt, y: p.y + a.y * tt },
      end: { x: p.x + b.x * tt, y: p.y + b.y * tt },
      center: { x: p.x + bis.x * cd, y: p.y + bis.y * cd },
      arcLength: r * ang[i],
      straightAfter: 0,
    };
  });
  let length = 0;
  for (let i = 0; i < n; i++) {
    corners[i].straightAfter = Math.max(0, edgeLen[i] - corners[i].tangent - corners[(i + 1) % n].tangent);
    length += corners[i].arcLength + corners[i].straightAfter;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of turns) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  // SVG path: start at the arc end of the last corner (S/F sits on the closing straight).
  const fmt = (v: number) => v.toFixed(2);
  let path = `M ${fmt(corners[n - 1].end.x)} ${fmt(corners[n - 1].end.y)}`;
  for (const c of corners) {
    path += ` L ${fmt(c.start.x)} ${fmt(c.start.y)}`;
    if (c.radius > 0.01)
      path += ` A ${fmt(c.radius)} ${fmt(c.radius)} 0 0 ${c.direction === "R" ? 1 : 0} ${fmt(c.end.x)} ${fmt(c.end.y)}`;
  }
  path += " Z";
  return { corners, length, bounds: { minX, minY, maxX, maxY }, crossings: countCrossings(turns), path };
}

function countCrossings(turns: Turn[]) {
  const n = turns.length;
  let c = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(turns[i], turns[(i + 1) % n], turns[j], turns[(j + 1) % n])) c++;
    }
  return c;
}
function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec) {
  const s = (p: Vec, q: Vec, r: Vec) => Math.sign(cross(sub(q, p), sub(r, p)));
  return s(a, b, c) !== s(a, b, d) && s(c, d, a) !== s(c, d, b);
}

// Start/finish sits on the closing straight (last turn → turn 1).
export function startFinish(g: Geometry) {
  const last = g.corners[g.corners.length - 1];
  const first = g.corners[0];
  const d = unit(sub(first.start, last.end));
  return { x: (last.end.x + first.start.x) / 2, y: (last.end.y + first.start.y) / 2, nx: -d.y, ny: d.x };
}

// ---------- analysis ----------

export type TurnAnalysis = {
  turn: number; // 1-based
  id: string;
  name?: string;
  sector: 1 | 2 | 3;
  direction: "L" | "R";
  angle: number; // degrees
  radius: number; // effective metres
  apexSpeed: number; // km/h
  entrySpeed: number; // km/h at end of the approach
  brakingDrop: number; // km/h
  approach: number; // straight length before the turn, metres
  type: "hairpin" | "slow" | "medium" | "fast" | "kink";
  overtaking: number; // 0–100
  locked: boolean;
};

export type SectorAnalysis = {
  sector: 1 | 2 | 3;
  length: number;
  turns: number;
  time: number; // s
  avgSpeed: number; // km/h
  minSpeed: number;
  character: string;
};

export type Analysis = {
  length: number; // metres
  lapTime: number; // seconds
  topSpeed: number; // km/h
  minSpeed: number;
  longestStraight: number; // metres
  turnCount: number;
  left: number;
  right: number;
  scores: { overtaking: number; flow: number; technicality: number; highSpeed: number };
  overtakingOpportunities: TurnAnalysis[];
  turns: TurnAnalysis[];
  sectors: SectorAnalysis[];
  warnings: string[];
  crossings: number;
  speedTrace: { s: number; v: number; sector: number }[]; // downsampled for sparkline
};

export function analyze(circuit: Circuit, g = buildGeometry(circuit.turns)): Analysis {
  const { corners } = g;
  const n = corners.length;
  // Sample the lap. Each sample: distance s, speed limit, corner index (-1 on straights).
  const lim: number[] = [];
  const who: number[] = [];
  const secOf: number[] = [];
  // Order the lap from S/F: closing straight second half, then corner 0, straight 0, corner 1 ...
  const push = (count: number, v: number, c: number, sector: number) => {
    for (let k = 0; k < count; k++) { lim.push(v); who.push(c); secOf.push(sector); }
  };
  const half = corners[n - 1].straightAfter / 2;
  push(Math.round(half / CAR.ds), CAR.vMax, -1, circuit.turns[0].sector);
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    // ponytail: shallow kinks are transients, not steady-state corners; scale radius up as angle shrinks below 25°.
    const rEff = c.radius * Math.max(1, (25 * Math.PI) / 180 / Math.max(c.turnAngle, 1e-3));
    const vc = c.radius > 0.01 ? Math.min(CAR.vMax, Math.sqrt(CAR.aLat * rEff)) : CAR.vMax;
    push(Math.max(1, Math.round(c.arcLength / CAR.ds)), vc, i, circuit.turns[i].sector);
    const st = i === n - 1 ? half : c.straightAfter;
    push(Math.round(st / CAR.ds), CAR.vMax, -1, circuit.turns[(i + 1) % n].sector);
  }
  const m = lim.length;
  const v = lim.slice();
  const acc = (s: number) => CAR.aAcc * Math.max(0, 1 - (s / CAR.vMax) ** 2) + 0.5;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < m; k++) {
      const p = (k - 1 + m) % m;
      v[k] = Math.min(lim[k], Math.sqrt(v[p] ** 2 + 2 * acc(v[p]) * CAR.ds));
    }
    for (let k = m - 1; k >= 0; k--) {
      const nx = (k + 1) % m;
      v[k] = Math.min(v[k], Math.sqrt(v[nx] ** 2 + 2 * CAR.aBrk * CAR.ds));
    }
  }
  const lapTime = v.reduce((t, s) => t + CAR.ds / s, 0);
  const topSpeed = Math.max(...v) * KMH;
  const minSpeed = Math.min(...v) * KMH;

  // Per turn: apex = min speed inside the arc; entry = max speed since the previous arc ended.
  const apex = new Array(n).fill(Infinity);
  const entry = new Array(n).fill(0);
  let runMax = 0;
  for (let lap = 0; lap < 2; lap++)
    for (let k = 0; k < m; k++) {
      const c = who[k];
      if (c < 0) runMax = Math.max(runMax, v[k]);
      else {
        if (who[(k - 1 + m) % m] !== c) { entry[c] = Math.max(runMax, v[k]); runMax = 0; }
        apex[c] = Math.min(apex[c], v[k]);
      }
    }
  const turns: TurnAnalysis[] = corners.map((c, i) => {
    const approach = corners[(i - 1 + n) % n].straightAfter;
    const drop = Math.max(0, (entry[i] - apex[i]) * KMH);
    const deg = (c.turnAngle * 180) / Math.PI;
    const type: TurnAnalysis["type"] =
      deg < 20 ? "kink" : c.radius < 30 && deg > 110 ? "hairpin" : c.radius < 55 ? "slow" : c.radius < 120 ? "medium" : "fast";
    // Overtaking = heavy braking after a long approach. ≥70 counts as a strong opportunity.
    const overtaking = drop < 60 ? Math.round(Math.min(1, drop / 160) * 30) : Math.round(Math.min(1, drop / 160) * 55 + Math.min(1, approach / 600) * 45);
    return {
      turn: i + 1, id: circuit.turns[i].id, name: circuit.turns[i].name, sector: circuit.turns[i].sector,
      direction: c.direction, angle: Math.round(deg), radius: Math.round(c.radius),
      apexSpeed: Math.round(apex[i] * KMH), entrySpeed: Math.round(entry[i] * KMH), brakingDrop: Math.round(drop),
      approach: Math.round(approach), type, overtaking, locked: !!circuit.turns[i].locked,
    };
  });
  const real = turns.filter((t) => t.type !== "kink");
  const opps = turns.filter((t) => t.overtaking >= 70).sort((a, b) => b.overtaking - a.overtaking);
  // Longest straight: consecutive straights joined through kinks count as one.
  let longestStraight = 0;
  for (let i = 0; i < n; i++) {
    let s = corners[i].straightAfter, j = i;
    while (turns[(j + 1) % n].type === "kink" && j - i < n) { j++; s += corners[j % n].arcLength + corners[j % n].straightAfter; }
    longestStraight = Math.max(longestStraight, s);
  }
  // Sectors
  const sectors: SectorAnalysis[] = ([1, 2, 3] as const).map((sec) => {
    let length = 0, time = 0, min = Infinity;
    for (let k = 0; k < m; k++) if (secOf[k] === sec) { length += CAR.ds; time += CAR.ds / v[k]; min = Math.min(min, v[k]); }
    const st = real.filter((t) => t.sector === sec);
    const avgSpeed = length ? (length / time) * KMH : 0;
    const density = length ? st.length / (length / 1000) : 0;
    const slow = st.filter((t) => t.apexSpeed < 150).length;
    const character =
      !length ? "—" : avgSpeed > 235 && slow <= 1 ? "Fast & flowing" : slow >= 3 && density > 3.2 ? "Technical" : slow >= 2 && avgSpeed < 190 ? "Stop-go" : "Mixed";
    return { sector: sec, length: Math.round(length), turns: st.length, time, avgSpeed: Math.round(avgSpeed), minSpeed: Math.round(min * KMH) || 0, character };
  });
  // Scores
  const meanDrop = real.length ? real.reduce((a, t) => a + t.brakingDrop, 0) / real.length : 0;
  const fastShare = real.length ? real.filter((t) => t.apexSpeed >= 170).length / real.length : 0;
  const slowShare = real.length ? real.filter((t) => t.apexSpeed < 150).length / real.length : 0;
  const perKm = real.length / (g.length / 1000 || 1);
  const top3 = [...turns].sort((a, b) => b.overtaking - a.overtaking).slice(0, 3);
  const scores = {
    flow: clamp(100 * (0.55 * fastShare + 0.45 * (1 - Math.min(1, meanDrop / 200)))),
    technicality: clamp(100 * (0.5 * Math.min(1, perKm / 3.6) + 0.5 * slowShare)),
    overtaking: clamp(Math.min(opps.length, 3) * 22 + (top3.reduce((a, t) => a + t.overtaking, 0) / 3) * 0.35),
    highSpeed: clamp((v.filter((s) => s * KMH > 250).length / m) * 100 * 1.6),
  };
  // Warnings
  const warnings: string[] = [];
  if (g.length > 7000) warnings.push(`Circuit is ${(g.length / 1000).toFixed(2)} km — long for a modern Formula layout (target 4–6 km).`);
  if (g.length < 3000) warnings.push(`Circuit is ${(g.length / 1000).toFixed(2)} km — short; consider lengthening.`);
  for (const t of turns) {
    if (t.radius < 12 && t.type !== "kink") warnings.push(`Turn ${t.turn} radius ${t.radius} m is tighter than a Formula car can reasonably take (min ~12 m).`);
    const req = corners[t.turn - 1].requestedRadius;
    if (req - corners[t.turn - 1].radius > 5) warnings.push(`Turn ${t.turn} radius clamped ${Math.round(req)} → ${t.radius} m: not enough room between neighbours.`);
  }
  for (let i = 0; i < n; i++) if (corners[i].straightAfter < 25 && corners[i].straightAfter + corners[i].arcLength < 60) warnings.push(`Turns ${i + 1}–${(i % n) + 2 > n ? 1 : i + 2} are very close; consider merging or spreading them.`);
  if (g.crossings === 1) warnings.push("Layout crosses itself once — requires a bridge/underpass (figure-eight).");
  if (g.crossings > 1) warnings.push(`Layout crosses itself ${g.crossings} times — not buildable.`);
  if (longestStraight > 1500) warnings.push(`Longest straight ${Math.round(longestStraight)} m — very long; a kink or chicane may improve flow.`);

  const step = Math.max(1, Math.floor(m / 240));
  const speedTrace = [];
  for (let k = 0; k < m; k += step) speedTrace.push({ s: k * CAR.ds, v: Math.round(v[k] * KMH), sector: secOf[k] });

  return {
    length: g.length, lapTime, topSpeed: Math.round(topSpeed), minSpeed: Math.round(minSpeed), longestStraight: Math.round(longestStraight),
    turnCount: real.length, left: real.filter((t) => t.direction === "L").length, right: real.filter((t) => t.direction === "R").length,
    scores, overtakingOpportunities: opps, turns, sectors, warnings, crossings: g.crossings, speedTrace,
  };
}

const clamp = (x: number) => Math.round(Math.max(0, Math.min(100, x)));

export const fmtLap = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
export const fmtKm = (m: number) => `${(m / 1000).toFixed(2)}`;
