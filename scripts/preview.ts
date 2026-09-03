// Dev helper: prints analysis for every reference circuit and writes /tmp/notasprint-<id>.svg previews.
import { writeFileSync } from "node:fs";
import { analyze, buildGeometry, fmtKm, fmtLap, startFinish } from "../src/lib/circuit";
import { CIRCUITS } from "../src/lib/circuits";

for (const c of CIRCUITS) {
  const g = buildGeometry(c.turns);
  const a = analyze(c, g);
  console.log(`\n== ${c.name}  ${fmtKm(a.length)} km  lap ${fmtLap(a.lapTime)}  top ${a.topSpeed}  straight ${a.longestStraight} m  turns ${a.turnCount} (${a.left}L/${a.right}R)  x${a.crossings}`);
  console.log(`   scores`, a.scores, ` opps: ${a.overtakingOpportunities.map((t) => `T${t.turn}(${t.overtaking})`).join(" ")}`);
  console.log(`   sectors`, a.sectors.map((s) => `S${s.sector} ${s.length}m ${s.turns}t ${s.avgSpeed}km/h ${s.character}`).join(" | "));
  for (const t of a.turns) console.log(`   T${String(t.turn).padStart(2)} ${t.direction} ${String(t.angle).padStart(3)}° r${String(t.radius).padStart(3)} apex ${String(t.apexSpeed).padStart(3)} entry ${String(t.entrySpeed).padStart(3)} drop ${String(t.brakingDrop).padStart(3)} appr ${String(t.approach).padStart(4)} ${t.type.padEnd(7)} ot ${t.overtaking} ${t.name ?? ""}`);
  for (const w of a.warnings) console.log(`   ! ${w}`);
  const pad = 120;
  const { minX, minY, maxX, maxY } = g.bounds;
  const sf = startFinish(g);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}" width="1200" style="background:#0a0a0a">
  <path d="${g.path}" fill="none" stroke="#2a2a2a" stroke-width="${c.trackWidth}" stroke-linejoin="round"/>
  <path d="${g.path}" fill="none" stroke="#d9d6cf" stroke-width="0.8" opacity=".7"/>
  <line x1="${sf.x - sf.nx * 10}" y1="${sf.y - sf.ny * 10}" x2="${sf.x + sf.nx * 10}" y2="${sf.y + sf.ny * 10}" stroke="#f2f0eb" stroke-width="3"/>
  ${c.turns.map((t, i) => `<circle cx="${t.x}" cy="${t.y}" r="4" fill="#0a0a0a" stroke="#f2f0eb" stroke-width="1.5"/><text x="${t.x + 8}" y="${t.y - 8}" fill="#f2f0eb" font-size="18" font-family="monospace">${i + 1}${a.turns[i].overtaking >= 65 ? " ▸" : ""}</text>`).join("")}
</svg>`;
  writeFileSync(`/tmp/notasprint-${c.id}.svg`, svg);
}
