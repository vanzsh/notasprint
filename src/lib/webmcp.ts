// Registers the tool surface with the browser's WebMCP model context (Chrome 149+ / ChatGPT in-app browser).
import { tools, type Tool } from "./tools";
import { setAgent } from "./store";

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
    for (const t of tools) Promise.resolve(mc.registerTool(t, { signal: controller.signal })).catch(() => {});
    setAgent("connected");
  } catch (e) {
    console.warn("WebMCP registration failed", e);
    setAgent("unavailable");
  }
  return () => controller.abort();
}
