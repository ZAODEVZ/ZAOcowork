"use client";

import { useEffect, useState, useTransition } from "react";
import type { TeamMember, TeamRole } from "@/lib/team";
import {
  addUserAction,
  deleteUserAction,
  resetPasswordAction,
  setActiveAction,
  setRoleAction,
} from "@/app/admin/actions";

// /admin Users surface. Server actions handle the writes; this client wrapper
// just renders the form + per-row controls. Founders (Zaal/Iman) are
// protected from demote/delete in the UI - the in-code isAdmin() also has a
// hardcoded admin override for them so any DB-side accident is recoverable.

const ROLES: TeamRole[] = ["admin", "lead", "worker"];

function isFounder(m: TeamMember): boolean {
  const slug = (m.legacy_owner ?? "").toLowerCase();
  return slug === "zaal" || slug === "iman";
}

export function UsersPanel({ members, actorLabel }: { members: TeamMember[]; actorLabel: string }) {
  return (
    <div className="space-y-4">
      <AddUserForm />
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Login slug</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Password</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <UserRow key={m.id} member={m} actorLabel={actorLabel} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-white/40">
        Login slug is the lowercased identifier used in session cookies. Treat it as
        immutable - changing it would invalidate any existing session for that user.
      </p>
    </div>
  );
}

function AddUserForm() {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await addUserAction(fd);
          (document.getElementById("admin-add-user-form") as HTMLFormElement | null)?.reset();
        } finally {
          setPending(false);
        }
      }}
      id="admin-add-user-form"
      className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/85">Add user</span>
        <span className="text-[10px] text-white/40">creates a login + roster row</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Field label="Display name" name="name" placeholder="e.g. Cannon Jones" required />
        <Field
          label="Login slug"
          name="legacy_owner"
          placeholder="lowercase, e.g. cannon"
          required
          pattern="^[a-z][a-z0-9_-]{0,30}$"
        />
        <Field
          label="Initial password"
          name="password"
          type="password"
          placeholder="min 8 chars"
          minLength={8}
          required
        />
        <SelectField label="Role" name="role" options={ROLES} defaultValue="worker" />
        <Field label="Telegram ID (optional)" name="telegram_id" placeholder="numeric" />
        <Field label="Email (optional)" name="email" type="email" placeholder="user@example.com" />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50 transition"
        >
          {pending ? "Adding..." : "Add user"}
        </button>
      </div>
    </form>
  );
}

function UserRow({ member }: { member: TeamMember; actorLabel: string }) {
  const founder = isFounder(member);
  const [editingPwd, setEditingPwd] = useState(false);
  const [role, setRole] = useState<TeamRole>(member.role);
  const [roleSaving, startRole] = useTransition();

  // Keep local optimistic value in sync if the server-rendered role changes
  // (e.g. after a refresh or another admin's edit lands).
  useEffect(() => setRole(member.role), [member.role]);

  function changeRole(next: TeamRole) {
    const prev = role;
    setRole(next); // optimistic
    const fd = new FormData();
    fd.set("id", member.id);
    fd.set("role", next);
    startRole(async () => {
      try {
        await setRoleAction(fd);
      } catch {
        setRole(prev); // revert on failure
      }
    });
  }

  return (
    <tr className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
      <td className="px-3 py-2 text-white/90">{member.name}</td>
      <td className="px-3 py-2 text-white/60 font-mono text-xs">{member.legacy_owner ?? "-"}</td>
      <td className="px-3 py-2">
        <select
          value={role}
          onChange={(e) => changeRole(e.target.value as TeamRole)}
          disabled={roleSaving || (founder && member.role === "admin")}
          className="rounded-md bg-[#0b1220] border border-white/10 px-2 py-1 text-xs text-white/85 disabled:opacity-60"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-xs text-white/60">
        {editingPwd ? (
          <form
            action={async (fd) => {
              await resetPasswordAction(fd);
              setEditingPwd(false);
            }}
            className="flex items-center gap-1"
          >
            <input type="hidden" name="id" value={member.id} />
            <input
              type="password"
              name="password"
              minLength={8}
              required
              placeholder="new password (8+)"
              className="rounded bg-[#0b1220] border border-white/10 px-2 py-1 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-zao-accent/80 hover:bg-zao-accent px-2 py-1 text-[11px] text-black"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingPwd(false)}
              className="text-[11px] text-white/45 hover:text-white/80"
            >
              cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span>
              {member.has_password ? (
                <span className="text-emerald-300">DB</span>
              ) : (
                <span className="text-white/40">env-var</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditingPwd(true)}
              className="text-[11px] underline text-white/55 hover:text-white/85"
            >
              reset
            </button>
            {member.password_set_at && (
              <span className="text-[10px] text-white/35">
                set {new Date(member.password_set_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <form action={setActiveAction} className="inline">
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="active" value={member.active ? "false" : "true"} />
          <button
            type="submit"
            disabled={founder}
            className={`text-[11px] rounded px-2 py-1 border ${
              member.active
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/15 bg-white/[0.04] text-white/55"
            } disabled:opacity-50`}
            title={
              founder
                ? "Founders can't be deactivated"
                : member.active
                  ? "Click to deactivate"
                  : "Click to reactivate"
            }
          >
            {member.active ? "active" : "inactive"}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 text-right">
        {founder ? (
          <span className="text-[10px] text-white/30">protected</span>
        ) : (
          <form action={deleteUserAction} className="inline">
            <input type="hidden" name="id" value={member.id} />
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm(`Delete ${member.name}? This removes the login + roster row permanently. Deactivate instead?`)) {
                  e.preventDefault();
                }
              }}
              className="text-[11px] text-red-300/80 hover:text-red-200 underline"
            >
              delete
            </button>
          </form>
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
  minLength,
  pattern,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  pattern?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-white/55">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        pattern={pattern}
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
  options: readonly string[];
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
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
