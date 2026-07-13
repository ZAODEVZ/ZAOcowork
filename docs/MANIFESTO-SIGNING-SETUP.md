# Manifesto signing - setup checklist (sub-project 4)

Research is done (`docs/MANIFESTO-SIGNING-RESEARCH.md`): Hats Protocol's
**Agreement Eligibility** module is the mechanism - sign the Manifesto
on-chain, get the hat minted automatically, no admin approval. This doc is
the exact next steps to make it real.

**Why this isn't further along tonight**: the actual claim page needs a
connected wallet in the browser, which needs a WalletConnect/Reown
`projectId` and RPC URLs - the same prerequisites this repo's own
`docs/WEB3-INTEGRATION-GUIDE.md` already flags as "need secrets/accounts
only you can create" and "can't responsibly be turned on from a coding
session alone." Writing wallet-connect UI code against secrets that don't
exist yet would just be code that looks done but doesn't work - not
actually finishing this. So: the two things that need YOU are called out
below, and everything downstream of them is ready to build the moment
they're done.

## Step 1 (you): deploy the hat + Agreement Eligibility module

No code needed - this is a few clicks in Hats Protocol's own app.

1. Go to [app.hatsprotocol.xyz](https://app.hatsprotocol.xyz), connect the
   wallet that administers ZAO's existing Hats tree (the same one used for
   the mentor hat, treeId 226).
2. Create a new hat under the appropriate branch - e.g. "ZAO Member" or
   "Manifesto Signer" - decide the exact name/description when you get here.
3. Open that hat -> "Edit Tree" -> find it -> "Revocation & Eligibility" ->
   choose "Agreement Eligibility" -> deploy. It'll ask for the agreement
   text (or a link/hash to it) - use the live Manifesto page content
   (thezao.xyz/papers/manifesto) or a hash of it.
4. Note down two things once deployed: the **hat ID** and the **Agreement
   Eligibility module's deployed address**. Both go into env vars in Step 3.

This is also where you decide the open question from the research doc: does
a future Manifesto version bump require re-signing? The module supports it
natively (it tracks a "current agreement" and can require re-signing when
it changes) - worth deciding now while you're in the deploy flow, since it
affects what agreement content you register.

## Step 2 (you): provision WalletConnect

Per `docs/WEB3-INTEGRATION-GUIDE.md` Phase D2 (already documented, not yet
done): a free Reown/WalletConnect `projectId` at cloud.reown.com, plus an
Optimism RPC URL. Same prerequisite this repo's Phase D wallet-identity work
has been waiting on.

## Step 3 (once 1 & 2 are done): the actual build

With a hat ID, module address, and WalletConnect projectId in hand, this
becomes a normal, fast build - no more open questions:

- Install `wagmi`, `viem`, `@tanstack/react-query`, `@rainbow-me/rainbowkit`
  (per Phase D1 of the web3 guide - not yet installed in this repo).
- A `/sign-manifesto` page: connect wallet (RainbowKit `<ConnectButton/>`),
  show the Manifesto text, a "Sign" button that calls the Agreement
  Eligibility module's claim function, success/already-signed states.
- Env vars: `NEXT_PUBLIC_MANIFESTO_HAT_ID`, `NEXT_PUBLIC_AGREEMENT_MODULE_ADDRESS`,
  `NEXT_PUBLIC_WC_PROJECT_ID`, `NEXT_PUBLIC_RPC_L2` (Optimism).
- Link to it from `public/papers/manifesto.html`'s existing "Read the full
  creed" callout on what-is-the-zao.html, and from the manifesto page itself.
- Gate feature-flagged behind `NEXT_PUBLIC_WEB3_ENABLED=true` per the
  existing Phase D5 convention, so it ships dark until Steps 1-2 are done
  and verified on a testnet or with a throwaway hat first.

## What's already true today (no change needed)

The live pages already correctly describe signing as "an on-chain hat (via
Hats Protocol, ERC-1155, soulbound and non-transferable, on Optimism)" -
that description doesn't need to change once this ships; it's accurate to
the mechanism this doc describes. What's missing is only the actual
claim-page implementation and the deployed hat/module themselves.
