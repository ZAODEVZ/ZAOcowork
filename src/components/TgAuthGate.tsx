"use client";

import { useEffect, useState } from "react";

type Phase = "init" | "authenticating" | "error" | "no_tg";

export function TgAuthGate() {
  const [phase, setPhase] = useState<Phase>("init");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const tg = (window as unknown as Record<string, unknown>).Telegram as
      | { WebApp?: { initData?: string; ready?: () => void } }
      | undefined;

    if (!tg?.WebApp?.initData) {
      setPhase("no_tg");
      return;
    }

    const initData = tg.WebApp.initData;
    tg.WebApp.ready?.();
    setPhase("authenticating");

    fetch("/api/tg/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) {
          window.location.reload();
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (body.error === "not_in_allowlist") {
            setErrorMsg("Your Telegram account is not on the access list.");
          } else {
            setErrorMsg(`Auth failed (${body.error ?? res.status}). Try reopening the board.`);
          }
          setPhase("error");
        }
      })
      .catch(() => {
        setErrorMsg("Network error. Check your connection and try again.");
        setPhase("error");
      });
  }, []);

  return (
    <main className="min-h-screen bg-[#041225] text-white flex items-center justify-center px-6">
      <div className="text-center space-y-4 max-w-xs">
        <div className="text-3xl font-bold">
          <span className="text-white">ZAO</span>{" "}
          <span className="text-yellow-400">Cowork</span>
        </div>

        {phase === "init" || phase === "authenticating" ? (
          <>
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-white/50">
              {phase === "init" ? "Starting…" : "Signing you in…"}
            </p>
          </>
        ) : phase === "no_tg" ? (
          <>
            <p className="text-sm text-white/60">
              This page is designed to be opened inside Telegram via the{" "}
              <strong>/board</strong> command.
            </p>
            <a
              href="https://thezao.xyz/board"
              className="inline-block text-sm text-blue-400 underline"
            >
              Open the full board instead →
            </a>
          </>
        ) : (
          <>
            <p className="text-sm text-red-400">{errorMsg}</p>
            <button
              className="text-xs text-white/40 underline"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </>
        )}
      </div>
    </main>
  );
}
