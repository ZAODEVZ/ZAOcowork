# Manifesto-signing mechanism - research prep (not a design, not built)

The what-is-the-zao and manifesto pages both currently claim "signing the
Manifesto mints an on-chain hat," but no contract or UI for that specific
hat exists yet - Zaal flagged this as an open blocker needing "a deeper
dive" (2026-07-09). This is research prep for that future design
conversation - it proposes nothing and builds nothing. It only answers the
concrete technical question: does Hats Protocol support permissionless,
admin-free hat minting, and if so, how.

## Finding: yes, via the Agreement Eligibility module

Hats Protocol's default minting flow requires the hat's admin to mint each
hat individually - not what a self-serve "sign the manifesto, get your hat"
flow needs. But Hats Protocol ships a documented, reusable **Agreement
Eligibility** module built exactly for this case.

**How it works** (per Hats Protocol's own case study, the "Hats Community
Member Hat" on their own protoDAO):
1. A user visits a claim page and reviews the agreement text.
2. They sign it via an on-chain transaction.
3. That transaction both records their agreement and automatically mints
   the hat to their wallet - no admin approval step, no manual minting.

**Deployment**, per Hats Protocol's docs, doesn't require writing a new
smart contract - it's configured through the Hats Protocol app: open the
hat's tree, "Edit Tree" -> select the hat -> "Revocation & Eligibility" ->
choose "Agreement Eligibility" -> fill in parameters -> deploy. The module
also ships a "unique claim page" UI out of the box (view agreement, sign,
claim), which could plausibly replace a bespoke ZAOpaperzBOT or web UI for
this, or could be link out to it directly.

**Versioning tie-in**: the module tracks a "current agreement" value, and
"if a new agreement is published, community members must sign the new
agreement in order to keep wearing the hat." That means manifesto version
bumps (the same v1.0/v1.1 convention this session set up for other papers)
could map directly onto this module's agreement-versioning - a manifesto
edit could require re-signing to keep the hat, which is arguably a feature
(mirrors the point of the versioning convention: real content changes
should be visible and acknowledged) rather than a problem, but is a real
design question for the actual brainstorm (does ZAO want re-signing to be
required on every version bump, or only major ones?).

**Chain confirmed**: Hats Protocol core contracts (including, per Hats'
supported-chains doc, the deployment that Agreement Eligibility builds on)
are live on Optimism at the same address as every other supported chain:
`0x3bc1A0Ad72417f2d411118085256fC53CBdDd137`. This matches where ZAO's
existing OG/ZOR Respect tokens and other Hats-based roles (e.g. the mentor
hat, treeId 226) already live - no new chain, no new wallet infra needed.

## What's still unverified / needs the real design conversation

- Whether the Agreement Eligibility module's Optimism deployment address
  and audit status specifically (not just Hats Protocol core) is confirmed
  - web search did not surface this cleanly; needs a direct check of
  `github.com/Hats-Protocol/modules-registry` or a question to the Hats
  Protocol team/Discord before committing to it.
- Whether ZAO wants to use Hats' own claim-page UI, or build a bespoke one
  (e.g. as a ZAOpaperzBOT command, or a page on thezao.xyz) - both are
  possible; this module only handles the on-chain eligibility/minting side.
- Whether "signing" should require a wallet-connect + on-chain tx (real
  signature, real gas even if minimal) or whether ZAO wants a lower-friction
  off-chain-attestation-then-batched-mint flow instead - the Agreement
  Eligibility module assumes the former; the "needs a deeper dive" comment
  may have been about exactly this UX tradeoff.
- How this interacts with sub-project 2 (community editing + attribution) -
  if the Manifesto itself becomes community-editable, "which version did
  you sign" and "who needs to re-sign" become live questions, not one-time
  setup.

## Sources

- [Eligibility & Accountability Criteria](https://docs.hatsprotocol.xyz/hats-integrations/eligibility-and-accountability-criteria) - Hats Protocol Docs
- [Hats protoDAO Case Study](https://www.hatsprotocol.xyz/wearer/hats-protodao) - the self-service onboarding example this research is based on
- [Hats Protocol Supported Chains](https://docs.hatsprotocol.xyz/using-hats/hats-protocol-supported-chains) - confirms Optimism deployment
- [Hats-Protocol/modules-registry](https://github.com/Hats-Protocol/modules-registry) - GitHub registry of Hats Modules, not yet directly checked for Agreement Eligibility's specific per-chain deployment address
