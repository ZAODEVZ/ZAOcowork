"use client";

import { useState } from "react";
import type { BrandRow } from "@/lib/brands-db";
import { migrationPath } from "@/lib/migrations";
import {
  addBrandAction,
  deleteBrandAction,
  updateBrandAction,
} from "@/app/admin/actions";

// /admin Brands panel. Shows every brand (DB-backed if the 002 migration has
// run, otherwise the const fallback projected through FALLBACK_BRANDS so the
// table isn't empty pre-migration). New brands write to the DB. Editing or
// deleting a const-` prefixed row is blocked at the action layer with a
// helpful error since they aren't real DB rows yet.

const COLOR_PRESETS = [
  { label: "Indigo", value: "bg-indigo-600/30 text-indigo-200 border-indigo-500/40" },
  { label: "Slate", value: "bg-slate-600/30 text-slate-200 border-slate-500/40" },
  { label: "Amber", value: "bg-amber-600/30 text-amber-200 border-amber-500/40" },
  { label: "Cyan", value: "bg-cyan-600/30 text-cyan-200 border-cyan-500/40" },
  { label: "Red", value: "bg-red-600/30 text-red-200 border-red-500/40" },
  { label: "Fuchsia", value: "bg-fuchsia-600/30 text-fuchsia-200 border-fuchsia-500/40" },
  { label: "Emerald", value: "bg-emerald-600/30 text-emerald-200 border-emerald-500/40" },
  { label: "Rose", value: "bg-rose-600/30 text-rose-200 border-rose-500/40" },
  { label: "Teal", value: "bg-teal-600/30 text-teal-200 border-teal-500/40" },
  { label: "Yellow", value: "bg-yellow-600/30 text-yellow-200 border-yellow-500/40" },
  { label: "Violet", value: "bg-violet-600/30 text-violet-200 border-violet-500/40" },
  { label: "Orange", value: "bg-orange-600/30 text-orange-200 border-orange-500/40" },
  { label: "Pink", value: "bg-pink-600/30 text-pink-200 border-pink-500/40" },
];

export function BrandsPanel({
  brands,
  migrationApplied,
}: {
  brands: BrandRow[];
  migrationApplied: boolean;
}) {
  return (
    <div className="space-y-4">
      {!migrationApplied && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="font-semibold mb-1">brands table not ready</div>
          <div className="text-xs text-amber-100/85">
            Apply <code className="text-amber-300">{migrationPath("brands_table")}</code> in the
            Supabase SQL editor to enable add/edit/delete. The list below is the const fallback for read-only display.
          </div>
        </div>
      )}
      <AddBrandForm disabled={!migrationApplied} />
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Slugs (hashtag aliases)</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">Sort</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <BrandRowView key={b.id} brand={b} migrationApplied={migrationApplied} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-white/40">
        Sort order under 100 = primary top-row tab. 100+ = lives in the More dropdown.
        Lower numbers render first. Tasks tagged with a brand keep the tag even if the brand
        is deactivated or deleted, so untag in bulk first if you want them out of filters.
      </p>
    </div>
  );
}

function AddBrandForm({ disabled }: { disabled: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await addBrandAction(fd);
          (document.getElementById("admin-add-brand-form") as HTMLFormElement | null)?.reset();
        } finally {
          setPending(false);
        }
      }}
      id="admin-add-brand-form"
      className={`rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/85">Add brand</span>
        <span className="text-[10px] text-white/40">surfaces in tabs + filters + NL parser</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Field label="Name" name="name" placeholder='e.g. "ZAO Cards"' required />
        <Field
          label="Slugs (comma-sep, lowercase)"
          name="slugs"
          placeholder="zao-cards, cards"
        />
        <SelectColor name="color" />
        <Field
          label="Sort order"
          name="sort_order"
          type="number"
          placeholder="100 = More dropdown; 10..60 = primary tab"
          defaultValue="100"
          required
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50 transition"
        >
          {pending ? "Adding..." : "Add brand"}
        </button>
      </div>
    </form>
  );
}

function BrandRowView({ brand, migrationApplied }: { brand: BrandRow; migrationApplied: boolean }) {
  const [editing, setEditing] = useState(false);
  const isConst = brand.id.startsWith("const-");
  const editable = migrationApplied && !isConst;

  if (editing && editable) {
    return (
      <tr className="border-b border-white/5 bg-white/[0.03]">
        <td colSpan={6} className="px-3 py-3">
          <form
            action={async (fd) => {
              await updateBrandAction(fd);
              setEditing(false);
            }}
            className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end"
          >
            <input type="hidden" name="id" value={brand.id} />
            <Field label="Name" name="name" defaultValue={brand.name} required />
            <Field
              label="Slugs"
              name="slugs"
              defaultValue={brand.slugs.join(", ")}
              placeholder="comma-sep, lowercase"
            />
            <SelectColor name="color" defaultValue={brand.color} />
            <Field
              label="Sort"
              name="sort_order"
              type="number"
              defaultValue={String(brand.sort_order)}
              required
            />
            <SelectField
              label="Status"
              name="active"
              options={[
                { label: "active", value: "true" },
                { label: "inactive", value: "false" },
              ]}
              defaultValue={brand.active ? "true" : "false"}
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="rounded-md bg-zao-accent hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-black transition"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-white/55 hover:text-white/85"
              >
                cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded border text-xs ${brand.color}`}>
          {brand.name}
        </span>
      </td>
      <td className="px-3 py-2 text-white/55 font-mono text-[11px]">
        {brand.slugs.length === 0 ? <span className="text-white/30">-</span> : brand.slugs.join(", ")}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block w-6 h-4 rounded border ${brand.color}`} title={brand.color} />
      </td>
      <td className="px-3 py-2 text-xs text-white/60">{brand.sort_order}</td>
      <td className="px-3 py-2">
        <span
          className={`text-[11px] rounded px-2 py-0.5 border ${
            brand.active
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
              : "border-white/15 bg-white/[0.04] text-white/55"
          }`}
        >
          {brand.active ? "active" : "inactive"}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        {isConst ? (
          <span className="text-[10px] text-white/30">seed (apply 002 to edit)</span>
        ) : editable ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] underline text-white/65 hover:text-white/90"
            >
              edit
            </button>
            <form action={deleteBrandAction} className="inline">
              <input type="hidden" name="id" value={brand.id} />
              <button
                type="submit"
                onClick={(e) => {
                  if (
                    !window.confirm(
                      `Delete brand "${brand.name}"? Existing tasks tagged with it keep the tag. They just won't show up in filters anymore.`,
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
                className="text-[11px] text-red-300/80 hover:text-red-200 underline"
              >
                delete
              </button>
            </form>
          </div>
        ) : (
          <span className="text-[10px] text-white/30">migration pending</span>
        )}
      </td>
    </tr>
  );
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-white/55">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-zao-accent/60"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  defaultValue?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-white/55">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white/85"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectColor({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <label className="block text-xs">
      <span className="text-white/55">Color</span>
      <select
        name={name}
        defaultValue={defaultValue ?? COLOR_PRESETS[0].value}
        className="mt-1 w-full rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white/85"
      >
        {COLOR_PRESETS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
