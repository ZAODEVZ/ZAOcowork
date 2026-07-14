// ReposWidget shows a compact summary and links to the /repos page
// Future: fetch GitHub data to show active/stale/archived counts

export function ReposWidget() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-green-900/20 to-teal-900/20 border border-green-500/30 p-6 flex flex-col">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-green-200 mb-4">
        Repos
      </h2>

      <div className="flex-1 mb-6">
        <div className="text-sm text-white/80 leading-relaxed mb-4">
          <p>ZAO ecosystem repositories across teams and projects.</p>
        </div>

        {/* Placeholder summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
            <div className="text-xs text-green-200/70">Active</div>
            <div className="text-lg font-bold text-green-300">8+</div>
          </div>
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2">
            <div className="text-xs text-yellow-200/70">Stale</div>
            <div className="text-lg font-bold text-yellow-300">3</div>
          </div>
          <div className="rounded-lg bg-slate-500/10 border border-slate-500/20 p-2">
            <div className="text-xs text-slate-200/70">Archived</div>
            <div className="text-lg font-bold text-slate-300">2+</div>
          </div>
        </div>
      </div>

      <a
        href="/repos"
        className="inline-block rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 px-4 py-2 text-sm font-semibold text-green-200 transition-colors"
      >
        View all repos
      </a>

      <div className="mt-3 text-xs text-white/40">
        Link to /repos page (under development in parallel)
      </div>
    </div>
  );
}
