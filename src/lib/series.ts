// The three motorsport disciplines NotASprint designs for. One structured source read by the analysis (vehicle
// model and score thresholds), the simulation, the custom generator, the UI and the WebMCP tools.
// Numbers are product heuristics for a point-mass model — plausible orders of magnitude, not regulations or
// certified performance data.

export const SERIES_IDS = ["f1", "fe", "motogp"] as const;
export type SeriesId = (typeof SERIES_IDS)[number];

export type Vehicle = {
  vMax: number; // m/s
  aLat: number; // m/s² lateral grip → apex speed = sqrt(aLat · r)
  aAcc: number; // m/s² peak longitudinal acceleration, fading to 0 at vMax
  aBrk: number; // m/s² braking
  minRadius: number; // metres a vehicle can reasonably take
  length: number; // metres, for the simulated vehicle glyph
  width: number;
};

export type Series = {
  id: SeriesId;
  name: string;
  short: string;
  noun: string; // "car" | "bike"
  vehicle: Vehicle;
  /** Speed thresholds (km/h) and braking/approach scales the design scores are read against. */
  thresholds: { fast: number; slow: number; high: number; drop: number; dropMin: number; approach: number };
  /** Typical lap length band in metres: [warn below, target min, target max, warn above]. */
  lengthBand: [number, number, number, number];
  /** How custom concepts are generated: overall scale, turn count and the mix of corner radii (metres). */
  generator: { length: [number, number]; turns: [number, number]; radii: number[]; hairpin: number; straightBias: number; width: number };
  /** Two-line design emphasis shown to designers and agents. */
  emphasis: string;
};

export const SERIES: Record<SeriesId, Series> = {
  f1: {
    id: "f1", name: "Formula 1", short: "F1", noun: "car",
    vehicle: { vMax: 94, aLat: 34, aAcc: 12, aBrk: 42, minRadius: 12, length: 5.6, width: 2.0 },
    thresholds: { fast: 170, slow: 150, high: 250, drop: 160, dropMin: 60, approach: 600 },
    lengthBand: [3000, 4000, 6000, 7000],
    generator: { length: [4600, 5800], turns: [14, 19], radii: [22, 30, 45, 60, 90, 130, 180, 260], hairpin: 0.15, straightBias: 0.55, width: 14 },
    emphasis: "Braking zones after long straights, overtaking opportunities and high top speed.",
  },
  fe: {
    id: "fe", name: "Formula E", short: "FE", noun: "car",
    vehicle: { vMax: 78, aLat: 24, aAcc: 9, aBrk: 30, minRadius: 10, length: 5.0, width: 1.7 },
    thresholds: { fast: 140, slow: 120, high: 200, drop: 130, dropMin: 50, approach: 450 },
    lengthBand: [1800, 2200, 3500, 4200],
    generator: { length: [2400, 3300], turns: [13, 18], radii: [14, 18, 24, 30, 40, 55, 80], hairpin: 0.3, straightBias: 0.3, width: 12 },
    emphasis: "Compact technical sequences, stop-start braking and energy-friendly rhythm over long straights.",
  },
  motogp: {
    id: "motogp", name: "MotoGP", short: "MotoGP", noun: "bike",
    vehicle: { vMax: 97, aLat: 16, aAcc: 10, aBrk: 18, minRadius: 20, length: 2.1, width: 0.7 },
    thresholds: { fast: 150, slow: 120, high: 230, drop: 140, dropMin: 50, approach: 550 },
    lengthBand: [3000, 4000, 5500, 6500],
    generator: { length: [4200, 5300], turns: [12, 17], radii: [45, 60, 80, 100, 130, 170, 220], hairpin: 0.05, straightBias: 0.4, width: 13 },
    emphasis: "Corner flow, sustained direction changes and wide arcs a motorcycle can carry lean through.",
  },
};

export const seriesById = (id: string | undefined) => SERIES[(id ?? "f1") as SeriesId] ?? SERIES.f1;

/** Resolve "Formula E", "fe", "MotoGP", "moto gp", "bikes" … to a series. */
export function resolveSeries(phrase: string): Series | undefined {
  const p = String(phrase ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!p) return undefined;
  if (/^(f1|formula1|formulaone|grandprix)$/.test(p)) return SERIES.f1;
  if (/^(fe|formulae|electric|eprix)$/.test(p)) return SERIES.fe;
  if (/^(motogp|moto|bikes?|motorcycles?|gpbikes)$/.test(p)) return SERIES.motogp;
  return undefined;
}
