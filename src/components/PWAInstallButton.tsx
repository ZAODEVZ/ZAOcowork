"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

type GuideType = "ios" | "generic";

export function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState<GuideType | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false); // avoid SSR mismatch

  useEffect(() => {
    setReady(true);
    if (isStandalone()) { setInstalled(true); return; }

    setIos(detectIOS());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null); };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Hide only when confirmed installed or before hydration
  if (!ready || installed) return null;

  async function handleClick() {
    if (deferredPrompt) {
      // Native install dialog (Chrome/Edge/Android)
      setLoading(true);
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") { setInstalled(true); setDeferredPrompt(null); }
      } finally { setLoading(false); }
      return;
    }
    if (ios) { setGuide("ios"); return; }
    // Any other browser: show generic guide
    setGuide("generic");
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        title="Install this app on your device"
        className="flex items-center gap-1.5 rounded-lg border border-blue-500/50 bg-blue-500/20 px-2.5 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/30 hover:border-blue-400/70 hover:text-blue-200 active:scale-95 transition-all duration-150 disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
            <circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="10" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.5v8M5.5 7.5L8 10l2.5-2.5" />
            <path d="M2.5 11.5v1A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5v-1" />
          </svg>
        )}
        {loading ? "Saving…" : "Install"}
      </button>

      {guide === "ios"     && <IOSGuide     onClose={() => setGuide(null)} />}
      {guide === "generic" && <GenericGuide onClose={() => setGuide(null)} />}
    </>
  );
}

/* ── iOS Safari guide ────────────────────────────────── */
function IOSGuide({ onClose }: { onClose: () => void }) {
  const isSafari =
    typeof navigator !== "undefined" &&
    /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title="Install Zao Works"
        sub={isSafari ? "Follow the steps below in Safari" : "Open in Safari for best results"}
        onClose={onClose}
      />
      <ol className="space-y-4">
        {isSafari ? (
          <>
            <Step n={1} icon={<IconShare />}>Tap the <b className="text-white">Share</b> button <span className="text-white/40 text-xs">(bottom toolbar)</span></Step>
            <Step n={2} icon={<IconPlus />}>Scroll and tap <b className="text-white">"Add to Home Screen"</b></Step>
            <Step n={3} icon={<IconCheck />}>Tap <b className="text-white">Add</b> to confirm</Step>
          </>
        ) : (
          <>
            <Step n={1} icon={<IconSafari />}>Open this page in <b className="text-white">Safari</b></Step>
            <Step n={2} icon={<IconShare />}>Tap the <b className="text-white">Share</b> button</Step>
            <Step n={3} icon={<IconPlus />}>Tap <b className="text-white">"Add to Home Screen"</b></Step>
          </>
        )}
      </ol>
      {isSafari && (
        <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2.5">
          <IconShare className="text-blue-400 shrink-0" />
          <span className="text-xs text-white/50 leading-snug">
            Share icon — box with upward arrow in Safari's bottom bar
          </span>
        </div>
      )}
    </Modal>
  );
}

/* ── Generic browser guide (Chrome/Edge/Firefox desktop) */
function GenericGuide({ onClose }: { onClose: () => void }) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isEdge    = /Edg\//.test(ua);
  const isChrome  = /Chrome\//.test(ua) && !isEdge;
  const isFirefox = /Firefox\//.test(ua);

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Install Zao Works" sub="Add this app to your device" onClose={onClose} />
      <ol className="space-y-4">
        {(isChrome || isEdge) ? (
          <>
            <Step n={1} icon={<IconMenu />}>
              Look for the <b className="text-white">install icon</b> in the address bar{" "}
              <span className="text-white/40 text-xs">(a monitor with a down arrow)</span>
            </Step>
            <Step n={2} icon={<IconPlus />}>
              Or open the <b className="text-white">⋮ menu</b> → <b className="text-white">"Install app"</b>
            </Step>
            <Step n={3} icon={<IconCheck />}>Click <b className="text-white">Install</b> to confirm</Step>
          </>
        ) : isFirefox ? (
          <>
            <Step n={1} icon={<IconMenu />}>Open the <b className="text-white">☰ menu</b></Step>
            <Step n={2} icon={<IconPlus />}>Tap <b className="text-white">"Add to Home Screen"</b></Step>
            <Step n={3} icon={<IconCheck />}>Tap <b className="text-white">Add</b> to confirm</Step>
          </>
        ) : (
          <>
            <Step n={1} icon={<IconMenu />}>Open your <b className="text-white">browser menu</b> <span className="text-white/40 text-xs">(⋮ or ☰)</span></Step>
            <Step n={2} icon={<IconPlus />}>Look for <b className="text-white">"Install app"</b> or <b className="text-white">"Add to Home Screen"</b></Step>
            <Step n={3} icon={<IconCheck />}>Confirm to install</Step>
          </>
        )}
      </ol>
      <p className="mt-4 text-xs text-white/35 leading-snug">
        For the best experience use Chrome, Edge, or Safari.
      </p>
    </Modal>
  );
}

/* ── shared modal shell ──────────────────────────────── */
function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-sm rounded-2xl bg-[#0b1d33] border border-white/10 shadow-2xl px-6 py-6"
        >
          {children}
        </div>
      </div>
    </>
  );
}

function ModalHeader({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <p className="text-base font-bold text-white">{title}</p>
        <p className="text-xs text-white/45 mt-0.5">{sub}</p>
      </div>
      <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l10 10M12 2L2 12" />
        </svg>
      </button>
    </div>
  );
}

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="shrink-0 h-7 w-7 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[11px] font-bold text-blue-300">{n}</span>
      <span className="flex items-center gap-2 text-sm text-white/65 leading-snug">
        <span className="text-white/40 shrink-0">{icon}</span>
        <span>{children}</span>
      </span>
    </li>
  );
}

/* ── icons ───────────────────────────────────────────── */
function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="12" height="10" rx="2" />
      <path d="M10 1v11M7 4l3-3 3 3" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <rect x="3" y="3" width="14" height="14" rx="3" />
      <path d="M10 7v6M7 10h6" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4.5 4.5L16 6" />
    </svg>
  );
}
function IconSafari() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18" />
      <path d="M13.5 6.5L11 11 6.5 13.5 9 9l4.5-2.5z" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="10" cy="5" r="1" fill="currentColor" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}
