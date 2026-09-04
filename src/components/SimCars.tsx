"use client";
import { useEffect, useMemo } from "react";
import { lapPath, type Geometry } from "@/lib/circuit";
import { advance, PLAYBACK_RATE, restart, usePlayback } from "@/lib/playback";
import { seriesById, type SeriesId } from "@/lib/series";
import type { SimResult } from "@/lib/simulation";

const f = (n: number) => Math.round(n * 100) / 100;

// High-contrast liveries for a near-black canvas: no black, charcoal or dark green. 24 entries cover the largest field
// (24) without a repeat. Generic colour-and-stripe combinations, not any real team's colours.
const W = "#F2F0EB", R = "#FF3045", B = "#3B82F6", Y = "#FACC15", G = "#22C55E", O = "#F97316", C = "#22D3EE", M = "#E879F9", L = "#A3E635", P = "#FB7185";
type Livery = { body: string; accent: string; pattern: "solid" | "centre" | "side" | "two-tone" | "nose" };
export const LIVERIES: Livery[] = [
  { body: W, accent: R, pattern: "centre" }, { body: R, accent: W, pattern: "solid" }, { body: W, accent: B, pattern: "side" }, { body: B, accent: W, pattern: "nose" },
  { body: Y, accent: B, pattern: "centre" }, { body: W, accent: G, pattern: "two-tone" }, { body: O, accent: W, pattern: "side" }, { body: C, accent: W, pattern: "solid" },
  { body: G, accent: Y, pattern: "nose" }, { body: W, accent: Y, pattern: "centre" }, { body: M, accent: W, pattern: "solid" }, { body: B, accent: Y, pattern: "two-tone" },
  { body: R, accent: Y, pattern: "side" }, { body: L, accent: B, pattern: "solid" }, { body: W, accent: O, pattern: "nose" }, { body: P, accent: W, pattern: "centre" },
  { body: Y, accent: R, pattern: "two-tone" }, { body: C, accent: B, pattern: "side" }, { body: O, accent: B, pattern: "centre" }, { body: W, accent: C, pattern: "two-tone" },
  { body: G, accent: W, pattern: "side" }, { body: B, accent: R, pattern: "nose" }, { body: L, accent: R, pattern: "centre" }, { body: R, accent: B, pattern: "two-tone" },
];

/**
 * Simulated vehicles drawn on the live circuit's own centreline. Positions come from the recorded run, interpolated
 * between frames; the rAF loop lives here so nothing else re-renders per tick. Each participant keeps one livery for the
 * whole run (index + seed), so "car 4" can be followed lap after lap; another run may deal them differently.
 */
export function SimCars({ result, run, g, px, view, series }: { result: SimResult; run: number; g: Geometry; px: number; view: { x: number; y: number; w: number; h: number }; series: SeriesId }) {
  const path = useMemo(() => lapPath(g), [g]);
  const s = seriesById(series);
  const bike = s.noun === "bike";
  // Never smaller than ~12 × 5 px on screen so the livery reads at map scale; otherwise true to the vehicle's footprint.
  const len = Math.max(s.vehicle.length, 12 * px), wid = Math.max(s.vehicle.width, (bike ? 4 : 5) * px);
  const playing = usePlayback((p) => p.playing);
  const t = usePlayback((p) => p.t);
  const { step, s: frames } = result.frames;
  const end = (frames.length - 1) * step;

  useEffect(() => { restart(run); }, [run]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), id = 0;
    const loop = (now: number) => { advance(((now - last) / 1000) * PLAYBACK_RATE, end); last = now; id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing, end]);

  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(t / step))), k = Math.max(0, Math.min(1, (t - i * step) / step));
  const a = frames[i], b = frames[Math.min(frames.length - 1, i + 1)];
  if (!a) return null;
  const L = path.length;
  const running = a.filter((s) => !Number.isNaN(s));
  const lap = running.length ? Math.min(result.params.laps, Math.max(1, Math.floor(Math.max(...running) / L) + 1)) : result.params.laps;
  return (
    <g className="sim-cars" pointerEvents="none">
      {a.map((sa, c) => {
        const sb = b[c];
        if (Number.isNaN(sa) || Number.isNaN(sb)) return null; // finished vehicles leave the track
        const at = sa + (sb - sa) * k, p = path.at(at), q = path.at(at + 2);
        const deg = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
        const lv = LIVERIES[(c + result.params.seed) % LIVERIES.length];
        return (
          <g key={c} className="sim-car" transform={`translate(${f(p.x)} ${f(p.y)}) rotate(${f(deg)})`}>
            {bike ? <Bike len={len} wid={wid} lv={lv} px={px} /> : <Car len={len} wid={wid} lv={lv} px={px} />}
          </g>
        );
      })}
      <text x={f(view.x + view.w - 16 * px)} y={f(view.y + view.h - 14 * px)} className="track" fontSize={f(11 * px)} fill="var(--fg-dim)" textAnchor="end">
        SIM LAP {lap}/{result.params.laps} · {result.params.cars} {s.noun.toUpperCase()}S · {PLAYBACK_RATE}×{playing ? "" : " · PAUSED"}
      </text>
    </g>
  );
}

/** Generic single-seater: body with the livery pattern, a darker rear-wing bar, hairline outline. Nose points +x. */
function Car({ len, wid, lv, px }: { len: number; wid: number; lv: Livery; px: number }) {
  const x = -len / 2, y = -wid / 2, r = wid * 0.35;
  return (
    <>
      <rect x={f(x)} y={f(y)} width={f(len)} height={f(wid)} rx={f(r)} fill={lv.body} stroke="var(--bg)" strokeWidth={f(0.7 * px)} />
      {lv.pattern === "centre" && <rect x={f(x + len * 0.08)} y={f(-wid * 0.14)} width={f(len * 0.84)} height={f(wid * 0.28)} fill={lv.accent} />}
      {lv.pattern === "side" && <rect x={f(x + len * 0.08)} y={f(y + wid * 0.1)} width={f(len * 0.84)} height={f(wid * 0.24)} fill={lv.accent} />}
      {lv.pattern === "two-tone" && <rect x={f(x + len * 0.48)} y={f(y)} width={f(len * 0.52)} height={f(wid)} rx={f(r)} fill={lv.accent} />}
      {lv.pattern === "nose" && <rect x={f(x + len * 0.72)} y={f(y)} width={f(len * 0.28)} height={f(wid)} rx={f(r)} fill={lv.accent} />}
      <rect x={f(x)} y={f(y + wid * 0.1)} width={f(len * 0.1)} height={f(wid * 0.8)} fill="var(--bg)" opacity={0.55} />
    </>
  );
}

/** Generic motorcycle: a slim body in the livery with a round rider in the accent colour. */
function Bike({ len, wid, lv, px }: { len: number; wid: number; lv: Livery; px: number }) {
  return (
    <>
      <rect x={f(-len / 2)} y={f(-wid / 2)} width={f(len)} height={f(wid)} rx={f(wid / 2)} fill={lv.body} stroke="var(--bg)" strokeWidth={f(0.6 * px)} />
      <circle cx={f(-len * 0.08)} cy={0} r={f(wid * 0.42)} fill={lv.pattern === "solid" ? "var(--bg)" : lv.accent} />
    </>
  );
}
