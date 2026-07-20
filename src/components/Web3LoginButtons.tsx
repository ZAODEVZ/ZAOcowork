"use client";

import { useCallback, useEffect, useState } from "react";

// Login with Farcaster (SIWN) + Login with Wallet (SIWE).
//
// Both are additive - the password form above them keeps working, so nobody
// gets locked out while this rolls out.
//
// Farcaster: Neynar's SIWN script renders its own button and opens a popup to
// app.neynar.com/login. On success it hands us { signer_uuid, fid }; we POST the
// signer_uuid to /api/auth/farcaster, which re-verifies it SERVER-SIDE before
// minting a session. We never trust the fid the browser reports.
//
// Wallet: ask the server for a nonce + the exact message, personal_sign it, POST
// it back. Signing the server's verbatim message avoids client/server drift.
//
// Setup required (see PR notes): NEXT_PUBLIC_NEYNAR_CLIENT_ID, and this app's
// origin added to Authorized Origins in the Neynar dev portal.

const SIWN_SCRIPT = "https://neynarxyz.github.io/siwn/raw/1.2.0/index.js";

type Status = { kind: "idle" | "busy" | "pending" | "error"; message?: string };

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    onSiwnSuccess?: (data: { signer_uuid?: string; fid?: number }) => void;
  }
}

export function Web3LoginButtons() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const clientId = process.env.NEXT_PUBLIC_NEYNAR_CLIENT_ID;

  // --- Farcaster (SIWN) ---
  useEffect(() => {
    if (!clientId) return;
    window.onSiwnSuccess = async (data) => {
      if (!data?.signer_uuid) {
        setStatus({ kind: "error", message: "Farcaster sign-in returned no signer." });
        return;
      }
      setStatus({ kind: "busy" });
      try {
        const res = await fetch("/api/auth/farcaster", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ signer_uuid: data.signer_uuid }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          window.location.href = "/";
          return;
        }
        if (json?.status === "pending") {
          setStatus({
            kind: "pending",
            message: "You're signed in with Farcaster. An admin needs to approve your access - you'll get in once they do.",
          });
          return;
        }
        setStatus({ kind: "error", message: json?.error ?? "Farcaster sign-in failed." });
      } catch {
        setStatus({ kind: "error", message: "Network error during Farcaster sign-in." });
      }
    };

    const s = document.createElement("script");
    s.src = SIWN_SCRIPT;
    s.async = true;
    document.body.appendChild(s);
    return () => {
      s.remove();
      delete window.onSiwnSuccess;
    };
  }, [clientId]);

  // --- Wallet (SIWE) ---
  const signInWithWallet = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setStatus({ kind: "error", message: "No wallet found. Install a browser wallet, or use Farcaster." });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) {
        setStatus({ kind: "error", message: "No account selected." });
        return;
      }

      const nonceRes = await fetch(`/api/auth/wallet?address=${address}`);
      const { message } = (await nonceRes.json()) as { message?: string };
      if (!message) {
        setStatus({ kind: "error", message: "Could not start wallet sign-in." });
        return;
      }

      const signature = (await eth.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const res = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      if (json?.status === "pending") {
        setStatus({
          kind: "pending",
          message: "Wallet verified. An admin needs to approve your access - you'll get in once they do.",
        });
        return;
      }
      setStatus({ kind: "error", message: json?.error ?? "Wallet sign-in failed." });
    } catch (err: unknown) {
      // User rejecting the signature prompt is normal, not an error worth shouting about.
      const msg = err instanceof Error && /reject|denied/i.test(err.message)
        ? "Sign-in cancelled."
        : "Wallet sign-in failed.";
      setStatus({ kind: "error", message: msg });
    }
  }, []);

  const busy = status.kind === "busy";

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-white/40">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {clientId ? (
        <div
          className="neynar_signin flex w-full justify-center"
          data-client_id={clientId}
          data-success-callback="onSiwnSuccess"
          data-theme="dark"
          data-variant="farcaster"
        />
      ) : null}

      <button
        type="button"
        onClick={signInWithWallet}
        disabled={busy}
        className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
      >
        {busy ? "Signing in..." : "Login with Wallet"}
      </button>

      {status.message ? (
        <p
          className={
            status.kind === "pending"
              ? "rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
              : "text-sm text-red-300"
          }
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
