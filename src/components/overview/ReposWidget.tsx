import { Card, SectionHeader, StatTile } from "./ui";

export function ReposWidget() {
  return (
    <Card className="p-6 flex flex-col">
      <SectionHeader label="Repos" accent="green" />

      <div className="flex-1 mb-6">
        <p className="text-sm text-white/80 leading-relaxed mb-4">
          ZAO ecosystem repositories across teams and projects.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Active" value="8+" accent="green" size="sm" />
          <StatTile label="Stale" value="3" accent="orange" size="sm" />
          <StatTile label="Archived" value="2+" accent="green" size="sm" />
        </div>
      </div>

      <a
        href="/repos"
        className="inline-block rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 px-4 py-2 text-sm font-semibold text-green-200 transition-colors"
      >
        View all repos
      </a>

      <div className="mt-3 text-xs text-white/40">Link to /repos (under development)</div>
    </Card>
  );
}
