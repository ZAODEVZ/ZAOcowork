"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/chat-models";

type Role = "user" | "assistant";
type Message = { role: Role; content: string; actions?: TaskAction[] };
type TaskAction = { id: number; action: "close" | "create" | "update" | "comment" | "snooze"; title?: string; notes?: string };

const MODEL_KEY = "zao-task-chat-model-v1";

const SUGGESTIONS = [
  "What's overdue?",
  "Close the last 3 items",
  "Add a task: fix the audio",
  "What did I ship today?",
];

const GREETING =
  "Chat about your tasks. You can ask questions or type commands like 'close #12' or 'add a task for next week'. I can suggest actions as buttons.";

/**
 * Extract [ACTIONS]...[/ACTIONS] blocks from text and return { visible, actions }.
 */
function parseActions(text: string): { visible: string; actions: TaskAction[] } {
  const actionStart = text.indexOf("[ACTIONS]");
  if (actionStart === -1) return { visible: text, actions: [] };

  const actionEnd = text.indexOf("[/ACTIONS]", actionStart);
  if (actionEnd === -1) return { visible: text, actions: [] };

  const visible = text.slice(0, actionStart) + text.slice(actionEnd + 10);
  const actionBlock = text.slice(actionStart + 9, actionEnd).trim();

  try {
    const parsed = JSON.parse(actionBlock);
    if (Array.isArray(parsed.actions)) {
      return { visible, actions: parsed.actions };
    }
  } catch {
    // Invalid JSON, just ignore
  }

  return { visible: text, actions: [] };
}

export function TaskChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [executing, setExecuting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Restore the last-picked model.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(MODEL_KEY);
    if (saved && CHAT_MODELS.some((m) => m.id === saved)) setModel(saved);
  }, []);

  // Stick to the bottom as tokens stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Cancel any in-flight stream if the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setError(null);
    setInput("");

    const next: Message[] = [...messages, { role: "user", content }];
    // Optimistically add an empty assistant message we stream into.
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat?mode=task-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, model }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let detail = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) detail = j.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          const { visible, actions } = parseActions(acc);
          copy[copy.length - 1] = { role: "assistant", content: visible.trim(), actions };
          return copy;
        });
      }
      // Flush any bytes the decoder buffered.
      const tail = decoder.decode();
      if (tail) {
        acc += tail;
        setMessages((prev) => {
          const copy = [...prev];
          const { visible, actions } = parseActions(acc);
          copy[copy.length - 1] = { role: "assistant", content: visible.trim(), actions };
          return copy;
        });
      }

      if (!acc.trim()) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "(no response — try rephrasing)",
          };
          return copy;
        });
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setMessages((prev) => {
        const copy = [...prev];
        if (
          copy.length &&
          copy[copy.length - 1].role === "assistant" &&
          !copy[copy.length - 1].content
        ) {
          copy.pop();
        }
        return copy;
      });
      if (!aborted) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      taRef.current?.focus();
    }
  }

  async function executeAction(action: TaskAction) {
    if (executing) return;
    setExecuting(true);
    setError(null);

    try {
      const actionType = action.action;
      const itemId = action.id;

      if (actionType === "close") {
        const res = await fetch(`/api/v1/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        });
        if (!res.ok) throw new Error(`Failed to close #${itemId}`);
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            actions: copy[copy.length - 1].actions?.filter(a => a.id !== itemId),
          };
          return copy;
        });
        send(`Closed #${itemId} successfully. What's next?`);
      } else if (actionType === "create") {
        const res = await fetch("/api/v1/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: action.title || "New task",
            notes: action.notes || "",
          }),
        });
        if (!res.ok) throw new Error("Failed to create task");
        const data = await res.json();
        send(`Created #${data.id} successfully. Anything else?`);
      } else if (actionType === "update") {
        // Generic update - for now just acknowledge
        const res = await fetch(`/api/v1/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: action.notes }),
        });
        if (!res.ok) throw new Error(`Failed to update #${itemId}`);
        send(`Updated #${itemId}. Anything else?`);
      }
      // More action types can be added here (snooze, comment, etc.)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute action");
    } finally {
      setExecuting(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-[min(70vh,640px)]">
      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {empty && (
          <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-white/60">
            {GREETING}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            <Bubble role={m.role} content={m.content} streaming={streaming && i === messages.length - 1 && m.role === "assistant"} />
            {m.actions && m.actions.length > 0 && (
              <div className="mt-2 ml-4 flex flex-wrap gap-1.5">
                {m.actions.map((action, ai) => (
                  <button
                    key={ai}
                    onClick={() => executeAction(action)}
                    disabled={executing}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-50 transition"
                  >
                    [{action.action === "close" ? `Close #${action.id}` : `${action.action} #${action.id}`}]
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Suggestions — only before the first turn */}
      {empty && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 text-white/70 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask or type a task command…"
          className="flex-1 resize-none rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/60 focus:ring-1 focus:ring-emerald-400/30 max-h-32"
        />
        {streaming ? (
          <button
            onClick={stop}
            className="rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] px-4 py-2.5 text-sm font-medium text-white/80"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black transition shadow-lg shadow-emerald-500/20"
          >
            Send
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] text-white/30">
          Enter to send · Shift+Enter for new line · suggests actions as buttons · you confirm by tapping
        </p>
        <label className="flex items-center gap-1.5 text-[10px] text-white/30">
          <span>Model</span>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              if (typeof window !== "undefined") {
                window.localStorage.setItem(MODEL_KEY, e.target.value);
              }
            }}
            className="rounded-md bg-[#0b1220] border border-white/10 px-1.5 py-1 text-[10px] text-white/70 focus:outline-none focus:border-emerald-400/60"
          >
            {CHAT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming,
}: {
  role: Role;
  content: string;
  streaming: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? "bg-blue-500/20 border border-blue-500/30 text-blue-50"
            : "bg-white/[0.06] border border-white/10 text-white/85"
        }`}
      >
        {content || (streaming ? "" : "")}
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-emerald-400/80 animate-pulse" />
        )}
      </div>
    </div>
  );
}
