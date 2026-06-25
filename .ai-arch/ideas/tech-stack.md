# Idea: Tech Stack & Platform
_Created: 2026-06-15_
_Slug: tech-stack_

## Description
The runtime foundation: **React Native / Expo (managed workflow + prebuild)**, **cross-platform mobile (iOS + Android)**, **offline-first**, **no backend in the MVP**. Math display uses `react-native-mathjax-text-svg` for LaTeX → native formula rendering (no WebView); **MathLive is rejected** (heavy, WebView-backed, aimed at advanced expression authoring).

**Answer matching is strict canonical form, not runtime equivalence.** No CAS (`math.js`/`nerdamer`) ships in the MVP: backward generation already owns the canonical answer, and treating alternate written forms (`1/2`≡`0.5`, `2x`≡`x·2`) as interchangeable would conflate distinct skill atoms and blind the diagnostic loop. Canonicalization is expressed as a **normalization policy carried by the generator contract** (see [[task-generation]] / [[step-level-checking]]). A node that *deliberately* accepts multiple forms is a rare, explicit, per-generator opt-in — never a global dependency.

## Priority
blocking

## Maturity
ready

## Decision
_Decided: 2026-06-15_

### What Was Decided
1. **D1 — Expo *managed* workflow + prebuild (config plugins / dev-client). No bare workflow.**
2. **D2 — Strict canonical-form answer matching. The CAS (`math.js`/`nerdamer`) is dropped from the MVP; canonical/normalization policy moves into the generator contract.**

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| **D1: Bare workflow** | No MVP dependency forces it — the entire native surface (`expo-sqlite`/`react-native-mmkv`, `expo-localization`, `expo-sharing`+`expo-file-system`, `expo-clipboard`, `expo-linking`, `lottie-react-native`) is plugin-reachable under prebuild. Going bare now is pre-insurance against a trigger that doesn't exist; write a custom plugin or drop to bare *then*, locally, if one ever appears. |
| **D1: Managed, Expo Go only (no native modules)** | Impossible the moment a storage engine lands — persistence *needs* a native module; clinging to Expo Go would forbid the system of record. |
| **D2: Runtime CAS equivalence (`math.js`/`nerdamer`)** | Solves a problem backward generation doesn't have (we already control the canonical form); ~150KB+ dependency; and the load-bearing reason — accepting `1/2`≡`0.5` / `2x`≡`x·2` treats *different skill atoms* as interchangeable and blinds the diagnostic loop the product exists to run. |
| **D2: Per-generator multi-form acceptance everywhere** | Re-globalizes the CAS by the back door. Kept instead as a rare, explicit, local per-node opt-in. |

### Rationale
- **D1** is recognizing the *absence of a bare trigger*, not a bet. Prebuild dissolves the old managed-vs-bare dichotomy: "needs a native module" no longer means "go bare and lose managed updates."
- **D2** is a *pedagogical correctness* decision, not a bundle-size economy. The constrained `tokens` widget already eliminates the syntactic chaos a CAS parser exists to tame, so canonicalizing its output is trivial.
- Both decisions **remove** an MVP conditional rather than add insurance (no bare-workflow tax, no CAS dependency).

### Implications
- **[[task-generation]]** — generator contract must emit a **normalization policy** (fraction in lowest terms, fixed ordering, decimal policy) alongside `solution`. New dependency edge.
- **[[step-level-checking]]** — applies that policy to submitted input via strict matching; the former "equivalence libs" role is gone.
- **[[constrained-answer-entry]]** — `tokens` tiles constrain the input space, making output canonicalization trivial.
- **[[local-persistence]]** — D1 keeps **both** SQLite and MMKV reachable, so the engine choice stays genuinely external/open there. **Cost consequence of D1:** the first native module ends Expo Go → forces a **development build + $99/EAS**; that cost decision is *triggered by and owned by* local-persistence's engine choice (shared-concern edge).
- **Scope:** advanced to `decided`, **not `ready`** — two items remain open *elsewhere* and on their own clocks: i18n catalog tooling (owned by [[i18n-strings]], gated on tone-ownership R2) and the storage engine (owned by [[local-persistence]]). Pinning either here would decide it ahead of the decision it depends on.

## Notes
- Brief §11/§12, locked decision #9. Author will test on both Android and iOS real platforms ("from MCP" recorded as cross-platform device testing — confirm if it meant more).
- Offline-first applies to the whole core: generation, checking, progress, explanation-as-prompt.
- Because of **backward generation**, a runtime CAS is mostly unnecessary — answers/steps are already known; an equivalence lib is needed only for accepting alternate written forms (ties to [[step-level-checking]] and the `tokens` widget in [[constrained-answer-entry]]).
- Khan Academy precedent: built a custom constrained math keyboard for mobile rather than free-text input — validates the `tokens` approach over a full math editor.
- Open: i18n catalog tooling (`expo-localization` + `i18next`) — see [[i18n-strings]]. **DEPENDENT — do not default to `i18next` here.** This choice is gated on (a) tone-ownership resolution (triage **R2**) and (b) mapping the third `register ∈ {neutral, warm, playful}` axis onto a tool that natively keys only `(key, locale)`. Vanilla `i18next` is *not* obviously correct once `register` exists; locking tooling in tech-stack would decide it ahead of the presentation-theme ↔ i18n register-lookup resolution it depends on, reintroducing the per-theme string duplication R2 warns against. Owned by [[i18n-strings]], not tech-stack.

### Explored 2026-06-15 — Expo workflow (Q1) & equivalence strategy (Q2)
Two directions taken (signed off; formalize via `/architector:decide` to advance maturity + record rationale/alternatives):

**Q1 — Expo *managed* (config plugins + dev-client / prebuild), NOT bare.**
- No MVP dependency forces bare. The full native surface is reachable via Expo first-party / config plugins: `expo-sqlite` **or** `react-native-mmkv` (storage — pending [[local-persistence]]'s engine choice), `expo-localization`, `expo-sharing` + `expo-file-system` (local export/import backup), `expo-clipboard` (ClipboardPromptProvider), `expo-linking` (deep-link to external chat), `lottie-react-native` (future companion), `react-native-mathjax-text-svg` (pure JS/RN, no native module).
- Prebuild dissolves the old managed-vs-bare dichotomy: "needs a native module" no longer means "go bare." Committing to managed is *recognizing the absence of a bare trigger*, not a bet — if a plugin-less native module ever appears, write a custom plugin or drop to bare *then*, locally. Don't pre-insure.
- **Honest cost (record, don't relitigate):** any native module (MMKV, Lottie, `expo-sqlite` native) means the app no longer runs in **Expo Go** — a **development build** is required, ending the free Expo-Go iPhone testing flow and re-raising the **$99 / EAS** question. This cost is *triggered by* [[local-persistence]]'s storage-engine choice, so the cost decision lives there; named here so it isn't a surprise.

**Q2 — Strict canonical-form matching; CAS (`math.js`/`nerdamer`) DROPPED from MVP.**
- Backward generation already *constructs* the task from a known answer + steps, so the generator always knows the canonical expected form. A runtime CAS solves a problem this architecture doesn't have (it would imply we don't control the answer's form — but we generated it).
- **The deeper reason is pedagogical, not bundle size:** `2x` vs `x·2`, `1/2` vs `0.5` are **different skills**, not "equivalent correct answers." Recognizing `1/2 = 0.5` is its own graph node (decimals ↔ fractions). Accepting multiple forms as equally correct would **blind the diagnostic loop** ([[diagnostic-loop]]) the product exists to run. Strict canonical form is what the diagnostic model already requires.
- **Mechanism:** canonical form becomes part of the generator contract — alongside `solution`, a **normalization policy** for submitted input (fraction in lowest terms, fixed ordering, decimal policy). This is a [[task-generation]] + [[step-level-checking]] obligation imposed by *this* node. The [[constrained-answer-entry]] `tokens` widget already constrains the input space (tiles, not free text), so canonicalizing its output is trivial — the syntactic chaos a CAS parser exists to tame never arises.
- **Future exception stays local:** a node that *deliberately* accepts multiple forms becomes an explicit per-generator rule, never a dependency every generator drags in.
- Net: both decisions *remove* a conditional complexity from the MVP (no bare-workflow tax, no CAS dependency) rather than adding insurance.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Blocks (→):**
- → [[step-level-checking]] — equivalence libs (math.js) for accepting alternate token forms. **Revised (Q2): CAS dropped — instead imposes a strict normalization-policy obligation the checker applies to submitted input.**
- → [[task-generation]] — **(new, Q2)** canonical-form / normalization policy is part of the generator contract (lowest terms, fixed ordering, decimal policy), not just `solution`.
- → [[constrained-answer-entry]] — no-MathLive stance + widget/rendering libs; `tokens` tiles make output canonicalization trivial (Q2)
- → [[i18n-localization]] — catalog tooling (expo-localization/i18next) + Intl formatting

**Shared-concern / consequence:**
- ↔ [[local-persistence]] — **(Q1)** the SQLite-vs-MMKV engine choice (still open there) is the trigger that ends Expo Go testing and forces a dev build + $99/EAS; cost decision lives in local-persistence.

_Underpins every node as the runtime foundation; the edges above are the load-bearing library choices. Widest-fan-out hub — cheap to lock (brief decision #9). Workflow pinned to Expo managed + prebuild (Q1)._

## History
- 2026-06-15 /architector:new — RN/Expo, cross-platform iOS+Android, offline-first, no backend; library guidance folded in (no MathLive; mathjax-text-svg for display; math.js for equivalence). Stack is locked in brief; runtime CAS mostly unneeded due to backward generation.
- 2026-06-15 /architector:decide — LOCKED D1 = Expo managed + prebuild (no bare; recognizing the absence of a bare trigger, not a bet) and D2 = strict canonical-form matching, CAS dropped (pedagogical: alternate forms are different skill atoms, accepting them blinds the diagnostic loop → normalization policy into the generator contract). Advanced explored → **decided** (deliberately NOT ready): catalog tooling (gated on tone-ownership R2 + register-axis mapping, owned by i18n-strings) and SQLite-vs-MMKV (owned by local-persistence) stay open on their own clocks; pinning either here would invert a dependency. Added carry-forward pointer on the catalog-tooling note so 'Open' isn't later mis-defaulted to i18next.
- 2026-06-15 /architector:explore — settled two directions (signed off, pending /decide to formalize): Q1 = Expo **managed** (config plugins + prebuild), no bare — full MVP native surface is plugin-reachable; committing recognizes the absence of a bare trigger; honest cost = native module ends Expo Go → dev build + $99/EAS, triggered by local-persistence's engine choice. Q2 = **strict canonical-form matching, CAS dropped** — backward generation already owns the canonical form; the real reason is pedagogical (`1/2` vs `0.5` are *different skills*, accepting both blinds the diagnostic loop), so canonical/normalization policy moves into the generator contract (new → task-generation edge). Both decisions remove an MVP conditional rather than add insurance. Handed SQLite-vs-MMKV back to local-persistence.
- 2026-06-24 /architector:finalize — advanced **decided → ready** (bookkeeping). Both threads that held this node at `decided` are closed: catalog tooling resolved by [[i18n-strings]] (i18next + register-as-context, 2026-06-22) and the storage engine resolved by [[local-persistence]] (expo-sqlite, 2026-06-22). No open threads remain — the 2026-06-22 local-persistence session already noted this node was eligible to advance. Confirmed by user at finalize gate.
