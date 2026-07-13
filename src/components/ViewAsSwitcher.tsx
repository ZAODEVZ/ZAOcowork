"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface TeamMember {
  id: string;
  name: string;
  legacyOwner: string;
}

export function ViewAsSwitcher({ currentUser, isAdmin }: { currentUser: string; isAdmin: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewAsParam = searchParams.get("viewAs");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin || !open) return;
    setLoading(true);
    fetch("/api/team/members")
      .then((res) => res.json())
      .then((data) => {
        setMembers(data || []);
      })
      .catch(() => {
        setMembers([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isAdmin, open]);

  if (!isAdmin) {
    return null;
  }

  function setViewAs(legacyOwner: string) {
    const url = new URL(window.location.href);
    if (legacyOwner && legacyOwner !== currentUser) {
      url.searchParams.set("viewAs", legacyOwner);
    } else {
      url.searchParams.delete("viewAs");
    }
    router.push(url.toString());
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/5 transition"
        title="View board as another team member"
      >
        View as {viewAsParam || "me"}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-white/20 bg-[#0a1625] shadow-lg z-50">
          <div className="p-2 space-y-1">
            {/* Show "View as me" option */}
            <button
              onClick={() => setViewAs(currentUser)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition ${
                !viewAsParam
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              View as me
            </button>

            <div className="border-t border-white/10 my-1" />

            {loading ? (
              <div className="px-3 py-2 text-xs text-white/50">Loading...</div>
            ) : members.length === 0 ? (
              <div className="px-3 py-2 text-xs text-white/50">No team members</div>
            ) : (
              members.map((member) => (
                <button
                  key={member.id}
                  onClick={() => setViewAs(member.legacyOwner)}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition ${
                    viewAsParam === member.legacyOwner
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {member.name} ({member.legacyOwner})
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
