"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildGeometry, startFinish, type Circuit } from "@/lib/circuit";
import { insertTurnOnSegment, moveTurn } from "@/lib/moves";
import { commit, preview, select, useStore } from "@/lib/store";

const PAD = 0.14;

function fitViewBox(b: { minX: number; minY: number; maxX: number; maxY: number }, size: { w: number; h: number }) {
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const aspect = size.w / size.h;
  let vw = w * (1 + 2 * PAD), vh = h * (1 + 2 * PAD);
  if (vw / vh < aspect) vw = vh * aspect; else vh = vw / aspect;
  return `${(b.minX + w / 2 - vw / 2).toFixed(1)} ${(b.minY + h / 2 - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
}

export function Canvas() {
  const circuit = useStore((s) => s.circuit);
  const analysis = useStore((s) => s.analysis);
  const selected = useStore((s) => s.selected);
  const flash = useStore((s) => s.flash);
  const g = useMemo(() => buildGeometry(circuit.turns), [circuit.turns]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const drag = useRef<{ id: string; start: Circuit; moved: boolean } | null>(null);
  const [frozen, setFrozen] = useState<string | null>(null);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the circuit with generous margin; frozen while dragging so the world doesn't move under the cursor.
  const viewBox = frozen ?? fitViewBox(g.bounds, size);
  const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
  const px = vw / size.w; // world metres per screen pixel

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
    drag.current = { id, start: circuit, moved: false };
    setFrozen(viewBox);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { x, y } = toWorld(e);
    drag.current.moved = true;
    preview(moveTurn(drag.current.start, drag.current.id, Math.round(x), Math.round(y)));
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
    <svg
      ref={svgRef}
      className="h-full w-full select-none touch-none"
      viewBox={viewBox}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerDown={() => select(null)}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern id="grid" width={gridMinor} height={gridMinor} patternUnits="userSpaceOnUse">
          <path d={`M ${gridMinor} 0 L 0 0 0 ${gridMinor}`} fill="none" stroke="var(--line)" strokeWidth={px * 0.7} />
        </pattern>
        <pattern id="grid-major" width={gridMajor} height={gridMajor} patternUnits="userSpaceOnUse">
          <rect width={gridMajor} height={gridMajor} fill="url(#grid)" />
          <path d={`M ${gridMajor} 0 L 0 0 0 ${gridMajor}`} fill="none" stroke="var(--line-strong)" strokeWidth={px * 0.7} opacity={0.7} />
        </pattern>
      </defs>
      <rect x={vx} y={vy} width={vw} height={vh} fill="url(#grid-major)" />
      <text x={vx + 16 * px} y={vy + vh - 14 * px} className="mono" fontSize={11 * px} fill="var(--fg-dim)">GRID 100 m · N ↑</text>

      {/* Track */}
      <path d={g.path} fill="none" stroke="var(--asphalt-edge)" strokeWidth={w + 1.4} strokeLinejoin="round" opacity={0.75} />
      <path d={g.path} fill="none" stroke="var(--asphalt)" strokeWidth={w} strokeLinejoin="round" />
      {[...flashSet].map((id) => {
        const i = circuit.turns.findIndex((t) => t.id === id);
        const c = g.corners[i];
        if (!c || c.radius < 0.01) return null;
        return <path key={`${id}-${flash!.at}`} className="flash-stroke" d={`M ${c.start.x} ${c.start.y} A ${c.radius} ${c.radius} 0 0 ${c.direction === "R" ? 1 : 0} ${c.end.x} ${c.end.y}`} fill="none" strokeWidth={w + 1.4} opacity={0.9} />;
      })}

      {/* Start / finish */}
      <line x1={sf.x - sf.nx * w * 0.6} y1={sf.y - sf.ny * w * 0.6} x2={sf.x + sf.nx * w * 0.6} y2={sf.y + sf.ny * w * 0.6} stroke="var(--fg)" strokeWidth={2.2 * px} />
      <text x={sf.x - sf.nx * (w * 0.6 + 12 * px)} y={sf.y - sf.ny * (w * 0.6 + 12 * px)} className="mono" fontSize={10 * px} fill="var(--fg-muted)" textAnchor="middle" dominantBaseline="middle">S/F</text>

      {/* Sector boundaries */}
      {g.corners.map((c, i) => {
        const next = circuit.turns[(i + 1) % circuit.turns.length];
        if (next.sector === circuit.turns[i].sector) return null;
        const nc = g.corners[(i + 1) % circuit.turns.length];
        const mx = (c.end.x + nc.start.x) / 2, my = (c.end.y + nc.start.y) / 2;
        const dx = nc.start.x - c.end.x, dy = nc.start.y - c.end.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        return (
          <g key={`sec-${i}`}>
            <line x1={mx - nx * w * 0.8} y1={my - ny * w * 0.8} x2={mx + nx * w * 0.8} y2={my + ny * w * 0.8} stroke="var(--fg-dim)" strokeWidth={1.2 * px} />
            <text x={mx + nx * (w * 0.8 + 10 * px)} y={my + ny * (w * 0.8 + 10 * px)} className="display" fontSize={12 * px} fill="var(--fg-dim)" textAnchor="middle" dominantBaseline="middle">S{next.sector}</text>
          </g>
        );
      })}

      {/* Turns */}
      {circuit.turns.map((t, i) => {
        const c = g.corners[i];
        const dx = t.x - c.center.x, dy = t.y - c.center.y, L = Math.hypot(dx, dy) || 1;
        const ox = (dx / L) * 14 * px, oy = (dy / L) * 14 * px;
        const isSel = t.id === selected, isFlash = flashSet.has(t.id);
        const color = isSel ? "var(--accent)" : "var(--fg)";
        return (
          <g key={t.id} className={`turn-handle ${t.locked ? "locked" : ""}`} onPointerDown={(e) => onHandleDown(e, t.id, t.locked)} onDoubleClick={(e) => e.stopPropagation()}>
            <circle cx={t.x} cy={t.y} r={14 * px} fill="transparent" />
            {t.locked && <circle cx={t.x} cy={t.y} r={7.5 * px} fill="none" stroke="var(--accent)" strokeWidth={1 * px} />}
            <circle key={isFlash ? `f-${flash!.at}` : "n"} className={isFlash ? "flash" : undefined} cx={t.x} cy={t.y} r={3.6 * px} fill={isSel ? "var(--accent)" : "var(--bg)"} stroke={color} strokeWidth={1.3 * px} />
            <text x={t.x + ox} y={t.y + oy} className="mono" fontSize={11 * px} fill={isSel ? "var(--accent)" : "var(--fg)"} textAnchor="middle" dominantBaseline="middle" fontWeight={500}>
              {oppSet.has(t.id) && <tspan fill="var(--accent)">▸</tspan>}{i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
