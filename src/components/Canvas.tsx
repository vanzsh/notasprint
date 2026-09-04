"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Fullscreen, Minus, Plus } from "lucide-react";
import { buildGeometry, fingerprint, startFinish, type Circuit } from "@/lib/circuit";
import { insertTurnOnSegment, moveTurn } from "@/lib/moves";
import { commit, preview, select, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SimCars } from "./SimCars";

const PAD = 0.14;
const ZOOM = { min: 0.75, max: 3, step: 1.25 }; // deliberately limited: a closer look, never a lost circuit
const f = (n: number) => Math.round(n * 100) / 100; // stable across server/client float formatting

type Box = { minX: number; minY: number; maxX: number; maxY: number };
type View = { z: number; dx: number; dy: number }; // zoom about the fitted view and a pan offset in metres
const FIT: View = { z: 1, dx: 0, dy: 0 };

/** The fitted view (z = 1) with ~14 % margin, then zoomed and panned; the pan is clamped so the circuit stays in frame. */
function viewBox(b: Box, size: { w: number; h: number }, v: View) {
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const aspect = size.w / size.h;
  let vw = w * (1 + 2 * PAD), vh = h * (1 + 2 * PAD);
  if (vw / vh < aspect) vw = vh * aspect; else vh = vw / aspect;
  vw /= v.z; vh /= v.z;
  const cx = b.minX + w / 2 + Math.max(-w / 2, Math.min(w / 2, v.dx)), cy = b.minY + h / 2 + Math.max(-h / 2, Math.min(h / 2, v.dy));
  return `${(cx - vw / 2).toFixed(1)} ${(cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
}

export function Canvas() {
  const circuit = useStore((s) => s.circuit);
  const analysis = useStore((s) => s.analysis);
  const selected = useStore((s) => s.selected);
  const flash = useStore((s) => s.flash);
  const simulation = useStore((s) => s.simulation);
  const simRun = useStore((s) => s.simRun);
  const compareVersion = useStore((s) => (s.compare ? s.versions.find((v) => v.id === s.compare) ?? null : null));
  const g = useMemo(() => buildGeometry(circuit.turns), [circuit.turns]);
  const comparePath = useMemo(() => (compareVersion ? buildGeometry(compareVersion.circuit.turns).path : null), [compareVersion]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const drag = useRef<{ id: string; start: Circuit; moved: boolean; from: { x: number; y: number }; vertex: { x: number; y: number } } | null>(null);
  const [frozen, setFrozen] = useState<string | null>(null);
  const [view, setView] = useState<View & { id: string }>({ ...FIT, id: circuit.id });
  const v = view.id === circuit.id ? view : FIT; // a new circuit always opens fitted
  const isFit = v.z === 1 && v.dx === 0 && v.dy === 0;

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the circuit with generous margin; frozen while dragging so the world doesn't move under the cursor.
  const box = frozen ?? viewBox(g.bounds, size, v);
  const [vx, vy, vw, vh] = box.split(" ").map(Number);
  const px = vw / size.w; // world metres per screen pixel

  // Zoom about a world point (the cursor, or the view centre for the buttons), clamped to the limited range.
  const zoomTo = (z: number, at?: { x: number; y: number }) => {
    const nz = Math.max(ZOOM.min, Math.min(ZOOM.max, z));
    const cx = vx + vw / 2, cy = vy + vh / 2, k = v.z / nz;
    const ncx = at ? at.x - (at.x - cx) * k : cx, ncy = at ? at.y - (at.y - cy) * k : cy;
    const bw = g.bounds.maxX - g.bounds.minX, bh = g.bounds.maxY - g.bounds.minY;
    setView({ id: circuit.id, z: nz, dx: ncx - (g.bounds.minX + bw / 2), dy: ncy - (g.bounds.minY + bh / 2) });
  };
  const fit = () => setView({ ...FIT, id: circuit.id });
  useEffect(() => {
    // Wheel / pinch zooms at the cursor. Registered natively so the page never scrolls behind the canvas.
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = el.getScreenCTM()!.inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
      zoomTo(v.z * Math.exp(-(e.ctrlKey ? e.deltaY * 0.01 : e.deltaY * 0.0025)), { x: p.x, y: p.y });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const toWorld = (e: React.PointerEvent | React.MouseEvent) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  const onHandleDown = (e: React.PointerEvent, id: string, locked?: boolean) => {
    e.stopPropagation();
    select(id);
    if (locked) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const t = circuit.turns.find((x) => x.id === id)!;
    drag.current = { id, start: circuit, moved: false, from: toWorld(e), vertex: { x: t.x, y: t.y } };
    setFrozen(box);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toWorld(e), d = drag.current;
    d.moved = true;
    preview(moveTurn(d.start, d.id, Math.round(d.vertex.x + p.x - d.from.x), Math.round(d.vertex.y + p.y - d.from.y)));
  };
  const onUp = () => {
    if (!drag.current) return;
    const d = drag.current;
    drag.current = null;
    setFrozen(null);
    if (d.moved) {
      const cur = circuit; // latest previewed circuit
      // Re-commit against history baseline: restore start, then commit the previewed result.
      preview(d.start);
      commit(cur, { source: "human", changed: [d.id] });
    }
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toWorld(e);
    // Nearest polygon segment
    let best = { i: 0, d: Infinity };
    circuit.turns.forEach((a, i) => {
      const b = circuit.turns[(i + 1) % circuit.turns.length];
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
      const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
      if (d < best.d) best = { i, d };
    });
    if (best.d > 60) return;
    const next = insertTurnOnSegment(circuit, best.i, Math.round(p.x), Math.round(p.y));
    commit(next, { source: "human", changed: [next.turns[best.i + 1].id] });
    select(next.turns[best.i + 1].id);
  };

  const sf = startFinish(g);
  const w = circuit.trackWidth;
  const oppSet = new Set(analysis.overtakingOpportunities.map((t) => t.id));
  const flashSet = new Set(flash?.ids ?? []);
  const gridMinor = 100, gridMajor = 500;

  return (
    <>
    <svg
      ref={svgRef}
      className="h-full w-full select-none touch-none"
      viewBox={box}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerDown={() => select(null)}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern id="grid" width={gridMinor} height={gridMinor} patternUnits="userSpaceOnUse">
          <path d={`M ${gridMinor} 0 L 0 0 0 ${gridMinor}`} fill="none" stroke="var(--line)" strokeWidth={f(px * 0.7)} />
        </pattern>
        <pattern id="grid-major" width={gridMajor} height={gridMajor} patternUnits="userSpaceOnUse">
          <rect width={gridMajor} height={gridMajor} fill="url(#grid)" />
          <path d={`M ${gridMajor} 0 L 0 0 0 ${gridMajor}`} fill="none" stroke="var(--line-strong)" strokeWidth={f(px * 0.7)} opacity={0.7} />
        </pattern>
      </defs>
      <rect x={f(vx)} y={f(vy)} width={vw} height={vh} fill="url(#grid-major)" />
      <text x={f(vx + 16 * px)} y={f(vy + vh - 14 * px)} className="track" fontSize={f(11 * px)} fill="var(--fg-dim)">GRID 100 m · N ↑</text>

      {/* Track */}
      <path d={g.path} fill="none" stroke="var(--asphalt-edge)" strokeWidth={f(w + 1.4)} strokeLinejoin="round" opacity={0.75} />
      <path d={g.path} fill="none" stroke="var(--asphalt)" strokeWidth={f(w)} strokeLinejoin="round" />
      {/* Compare version: its centreline as a dashed hairline, so the difference reads without competing with the track */}
      {comparePath && compareVersion && (
        <g pointerEvents="none">
          <path d={comparePath} fill="none" stroke="var(--fg-muted)" strokeWidth={f(1.4 * px)} strokeDasharray={`${f(7 * px)} ${f(5 * px)}`} strokeLinejoin="round" opacity={0.9} />
          <text x={f(vx + vw - 16 * px)} y={f(vy + 22 * px)} className="track" fontSize={f(11 * px)} fill="var(--fg-dim)" textAnchor="end">
            <tspan fill="var(--fg)">CURRENT ▬</tspan>{"   "}{compareVersion.id.toUpperCase()} · {compareVersion.name.toUpperCase()} ┄
          </text>
        </g>
      )}
      {[...flashSet].map((id) => {
        const i = circuit.turns.findIndex((t) => t.id === id);
        const c = g.corners[i];
        if (!c || c.radius < 0.01) return null;
        return <path key={`${id}-${flash!.at}`} className="flash-stroke" d={`M ${c.start.x} ${c.start.y} A ${c.radius} ${c.radius} 0 0 ${c.direction === "R" ? 1 : 0} ${c.end.x} ${c.end.y}`} fill="none" strokeWidth={f(w + 1.4)} opacity={0.9} />;
      })}

      {/* Start / finish */}
      <line x1={f(sf.x - sf.nx * w * 0.6)} y1={f(sf.y - sf.ny * w * 0.6)} x2={f(sf.x + sf.nx * w * 0.6)} y2={f(sf.y + sf.ny * w * 0.6)} stroke="var(--fg)" strokeWidth={f(2.2 * px)} />
      <text x={f(sf.x - sf.nx * (w * 0.6 + 12 * px))} y={f(sf.y - sf.ny * (w * 0.6 + 12 * px))} className="track" fontSize={f(10 * px)} fill="var(--fg-muted)" textAnchor="middle" dominantBaseline="middle">S/F</text>

      {/* Sector boundaries */}
      {g.corners.map((c, i) => {
        const next = circuit.turns[(i + 1) % circuit.turns.length];
        if (next.sector === circuit.turns[i].sector || next.sector === 1) return null; // S/F marks the start of S1
        const nc = g.corners[(i + 1) % circuit.turns.length];
        const mx = (c.end.x + nc.start.x) / 2, my = (c.end.y + nc.start.y) / 2;
        const dx = nc.start.x - c.end.x, dy = nc.start.y - c.end.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        return (
          <g key={`sec-${i}`}>
            <line x1={f(mx - nx * w * 0.8)} y1={f(my - ny * w * 0.8)} x2={f(mx + nx * w * 0.8)} y2={f(my + ny * w * 0.8)} stroke="var(--fg-dim)" strokeWidth={f(1.2 * px)} />
            <text x={f(mx + nx * (w * 0.8 + 10 * px))} y={f(my + ny * (w * 0.8 + 10 * px))} className="track" fontSize={f(12 * px)} fontWeight={600} fill="var(--fg-dim)" textAnchor="middle" dominantBaseline="middle">S{next.sector}</text>
          </g>
        );
      })}

      {/* Turns */}
      {circuit.turns.map((t, i) => {
        const c = g.corners[i];
        const dx = t.x - c.center.x, dy = t.y - c.center.y, L = Math.hypot(dx, dy) || 1;
        // Marker sits on the apex, not the control vertex (which drifts off-road for large radii).
        const ax = c.radius > 0.01 ? c.center.x + (dx / L) * c.radius : t.x, ay = c.radius > 0.01 ? c.center.y + (dy / L) * c.radius : t.y;
        const off = w / 2 + 12 * px;
        const ox = (dx / L) * off, oy = (dy / L) * off;
        const isSel = t.id === selected, isFlash = flashSet.has(t.id);
        const color = isSel ? "var(--accent)" : "var(--fg)";
        return (
          <g key={t.id} className={`turn-handle ${t.locked ? "locked" : ""}`} onPointerDown={(e) => onHandleDown(e, t.id, t.locked)} onDoubleClick={(e) => e.stopPropagation()}>
            <circle cx={f(ax)} cy={f(ay)} r={f(14 * px)} fill="transparent" />
            {t.locked && <circle cx={f(ax)} cy={f(ay)} r={f(7.5 * px)} fill="none" stroke="var(--accent)" strokeWidth={f(1 * px)} />}
            <circle key={isFlash ? `f-${flash!.at}` : "n"} className={isFlash ? "flash" : undefined} cx={f(ax)} cy={f(ay)} r={f(3.6 * px)} fill={isSel ? "var(--accent)" : "var(--bg)"} stroke={color} strokeWidth={f(1.3 * px)} />
            <text x={f(ax + ox)} y={f(ay + oy)} className="track" fontSize={f(11 * px)} fill={isSel ? "var(--accent)" : "var(--fg)"} textAnchor="middle" dominantBaseline="middle" fontWeight={600}>
              {oppSet.has(t.id) && <tspan fill="var(--accent)">▸</tspan>}{i + 1}
            </text>
            {isSel && t.name && (
              // Name stacks on the side of the number that faces away from the asphalt.
              <text x={f(ax + ox)} y={f(ay + oy + (oy < 0 ? -12 : 12) * px)} className="track" fontSize={f(10 * px)} fill="var(--fg-muted)" textAnchor="middle" dominantBaseline="middle">{t.name}</text>
            )}
          </g>
        );
      })}

      {/* Simulated cars on this circuit's own centreline; hidden once the geometry no longer matches the run */}
      {simulation && simulation.fingerprint === fingerprint(circuit) && <SimCars result={simulation} run={simRun} g={g} px={px} view={{ x: vx, y: vy, w: vw, h: vh }} series={circuit.series} />}
    </svg>
    {/* Workspace zoom: a closer look at a corner, then straight back to Fit. */}
    <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
      <div className="flex flex-col">
        <Tooltip><TooltipTrigger asChild><Button size="icon" className="rounded-b-none" onClick={() => zoomTo(v.z * ZOOM.step)} disabled={v.z >= ZOOM.max} aria-label="Zoom in"><Plus /></Button></TooltipTrigger><TooltipContent side="right">Zoom in · scroll or pinch on the canvas</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button size="icon" className="-mt-px rounded-none" onClick={() => zoomTo(v.z / ZOOM.step)} disabled={v.z <= ZOOM.min} aria-label="Zoom out"><Minus /></Button></TooltipTrigger><TooltipContent side="right">Zoom out</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button size="icon" className="-mt-px rounded-t-none" onClick={fit} disabled={isFit} aria-label="Fit circuit"><Fullscreen /></Button></TooltipTrigger><TooltipContent side="right">Fit the whole circuit</TooltipContent></Tooltip>
      </div>
      {!isFit && <span className="mono pl-0.5 text-[10px] text-fg-dim">{Math.round(v.z * 100)}%</span>}
    </div>
    </>
  );
}
