"use client";

import { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

const SUGGESTIONS = [
  "What should I work on next?",
  "What's blocked right now?",
  "Any aging items I'm ignoring?",
  "Summarize the board in 3 lines",
];

const GREETING =
  "Ask me anything about the board. I can see every item, its status, owner, priority, and age. Try one of the prompts below.";

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
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
          copy[copy.length - 1] = { role: "assistant", content: acc };
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
      // Drop the empty assistant placeholder on failure.
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
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 pr-1"
      >
        {empty && (
          <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-white/60">
            {GREETING}
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble
            key={i}
            role={m.role}
            content={m.content}
            streaming={
              streaming && i === messages.length - 1 && m.role === "assistant"
            }
          />
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
          placeholder="Ask about the board…"
          className="flex-1 resize-none rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal-400/60 focus:ring-1 focus:ring-teal-400/30 max-h-32"
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
            className="rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:hover:bg-teal-500 px-4 py-2.5 text-sm font-medium text-black transition shadow-lg shadow-teal-500/20"
          >
            Send
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[10px] text-white/30">
        Enter to send · Shift+Enter for a new line · the assistant reads the live board but cannot edit it
      </p>
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
          <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-teal-400/80 animate-pulse" />
        )}
      </div>
    </div>
  );
}
