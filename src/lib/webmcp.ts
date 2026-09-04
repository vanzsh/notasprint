// Registers the tool surface with the browser's WebMCP model context (Chrome 149+ / ChatGPT in-app browser).
import { tools, type Tool } from "./tools";
import { logCall, setAgent } from "./store";

/** Every call the browser's agent makes is recorded in the activity log with its outcome — real event data only. */
const logged = (t: Tool): Tool => ({
  ...t,
  execute: async (input) => {
    const started = Date.now();
    const out = await t.execute(input);
    let ok = true, summary: string | undefined;
    try { const o = JSON.parse(out); ok = o.ok !== false; summary = o.ok === false ? o.error : o.receipt; } catch { /* non-JSON body: a successful export */ }
    logCall(t.name, ok, started, summary);
    return out;
  },
});

type ModelContext = {
  registerTool: (tool: Tool & { execute: (input: Record<string, unknown>, ctx?: unknown) => Promise<string> }, opts?: { signal?: AbortSignal }) => void | Promise<void>;
  provideContext?: (ctx: { tools: Tool[] }) => void;
};

function modelContext(): ModelContext | undefined {
  const d = document as Document & { modelContext?: ModelContext };
  const n = navigator as Navigator & { modelContext?: ModelContext };
  return d.modelContext ?? n.modelContext;
}

/** Returns a cleanup function. Safe to call in a React effect. */
export function registerWebMCP() {
  const mc = modelContext();
  if (!mc) { setAgent("unavailable"); return () => {}; }
  const controller = new AbortController();
  try {
    // Aborting the signal unregisters; the returned promise then rejects with AbortError, which is expected.
    for (const t of tools) Promise.resolve(mc.registerTool(logged(t), { signal: controller.signal })).catch(() => {});
    setAgent("connected");
  } catch (e) {
    console.warn("WebMCP registration failed", e);
    setAgent("unavailable");
  }
  return () => controller.abort();
}
