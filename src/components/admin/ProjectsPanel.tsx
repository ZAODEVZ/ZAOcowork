"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/types";
import {
  addProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from "@/app/admin/actions";

// ProjectsPanel: list + create + inline-edit + delete projects.
// Pattern mirrors BrandsPanel so /admin feels consistent.

const STATUS_TONES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  completed: "bg-blue-500/15 text-blue-200 border-blue-500/30",
  cancelled: "bg-red-500/15 text-red-200 border-red-500/30",
};

export function ProjectsPanel({
  projects,
  taskCounts,
  unparentedCount,
  brandNames,
}: {
  projects: Project[];
  taskCounts: Map<string, { total: number; open: number; done: number }>;
  unparentedCount: number;
  brandNames: string[];
}) {
  const [showAdd, setShowAdd] = useState(projects.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/70">
          {projects.length} project{projects.length === 1 ? "" : "s"}
          {unparentedCount > 0 && (
            <span className="ml-2 text-xs text-white/45">
              · {unparentedCount} unparented task{unparentedCount === 1 ? "" : "s"} (no project)
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium px-3 py-1.5 transition"
        >
          {showAdd ? "Cancel" : "+ Add project"}
        </button>
      </div>

      {showAdd && <AddProjectForm brandNames={brandNames} onDone={() => setShowAdd(false)} />}

      <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
        {projects.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-white/55">
            No projects yet. Create one above to start grouping tasks.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {projects.map((p) => {
              const counts = taskCounts.get(p.id) ?? { total: 0, open: 0, done: 0 };
              return <ProjectRow key={p.id} project={p} counts={counts} brandNames={brandNames} />;
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddProjectForm({
  brandNames,
  onDone,
}: {
  brandNames: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        await addProjectAction(formData);
        onDone();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "create failed");
      }
    });
  }

  return (
    <form action={onSubmit} className="rounded-2xl bg-indigo-500/[0.08] border border-indigo-500/30 p-4">
      <div className="text-xs font-semibold text-indigo-200 mb-3 uppercase tracking-wider">
        New project
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name *" hint="Human-readable, max 80 chars">
          <input
            name="name"
            required
            maxLength={80}
            placeholder="WaveWarZ Phase 2"
            className={inputCls}
          />
        </Field>
        <Field label="Slug *" hint="Lowercase, dashes ok. Used in URLs + bot commands.">
          <input
            name="slug"
            required
            pattern="^[a-z0-9][a-z0-9-]{1,40}$"
            placeholder="wavewarz-phase-2"
            className={inputCls}
          />
        </Field>
        <Field label="Default brand">
          <select name="brand_default" className={inputCls} defaultValue="">
            <option value="">(none)</option>
            {brandNames.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target date" hint="Optional. YYYY-MM-DD">
          <input name="target_date" placeholder="2026-08-15" className={inputCls} />
        </Field>
        <Field label="Sort order" hint="Lower = shown first. Default 100.">
          <input name="sort_order" defaultValue="100" className={inputCls} />
        </Field>
        <Field label="Color (Tailwind class)" hint="Optional. Defaults to neutral.">
          <input
            name="color"
            placeholder="bg-cyan-500/20 text-cyan-200 border-cyan-500/40"
            className={inputCls}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description" hint="Optional one-liner shown on the project card.">
            <textarea
              name="description"
              rows={2}
              placeholder="Ship the parklet booking flow + Stripe + landing"
              className={`${inputCls} resize-none`}
            />
          </Field>
        </div>
      </div>
      {error && <div className="mt-3 text-[11px] text-red-300">{error}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-lg border border-white/10 hover:bg-white/5 text-white/70 text-xs font-medium px-3 py-1.5 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold px-3 py-1.5 transition disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}

function ProjectRow({
  project,
  counts,
  brandNames,
}: {
  project: Project;
  counts: { total: number; open: number; done: number };
  brandNames: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function saveEdit(formData: FormData) {
    setError(null);
    formData.set("id", project.id);
    start(async () => {
      try {
        await updateProjectAction(formData);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "update failed");
      }
    });
  }

  function changeStatus(status: string) {
    const fd = new FormData();
    fd.set("id", project.id);
    fd.set("status", status);
    start(async () => {
      try {
        await updateProjectAction(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "status change failed");
      }
    });
  }

  function togglePublic() {
    const fd = new FormData();
    fd.set("id", project.id);
    fd.set("is_public", project.isPublic ? "false" : "true");
    start(async () => {
      try {
        await updateProjectAction(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "public toggle failed");
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete project "${project.name}"? Tasks will be unparented (not deleted).`)) return;
    const fd = new FormData();
    fd.set("id", project.id);
    start(async () => {
      try {
        await deleteProjectAction(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "delete failed");
      }
    });
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form action={saveEdit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Name">
              <input name="name" defaultValue={project.name} className={inputCls} />
            </Field>
            <Field label="Default brand">
              <select name="brand_default" defaultValue={project.brandDefault ?? ""} className={inputCls}>
                <option value="">(none)</option>
                {brandNames.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target date">
              <input name="target_date" defaultValue={project.targetDate ?? ""} placeholder="YYYY-MM-DD" className={inputCls} />
            </Field>
            <Field label="Sort order">
              <input name="sort_order" defaultValue={project.sortOrder} className={inputCls} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Description">
                <textarea name="description" defaultValue={project.description ?? ""} rows={2} className={`${inputCls} resize-none`} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Color (Tailwind class)">
                <input name="color" defaultValue={project.color} className={inputCls} />
              </Field>
            </div>
          </div>
          {error && <div className="mt-2 text-[11px] text-red-300">{error}</div>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded-lg border border-white/10 hover:bg-white/5 text-white/70 text-xs px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`px-4 py-3 hover:bg-white/[0.02] ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] uppercase tracking-wider rounded-md border px-1.5 py-0.5 ${project.color}`}>
              {project.slug}
            </span>
            <span className={`text-[9px] uppercase rounded-md border px-1.5 py-0.5 ${STATUS_TONES[project.status]}`}>
              {project.status}
            </span>
            {project.brandDefault && (
              <span className="text-[9px] text-white/55 border border-white/15 rounded-md px-1.5 py-0.5">
                {project.brandDefault}
              </span>
            )}
            {project.targetDate && (
              <span className="text-[10px] text-white/45">target {project.targetDate}</span>
            )}
          </div>
          <div className="text-sm font-medium text-white">{project.name}</div>
          {project.description && (
            <div className="text-[11px] text-white/50 mt-0.5">{project.description}</div>
          )}
          <div className="text-[10px] text-white/35 mt-1">
            <a href={`/?project=${encodeURIComponent(project.slug)}`} className="underline hover:text-white/65">
              {counts.total} task{counts.total === 1 ? "" : "s"}
            </a>{" "}
            ({counts.open} open, {counts.done} done)
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[10px] text-white/50 hover:text-white border border-white/10 rounded px-2 py-0.5"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={togglePublic}
            disabled={pending}
            className={`text-[10px] border rounded px-2 py-0.5 transition disabled:opacity-50 ${
              project.isPublic
                ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/30"
                : "text-white/50 hover:text-white border-white/10 hover:border-white/30"
            }`}
          >
            {project.isPublic ? "Public" : "Private"}
          </button>
          <select
            value={project.status}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={pending}
            className="text-[10px] rounded bg-[#0b1220] border border-white/10 px-1.5 py-0.5 text-white/75 disabled:opacity-50"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] text-red-300/70 hover:text-red-200 border border-red-500/20 hover:border-red-500/40 rounded px-2 py-0.5"
          >
            Delete
          </button>
        </div>
      </div>
      {error && <div className="mt-1 text-[11px] text-red-300">{error}</div>}
    </li>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-white/45">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-white/35 mt-0.5">{hint}</span>}
    </label>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg bg-[#0b1220] border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50";
