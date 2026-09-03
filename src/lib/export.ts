import { startFinish, type Analysis, type Circuit, type Geometry } from "./circuit";

export const exportJSON = (c: Circuit, a: Analysis) =>
  JSON.stringify({
    format: "notasprint.circuit/1", units: "metres", exported_at: new Date().toISOString(),
    circuit: c,
    analysis: { length_m: Math.round(a.length), lap_time_s: Math.round(a.lapTime * 10) / 10, scores: a.scores, sectors: a.sectors, turns: a.turns, warnings: a.warnings },
  }, null, 2);

export function exportSVG(c: Circuit, g: Geometry) {
  const pad = 120;
  const { minX, minY, maxX, maxY } = g.bounds;
  const sf = startFinish(g);
  const labels = c.turns.map((t, i) => `<text x="${(t.x + 10).toFixed(1)}" y="${(t.y - 10).toFixed(1)}" font-family="ui-monospace, monospace" font-size="16" fill="#F2F0EB">${i + 1}${t.name ? ` ${t.name}` : ""}</text>`).join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}">
  <title>${c.name} — NotASprint</title>
  <rect x="${minX - pad}" y="${minY - pad}" width="${maxX - minX + 2 * pad}" height="${maxY - minY + 2 * pad}" fill="#0A0A0A"/>
  <path d="${g.path}" fill="none" stroke="#2A2A2A" stroke-width="${c.trackWidth}" stroke-linejoin="round"/>
  <path d="${g.path}" fill="none" stroke="#D9D6CF" stroke-width="0.8" opacity="0.7"/>
  <line x1="${(sf.x - sf.nx * c.trackWidth * 0.6).toFixed(1)}" y1="${(sf.y - sf.ny * c.trackWidth * 0.6).toFixed(1)}" x2="${(sf.x + sf.nx * c.trackWidth * 0.6).toFixed(1)}" y2="${(sf.y + sf.ny * c.trackWidth * 0.6).toFixed(1)}" stroke="#F2F0EB" stroke-width="3"/>
  <g>
    ${labels}
  </g>
</svg>`;
}
