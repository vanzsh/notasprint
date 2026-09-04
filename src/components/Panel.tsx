"use client";
import { useRef, useState } from "react";
import { ChevronRight, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { ARCHETYPES, archetypeById, type ArchetypeId } from "@/lib/archetypes";
import { fingerprint, fmtKm, fmtLap, type Analysis, type Circuit } from "@/lib/circuit";
import { evaluateBrief, isBriefEmpty } from "@/lib/constraints";
import { applyInspiration, deleteTurn, editTurns, insertTurns, setLocks, type InspirationScope } from "@/lib/moves";
import { commit, getState, preview, SCORE_LABEL, select, undo, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Brief } from "./Brief";
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

export function Panel() {
  const { circuit, analysis: a, selected, receipt, brief, simulation, versions, compare } = useStore((s) => s);
  const selIdx = circuit.turns.findIndex((t) => t.id === selected);
  const turn = selIdx >= 0 ? circuit.turns[selIdx] : null;
  const ta = selIdx >= 0 ? a.turns[selIdx] : null;
  const example = archetypeById(circuit.inspiration ?? "")?.name;
  const report = evaluateBrief(brief, circuit, a);
  const simStale = simulation ? simulation.fingerprint !== fingerprint(circuit) : false;
  const scoreKeys = Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[];

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      <ScrollArea className="min-h-0 flex-1">
        <Section label="Circuit" summary={`${fmtKm(a.length)} km · ${a.turnCount} turns`} defaultOpen>
          <div className="display text-[28px] leading-none">{circuit.name}</div>
          <div className="mt-1 truncate text-[12px] text-fg-muted" title={circuit.tagline}>{circuit.tagline}</div>
          <Tooltip>
            <TooltipTrigger asChild><div className="mono mt-1 w-fit cursor-help text-[11px] text-fg-dim">Reference layout · {example ? `${example} example` : "Mixed character"}</div></TooltipTrigger>
            <TooltipContent side="left">Reference layouts are example starting points. Design inspirations are characteristics applied to the live circuit.</TooltipContent>
          </Tooltip>
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
                  <td className="py-1 text-fg-muted">{s.character}</td>
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
            <button key={t.id} onClick={() => select(t.id)} className={cn("mono -mx-2 flex h-6 w-[calc(100%+16px)] items-center justify-between gap-2 rounded-sm px-2 text-left text-[11px] hover:bg-surface-2", t.id === selected && "bg-surface-2")}>
              <span className="text-fg"><span className="text-accent">▸</span> T{t.turn}{t.name ? <span className="text-fg-muted"> {t.name}</span> : null}</span>
              <span className="text-fg-muted">{t.entrySpeed}<span className="text-fg-dim">→</span>{t.apexSpeed} <span className="text-fg-dim">km/h</span> · {t.approach} <span className="text-fg-dim">m</span></span>
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
      </ScrollArea>

      <div className="border-t border-line px-4 py-2.5">
        <div className="label mb-1.5">Activity</div>
        {receipt ? (
          <div key={receipt.at} className="mono text-[11px] text-fg-muted">
            <div className="flex items-baseline gap-2">
              <span className={cn("shrink-0 tracking-[0.06em]", receipt.source === "agent" ? "text-fg" : "text-fg-dim")}>{receipt.source === "agent" ? "AGENT" : "YOU"}</span>
              <span className="tick min-w-0 flex-1 truncate text-fg" title={receipt.label ?? receipt.text}>{receipt.label ?? receipt.text}</span>
              <Button variant="link" className="shrink-0 text-[11px]" onClick={() => undo()}>Undo</Button>
            </div>
            {receipt.label && receipt.text && <div className="mt-0.5 truncate pl-[calc(5ch+8px)]" title={receipt.text}>{receipt.text}</div>}
          </div>
        ) : (
          <div className="mono text-[11px] text-fg-dim">No changes yet · ⌘Z undo · ⇧⌘Z redo</div>
        )}
      </div>
    </aside>
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
        <span className="mono text-[11px] text-fg-muted">S{t.sector} · {Math.round(t.x)}, {Math.round(t.y)}</span>
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
      <ol className="mono space-y-0.5 text-[11px] text-fg-muted">
        <li><span className="text-fg">Drag</span> · click to inspect · double-click to add</li>
        <li><span className="text-fg">L</span> locks a turn — no tool can move or delete it</li>
        <li><span className="text-fg">Ask</span> the agent — it edits this live circuit</li>
        <li><span className="text-fg">⌘Z</span> undo · ⇧⌘Z redo · Export JSON / SVG</li>
      </ol>
      <div className="mono text-[11px] text-fg-dim">
        {agent === "connected" ? "Agent connected · tool calls edit this circuit" : agent === "unavailable" ? "No WebMCP agent detected · use the ChatGPT desktop browser or Chrome 149+ with chrome://flags/#enable-webmcp-testing" : "Checking for a WebMCP agent"}
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
              <div className={cn("mono mt-1 text-[11px]", isOpen ? "leading-relaxed text-fg-muted" : "text-fg-dim")}>{isOpen ? a.traits.join(" · ") : a.summary}</div>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapse-down data-[state=closed]:animate-collapse-up">
              <div className="space-y-2 pb-3">
                <div className="text-[12px] text-fg-muted">Ask the agent <span className="mono text-fg">“{a.examplePrompt}”</span></div>
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
      {note && <div className="mono mt-2 text-[11px] text-fg-muted before:mr-2 before:text-accent before:content-['!']">{note}</div>}
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
    <Collapsible open={open} onOpenChange={setManual} className="border-b border-line">
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
