"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  OWNERS,
  PRIORITIES,
  SERVICE_CLASSES,
  SERVICE_CLASS_LABELS,
  relativeTime,
  type ActionItem,
} from "@/lib/types";
import { triageRoute, triageReject } from "@/app/actions";

// TriagePanel renders the inbox of TRIAGE items and lets a lead route
// each one in a single submit: owner + priority + service class + brand.
// On submit the row moves status -> TODO and disappears from this list.
//
// Reject button: marks the row archived (soft delete) with a "rejected
// at triage" activity entry, so the row stays in audit but vanishes
// from active views.
export function TriagePanel({
  items,
  brands,
}: {
  items: ActionItem[];
  brands: string[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 text-center">
        <div className="text-sm text-white/55">
          Nothing waiting. When external writers (Telegram bot, /meeting capture,
          research dispatcher) drop new items here, they will show up for routing.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <TriageCard key={it.id} item={it} brands={brands} />
      ))}
    </div>
  );
}

function TriageCard({ item, brands }: { item: ActionItem; brands: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [owner, setOwner] = useState<string>(String(item.owner) === "Both" ? "Open" : String(item.owner) || "Open");
  const [priority, setPriority] = useState<string>(item.priority);
  const [serviceClass, setServiceClass] = useState<string>(item.serviceClass ?? "Standard");
  const [brand, setBrand] = useState<string>((item.brands && item.brands[0]) || "");

  function onRoute() {
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("owner", owner);
    fd.set("priority", priority);
    fd.set("serviceClass", serviceClass);
    if (brand) fd.set("brand", brand);
    start(async () => {
      await triageRoute(fd);
      router.refresh();
    });
  }
  function onReject() {
    if (!confirm(`Reject "${item.title}"? It will be archived (soft delete) and removed from triage.`)) return;
    const fd = new FormData();
    fd.set("id", item.id);
    start(async () => {
      await triageReject(fd);
      router.refresh();
    });
  }

  const created = relativeTime(item.createdAt);
  const source = item.createdBy || "unknown";

  return (
    <div className={`rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/[0.06] p-4 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{item.title}</div>
          <div className="text-[11px] text-white/45 mt-0.5">
            #{item.id} - created {created} by {source}
            {item.notes ? ` - ${item.notes.slice(0, 80)}${item.notes.length > 80 ? "..." : ""}` : ""}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Selector label="Owner" value={owner} onChange={setOwner} options={[...OWNERS]} />
        <Selector label="Priority" value={priority} onChange={setPriority} options={[...PRIORITIES]} />
        <Selector
          label="Service class"
          value={serviceClass}
          onChange={setServiceClass}
          options={SERVICE_CLASSES.map((sc) => sc)}
          labels={SERVICE_CLASS_LABELS as Record<string, string>}
        />
        <Selector
          label="Brand (optional)"
          value={brand}
          onChange={setBrand}
          options={["", ...brands]}
          labels={{ "": "(none)" }}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          className="rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-xs font-medium px-3 py-1.5 transition"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onRoute}
          disabled={pending}
          className="rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-xs font-medium px-3 py-1.5 transition"
        >
          Send to TODO
        </button>
      </div>
    </div>
  );
}

function Selector({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-white/45">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg bg-[#0b1220] border border-white/10 px-2 py-1.5 text-xs text-white/85"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}
