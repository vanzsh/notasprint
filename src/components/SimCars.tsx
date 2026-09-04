"use client";
import { useEffect, useMemo } from "react";
import { lapPath, type Geometry } from "@/lib/circuit";
import { advance, PLAYBACK_RATE, restart, usePlayback } from "@/lib/playback";
import { seriesById, type SeriesId } from "@/lib/series";
import type { SimResult } from "@/lib/simulation";

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * Simulated vehicles drawn on the live circuit's own centreline. Positions come from the recorded run, interpolated
 * between frames; the rAF loop lives here so nothing else re-renders per tick. The glyph is a plain oriented
 * rectangle sized from the discipline's vehicle (a single-seater or a motorcycle), never a livery.
 */
export function SimCars({ result, run, g, px, view, series }: { result: SimResult; run: number; g: Geometry; px: number; view: { x: number; y: number; w: number; h: number }; series: SeriesId }) {
  const path = useMemo(() => lapPath(g), [g]);
  const s = seriesById(series);
  // Never smaller than ~7 × 3 px on screen, otherwise true to the vehicle's footprint.
  const len = Math.max(s.vehicle.length, 7 * px), wid = Math.max(s.vehicle.width, (s.noun === "bike" ? 2.4 : 3.2) * px);
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
        if (Number.isNaN(sa) || Number.isNaN(sb)) return null; // finished cars leave the track
        const at = sa + (sb - sa) * k, p = path.at(at), q = path.at(at + 2);
        const deg = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
        return <rect key={c} className="sim-car" x={f(p.x - len / 2)} y={f(p.y - wid / 2)} width={f(len)} height={f(wid)} rx={f(wid / 2)} transform={`rotate(${f(deg)} ${f(p.x)} ${f(p.y)})`} fill="var(--fg)" stroke="var(--bg)" strokeWidth={f(0.8 * px)} />;
      })}
      <text x={f(view.x + view.w - 16 * px)} y={f(view.y + view.h - 14 * px)} className="track" fontSize={f(11 * px)} fill="var(--fg-dim)" textAnchor="end">
        SIM LAP {lap}/{result.params.laps} · {result.params.cars} {s.noun.toUpperCase()}S · {PLAYBACK_RATE}×{playing ? "" : " · PAUSED"}
      </text>
    </g>
  );
}
