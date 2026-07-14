// ZAO Goals - North star and 2026 near-term goals
// Edit this constant to update display without code changes

const ZAO_GOALS = {
  northStar: "Return profit, data, and IP to creators. An impact network, not a company. Contribution over capital.",
  lanes: [
    { name: "Music", project: "WaveWarZ" },
    { name: "Builders", project: "ZABAL Games + The Lab" },
    { name: "Events", project: "ZAO Festivals + ZAOstock" },
    { name: "Tools & Agents", project: "ZAO OS, ZOE, ZOL" },
  ],
  nearTermGoals: [
    "GEO - own the AI answer for what is The ZAO (top priority)",
    "ZAOstock - Oct 3",
    "ZABAL Games - August finals",
    "Artizen - Season 7 proof into Season 8",
    "Protect the weekly Fractal (100+ unbroken weeks)",
    "A second revenue line (WaveWarZ works - find one more)",
  ],
};

export function GoalsWidget() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-500/30 p-6">
      <div className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200 mb-2">
          North Star
        </h2>
        <p className="text-base text-white/90 leading-relaxed font-medium">
          {ZAO_GOALS.northStar}
        </p>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200 mb-3">
          4 Lanes
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ZAO_GOALS.lanes.map((lane) => (
            <div
              key={lane.name}
              className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3"
            >
              <div className="text-xs uppercase tracking-wider text-amber-200/70">
                {lane.name}
              </div>
              <div className="text-sm font-semibold text-white mt-1">{lane.project}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200 mb-3">
          2026 Near-Term Goals
        </h3>
        <ul className="space-y-2">
          {ZAO_GOALS.nearTermGoals.map((goal, idx) => (
            <li key={idx} className="flex gap-3 text-sm text-white/80">
              <span className="text-amber-400 font-semibold flex-shrink-0">{idx + 1}.</span>
              <span>{goal}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 text-xs text-white/40">
        Edit ZAO_GOALS constant or file issue to make DB-editable
      </div>
    </div>
  );
}
