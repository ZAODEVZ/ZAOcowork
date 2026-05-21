# Six Sigma applied to imanprojects

How we use Six Sigma + Lean principles to keep the tracker honest, the work moving, and the noise low. Not academic - operational.

## Why bake Six Sigma in

A tracker w/o discipline becomes a graveyard. Items pile up, status drifts from reality, no one trusts the numbers. Six Sigma forces a few habits that prevent that:

- Every item has a **clear definition** (what done looks like, who owns it, by when)
- Every item has a **measurable outcome** (cycle time, age, status truth)
- Every change is **logged** (audit trail = continuous improvement signal)
- The system itself gets **reviewed weekly** (control loop)

## Core principles (quick canon)

### 1. DMAIC — the workflow stages

Every meaningful work item should live in one of these phases. We use **DMAIC** as a `phase` field on each item:

| Phase | Question it answers | Example for ZAO Devz |
|-------|---------------------|----------------------|
| **Define** | What problem? Who's the customer? What does success look like? | "ZAO Devz site review - what's broken from a builder's perspective?" |
| **Measure** | What's actually happening today? What are the numbers? | "Audit current site - count broken links, slow pages, missing content" |
| **Analyze** | What's the root cause? Why does this happen? | "Why are devs not signing up? Survey 10. Look at funnel drop-off." |
| **Improve** | What change do we make? Test it. | "Rewrite landing copy. Add 3 builder testimonials. Ship." |
| **Control** | How do we keep it from regressing? Monitor. | "Add weekly site audit. Track signup-rate KPI. Revert if drops." |

For most quick action items u can leave phase blank or put `Define`. The phase becomes useful for projects (multi-step work).

### 2. 5S — for the tracker itself

Apply 5S to the tracker hygiene weekly:

- **Sort** - delete or archive items that no longer matter
- **Set in order** - priority + category each item correctly
- **Shine** - clean stale notes, fix wrong owners, update due dates
- **Standardize** - use the templates (see below)
- **Sustain** - 15 min weekly review to keep above habits

### 3. Voice of customer (VoC)

Every item should answer: **who benefits when this is done?** Not "Iman" or "Zaal" - the end customer. Examples:
- ZAO Devz site fixes -> benefits: builders evaluating ZAO
- Social posting -> benefits: ZAO community + new joiners
- POIDH bounty -> benefits: contributors + observers seeing fairness

Add the customer in the notes. Forces clarity.

### 4. The 7 wastes (TIMWOODS - Lean)

Eliminate from our work:

- **T**ransport - moving info between tools without value (e.g. copy-pasting between 4 places)
- **I**nventory - too many open items at once (WIP limit: 5 per person)
- **M**otion - clicking thru 6 screens to do 1 task
- **W**aiting - blocked items that nobody nudges
- **O**verproduction - building features no one asked for
- **O**verprocessing - 5 review rounds when 1 would do
- **D**efects - shipping broken stuff
- **S**kills wasted - assigning wrong owner

Whenever an item feels heavy, name the waste, kill it.

### 5. Measure what matters (KPIs)

The tracker auto-shows two metrics per item:

- **Age** - days since item created (red after 14 days w/o status change)
- **Cycle time** - days from `Define` to `Done` (target: median < 7 days for most items)

Weekly review looks at:
- Throughput (items moved to Done this week)
- Aging items (open > 14 days = red flag)
- WIP per person (target: < 5)

## How the tracker enforces this

The UI structures items around these principles:

| Field | Maps to Six Sigma |
|-------|-------------------|
| `title` | Define stage - one-line problem statement |
| `category` | Project area / value stream |
| `phase` | DMAIC stage |
| `priority` | P1/P2/P3 - forces choice, prevents "everything is urgent" |
| `owner` | Single accountable person (no "both" if avoidable) |
| `due` | Time-box - prevents work-in-progress drift |
| `notes` | Customer + acceptance criteria + measurements |
| `status` | TODO -> WIP -> BLOCKED -> DONE (visual flow) |
| `createdAt` / `updatedAt` | Auto - enables age + cycle-time KPIs |

## Templates (standard work)

Use these stems when adding items so the team writes consistent items:

**Project work (DMAIC):**
```
Title: [Problem statement, not solution]
Category: [pick one]
Phase: Define / Measure / Analyze / Improve / Control
Priority: P1 / P2 / P3
Owner: [single person]
Due: [YYYY-MM-DD]
Notes:
- Customer: [who benefits]
- Success: [what done looks like]
- Measurements: [how we'll know]
```

**Quick task:**
```
Title: [verb + noun, e.g. "Email John about Aug schedule"]
Category: Ops
Priority: P3
Owner: [me or them]
Due: [date]
```

## Weekly review (Control)

Every Monday or Friday, 15 min:

1. **Sort** - close anything Done last week. Archive items that died.
2. **Aging** - any item open > 14 days? Decide: kill, push, escalate.
3. **WIP** - anyone over 5 active items? Drop to 3 most important.
4. **Throughput** - what shipped? Celebrate.
5. **Blockers** - top 3 BLOCKED items. Resolve or kill.
6. **Set next week's P1** - 3 max.

## Continuous improvement (the meta-loop)

The tracker itself is an experiment. After 2 weeks of use, ask:
- What category are we mis-using?
- What field do we always leave blank? (delete it)
- What field do we wish we had?
- What's the avg cycle time? Is it improving?

Tweak. Re-deploy. Repeat.

## References (for deeper reading later)

- DMAIC: ASQ - https://asq.org/quality-resources/dmaic
- 5S: Lean Enterprise Institute
- TIMWOODS / 7 wastes: Toyota Production System canon
- WIP limits + Kanban: David J. Anderson, "Kanban" (2010)

Apply lightly. The point is the work, not the framework.
