// Export: JSON (definition + analysis) and drawings in four presentation styles, as SVG or rasterised PNG.
// Pure string building here; only `svgToPng` touches the DOM (it runs in the designer's browser).
import { fmtKm, fmtLap, SCORE_LABEL, startFinish, type Analysis, type Circuit, type Geometry } from "./circuit";
import { seriesById } from "./series";

export const EXPORT_STYLES = ["technical", "presentation", "minimal", "analysis"] as const;
export type ExportStyle = (typeof EXPORT_STYLES)[number];
export const EXPORT_STYLE_INFO: Record<ExportStyle, { name: string; blurb: string }> = {
  technical: { name: "Technical", blurb: "Grid, turn numbers, sectors, braking zones and a scale bar." },
  presentation: { name: "Presentation", blurb: "Clean circuit with its name, location and headline metrics." },
  minimal: { name: "Minimal", blurb: "The circuit and nothing else." },
  analysis: { name: "Analysis", blurb: "Presentation view plus design scores, sectors and overtaking zones." },
};
export const EXPORT_FORMATS = ["svg", "png", "png-transparent", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const C = { bg: "#0A0A0A", asphalt: "#2A2A2A", edge: "#D9D6CF", fg: "#F2F0EB", muted: "#8A8A8A", dim: "#5A5A5A", line: "#232323", lineStrong: "#3A3A3A", accent: "#FF3045" };
const F = { display: "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif", mono: "'Geist Mono', ui-monospace, Menlo, monospace", track: "Oxanium, 'Geist Mono', ui-monospace, monospace" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (v: number) => v.toFixed(1);

export const exportJSON = (c: Circuit, a: Analysis) =>
  JSON.stringify({
    format: "notasprint.circuit/2", units: "metres", exported_at: new Date().toISOString(),
    motorsport: { id: c.series, name: seriesById(c.series).name },
    circuit: c,
    analysis: { length_m: Math.round(a.length), lap_time_s: Math.round(a.lapTime * 10) / 10, top_speed_kmh: a.topSpeed, longest_straight_m: a.longestStraight, scores: a.scores, sectors: a.sectors, turns: a.turns, warnings: a.warnings },
    note: "Design analysis from a point-mass model. Not survey data, official telemetry or a certified assessment.",
  }, null, 2);

/**
 * Draw the circuit. The viewBox is in metres; every stroke and font is expressed in metres too, scaled from the lap
 * so a 2 km street circuit and a 6 km grand prix layout export with the same visual weight.
 */
export function exportSVG(c: Circuit, a: Analysis, g: Geometry, style: ExportStyle = "technical", opts: { transparent?: boolean } = {}) {
  const { minX, minY, maxX, maxY } = g.bounds;
  const w0 = maxX - minX, h0 = maxY - minY;
  const u = Math.max(w0, h0) / 1000; // 1 "unit" ≈ 1 px on a 1000 px-wide drawing
  const pad = 110 * u;
  // Portrait layouts have no room for name and metrics side by side: the metrics drop to a second line.
  const narrow = w0 + 2 * pad < 1150 * u, off = narrow ? 70 * u : 0;
  const footer = style === "presentation" ? 120 * u + off : style === "analysis" ? 250 * u + 2 * off : style === "technical" ? 40 * u : 0;
  const x0 = minX - pad, y0 = minY - pad, W = w0 + 2 * pad, H = h0 + 2 * pad + footer;
  const sf = startFinish(g);
  const series = seriesById(c.series);
  const tw = c.trackWidth;
  const parts: string[] = [];
  const text = (x: number, y: number, s: string, size: number, o: { fill?: string; font?: string; anchor?: "start" | "middle" | "end"; weight?: number; upper?: boolean; ls?: number } = {}) =>
    `<text x="${f1(x)}" y="${f1(y)}" font-family="${o.font ?? F.mono}" font-size="${f1(size * u)}" fill="${o.fill ?? C.fg}" text-anchor="${o.anchor ?? "start"}"${o.weight ? ` font-weight="${o.weight}"` : ""}${o.ls ? ` letter-spacing="${f1(o.ls * u)}"` : ""}>${esc(o.upper ? s.toUpperCase() : s)}</text>`;

  if (!opts.transparent) parts.push(`<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(W)}" height="${f1(H)}" fill="${C.bg}"/>`);
  if (style === "technical") {
    const gx0 = Math.floor(x0 / 100) * 100, gy0 = Math.floor(y0 / 100) * 100;
    const grid: string[] = [];
    for (let x = gx0; x <= x0 + W; x += 100) grid.push(`M ${x} ${f1(y0)} V ${f1(y0 + H - footer)}`);
    for (let y = gy0; y <= y0 + H - footer; y += 100) grid.push(`M ${f1(x0)} ${y} H ${f1(x0 + W)}`);
    parts.push(`<path d="${grid.join(" ")}" stroke="${C.line}" stroke-width="${f1(0.8 * u)}" fill="none"/>`);
  }
  // Track
  parts.push(`<path d="${g.path}" fill="none" stroke="${C.edge}" stroke-width="${f1(tw + 1.6 * u)}" stroke-linejoin="round" opacity="0.75"/>`);
  parts.push(`<path d="${g.path}" fill="none" stroke="${C.asphalt}" stroke-width="${f1(tw)}" stroke-linejoin="round"/>`);
  if (style === "minimal") return wrap(x0, y0, W, H, parts, c);

  // Start / finish
  parts.push(`<line x1="${f1(sf.x - sf.nx * tw * 0.6)}" y1="${f1(sf.y - sf.ny * tw * 0.6)}" x2="${f1(sf.x + sf.nx * tw * 0.6)}" y2="${f1(sf.y + sf.ny * tw * 0.6)}" stroke="${C.fg}" stroke-width="${f1(2.2 * u)}"/>`);
  parts.push(text(sf.x - sf.nx * (tw * 0.6 + 14 * u), sf.y - sf.ny * (tw * 0.6 + 14 * u) + 4 * u, "S/F", 11, { fill: C.muted, font: F.track, anchor: "middle" }));
  // Turn markers and numbers
  const opp = new Set(a.overtakingOpportunities.map((t) => t.id));
  c.turns.forEach((t, i) => {
    const k = g.corners[i];
    const dx = t.x - k.center.x, dy = t.y - k.center.y, L = Math.hypot(dx, dy) || 1;
    const ax = k.radius > 0.01 ? k.center.x + (dx / L) * k.radius : t.x, ay = k.radius > 0.01 ? k.center.y + (dy / L) * k.radius : t.y;
    const off = tw / 2 + 14 * u;
    parts.push(`<circle cx="${f1(ax)}" cy="${f1(ay)}" r="${f1(3.6 * u)}" fill="${C.bg}" stroke="${C.fg}" stroke-width="${f1(1.3 * u)}"/>`);
    if (t.locked) parts.push(`<circle cx="${f1(ax)}" cy="${f1(ay)}" r="${f1(7.5 * u)}" fill="none" stroke="${C.accent}" stroke-width="${f1(u)}"/>`);
    const lx = ax + (dx / L) * off, ly = ay + (dy / L) * off + 4 * u;
    const label = `${style === "technical" && opp.has(t.id) ? "▸" : ""}${i + 1}`;
    parts.push(text(lx, ly, label, 12, { font: F.track, anchor: "middle", weight: 600 }));
    if (style === "technical" && t.name) parts.push(text(lx, ly + 12 * u, t.name, 9, { font: F.track, anchor: "middle", fill: C.muted }));
  });
  if (style === "technical") {
    // Sector boundaries and legend
    c.turns.forEach((t, i) => {
      const next = c.turns[(i + 1) % c.turns.length];
      if (next.sector === t.sector || next.sector === 1) return;
      const k = g.corners[i], nk = g.corners[(i + 1) % c.turns.length];
      const mx = (k.end.x + nk.start.x) / 2, my = (k.end.y + nk.start.y) / 2;
      const dx = nk.start.x - k.end.x, dy = nk.start.y - k.end.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      parts.push(`<line x1="${f1(mx - nx * tw * 0.8)}" y1="${f1(my - ny * tw * 0.8)}" x2="${f1(mx + nx * tw * 0.8)}" y2="${f1(my + ny * tw * 0.8)}" stroke="${C.dim}" stroke-width="${f1(1.2 * u)}"/>`);
      parts.push(text(mx + nx * (tw * 0.8 + 12 * u), my + ny * (tw * 0.8 + 12 * u) + 4 * u, `S${next.sector}`, 12, { font: F.track, fill: C.dim, anchor: "middle", weight: 600 }));
    });
    const by = y0 + H - 18 * u;
    parts.push(`<line x1="${f1(x0 + 16 * u)}" y1="${f1(by - 8 * u)}" x2="${f1(x0 + 16 * u + 500)}" y2="${f1(by - 8 * u)}" stroke="${C.muted}" stroke-width="${f1(1.5 * u)}"/>`);
    parts.push(text(x0 + 16 * u, by + 6 * u, "500 m · grid 100 m · N ↑", 11, { font: F.track, fill: C.dim }));
    parts.push(text(x0 + W - 16 * u, by + 6 * u, `${esc(c.name)} · ${series.name} · ${fmtKm(a.length)} km · ${a.turnCount} turns · ▸ strong braking zone`, 11, { font: F.track, fill: C.dim, anchor: "end" }));
    parts.push(text(x0 + W - 16 * u, y0 + 24 * u, "NotASprint · design analysis, not survey data", 10, { fill: C.dim, anchor: "end" }));
  }
  if (style === "presentation" || style === "analysis") {
    const fy = y0 + H - footer + 32 * u;
    parts.push(`<line x1="${f1(x0 + 24 * u)}" y1="${f1(y0 + H - footer)}" x2="${f1(x0 + W - 24 * u)}" y2="${f1(y0 + H - footer)}" stroke="${C.line}" stroke-width="${f1(u)}"/>`);
    parts.push(text(x0 + 24 * u, fy + 28 * u, c.name, 40, { font: F.display, weight: 600, upper: true, ls: 0.8 }));
    parts.push(text(x0 + 24 * u, fy + 50 * u, [c.location, series.name, c.custom ? "Generated concept" : "Reference-inspired layout"].filter(Boolean).join(" · "), 12, { fill: C.muted }));
    const heroes: [string, string, string][] = [[fmtKm(a.length), "km", "Length"], [fmtLap(a.lapTime), "", "Est. lap"], [String(a.turnCount), `${a.left}L ${a.right}R`, "Turns"], [String(a.topSpeed), "km/h", "Top speed"]];
    heroes.forEach(([v, unit, label], i) => {
      const hx = narrow ? x0 + 24 * u + i * 150 * u : x0 + W - 24 * u - (heroes.length - 1 - i) * 150 * u;
      parts.push(text(hx, fy + off + 30 * u, v, 34, { font: F.display, weight: 600, anchor: narrow ? "start" : "end" }));
      parts.push(text(hx, fy + off + 48 * u, `${label.toUpperCase()}${unit ? ` · ${unit}` : ""}`, 10, { fill: C.muted, anchor: narrow ? "start" : "end", ls: 0.8 }));
    });
    parts.push(text(x0 + W - 24 * u, y0 + H - 14 * u, "NotASprint · design analysis, not survey data", 10, { fill: C.dim, anchor: "end" }));
    if (style === "analysis") {
      const ay = fy + off + 90 * u;
      (Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[]).forEach((k, i) => {
        const sx = x0 + 24 * u + i * 130 * u;
        parts.push(text(sx, ay, SCORE_LABEL[k].toUpperCase(), 10, { fill: C.muted, ls: 0.8 }));
        parts.push(text(sx, ay + 30 * u, String(a.scores[k]), 30, { font: F.display, weight: 600 }));
        parts.push(`<rect x="${f1(sx)}" y="${f1(ay + 38 * u)}" width="${f1(100 * u)}" height="${f1(2 * u)}" fill="${C.line}"/><rect x="${f1(sx)}" y="${f1(ay + 38 * u)}" width="${f1(a.scores[k] * u)}" height="${f1(2 * u)}" fill="${C.fg}"/>`);
      });
      const tx = narrow ? x0 + 24 * u : x0 + W / 2 + 20 * u, ty = narrow ? ay + 70 * u : ay;
      a.sectors.forEach((s, i) => parts.push(text(tx, ty + i * 18 * u + 4 * u, `S${s.sector}  ${String(s.length).padStart(5)} m  ${String(s.turns).padStart(2)} t  ${String(s.avgSpeed).padStart(3)} km/h  ${s.character}`, 11, { fill: C.muted })));
      const opps = a.overtakingOpportunities.map((t) => `T${t.turn}${t.name ? ` ${t.name}` : ""} ${t.entrySpeed}→${t.apexSpeed}`).join(" · ");
      parts.push(text(tx, ty + 70 * u, `Strong braking zones: ${opps || "none"}`, 11, { fill: C.fg }));
      parts.push(text(tx, ty + 90 * u, `Longest straight ${a.longestStraight} m · track width ${c.trackWidth} m · ${series.name} vehicle model`, 11, { fill: C.dim }));
    }
  }
  return wrap(x0, y0, W, H, parts, c);
}

function wrap(x0: number, y0: number, W: number, H: number, parts: string[], c: Circuit) {
  const px = 2400, py = Math.round((px * H) / W);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(x0)} ${f1(y0)} ${f1(W)} ${f1(H)}" width="${px}" height="${py}">\n  <title>${esc(c.name)} — NotASprint</title>\n  ${parts.join("\n  ")}\n</svg>`;
}

/** Rasterise an SVG string in the browser. Resolves to a PNG blob at the SVG's declared pixel size. */
export function svgToPng(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG could not be rasterised")); };
    img.src = url;
  });
}
