"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  addMemory,
  confirmAutomation,
  deleteMemory,
  getAgents,
  getAudit,
  getSystem,
  listMemory,
  proposeAutomation,
  setMode,
  type MemoryItem,
  type Proposal,
} from "../lib/api";
import { controller } from "../lib/controller";
import { useRezaa } from "../lib/state";

const panelCls =
  "pointer-events-auto rounded-lg border border-arc/25 bg-abyss/60 p-3 " +
  "backdrop-blur-md shadow-glow font-hud text-[11px] leading-relaxed text-arc/90 holo-drift";

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-energy">
      <span className="inline-block h-1.5 w-1.5 animate-pulseGlow rounded-full bg-energy" />
      {children}
    </div>
  );
}

export default function HUD() {
  const { coreState, micEnabled, transcript, logs, activeAgent } = useRezaa();
  const [system, setSystem] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [command, setCommand] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memInput, setMemInput] = useState("");
  const [autoAction, setAutoAction] = useState("open_app");
  const [autoTarget, setAutoTarget] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const pushLog = useRezaa((s) => s.pushLog);
  const setCoreState = useRezaa((s) => s.setCoreState);

  const refreshMemory = (q?: string) =>
    listMemory(q).then((d) => setMemories(d.results ?? [])).catch(() => {});

  useEffect(() => {
    const tick = () => {
      getSystem().then(setSystem).catch(() => setSystem(null));
      getAgents().then((d) => setAgents(d.agents ?? [])).catch(() => {});
      getAudit().then((d) => setAudit(d.entries ?? [])).catch(() => {});
    };
    tick();
    refreshMemory();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    controller.sendCommand(command);
    setCommand("");
  };

  const saveMemory = async (e: FormEvent) => {
    e.preventDefault();
    if (!memInput.trim()) return;
    const res = await addMemory(memInput);
    pushLog(res.id ? "Memory stored" : `Memory refused: ${res.error ?? "?"}`, "system");
    setMemInput("");
    refreshMemory();
  };

  const propose = async () => {
    if (!autoTarget.trim()) return;
    const res = await proposeAutomation(autoAction, autoTarget);
    if (res.error) {
      pushLog(`BLOCKED: ${res.error}`, "system");
      setCoreState("alert");
      setTimeout(() => setCoreState("idle"), 1800);
    } else if (res.content !== undefined) {
      pushLog(`FILE ${res.target ?? autoTarget}:\n${res.content.slice(0, 400)}`, "system");
    } else if (res.confirmation_required) {
      setProposal(res);
    }
  };

  const answerProposal = async (answer: "YES" | "NO") => {
    if (!proposal?.token) return;
    setProposal(null);
    if (answer === "NO") {
      await confirmAutomation(proposal.token, "NO").catch(() => {});
      pushLog("Action rejected", "system");
      return;
    }
    setCoreState("executing");
    const res = await confirmAutomation(proposal.token, "YES");
    if (res.error) {
      pushLog(`DENIED: ${res.error}`, "system");
      setCoreState("alert");
    } else {
      pushLog(`EXECUTED: ${res.result ?? "ok"}`, "system");
    }
    setTimeout(() => setCoreState("idle"), 1800);
  };

  const toggleMode = async () => {
    if (!system) return;
    const res = await setMode(!system.read_only);
    setSystem({ ...system, read_only: res.read_only });
    pushLog(`Mode: ${res.read_only ? "READ-ONLY" : "EXECUTE"}`, "system");
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-[300px_1fr_300px] gap-4 p-4">
      {/* left column */}
      <div className="flex flex-col gap-4">
        <section className={panelCls}>
          <PanelTitle>System Core</PanelTitle>
          {system ? (
            <ul className="space-y-1">
              <li>STATE&nbsp;&nbsp;<b className="text-white">{coreState.toUpperCase()}</b></li>
              <li>MODE&nbsp;&nbsp;&nbsp;{system.read_only ? "READ-ONLY (safe)" : "EXECUTE"}</li>
              <li>BRAIN&nbsp;&nbsp;{system.provider}{system.model ? ` · ${system.model}` : ""}</li>
              <li>MEMORY&nbsp;{system.memory_backend}</li>
              <li>MIC&nbsp;&nbsp;&nbsp;&nbsp;{micEnabled ? "ONLINE" : "OFFLINE"}</li>
            </ul>
          ) : (
            <p className="text-arc/40">core offline — start backend :8000</p>
          )}
        </section>

        <section className={`${panelCls} holo-drift-late`}>
          <PanelTitle>Agent Network</PanelTitle>
          <ul className="space-y-1">
            {agents.map((a) => (
              <li key={a.name} className="flex justify-between">
                <span className={activeAgent === a.name ? "text-white" : ""}>
                  {activeAgent === a.name ? "▸ " : "  "}{a.name}
                </span>
                <span className="text-arc/40">{a.status}</span>
              </li>
            ))}
            {agents.length === 0 && <li className="text-arc/40">no agents detected</li>}
          </ul>
        </section>

        <section className={`${panelCls} holo-drift-late`}>
          <PanelTitle>Ops</PanelTitle>
          <button
            onClick={toggleMode}
            className={`mb-2 w-full rounded border px-2 py-1 text-[10px] uppercase tracking-widest ${
              system?.read_only
                ? "border-energy/40 text-energy hover:bg-energy/10"
                : "border-red-400/60 text-red-300 hover:bg-red-400/10"
            }`}
          >
            {system?.read_only ? "Read-Only (safe) — unlock" : "EXECUTE MODE — lock"}
          </button>
          <div className="flex gap-1">
            <select
              value={autoAction}
              onChange={(e) => setAutoAction(e.target.value)}
              className="rounded border border-arc/30 bg-abyss px-1 py-1 text-[10px] text-arc"
            >
              <option value="open_app">open_app</option>
              <option value="browser_task">browser</option>
              <option value="read_file">read_file</option>
            </select>
            <input
              value={autoTarget}
              onChange={(e) => setAutoTarget(e.target.value)}
              placeholder="target…"
              className="w-full rounded border border-arc/30 bg-abyss px-2 py-1 text-[10px] text-white placeholder-arc/30 outline-none"
            />
            <button
              onClick={propose}
              className="rounded border border-arc/40 px-2 text-[10px] uppercase text-arc hover:bg-arc/15"
            >
              Go
            </button>
          </div>
        </section>

        <section className={`${panelCls} max-h-64 overflow-hidden`}>
          <PanelTitle>Audit Trail</PanelTitle>
          <ul className="space-y-0.5 text-[10px]">
            {audit.slice(-9).reverse().map((e, i) => (
              <li key={i} className="truncate text-arc/60">
                <span className={e.status === "DENIED" ? "text-red-400" : "text-energy/80"}>
                  {e.status}
                </span>{" "}
                {e.action} · {e.target}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* center: transcript overlay + command bar */}
      <div className="flex flex-col items-center justify-end gap-3 pb-2">
        {transcript && coreState === "listening" && (
          <div className="pointer-events-none rounded border border-energy/30 bg-void/50 px-4 py-1 font-hud text-sm text-energy/90 backdrop-blur">
            “{transcript}”
          </div>
        )}
        <form onSubmit={submit} className="pointer-events-auto flex w-full max-w-xl gap-2">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder='Command REZAA… (or say "Hey Rezaa")'
            className="flex-1 rounded border border-arc/30 bg-abyss/70 px-4 py-2 font-hud text-sm text-white placeholder-arc/30 outline-none backdrop-blur focus:border-arc focus:shadow-glow"
          />
          <button className="rounded border border-arc/40 bg-arc/10 px-4 font-hud text-xs uppercase tracking-widest text-arc hover:bg-arc/25">
            Send
          </button>
          {!micEnabled && (
            <button
              type="button"
              onClick={() => controller.enableAudio()}
              className="rounded border border-energy/40 bg-energy/10 px-4 font-hud text-xs uppercase tracking-widest text-energy hover:bg-energy/25"
            >
              Mic
            </button>
          )}
        </form>
      </div>

      {/* right column: conversation feed + memory */}
      <div className="flex flex-col justify-start gap-4">
        <section className={`${panelCls} flex max-h-[52vh] flex-col`}>
          <PanelTitle>Comms</PanelTitle>
          <div className="space-y-2 overflow-y-auto">
            {logs.map((l) => (
              <p key={l.id} className="text-[11px]">
                <span className="text-arc/30">{l.time} </span>
                <span
                  className={
                    l.kind === "user"
                      ? "text-white"
                      : l.kind === "rezaa"
                        ? "text-energy"
                        : "text-arc/50"
                  }
                >
                  {l.kind === "user" ? "YOU ▸ " : l.kind === "rezaa" ? "REZAA ▸ " : "SYS ▸ "}
                </span>
                {l.text}
              </p>
            ))}
            {logs.length === 0 && (
              <p className="text-arc/40">
                Awaiting input. Say “Hey Rezaa”, clap, or type a command.
              </p>
            )}
          </div>
        </section>

        <section className={`${panelCls} holo-drift-late max-h-[30vh] overflow-hidden`}>
          <PanelTitle>Memory Core</PanelTitle>
          <form onSubmit={saveMemory} className="mb-2 flex gap-1">
            <input
              value={memInput}
              onChange={(e) => setMemInput(e.target.value)}
              placeholder="store a fact…"
              className="w-full rounded border border-arc/30 bg-abyss px-2 py-1 text-[10px] text-white placeholder-arc/30 outline-none"
            />
            <button className="rounded border border-arc/40 px-2 text-[10px] uppercase text-arc hover:bg-arc/15">
              +
            </button>
          </form>
          <ul className="space-y-1 overflow-y-auto">
            {memories.slice(0, 8).map((m) => (
              <li key={m.id} className="group flex items-start justify-between gap-2">
                <span className="truncate text-arc/70">{m.text}</span>
                <button
                  onClick={() => deleteMemory(m.id).then(() => refreshMemory())}
                  className="hidden text-red-400/80 hover:text-red-300 group-hover:block"
                  title="forget"
                >
                  ✕
                </button>
              </li>
            ))}
            {memories.length === 0 && <li className="text-arc/40">memory empty</li>}
          </ul>
        </section>
      </div>

      {/* confirmation gate modal */}
      {proposal && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-void/70 backdrop-blur-sm">
          <div className="w-[28rem] rounded-lg border border-energy/50 bg-abyss/90 p-5 font-hud shadow-glow">
            <PanelTitle>Confirmation Required</PanelTitle>
            <p className="mb-2 text-sm text-white">{proposal.prompt}</p>
            <p className="mb-4 text-[11px] text-arc/60">{proposal.preview}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => answerProposal("NO")}
                className="rounded border border-arc/40 px-4 py-1 text-xs uppercase tracking-widest text-arc/80 hover:bg-arc/10"
              >
                No
              </button>
              <button
                onClick={() => answerProposal("YES")}
                className="rounded border border-energy/60 bg-energy/15 px-4 py-1 text-xs uppercase tracking-widest text-energy hover:bg-energy/30"
              >
                Yes — execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
