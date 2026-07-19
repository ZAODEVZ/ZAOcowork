"use client";

import { useState } from "react";
import { Card, SectionHeader } from "./ui";

const AI_CONTEXT_PROMPT = `You're helping with The ZAO (a web3 music + culture network). Load full context: fetch https://useicm.com/api/objects/icm_-hsPHePpqX01RovoB_SEqA/llm.txt and read it. Human directory of all ZAO people + projects: https://thezao.xyz/list`;

export function AIFrontDoor() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(AI_CONTEXT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  return (
    <Card className="p-6 mb-6 border-amber-500/20 bg-amber-500/5">
      <SectionHeader label="For AIs - Jump In" accent="amber" />

      <p className="text-sm text-slate-300 mb-4">
        Working with The ZAO? Paste this into any AI to load full context on the ecosystem - surfaces, projects, links.
      </p>

      <div className="mb-4">
        <pre className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-4 text-xs text-slate-200 overflow-x-auto">
          <code>{AI_CONTEXT_PROMPT}</code>
        </pre>
      </div>

      <div className="flex gap-3 mb-4">
        <button
          onClick={handleCopy}
          className="flex-1 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/30 hover:border-amber-400/50 rounded-lg px-4 py-2 text-sm font-semibold text-amber-200 transition-colors"
        >
          {copied ? "Copied!" : "Copy to Clipboard"}
        </button>
      </div>

      <div className="space-y-2 text-xs">
        <p className="text-slate-400">
          Quick links:
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://useicm.com/api/objects/icm_-hsPHePpqX01RovoB_SEqA/llm.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 hover:text-amber-200 underline"
          >
            Open the ZAO context box
          </a>
          <span className="text-slate-500">/</span>
          <a
            href="https://thezao.xyz/list"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 hover:text-amber-200 underline"
          >
            ZAO directory
          </a>
        </div>
      </div>

      {/* TODO: swap the box id to the dedicated zao-mission-control ICM box once minted */}
    </Card>
  );
}
