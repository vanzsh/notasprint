// Browser check: launches local Chrome with WebMCP enabled, loads the app, and drives the real
// document.modelContext to make sure tools register and execute against the live UI.
// Usage: pnpm e2e [url]   (default http://localhost:3000)
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.argv[2] ?? "http://localhost:3000";
const port = 9333;
const chrome = spawn(CHROME, [`--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--enable-features=WebMCP", "--window-size=1600,1000", "--user-data-dir=/tmp/notasprint-e2e-profile", "about:blank"], { stdio: "ignore" });
const done = (code: number) => { chrome.kill(); process.exit(code); };
try {
  let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let i = 0; i < 50 && !targets.length; i++) {
    await new Promise((r) => setTimeout(r, 200));
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => []);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: { result?: { result: { value: unknown } }; error?: unknown }) => void>();
  const errors: string[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.method && m.params.type === "error") errors.push(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(" "));
  };
  const send = (method: string, params = {}) => new Promise<{ result?: { result: { value: unknown } }; error?: unknown }>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evalJS = async <T,>(expression: string) => {
    const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (m.error || !m.result) throw new Error(JSON.stringify(m.error ?? m));
    return m.result.result.value as T;
  };
  const shot = async (file: string) => {
    const m = await send("Page.captureScreenshot", { format: "png" }) as unknown as { result: { data: string } };
    writeFileSync(file, Buffer.from(m.result.data, "base64"));
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2500));
  if (await evalJS<boolean>("!!localStorage.getItem('notasprint.studio.v1')")) { await evalJS("localStorage.removeItem('notasprint.studio.v1'); 1"); await send("Page.reload"); await new Promise((r) => setTimeout(r, 2500)); }

  const names = await evalJS<string[]>("document.modelContext.getTools().then(ts => ts.map(t => t.name).sort())");
  console.log("registered tools:", names.join(", "));
  assert.ok(names.includes("get_circuit") && names.includes("reshape_sector") && names.includes("apply_design_inspiration"), "tools registered via WebMCP");
  assert.equal(await evalJS<string>("document.querySelector('.chip')?.textContent?.trim()"), "Agent connected");
  // Onboarding and inspiration UI are visible without any interaction; circuit annotations render in Oxanium.
  const text0 = await evalJS<string>("document.body.innerText");
  assert.ok(text0.includes("DESIGN LOOP") && text0.includes("INSPIRATION") && text0.includes("SIMULATE") && text0.includes("PROJECT") && text0.includes("FORMULA 1") && text0.includes("Reference"), "design loop, inspiration and the circuit switcher visible");
  assert.match(await evalJS<string>("getComputedStyle(document.querySelector('.turn-handle text')).fontFamily"), /Oxanium/, "turn numbers use Oxanium");
  assert.doesNotMatch(await evalJS<string>("getComputedStyle(document.body).fontFamily"), /Oxanium/, "product UI keeps Geist");

  const before = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'get_circuit'), '{}'))`));
  assert.equal(before.design_inspirations?.length, 3, "get_circuit lists the three design inspirations");
  const res = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'reshape_sector'), JSON.stringify({ sector: 3, intent: 'faster', reason: 'Faster Sector 3' })))`));
  assert.equal(res.ok, true);
  assert.ok(res.state.sectors[2].avg_speed_kmh > before.sectors[2].avg_speed_kmh, "sector 3 got faster in the live UI");
  await new Promise((r) => setTimeout(r, 300));
  const activity = await evalJS<string>("document.body.innerText.includes('WEBMCP') && document.body.innerText.includes('reshape_sector') && document.body.innerText.includes('Faster Sector 3')");
  assert.ok(activity, "agent receipt visible in the panel");
  console.log("receipt:", res.receipt);

  // Human: drag Turn 7 with the mouse, lock it with L.
  const handle = await evalJS<{ x: number; y: number }>(`(() => { const r = document.querySelectorAll('.turn-handle')[6].querySelector('circle').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const mouse = (type: string, x: number, y: number) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mouseReleased" ? 0 : 1 });
  await mouse("mousePressed", handle.x, handle.y);
  for (let k = 1; k <= 8; k++) await mouse("mouseMoved", handle.x + k * 6, handle.y - k * 5);
  await mouse("mouseReleased", handle.x + 48, handle.y - 40);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "l", code: "KeyL", text: "l" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "l", code: "KeyL" });
  await new Promise((r) => setTimeout(r, 300));
  const moved = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'get_circuit'), '{}'))`));
  const t7 = moved.turns[6];
  assert.deepEqual(moved.locked_turns, [7], "T7 locked via keyboard");
  assert.notDeepEqual([t7.x, t7.y], [before.turns[6].x, before.turns[6].y], "T7 moved by drag");
  assert.ok((await evalJS<string>("document.body.innerText")).includes("TURN 7"), "panel shows the Turn 7 inspector");

  // Agent: make Sector 2 more technical around the locked turn.
  const res2 = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'reshape_sector'), JSON.stringify({ sector: 2, intent: 'more_technical', reason: 'Technical Sector 2 around your Turn 7' })))`));
  assert.equal(res2.ok, true, res2.error);
  const kept = res2.state.turns.find((t: { locked?: boolean }) => t.locked);
  assert.deepEqual([kept.x, kept.y, kept.radius_m], [t7.x, t7.y, t7.radius_m], "locked T7 preserved");
  assert.ok(res2.state.turn_count > moved.turn_count, "sector 2 gained turns");
  const lockedNo = res2.state.turns.indexOf(kept) + 1;
  const denied = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'edit_turns'), JSON.stringify({ edits: [{ turn: ${lockedNo}, radius: 10 }] })))`));
  assert.equal(denied.ok, false, "agent cannot edit the locked turn");
  console.log("receipt:", res2.receipt);

  // Agent: design inspiration on Sector 3 via a reference alias, still around the locked turn.
  const res3 = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'reshape_sector'), JSON.stringify({ sector: 3, inspiration: 'Suzuka-style', reason: 'Flowing Sector 3' })))`));
  assert.equal(res3.ok, true, res3.error);
  const kept3 = res3.state.turns.find((t: { locked?: boolean }) => t.locked);
  assert.deepEqual([kept3.x, kept3.y, kept3.radius_m], [t7.x, t7.y, t7.radius_m], "locked T7 preserved through inspiration");
  assert.ok(res3.state.scores.flow > res2.state.scores.flow, "sector 3 gained flow in the live UI");
  await new Promise((r) => setTimeout(r, 300));
  assert.ok((await evalJS<string>("document.body.innerText")).includes("Flowing Sector 3"), "inspiration receipt visible in the panel");
  console.log("receipt:", res3.receipt);

  // Design brief via the agent; status visible to the designer, including the locked turn to preserve.
  const brief = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'set_design_brief'), JSON.stringify({ max_length_m: 5800, min_overtaking_zones: 3, preserve_turns: [${lockedNo}] })))`));
  assert.ok(brief.ok && brief.design_brief.active && brief.design_brief.status.length === 3, "brief set through WebMCP");
  await new Promise((r) => setTimeout(r, 300));
  const briefText = await evalJS<string>("document.body.innerText");
  assert.ok(briefText.includes("DESIGN BRIEF") && /PASS|FAIL|NEAR LIMIT/.test(briefText) && briefText.includes(`T${lockedNo} · PASS`), "brief statuses and the preserved locked turn render in the panel");

  // Simulation: cars appear on the live circuit, findings in the panel, a stale flag after the next geometry change.
  const sim = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'run_simulation'), JSON.stringify({ seed: 2 })))`));
  assert.ok(sim.ok && sim.simulation.findings.length > 0 && !("frames" in sim.simulation), "run_simulation returns compact findings");
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(await evalJS<number>("document.querySelectorAll('.sim-car').length"), 12, "12 simulated cars drawn on the canvas");
  const simText = await evalJS<string>("document.body.innerText");
  assert.ok(simText.includes("SIM LAP") && simText.includes("held up") && simText.includes(sim.simulation.findings[0].text.slice(0, 40)), "simulation telemetry and findings visible");
  const res4 = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'apply_design_move'), JSON.stringify({ move: 'open_turn', turn: 2, reason: 'Open Turn 2' })))`));
  assert.ok(res4.ok && res4.simulation_stale === true && res4.design_brief, "write receipts flag the stale simulation and carry the brief");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await evalJS<number>("document.querySelectorAll('.sim-car').length"), 0, "cars leave the canvas once the geometry no longer matches the run");

  // Versions: save via the agent, compare overlays on the canvas, restore is undoable.
  const saved = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'design_versions'), JSON.stringify({ action: 'save', name: 'E2E milestone' })))`));
  assert.equal(saved.version?.id, "v1");
  const cmp = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'design_versions'), JSON.stringify({ action: 'compare', version_id: 'v1' })))`));
  assert.ok(cmp.ok && cmp.comparison.rows.length > 5, "compare returns metric rows");
  await new Promise((r) => setTimeout(r, 300));
  const verText = await evalJS<string>("document.body.innerText");
  assert.ok(verText.includes("SNAPSHOTS") && verText.includes("E2E milestone") && verText.includes("CURRENT ▬"), "version list and canvas overlay legend visible");
  // Reference Library through the real UI: open, switch to MotoGP, see three references, create a custom concept.
  const clickText = async (sel: string, text: string) => {
    const p = await evalJS<{ x: number; y: number } | null>(`(() => { const el = [...document.querySelectorAll('${sel}')].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(p, `${text} clickable`);
    await mouse("mousePressed", p!.x, p!.y); await mouse("mouseReleased", p!.x, p!.y); await new Promise((r) => setTimeout(r, 350));
  };
  assert.match(await evalJS<string>("document.body.innerText"), /WEBMCP[\s\S]*#[0-9A-F]{4}/, "activity shows a WebMCP call with a local event id");
  await clickText("aside button[aria-haspopup=dialog]", "Formula 1");
  assert.equal(await evalJS<string>("document.querySelector('[data-slot=dialog-title]')?.textContent"), "Reference Library", "library opens");
  await clickText("[data-slot=tabs-trigger]", "MotoGP");
  await new Promise((r) => setTimeout(r, 600));
  const libText = await evalJS<string>("document.querySelector('[data-slot=dialog-content]').innerText");
  for (const n of ["Autodromo Internazionale del Mugello", "TT Circuit Assen", "Phillip Island Grand Prix Circuit", "Create custom", "Not affiliated with or endorsed"]) assert.ok(libText.toUpperCase().includes(n.toUpperCase()), `${n} shown`);
  assert.equal(await evalJS<number>("[...document.querySelectorAll('[data-slot=dialog-content] img')].filter(i => i.complete && i.naturalWidth > 0).length"), 3, "three series logos load");
  await clickText("[data-slot=dialog-content] button", "Create custom");
  const custom = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'get_circuit'), '{}'))`));
  assert.ok(custom.motorsport.id === "motogp" && custom.reference.kind === "custom" && custom.turn_count >= 6, "a custom MotoGP concept is the live circuit");
  assert.equal(await evalJS<unknown>("document.querySelector('[data-slot=dialog-content]')"), null, "library closes after picking");
  assert.ok((await evalJS<string>("document.body.innerText")).includes("MotoGP"), "panel shows the motorsport");
  const sim2 = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'run_simulation'), JSON.stringify({ seed: 2, cars: 8 })))`));
  assert.ok(sim2.ok && sim2.simulation.findings.length > 0, "simulation runs on the generated circuit");
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await evalJS<number>("document.querySelectorAll('.sim-car').length"), 8, "8 bikes drawn");
  assert.ok((await evalJS<string>("document.body.innerText")).includes("8 BIKES"), "canvas telemetry says bikes");
  await evalJS("localStorage.removeItem('notasprint.studio.v1'); 1");
  await shot("/tmp/notasprint-e2e.png");
  assert.deepEqual(errors, [], "no browser errors");
  console.log("OK — no console errors, screenshot at /tmp/notasprint-e2e.png");
  done(0);
} catch (e) {
  console.error(e);
  done(1);
}
