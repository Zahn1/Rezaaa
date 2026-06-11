"use client";

export interface ChatEvent {
  type: "meta" | "token" | "done" | "error";
  agent?: string;
  text?: string;
  error?: string;
}

/** Stream a chat message to the REZAA core; calls onEvent per SSE event. */
export async function streamChat(
  message: string,
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok || !res.body) {
    onEvent({ type: "error", error: `backend ${res.status}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.trim();
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {
          /* skip malformed frame */
        }
      }
    }
  }
}

export const getSystem = () => fetch("/api/system").then((r) => r.json());
export const getAgents = () => fetch("/api/agents").then((r) => r.json());
export const getAudit = () =>
  fetch("/api/audit?limit=20").then((r) => r.json());

// ---- memory -----------------------------------------------------------------
export interface MemoryItem {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
}

export const listMemory = (q?: string): Promise<{ results: MemoryItem[] }> =>
  fetch(q ? `/api/memory?q=${encodeURIComponent(q)}` : "/api/memory").then((r) => r.json());

export const addMemory = (text: string) =>
  fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then((r) => r.json());

export const deleteMemory = (id: string) =>
  fetch(`/api/memory/${id}`, { method: "DELETE" }).then((r) => r.json());

// ---- automation: propose -> confirm ------------------------------------------
export interface Proposal {
  approved?: boolean;
  confirmation_required?: boolean;
  token?: string;
  prompt?: string;
  preview?: string;
  content?: string;
  target?: string;
  error?: string;
}

export const proposeAutomation = async (
  action: string,
  target: string,
): Promise<Proposal> => {
  const r = await fetch("/api/automation/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, target }),
  });
  return r.json();
};

export const confirmAutomation = async (
  token: string,
  answer: "YES" | "NO",
): Promise<{ executed?: boolean; result?: string; error?: string }> => {
  const r = await fetch("/api/automation/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, answer }),
  });
  return r.json();
};

export const setMode = (read_only: boolean) =>
  fetch("/api/system/mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ read_only }),
  }).then((r) => r.json());
