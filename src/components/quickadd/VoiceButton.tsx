"use client";

import { useEffect, useRef, useState } from "react";

// Web Speech API mic button. Records a single utterance and pipes the final
// transcript into onTranscript. Falls back to disabled state in browsers
// without the API (Firefox, some Linux builds). webkitSpeechRecognition is
// the de-facto cross-browser name; the standardized SpeechRecognition only
// exists on bleeding-edge builds.

type MinimalRecognition = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => MinimalRecognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<MinimalRecognition | null>(null);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const results = e.results;
      let final = "";
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.isFinal) final += r[0].transcript;
      }
      const trimmed = final.trim();
      if (trimmed) onTranscript(trimmed);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={disabled}
      title={listening ? "Stop listening" : "Speak your task"}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      className={`flex items-center justify-center h-9 w-9 rounded-lg border transition disabled:opacity-50 ${
        listening
          ? "border-red-400/60 bg-red-500/20 text-red-200 animate-pulse"
          : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white hover:bg-white/[0.08]"
      }`}
    >
      <span className="text-base leading-none">{listening ? "■" : "◉"}</span>
    </button>
  );
}
