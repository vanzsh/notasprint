"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, ChevronDown, ChevronRight, Download, Lock, LockOpen, Plus, Presentation, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { ARCHETYPES, archetypeById, type ArchetypeId } from "@/lib/archetypes";
import { fingerprint, fmtKm, fmtLap, type Analysis, type Circuit } from "@/lib/circuit";
import { evaluateBrief, isBriefEmpty } from "@/lib/constraints";
import { applyInspiration, deleteTurn, editTurns, insertTurns, setLocks, type InspirationScope } from "@/lib/moves";
import { seriesById } from "@/lib/series";
import { commit, getState, loadCustom, preview, resetCircuit, SCORE_LABEL, select, undo, useStore, type Receipt } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Brief } from "./Brief";
import { SERIES_LOGO } from "./ReferenceLibrary";
import { Simulation } from "./Simulation";
import { Versions } from "./Versions";

// Short definitions for the motorsport vocabulary; shown on hover so labels can stay terse.
const TIP: Record<string, string> = {
  Overtaking: "Heavy braking after a long approach. A turn scoring ≥70 counts as a strong opportunity.",
  Flow: "How smoothly speed carries from corner to corner: linked radii, few stop-go moments.",
  Technical: "Corner density and the precision the sequence demands.",
  "High-speed": "Share of the lap spent at high speed: long straights and open radii.",
  Length: "Centreline lap distance.",
  "Est. lap": "Lap time from the point-mass speed profile.",
  Turns: "Real corners; kinks are not counted.",
  "Top speed": "Peak speed on the lap, reached at the end of the longest run.",
  "Max straight": "Longest full-throttle run between corners.",
  "Track width": "Asphalt width. Wider tracks allow more lines through a corner.",
  Apex: "Minimum speed through the corner.",
  Entry: "Speed at the end of the approach, before braking.",
  Approach: "Straight length before the corner. Longer approaches make stronger braking zones.",
  Braking: "Speed lost from entry to apex.",
  Radius: "Corner radius. Smaller is tighter and slower.",
  Sectors: "Three timing sectors, S/F starts S1.",
  Character: "Sector character from average speed, slow corners and corner density.",
};

export function Panel({ onLibrary, onExport, onPresent }: { onLibrary: () => void; onExport: () => void; onPresent: () => void }) {
  const { circuit, analysis: a, selected, events, brief, simulation, versions, compare } = useStore((s) => s);
  const selIdx = circuit.turns.findIndex((t) => t.id === selected);
  const turn = selIdx >= 0 ? circuit.turns[selIdx] : null;
  const ta = selIdx >= 0 ? a.turns[selIdx] : null;
  const example = archetypeById(circuit.inspiration ?? "")?.name;
  const series = seriesById(circuit.series);
  const report = evaluateBrief(brief, circuit, a);
  const simStale = simulation ? simulation.fingerprint !== fingerprint(circuit) : false;
  const scoreKeys = Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[];
  const canReset = useStore((s) => s.circuit !== s.origin);
  const [confirmReset, setConfirmReset] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  return (
    <aside ref={asideRef} className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      <div className="relative min-h-0 flex-1">
      <ScrollArea className="h-full">
        <Section label="Circuit" summary={`${series.short} · ${fmtKm(a.length)} km · ${a.turnCount} turns`} defaultOpen>
          {/* The circuit identity is the switcher: one raised control, click to open the Reference Library. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onLibrary} aria-haspopup="dialog" className="group -mx-1 flex w-[calc(100%+8px)] flex-col gap-1.5 rounded-sm border border-line bg-surface-2 px-3 py-2.5 text-left outline-none transition-[border-color,transform,background-color] duration-120 ease-out hover:-translate-y-px hover:border-line-strong hover:bg-[#1b1b1b] focus-visible:border-fg-muted active:translate-y-0">
                <span className="flex w-full items-center gap-2">
                  <Image src={SERIES_LOGO[circuit.series]} alt="" width={16} height={16} unoptimized className="size-4 rounded-[2px] object-contain" />
                  <span className="label text-fg-muted transition-colors duration-120 group-hover:text-fg">{series.name}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-fg-dim transition-colors duration-120 group-hover:text-fg">Change<ArrowLeftRight className="size-3.5" /></span>
                </span>
                <span className="display block min-w-0 text-[26px] leading-none text-fg">{circuit.name}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Open the Reference Library: three layouts per motorsport, or a new custom concept.</TooltipContent>
          </Tooltip>
          <div className="mt-2.5 text-[12px] leading-snug text-fg-muted">{circuit.tagline}</div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-fg-dim">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help truncate">
                  {circuit.custom !== undefined ? <>Generated concept · <span className="mono">seed {circuit.custom}</span></> : circuit.location ? <>{circuit.location} · Reference</> : "NotASprint original"}{example ? ` · ${example} example` : ""}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">Scores, warnings and the simulation use the {series.name} vehicle model: {Math.round(series.vehicle.vMax * 3.6)} km/h, {(series.vehicle.aLat / 9.81).toFixed(1)} g lateral. Reference layouts are schematic starting points; design inspirations are characteristics applied to the live circuit.</TooltipContent>
            </Tooltip>
            {circuit.custom !== undefined && (
              <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={() => loadCustom(circuit.series)} aria-label="Create another concept"><RefreshCw /></Button></TooltipTrigger>
                <TooltipContent side="left">Create another {series.name} concept. The agent can reproduce this one from its seed.</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="mt-3 flex items-end gap-6">
            <Hero value={fmtKm(a.length)} unit="km" label="Length" />
            <Hero value={fmtLap(a.lapTime)} unit="" label="Est. lap" />
            <Hero value={String(a.turnCount)} unit={`${a.left}L ${a.right}R`} label="Turns" />
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-x-4 border-t border-line pt-2">
            <Metric k="Top speed" v={a.topSpeed} unit="km/h" />
            <Metric k="Max straight" v={a.longestStraight} unit="m" />
            <Metric k="Track width" v={circuit.trackWidth} unit="m" />
          </div>
        </Section>

        <Section label="Design scores" summary={scoreKeys.map((k) => a.scores[k]).join(" · ")} defaultOpen>
          <div className="grid grid-cols-4 gap-3">
            {scoreKeys.map((k) => <Score key={k} label={SCORE_LABEL[k]} value={a.scores[k]} />)}
          </div>
        </Section>

        <Section key={selected ?? "loop"} label={turn ? `Turn ${selIdx + 1}` : "Design loop"} summary={ta ? `${ta.type} ${ta.direction} · ${Math.round(turn!.radius)} m` : undefined} flag={turn?.locked ? "locked" : undefined} defaultOpen>
          {turn ? <Inspector key={selected} i={selIdx} /> : <DesignLoop />}
        </Section>

        <Section label="Sectors" summary={a.sectors.map((s) => s.character).join(" · ")}>
          <table className="mono w-full text-[11px]">
            <thead>
              <tr className="label text-[10px]">
                <th className="pb-1 text-left font-normal">Sector</th>
                <th className="pb-1 text-left font-normal"><Term label="Character" /></th>
                <th className="pb-1 text-right font-normal">Turns</th>
                <th className="pb-1 text-right font-normal">Length</th>
                <th className="pb-1 text-right font-normal">Avg</th>
              </tr>
            </thead>
            <tbody>
              {a.sectors.map((s) => (
                <tr key={s.sector} className="border-t border-line">
                  <td className="display py-1 text-[15px] leading-none text-fg">S{s.sector}</td>
                  <td className="py-1 font-sans text-[12px] text-fg-muted">{s.character}</td>
                  <td className="py-1 text-right text-fg-muted">{s.turns}</td>
                  <td className="py-1 text-right text-fg-muted">{s.length} <span className="text-fg-dim">m</span></td>
                  <td className="py-1 text-right text-fg">{s.avgSpeed} <span className="text-fg-dim">km/h</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section label="Overtaking" summary={`${a.overtakingOpportunities.length} strong`}>
          {a.overtakingOpportunities.length === 0 && <div className="text-[12px] text-fg-dim">No strong braking zone yet. A heavy stop after a long straight creates one.</div>}
          {a.overtakingOpportunities.map((t) => (
            <button key={t.id} onClick={() => select(t.id)} className={cn("-mx-2 flex h-6 w-[calc(100%+16px)] items-center justify-between gap-2 rounded-sm px-2 text-left text-[12px] hover:bg-surface-2", t.id === selected && "bg-surface-2")}>
              <span className="text-fg"><span className="text-accent">▸</span> <span className="mono text-[11px]">T{t.turn}</span>{t.name ? <span className="text-fg-muted"> {t.name}</span> : null}</span>
              <span className="mono text-[11px] text-fg-muted">{t.entrySpeed}<span className="text-fg-dim">→</span>{t.apexSpeed} <span className="text-fg-dim">km/h</span> · {t.approach} <span className="text-fg-dim">m</span></span>
            </button>
          ))}
        </Section>

        <Section label="Speed trace" summary={`${a.topSpeed} km/h max`}>
          <SpeedTrace a={a} />
        </Section>

        <Section label="Design inspiration" summary="3 characters">
          <Inspiration />
        </Section>

        <Section label="Design brief" summary={isBriefEmpty(brief) ? "No constraints" : `${report.passed}/${report.active} pass`} flag={report.failed.length ? `${report.failed.length} failing` : undefined} autoOpen={!isBriefEmpty(brief)}>
          <Brief />
        </Section>

        <Section label="Simulation" summary={simulation ? `${simulation.totals.congestion} held up · ${simulation.totals.overtakes} passes` : "Not run"} flag={simStale ? "stale" : undefined} autoOpen={!!simulation}>
          <Simulation />
        </Section>

        <Section label="Versions" summary={versions.length ? (compare ? `Comparing ${compare.toUpperCase()}` : `${versions.length} saved`) : "None"} autoOpen={versions.length > 0}>
          <Versions />
        </Section>

        {a.warnings.length > 0 && (
          <Section label="Geometry warnings" flag={`${a.warnings.length} warning${a.warnings.length === 1 ? "" : "s"}`}>
            {a.warnings.map((w, i) => <div key={i} className="py-0.5 text-[12px] text-fg-muted before:mr-2 before:text-accent before:content-['!']">{w}</div>)}
          </Section>
        )}

        <Section label="Workspace" summary="Export · Present · Reset">
          <div className="grid grid-cols-3 gap-1">
            <Button onClick={onExport} aria-haspopup="dialog"><Download />Export</Button>
            <Button onClick={onPresent}><Presentation />Present</Button>
            <Button onClick={() => setConfirmReset(true)} disabled={!canReset} aria-haspopup="dialog"><RotateCcw />Reset</Button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-fg-dim">Export drawings and data, show the circuit full screen, or return this circuit to the layout it was loaded or generated with.</p>
        </Section>
      </ScrollArea>
      <MoreBelow root={asideRef} />
      </div>

      <div className="border-t border-line px-4 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="label">Activity</span>
          {events.length > 0 && <Button variant="link" className="text-[11px]" onClick={() => undo()}>Undo last change</Button>}
        </div>
        {events.length ? (
          <div className="space-y-1.5">{events.slice(0, 3).map((e, i) => <Event key={e.id} e={e} latest={i === 0} />)}</div>
        ) : (
          <div className="text-[12px] text-fg-dim">No changes yet. Agent tool calls and your edits are recorded here · <kbd className="mono text-fg-muted">⌘Z</kbd> undo</div>
        )}
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="max-w-[420px]" showCloseButton={false}>
          <DialogHeader className="flex-col gap-1.5">
            <DialogTitle>Reset circuit?</DialogTitle>
            <DialogDescription>This discards the changes made to {circuit.name} and restores the layout it was {circuit.custom !== undefined ? "generated" : "loaded"} with. The reset itself can be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-end">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { resetCircuit(); setConfirmReset(false); }}>Reset circuit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

/** One activity record. WebMCP calls show the tool, its outcome, the time and a local event id — real data only. */
function Event({ e, latest }: { e: Receipt; latest: boolean }) {
  const time = new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const agent = e.source === "agent";
  const headline = e.tool ? e.tool : (e.label ?? e.text);
  const detail = e.tool ? [e.label, e.text].filter(Boolean).join(" · ") : e.label ? e.text : "";
  return (
    <div className={cn("text-[11px]", latest ? "text-fg-muted" : "text-fg-dim")}>
      <div className="flex items-baseline gap-2">
        <span className={cn("label shrink-0 text-[10px]", agent ? (latest ? "text-fg" : "text-fg-muted") : "text-fg-dim")}>{agent ? "WebMCP" : "You"}</span>
        <span className={cn("min-w-0 flex-1 truncate", e.tool && "mono", latest ? "text-fg" : "text-fg-muted", latest && "tick")} title={headline}>{headline}</span>
        {e.tool && <span className={cn("label shrink-0 text-[10px]", e.ok ? "text-fg-muted" : "text-accent")}>{e.ok ? "success" : "refused"}</span>}
        <span className="mono shrink-0 text-[10px] text-fg-dim">{time}</span>
        <span className="mono shrink-0 text-[10px] text-fg-dim">{e.id}</span>
      </div>
      {detail && <div className="mt-0.5 truncate pl-[calc(6ch+8px)]" title={detail}>{detail}</div>}
    </div>
  );
}

/**
 * Sticky bottom indicator for the scrolling rail: a soft fade and a chevron whenever content sits below the fold. If a
 * flagged section (failing brief, stale simulation, geometry warnings) is out of view, it turns into a red count and the
 * click jumps to the first one; otherwise it scrolls on by most of a viewport.
 */
function MoreBelow({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const [state, setState] = useState<{ more: boolean; flags: number }>({ more: false, flags: 0 });
  const vp = () => root.current?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]") ?? null;
  const hiddenFlags = () => { const v = vp(); if (!v) return []; const bottom = v.getBoundingClientRect().bottom; return [...v.querySelectorAll<HTMLElement>("[data-flag]")].filter((el) => el.getBoundingClientRect().top > bottom - 12); };
  const measure = () => {
    const v = vp();
    if (!v) return;
    const next = { more: v.scrollTop + v.clientHeight < v.scrollHeight - 8, flags: hiddenFlags().length };
    setState((s) => (s.more === next.more && s.flags === next.flags ? s : next));
  };
  useEffect(() => {
    const v = vp();
    if (!v) return;
    const raf = requestAnimationFrame(measure);
    v.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(v); if (v.firstElementChild) ro.observe(v.firstElementChild);
    const mo = new MutationObserver(measure);
    mo.observe(v, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "data-flag"] });
    return () => { cancelAnimationFrame(raf); v.removeEventListener("scroll", measure); ro.disconnect(); mo.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measures the DOM; re-subscribing per render is unnecessary
  }, []);
  if (!state.more) return null;
  const go = () => {
    const v = vp(), target = hiddenFlags()[0];
    if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
    else v?.scrollBy({ top: v.clientHeight * 0.75, behavior: "smooth" });
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-surface to-transparent pb-1.5">
      <button onClick={go} className={cn("pointer-events-auto inline-flex h-6 items-center gap-1 rounded-sm border bg-surface px-1.5 text-[11px] outline-none transition-colors duration-120 hover:border-line-strong hover:text-fg focus-visible:border-fg-muted", state.flags ? "border-accent/60 text-accent hover:border-accent" : "border-line text-fg-muted")} aria-label={state.flags ? `${state.flags} item${state.flags === 1 ? " below needs" : "s below need"} attention` : "More below"}>
        <ChevronDown className="size-3.5" />
        {state.flags > 0 && <span className="mono pr-0.5 text-[10px]">{state.flags === 1 ? "!" : state.flags}</span>}
      </button>
    </div>
  );
}

function Inspector({ i }: { i: number }) {
  const circuit = useStore((s) => s.circuit);
  const ta = useStore((s) => s.analysis.turns[i]);
  const t = circuit.turns[i];
  const [name, setName] = useState(t.name ?? "");
  // Slider: live preview while scrubbing, one history entry on release.
  const base = useRef<Circuit | null>(null);
  const begin = () => { base.current ??= getState().circuit; };
  const end = () => {
    if (!base.current) return;
    const cur = getState().circuit;
    preview(base.current);
    base.current = null;
    commit(cur, { source: "human", changed: [t.id] });
  };
  if (!t) return null;
  const toggleLock = () => commit(setLocks(circuit, [i + 1], !t.locked).circuit, { source: "human", label: t.locked ? `Unlocked T${i + 1}` : `Locked T${i + 1}` });
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="display text-[15px] leading-none text-fg">{ta.type} · {ta.direction === "L" ? "Left" : "Right"} {ta.angle}°</div>
        <span className="text-[11px] text-fg-muted">S{t.sector} · <span className="mono">{Math.round(t.x)}, {Math.round(t.y)}</span></span>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 border-y border-line py-2">
        <Metric k="Apex" v={ta.apexSpeed} unit="km/h" />
        <Metric k="Entry" v={ta.entrySpeed} unit="km/h" />
        <Metric k="Approach" v={ta.approach} unit="m" />
        <Metric k="Braking" v={`−${ta.brakingDrop}`} unit="km/h" />
        <Metric k="Overtaking" v={ta.overtaking} unit="/100" strong={ta.overtaking >= 70} />
        <Metric k="Radius" v={ta.radius} unit="m" />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <Term label="Radius" className="label" />
          <span className="mono text-[12px]">{Math.round(t.radius)} <span className="text-fg-dim">m{ta.radius < Math.round(t.radius) - 3 ? ` · fits ${ta.radius}` : ""}</span></span>
        </div>
        <Slider min={8} max={320} step={1} value={[Math.round(t.radius)]} disabled={t.locked} aria-label="Corner radius"
          onPointerDown={begin} onKeyDown={begin} onValueCommit={end}
          onValueChange={([v]) => { begin(); preview(editTurns(getState().circuit, [{ turn: i + 1, radius: v }]).circuit); }} />
      </div>
      <div>
        <div className="label mb-1">Name</div>
        <Input value={name} disabled={t.locked} placeholder="Unnamed" aria-label="Turn name" onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (t.name ?? "") && commit(editTurns(circuit, [{ turn: i + 1, name }]).circuit, { source: "human", changed: [t.id] })} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button data-on={t.locked} onClick={toggleLock} aria-pressed={t.locked}>{t.locked ? <Lock /> : <LockOpen />}{t.locked ? "Locked" : "Lock"} <kbd className="mono text-[10px]">L</kbd></Button>
          </TooltipTrigger>
          <TooltipContent>{t.locked ? "No tool can move, resize or delete this turn." : "Keep this turn exactly where it is; the agent designs around it."}</TooltipContent>
        </Tooltip>
        <Button onClick={() => { const r = insertTurns(circuit, i, [midpoint(circuit, i)]); commit(r.circuit, { source: "human", changed: r.changed }); select(r.changed[0]); }}><Plus />Add turn after</Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Remove turn" disabled={t.locked || circuit.turns.length <= 4} onClick={() => { commit(deleteTurn(circuit, i).circuit, { source: "human", label: `Removed T${i + 1}` }); select(null); }}><Trash2 /></Button>
          </TooltipTrigger>
          <TooltipContent>{t.locked ? "Unlock the turn to remove it." : circuit.turns.length <= 4 ? "A circuit keeps at least four turns." : <>Remove turn <kbd>⌫</kbd></>}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// Onboarding lives in the empty selection state: exactly when a new user needs it, gone once they click a turn.
function DesignLoop() {
  const agent = useStore((s) => s.agent);
  return (
    <div className="space-y-1.5">
      <div className="display text-[15px] text-fg">Drag → Lock → Ask agent → Continue</div>
      <ol className="space-y-0.5 text-[12px] leading-snug text-fg-muted [&_kbd]:mono [&_kbd]:text-fg">
        <li><span className="text-fg">Drag</span> to move · click to inspect · double-click to add</li>
        <li><kbd>L</kbd> locks a turn — no tool can move or delete it</li>
        <li><span className="text-fg">Ask</span> the agent — it edits this live circuit, not a copy</li>
        <li><kbd>⌘Z</kbd> undo · <kbd>⇧⌘Z</kbd> redo</li>
      </ol>
      <div className="text-[12px] text-fg-dim">
        {agent === "connected" ? "Agent connected · tool calls edit this circuit" : agent === "unavailable" ? <>No WebMCP agent detected · use the ChatGPT desktop browser or Chrome 149+ with <span className="mono">chrome://flags/#enable-webmcp-testing</span></> : "Checking for a WebMCP agent"}
      </div>
    </div>
  );
}

// The three design archetypes. Applying one here runs the same engine function the agent's tools use.
function Inspiration() {
  const [open, setOpen] = useState<ArchetypeId | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const apply = (id: ArchetypeId, scope: InspirationScope) => {
    try {
      const r = applyInspiration(getState().circuit, id, scope);
      commit(r.circuit, { source: "human", changed: r.changed, label: `${archetypeById(id)!.name} · ${scope === "circuit" ? "circuit" : `S${scope}`}` });
      setNote(null);
    } catch (e) { setNote((e as Error).message); }
  };
  return (
    <div>
      {ARCHETYPES.map((a, k) => {
        const isOpen = open === a.id;
        return (
          <Collapsible key={a.id} open={isOpen} onOpenChange={(o) => setOpen(o ? a.id : null)} className={k ? "border-t border-line" : ""}>
            <CollapsibleTrigger className="group block w-full py-2 text-left">
              <div className={cn("display text-[15px] leading-none transition-colors duration-120 group-hover:text-fg", isOpen ? "text-fg" : "text-fg-muted")}>{a.name}</div>
              <div className={cn("mt-1 text-[12px]", isOpen ? "leading-relaxed text-fg-muted" : "text-fg-dim")}>{isOpen ? a.traits.join(" · ") : a.summary}</div>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapse-down data-[state=closed]:animate-collapse-up">
              <div className="space-y-2 pb-3">
                <div className="text-[12px] text-fg-muted">Ask the agent <span className="text-fg">“{a.examplePrompt}”</span></div>
                <div className="flex items-center gap-1">
                  <span className="label mr-1">Apply to</span>
                  {([1, 2, 3, "circuit"] as InspirationScope[]).map((s, n) => (
                    <Button key={String(s)} size="sm" className={cn(n > 0 && "-ml-px", n < 3 && "rounded-r-none", n > 0 && "rounded-l-none")} onClick={() => apply(a.id, s)}>{s === "circuit" ? "Circuit" : `S${s}`}</Button>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {note && <div className="mt-2 text-[12px] text-fg-muted before:mr-2 before:text-accent before:content-['!']">{note}</div>}
    </div>
  );
}

function midpoint(c: { turns: { x: number; y: number }[] }, i: number) {
  const a = c.turns[i], b = c.turns[(i + 1) % c.turns.length];
  return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), radius: 60 };
}

/**
 * Panel section: a collapsible with an instrument-style header — label left, live readout right.
 * `summary` shows while collapsed so a closed stack still reads as telemetry; `flag` is a signal and stays visible.
 * `autoOpen` opens the section when content arrives (a brief set by the agent, a simulation run) unless the designer
 * has already toggled it by hand.
 */
function Section({ label, summary, flag, defaultOpen = false, autoOpen = false, children }: { label: string; summary?: string; flag?: string; defaultOpen?: boolean; autoOpen?: boolean; children: React.ReactNode }) {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (defaultOpen || autoOpen);
  return (
    <Collapsible open={open} onOpenChange={setManual} className="border-b border-line" data-flag={flag ? "" : undefined}>
      <CollapsibleTrigger className="group flex h-8 w-full items-center gap-2 px-4 text-left outline-none transition-colors duration-120 hover:bg-surface-2 focus-visible:bg-surface-2">
        <ChevronRight className="size-3 shrink-0 text-fg-dim transition-transform duration-120 ease-out group-data-[state=open]:rotate-90" />
        <span className="label shrink-0 transition-colors duration-120 group-hover:text-fg group-data-[state=open]:text-fg">{label}</span>
        <span className="mono ml-auto flex min-w-0 items-baseline gap-2 text-[11px]">
          {summary && <span className="truncate text-fg-muted group-data-[state=open]:hidden">{summary}</span>}
          {flag && <span className="shrink-0 uppercase tracking-[0.06em] text-accent">{flag}</span>}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapse-down data-[state=closed]:animate-collapse-up">
        <div className="px-4 pb-3 pt-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A label with its definition on hover. */
function Term({ label, className }: { label: string; className?: string }) {
  const tip = TIP[label];
  if (!tip) return <span className={className}>{label}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className={cn("cursor-help", className)}>{label}</span></TooltipTrigger>
      <TooltipContent side="left">{tip}</TooltipContent>
    </Tooltip>
  );
}

function Hero({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span key={value} className="display tick text-[36px] leading-[0.95]">{value}</span>
        {unit && <span className="mono text-[11px] text-fg-muted">{unit}</span>}
      </div>
      <Term label={label} className="label mt-1 block" />
    </div>
  );
}

/** Secondary metric: dim label over a mono value with its unit. */
function Metric({ k, v, unit, strong }: { k: string; v: string | number; unit?: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Term label={k} className="label text-[10px] tracking-[0.06em] text-fg-dim" />
      <span className={cn("mono truncate text-[12px]", strong ? "text-accent" : "text-fg")}>{v}{unit && <span className="text-fg-dim"> {unit}</span>}</span>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Term label={label} className="label block text-[10px] tracking-[0.06em]" />
      <div key={value} className="display tick mt-0.5 text-[28px] leading-none">{value}</div>
      <div className="mt-1.5 h-[2px] bg-line"><div className="h-full bg-fg transition-[width] duration-300 ease-out" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

/**
 * Speed trace: the lap's speed profile as panel telemetry. Hairline grid at 100/200/300 km/h, sector boundaries
 * dashed, hover reads distance and speed. Bespoke SVG on purpose: it is one line and a crosshair.
 */
function SpeedTrace({ a }: { a: Analysis }) {
  const W = 320, H = 56, L = 24, VMAX = 360;
  const [hover, setHover] = useState<number | null>(null);
  const pts = a.speedTrace;
  const maxS = a.length || 1;
  const x = (s: number) => L + (s / maxS) * (W - L), y = (v: number) => H - (v / VMAX) * H;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.s).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const bounds = a.sectors.slice(0, -1).map((_, i) => a.sectors.slice(0, i + 1).reduce((n, s) => n + s.length, 0));
  const at = hover === null ? null : pts.reduce((b, p) => (Math.abs(p.s - hover) < Math.abs(b.s - hover) ? p : b), pts[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full touch-none" onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const fx = ((e.clientX - r.left) / r.width) * W; setHover(fx < L ? null : ((fx - L) / (W - L)) * maxS); }} onPointerLeave={() => setHover(null)}>
      {[100, 200, 300].map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 4} y={y(v) + 3} className="mono" fontSize={9} fill="var(--fg-dim)" textAnchor="end">{v}</text>
        </g>
      ))}
      {bounds.map((s, i) => <line key={i} x1={x(s)} x2={x(s)} y1={0} y2={H} stroke="var(--line-strong)" strokeDasharray="2 3" strokeWidth={1} />)}
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {at && (
        <g>
          <line x1={x(at.s)} x2={x(at.s)} y1={0} y2={H} stroke="var(--fg-muted)" strokeWidth={1} />
          <circle cx={x(at.s)} cy={y(at.v)} r={2.5} fill="var(--accent)" />
          <text x={x(at.s) > W * 0.6 ? x(at.s) - 6 : x(at.s) + 6} y={10} className="mono" fontSize={9} fill="var(--fg)" textAnchor={x(at.s) > W * 0.6 ? "end" : "start"}>{Math.round(at.s)} m · {at.v} km/h · S{at.sector}</text>
        </g>
      )}
      <text x={L} y={H + 11} className="mono" fontSize={9} fill="var(--fg-dim)">S/F</text>
      {bounds.map((s, i) => <text key={i} x={x(s) + 3} y={H + 11} className="mono" fontSize={9} fill="var(--fg-dim)">S{i + 2}</text>)}
      <text x={W} y={H + 11} className="mono" fontSize={9} fill="var(--fg-dim)" textAnchor="end">{a.topSpeed} km/h max</text>
    </svg>
  );
}
