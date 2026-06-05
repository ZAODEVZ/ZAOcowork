# ZAO Co-Works — Ecosystem Board Upgrade: Research & Roadmap

Synthesized from a 5-track deep-research pass (board UI/UX, ops dashboards, multi-brand
navigation, web3 identity/gating, web3 governance/payments). Sources cited at the end of
each section. Bias: production-ready, audited, widely-adopted, Next.js 15 / React 19 /
Supabase-compatible.

> **Constraint honored throughout:** we adopt other people's SDKs and already-deployed,
> audited contracts. We write **no** smart contracts of our own.

---

## PART 1 — BOARD UI/UX REDESIGN DIRECTION

### 1.1 The core shift: the board is one *view*, not the whole app

Every mature tool (Linear, Plane, Asana, Height) treats the data set as view-agnostic and
ships ~5 interchangeable layouts switched in one click: **Board (Kanban) · List · Table ·
Calendar · Timeline/Gantt**. We currently render only Kanban.

- **Table/Spreadsheet view** — bulk triage + multivariate comparison. Cards are *bad* at
  comparison (NN/g: users must "spatially reorient" between cards); tables win. Right-align
  numbers, left-align text, sticky header, sort/filter.
- **Timeline view** — due dates + dependencies + critical path.
- **Calendar view** — deadline-driven work.
- **Grouping as a switchable axis** — group the same items by status / owner / priority /
  brand / service-class on the fly (Linear & Plane both treat grouping as a display option,
  not fixed columns).

*Sources: docs.plane.so/core-concepts/issues/layouts, nngroup.com/articles/cards-component,
nngroup.com/articles/data-tables, asana.com/features/project-management/project-views*

### 1.2 Card design (cards should carry less, not more)

- Show only **what it is + who owns it** as required; everything else (priority, brand,
  due-countdown, age, PR link) is deliberate, not default — overload kills scannability.
- Titles start with an **action verb** ("Implement X", not "X stuff").
- **Hover reveals quick actions + inline edit** (Trello-style: hover→edit pencil, single-key
  hotkeys). Don't force opening the panel for a one-field change.
- **Never encode meaning by color alone** — every status/priority/owner color must pair with
  text/icon/shape (color-blind + grayscale safe). *Our priority dots currently fail this;
  the amber CLAIM badge passes (color + text).*

*Sources: wrike.com/kanban-guide/kanban-cards, kanbantool.com (card design), nngroup.com
(cards), blog.greeden.me dark-mode a11y guide, support.atlassian.com/trello*

### 1.3 Aging & SLA — make time visible

- **Darken the card progressively as it ages** toward/past its Service Level Expectation
  (SLE) — a preattentive cue, no reading required. (We already compute `ageDays`/`isStale`;
  wire it to card background intensity.)
- Keep **Classes of Service** (we already have Standard/FixedDate/Expedite/Intangible) as a
  card badge or lane, since they encode cost-of-delay.
- **Per-column WIP count** in the header; warn when over a soft limit. (We have a
  column-header review badge to build on.)

*Sources: prokanban.org (visualising work item aging), businessmap.io classes-of-service,
djaa.com/classes-of-service*

### 1.4 Dark theme (validate + tighten what we have)

- Our navy surfaces (`#0a1628`, `#0f1d33`, `#0b1220` inputs) already follow the
  **no-pure-black** rule — good. Keep going.
- Adopt a **token-driven theme** like Linear's (base + accent + contrast variables) and a
  Geist-style **layered surface scale** (Background 1 default, Background 2 sparingly; tiered
  Color 1=hover, 2=active, 2/3=badge bg; dedicated border color).
- Hit WCAG **per theme**: 4.5:1 text, 3:1 large text & UI borders.
- **Restraint is the 2025 trend** — Linear pulled its own blue toward near-neutral, reserving
  color for meaning. Use accent color only where it carries information.

*Sources: vercel.com/geist/colors, blog.logrocket.com/ux-design/linear-design,
linear.app/changelog 2024-03-20, accesify.io dark-mode, WCAG 2.2 contrast guides*

### 1.5 Concrete design tokens (copyable)

- **Spacing:** 4 / 8 / 16 / 24 / 32 / 48 / 64. Start with too much whitespace, remove.
- **Type scale:** 12 / 14 / 16 / 20 / 24 / 30 / 36; ≤2 families (Linear uses Inter Display +
  Inter). Hierarchy from size + weight + color, not size alone.
- **Motion:** micro-interactions 100–200ms; modal/view transitions 200–500ms; ease-out on
  enter, ease-in on exit, exits ~50ms faster. <100ms feels instant, >1s breaks flow.
- **Drag:** pick-up shadow, visible drop zone, target-column highlight that follows the drag;
  ~300ms in/out; dedicated drag handles on dense boards.

*Sources: refactoringui.com, nngroup.com/articles/animation-duration,
blog.logrocket.com/ux-design/drag-and-drop-ui-examples, equal.design motion rules*

### 1.6 Command palette (Cmd+K) — we partially have this

`Cmd/Ctrl+K` is the de-facto standard (Linear/Vercel/GitHub/Slack/Raycast). It should be
**fuzzy** and double as **universal search over content AND actions** (jump to task, change
status, filter). We have QuickAdd with ⌘K + find mode — extend it to actions/navigation.

*Sources: mobbin.com/glossary/command-palette, blog.superhuman.com command palette*

---

## PART 2 — DASHBOARDS & DATA VIZ

### 2.1 The metrics that actually matter (flow metrics)

| Metric | Definition | Why |
|---|---|---|
| **Throughput** | items completed / time | delivery rate |
| **Cycle time** | start → done | team working clock |
| **Lead time** | request → done | customer wait |
| **WIP** | started but not finished | the lever to reduce cycle time |
| **Work Item Age** | time since in-progress item entered, to *now* | the only **leading**/predictive metric |
| **Flow Efficiency** | active ÷ total elapsed | exposes waiting (usually 15–40%) |

Little's Law: avg Cycle Time = avg WIP ÷ avg Throughput.

### 2.2 The 4 charts worth building (priority order)

1. **Aging WIP chart** — mirrors the board: x = columns, y = days in stage, dots = items,
   WIP count per column. *Leading indicator, reuses our column layout.* Build first.
2. **Cycle-time scatterplot** with **85th-percentile SLE line** — set "85% finish within N
   days" expectations. (Vacanti: use percentiles, **never** mean±SD — cycle data isn't
   normal.)
3. **Cumulative Flow Diagram (CFD)** — stacked area by status; a widening band = bottleneck.
4. **Portfolio RAG roll-up** across Dev/Music/Marketing — one row per brand, status pill,
   with **explicit conservative logic** ("Red if any P1 is overdue", not averaged).

Encode card aging by **darkening cards**, not a new widget.

### 2.3 Dashboard UX

- Users scan **F-pattern** → most important KPI **top-left**, trends in the middle band.
- Cap competing elements (~7) above the fold; **progressive disclosure / drill-down**.
- First-class **time-range control** with **delta vs previous period**.

### 2.4 Charting library pick

**Recharts** (or **Tremor**, which is built on Recharts with shadcn-style prebuilt dashboard
components). Lowest friction for React, our data volume is modest (no Canvas scaling concern).
Reach for Nivo only if we need exotic charts; visx only if we need max control.

*Sources: getdx.com/blog/flow-metrics, agileambition.com (work item age), tameflow.com
(Vacanti scatterplots/SLA), Atlassian CFD docs, getnave.com aging-chart, businessmap.io,
nngroup.com/articles/dashboards-preattentive, Swarmia engineering-metrics, Linear Insights,
Plane analytics, blog.logrocket.com best-react-chart-libraries-2026, pkgpulse.com*

---

## PART 3 — MULTI-BRAND ECOSYSTEM NAVIGATION

### 3.1 The IA verdict: ONE workspace, brands as filters/teams — keep our model

Tools converge on **one workspace per org**; sub-brands become teams/projects/spaces inside
it. Linear's explicit guidance: **start with one team + labels**, only split into separate
teams when groups "rarely overlap." Separate workspaces/tenants are justified only by hard
**isolation** needs (data, permissions, blast radius) — not tidiness.

→ **Our portal-tabs + category-filter model is already the recommended pattern.** Keep
brands as filters/tabs inside one app unless a brand needs isolated membership/permissions.

### 3.2 The three near-term gaps (vs Linear/Asana/Notion)

1. **Cross-brand "My Work" inbox** — keyed to *relationship to user* (assigned / created /
   subscribed / recent), not to category. One inbox spanning all brands. (Linear "My Issues"
   has exactly these tabs with a "Focus" default ordering.)
2. **Saved filtered views as favoritable sidebar nav** — in modern tools, saved filters *are*
   the navigation (dynamic, favoritable, scoped to personal/team/workspace). Replace fixed
   portal tabs with saved views users can pin.
3. **Portfolio roll-up** — one row per brand with a status pill + rolled-up counts, above the
   boards (see 2.2 #4).

### 3.3 Switcher rules (if/when we add brand-scoping)

- Keep the **active scope explicit and persistent** (Vercel-style top-bar scope). Once a
  brand is selected, every downstream view filters to it.
- **Don't hide the switcher behind a click** — Slack's 2024 redesign did and had to reverse
  for power users. Disclose everything frequently needed up front.
- **Cap disclosure at two levels** (NN/g: 3+ levels measurably hurts). Favorites/pinning +
  universal search keep nav flat as brand count grows.

*Sources: docs.plane.so/core-concepts/workspaces, linear.app/docs/teams + custom-views +
my-issues + favorites, notion.com teamspaces, vercel.com/changelog new-dashboard-navigation,
slack.com redesign + flagsmith critique, asana.com portfolios, workos.com multi-tenant guide,
nngroup.com progressive-disclosure*

---

## PART 4 — WEB3 INTEGRATION LAYER (adopt, don't build)

### 4.1 Identity & auth — the foundation everything else needs

- **Base layer:** `wagmi` + `viem` (MIT, wevm org, very active). Every wallet UI sits on this.
- **Wallet UI:** **RainbowKit** (MIT, official Next.js App Router support) or **ConnectKit**
  (lighter). Needs only a free WalletConnect/Reown `projectId`.
- **Auth → Supabase:** Supabase has **first-party "Sign in with Web3"** using the EIP-4361
  **SIWE** standard — a connected wallet becomes a real `auth.users` row with RLS/session. No
  custom JWT bridge. *This is the clean path when we do the Supabase auth migration (Phase 2
  in our roadmap).* (Re-confirm exact client method name against live Supabase docs — newer
  API.)
- **ENS** names + avatars: built into wagmi (`useEnsName`, `useEnsAvatar`) — needs a mainnet
  RPC. **Farcaster** identity: AuthKit (free, self-host, read-only) or Neynar (paid, write +
  rich data).

*Sources: github.com/wevm/wagmi, github.com/rainbow-me/rainbowkit, supabase.com/docs/guides/
auth/auth-web3, eips.ethereum.org/EIPS/eip-4361, wagmi.sh ENS hooks, docs.farcaster.xyz/
auth-kit, docs.neynar.com*

### 4.2 Reputation — EAS (Ethereum Attestation Service)

Free, tokenless, audited public good. SDK `@ethereum-attestation-service/eas-sdk` (MIT).
Already deployed on mainnet + Optimism/Base/Arbitrum/Linea. **Off-chain signed attestations
cost zero gas.** Use case maps exactly to our model: a lead attests "ThyRev completed task X"
→ portable, verifiable contributor reputation graph. Anchor on-chain selectively.

*Sources: github.com/ethereum-attestation-service/eas-sdk, docs.attest.org,
docs.optimism.io/chain/identity/contracts-eas*

### 4.3 Token-gating / access

For simple "does this wallet hold token/NFT X or have role Y" → **wagmi/viem reads (or an EAS
check) evaluated server-side, gating Supabase RLS** — no third-party service needed. Escalate
only if required: **Lit Protocol** (encrypt the actual content; paid Capacity Credits),
**Guild.xyz** (hosted gating + Discord/TG; verify current SDK version), **Unlock** (sellable
membership NFTs).

*Sources: github.com/LIT-Protocol/js-sdk, github.com/guildxyz/guild-sdk,
github.com/unlock-protocol/unlock*

### 4.4 Governance — link decisions to tasks

- **Snapshot** (off-chain, gasless, free): `@snapshot-labs/snapshot.js` to write
  proposals/votes (signed in browser); read via `hub.snapshot.org/graphql`. Lowest friction.
- **Tally** only if we adopt an on-chain Governor contract (binding, gas per vote).
- **Pattern:** store `proposalId` + `source` on the Supabase task row; poll GraphQL
  server-side; auto-transition a task when its linked proposal passes. *Keeps our read-only
  assistant model — app reads governance state, doesn't custody votes.*

*Sources: docs.snapshot.box, docs.tally.xyz, github.com/withtally/tally-api-quickstart*

### 4.5 Bounties & payments — all via audited deployed contracts

| Need | Tool | Notes |
|---|---|---|
| Treasury + lead-approved batch payouts | **Safe** (`@safe-global/*`) | Maps to our lead/worker approval model; batch USDC in one tx. Use `@safe-global/*` (not legacy `@gnosis*`). |
| Vesting / grant escrow | **Sablier Lockup** | Deposit full amount upfront into audited contract = the escrow. Cliff/linear. |
| Continuous salary/retainer | **Superfluid** | Per-second USDCx stream. Call forwarder contracts via viem/wagmi (SDK-core is legacy). |
| Split a pool among contributors | **0xSplits** | `@0xsplits/splits-sdk` + `splits-kit` React components; free (gas only). |

- **USDC** native multi-chain; all the above operate on standard ERC-20 USDC. No custom
  contract anywhere.
- **AVOID: Coordinape** — sunset 2025. **Dework** — maintenance unconfirmed (verify it loads
  before depending on it). **Layer3** — active but quests/loyalty + partner-gated, not a
  drop-in bounty board.

*Sources: docs.safe.global/sdk, docs.sablier.com, docs.superfluid.org, docs.splits.org,
coordinape.com (sunset notice), github.com/layer3xyz/cubes*

---

## PART 5 — PHASED ADOPTION ROADMAP (highest value / lowest effort first)

**Phase A — UI/UX foundation (no web3, pure front-end; biggest day-to-day win)**
1. Add **Table/List view** toggle + **grouping axis** switch (status/owner/priority/brand).
2. **Aging cue:** darken cards past SLE (reuse `ageDays`/`isStale`).
3. **Per-column WIP counts** in headers.
4. Fix **color-alone** priority dots (add text/icon).
5. Tighten the **token-driven dark theme** + spacing/type/motion scale.

**Phase B — Navigation & "My Work"**
6. Cross-brand **"My Work" inbox** (assigned/created/subscribed/recent).
7. **Saved views** users can favorite/pin to the sidebar (replaces fixed portal tabs over time).
8. **Portfolio RAG roll-up** across Dev/Music/Marketing.

**Phase C — Dashboards**
9. Add **Recharts/Tremor**; ship Aging-WIP chart → cycle-time scatterplot (85th pct) → CFD.

**Phase D — Web3 identity (foundation for all web3)**
10. `wagmi` + `viem` + **RainbowKit**; **SIWE → Supabase** auth (pairs with our Phase-2
    Supabase auth migration). ENS names/avatars.

**Phase E — Web3 value-adds (pick by need)**
11. **EAS** contributor-reputation attestations (free, off-chain).
12. **Snapshot** governance linked to tasks.
13. **Safe** treasury + batch USDC payouts for bounties → add **Sablier/Superfluid/0xSplits**
    as payout shapes demand.
14. **Token-gating** via server-side wallet reads → Supabase RLS (escalate to Lit/Guild/Unlock
    only if needed).

**Sequencing logic:** A & B & C need zero web3 and deliver the "real PM toolkit" feel
immediately. D is the gate for everything in E. Within E, EAS + Snapshot are read-mostly and
low-risk; payments (Safe etc.) come last because they move real money and want the most care.
