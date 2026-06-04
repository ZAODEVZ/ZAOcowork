# Web3 Integration Guide (Roadmap Phases D & E)

This is the **implementation-ready scaffold** for the web3 layer from
`ECOSYSTEM-BOARD-RESEARCH.md`. It is intentionally **a guide, not merged live
code** — see "Why staged" below. Every step uses other people's audited,
deployed contracts and maintained SDKs; we write **no** smart contracts.

## Why this is staged (not blind-shipped)

These phases can't responsibly be turned on from a coding session alone:

1. **They need secrets/accounts only you can create** — a WalletConnect/Reown
   `projectId`, RPC URLs, a Supabase auth-provider change, a treasury **Safe**.
2. **Phase E moves real money.** Wiring USDC payouts / streams into a live app
   without you reviewing each contract address, chain, and signer is reckless.
3. **They want real-device QA** (wallet popups, mobile wallet deep-links) that
   can't be verified headless.

So the plan: you provision the accounts (checklist below), then we enable each
piece behind a feature flag, smallest-blast-radius first.

---

## PHASE D — Wallet identity (the gate for everything else)

### D1. Dependencies
```bash
npm i wagmi viem @tanstack/react-query @rainbow-me/rainbowkit
```
All MIT, actively maintained (wagmi/viem by wevm; RainbowKit official Next.js
App Router support).

### D2. Accounts you provision
- **Reown/WalletConnect `projectId`** — free at cloud.reown.com → env
  `NEXT_PUBLIC_WC_PROJECT_ID`.
- **Mainnet RPC** (for ENS) + your primary L2 RPC (Base/Optimism/Arbitrum) →
  env `NEXT_PUBLIC_RPC_MAINNET`, `NEXT_PUBLIC_RPC_L2`.

### D3. Wiring (providers + connect button)
- Add a `"use client"` `Web3Providers` wrapping `WagmiProvider` +
  `QueryClientProvider` + `RainbowKitProvider`; mount it inside the existing
  app tree (it can sit beside the current HMAC-cookie auth — wallet is additive,
  not a replacement, until you choose to migrate).
- Drop `<ConnectButton/>` in the NavBar.
- ENS name/avatar via wagmi `useEnsName` / `useEnsAvatar` (needs mainnet RPC).

### D4. Auth model — pair SIWE with Supabase (when ready)
Supabase has **first-party "Sign in with Web3" (EIP-4361 SIWE)**: a connected
wallet becomes a real `auth.users` row with a session, no custom JWT bridge.
This belongs with the planned **Supabase auth migration (our Phase 2)** — do it
then, not before, so we don't run two session systems at once.
Docs: https://supabase.com/docs/guides/auth/auth-web3

### D5. Feature flag
Gate the whole thing on `NEXT_PUBLIC_WEB3_ENABLED=true`. Off = the NavBar shows
nothing new and zero web3 code paths run. Ship dark, enable when ready.

---

## PHASE E — Value-adds (enable individually, by need)

> Order within E by blast radius: **reputation → governance → payments**.
> Read-mostly first; money last.

### E1. Reputation — EAS (free, off-chain, lowest risk)
- `npm i @ethereum-attestation-service/eas-sdk`
- Contracts already deployed on Base/Optimism/Arbitrum (e.g. Optimism predeploy
  `0x4200000000000000000000000000000000000021`). **Off-chain signed
  attestations cost zero gas.**
- Use case: a lead attests "ThyRev completed task #123" → a portable,
  verifiable contributor-reputation graph. Store the attestation UID on the
  task row; render a "✓ attested" badge.
- Integration point: `reviewUpdate` / mark-DONE in `src/app/actions.ts` could
  optionally emit an attestation. Keep it optional + off by default.
- Docs: https://docs.attest.org

### E2. Governance — Snapshot (free, gasless, read-mostly)
- `npm i @snapshot-labs/snapshot.js`
- **Read** proposals/votes via `https://hub.snapshot.org/graphql` (server-side
  in a route handler; cache it). **Write** (create proposal / vote) is signed
  in the browser by the user's wallet.
- Integration: store `snapshotProposalId` on a task; show live status
  (active/closed/passed); optionally auto-transition a Bounty task when its
  linked proposal passes. Keeps our read-only-assistant principle — the app
  reads governance state, it doesn't custody votes.
- Docs: https://docs.snapshot.box

### E3. Payments / bounties — adopt audited contracts, **money = most care**

| Need | Tool | Package |
|---|---|---|
| Treasury + lead-approved batch USDC payouts | **Safe** | `@safe-global/protocol-kit`, `@safe-global/api-kit` |
| Vesting / grant escrow | **Sablier Lockup** | `@sablier/sdk` + on-chain Lockup contract |
| Continuous salary stream | **Superfluid** | call `CFAv1Forwarder` via viem (SDK-core is legacy) |
| Split a pool among contributors | **0xSplits** | `@0xsplits/splits-sdk`, `@0xsplits/splits-kit` |

- **Recommended first money primitive: Safe batch payouts** — it maps exactly
  to our existing lead/worker *approval* model (multisig signers approve; batch
  many recipients in one tx). USDC is standard ERC-20 across Base/Arbitrum/etc.
- You provision: a **treasury Safe** (app.safe.global), its signers, and the
  chain/USDC address. The app proposes a payout; signers confirm in Safe.
- **Avoid:** Coordinape (sunset 2025); Dework (maintenance unverified); Layer3
  (quests/loyalty, partner-gated — not a drop-in bounty board).
- Docs: https://docs.safe.global/sdk, https://docs.sablier.com,
  https://docs.superfluid.org, https://docs.splits.org

---

## Your provisioning checklist (unblocks us to start wiring)

- [ ] Reown/WalletConnect `projectId` (free)
- [ ] Mainnet RPC URL (ENS) + L2 RPC URL
- [ ] Decide: keep HMAC auth + additive wallet, **or** migrate to Supabase SIWE
      auth (ties to Phase 2)
- [ ] Pick the L2 you'll standardize on (Base / Optimism / Arbitrum)
- [ ] (For payments) create the treasury **Safe** + list signers + confirm the
      USDC token address on your chosen chain

Once you hand over the first three, we enable **Phase D behind the flag** and
test wallet connect on a real device before touching anything in E.

---

## Env vars (added when each phase is enabled)
```
NEXT_PUBLIC_WEB3_ENABLED=        # master flag (false until ready)
NEXT_PUBLIC_WC_PROJECT_ID=       # Reown/WalletConnect
NEXT_PUBLIC_RPC_MAINNET=         # ENS resolution
NEXT_PUBLIC_RPC_L2=              # primary L2
# Phase E (only when that piece is enabled):
NEXT_PUBLIC_EAS_CHAIN_ID=
NEXT_PUBLIC_SNAPSHOT_SPACE=
NEXT_PUBLIC_TREASURY_SAFE=
```
