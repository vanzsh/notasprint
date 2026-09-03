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
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } };
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
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2500));

  const names = await evalJS<string[]>("document.modelContext.getTools().then(ts => ts.map(t => t.name).sort())");
  console.log("registered tools:", names.join(", "));
  assert.ok(names.includes("get_circuit") && names.includes("reshape_sector"), "tools registered via WebMCP");
  assert.equal(await evalJS<string>("document.querySelector('.chip')?.textContent?.trim()"), "Agent connected");

  const before = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'get_circuit'), '{}'))`));
  const res = JSON.parse(await evalJS<string>(`document.modelContext.getTools().then(ts => document.modelContext.executeTool(ts.find(t => t.name === 'reshape_sector'), JSON.stringify({ sector: 3, intent: 'faster', reason: 'Faster Sector 3' })))`));
  assert.equal(res.ok, true);
  assert.ok(res.state.sectors[2].avg_speed_kmh > before.sectors[2].avg_speed_kmh, "sector 3 got faster in the live UI");
  await new Promise((r) => setTimeout(r, 300));
  const activity = await evalJS<string>("document.body.innerText.includes('AGENT') && document.body.innerText.includes('Faster Sector 3')");
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
  await shot("/tmp/notasprint-e2e.png");
  console.log("OK — screenshot at /tmp/notasprint-e2e.png");
  done(0);
} catch (e) {
  console.error(e);
  done(1);
}
