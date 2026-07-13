# Zuke-conversation-to-edit pipeline - research prep (not a design, not built)

Sub-project 3 of the ZAO Paperz platform. This is research prep for a future
brainstorming conversation, not a design decision or a build. It maps what
exists today across the two real systems this sub-project would connect,
and names the actual gap between them.

## The two systems today, and the gap between them

**Zuke** (`ZAODEVZ/Zuke`) is the cloud-hosted live audio app - Farcaster
communities join a room, Juke (the underlying audio infra) fires webhooks
(`room.started`, `participant.joined/left`, `room.finished`/`room.ended`,
`recording.ready`), and Zuke syncs room state into its own Supabase project
(the same one, `yhpszfepoerqgnewukkh`, that hosts `paper_sections` and
`paper_edits`). `juke_spaces` has a `recording_url` column - so once a room
ends, Zuke *has* a link to the recording. Checked live: `juke_spaces` and
`juke_webhook_events` currently have 0 rows - no live traffic has gone
through Zuke yet, so there's no real transcript data to test against today,
only the schema.

**ZAOVideoEditor** ("ZAO Recordings Studio", `bettercallzaal/ZAOVideoEditor`)
is a separate, local-first, self-hosted desktop app: paste a recording or a
link in, get a transcript, an edited/trimmed video, clips, and drafted
social posts out. It already has real infrastructure directly relevant here:
a **brand glossary** that auto-corrects ZAO terms in transcripts (WaveWarZ,
SongJam, ZABAL Gamez, StiloWorld, etc.) and lets you "teach" it a fix so it
sticks for every future recording - functionally a proto version of this
session's shared-facts idea, already applied to transcript text. It also has
a **Library** of past recordings, searchable by phrase across all of them.

**The gap**: these two systems have zero existing integration. A repo code
search for "zuke" or "supabase" inside ZAOVideoEditor returns nothing - it's
a fully local, single-user tool today, with intake via manual paste-a-link,
not an automated hand-off from Zuke's `recording.ready` webhook. And
ZAOVideoEditor's own outputs (transcript, clips, social posts, YouTube
package) don't currently include anything shaped like "propose this as a
paper edit" - that output type doesn't exist yet anywhere in either repo.

So sub-project 3 isn't really "the pipeline is half-built, finish it" - it's
closer to "two working, well-built systems currently don't talk to each
other, and neither produces the specific output this needs." Two separate,
real gaps to close:
1. Zuke -> ZAOVideoEditor (or wherever transcription happens): automatic
   hand-off on `recording.ready`, vs. staying a manual paste step.
2. Transcript -> proposed paper edit: a new output type, not something
   either system does today - and its shape depends entirely on what
   sub-project 2 (community editing + attribution) decides a "proposed
   edit" even looks like.

## Open questions for the real brainstorm

- Does this wait for sub-project 2 to define what a "proposed edit" record
  looks like, since there's no target format to write into yet? (Same
  dependency shape as sub-project 2 asked of sub-project 4 - these three
  sub-projects lean on each other more than the original 4-way split
  suggested.)
- Is full automation (webhook -> transcribe -> LLM-extract candidate edit ->
  proposal queue, zero human in the loop until review) even desired, or
  does Zaal want a human to first watch/skim the ZAOVideoEditor output and
  manually decide "this conversation should update paper X" before anything
  becomes a formal proposal? The existing Library + search feature suggests
  ZAOVideoEditor is already built around a human doing that kind of review.
- ZAOVideoEditor is local-first by design (no cloud setup, runs on someone's
  machine). A pipeline that needs to react automatically to Zuke's cloud
  webhook would need either a cloud-deployed version of the transcription
  step, or accept that this sub-project is semi-manual (someone periodically
  runs the Studio against new Zuke recordings) rather than fully event-driven.

## Sources / basis

- `bettercallzaal/ZAOVideoEditor` README (fetched via `gh api
  repos/bettercallzaal/ZAOVideoEditor/readme`, 2026-07-13).
- `ZAODEVZ/Zuke` README (fetched the same way).
- Live schema + row-count check via `mcp__supabase__list_tables` /
  `execute_sql` against the Zuke Supabase project, 2026-07-13.
- `gh api search/code` against `bettercallzaal/ZAOVideoEditor` for "zuke"
  and "supabase" - zero results, confirming no existing integration.
