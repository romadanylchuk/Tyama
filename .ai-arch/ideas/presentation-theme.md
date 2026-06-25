# Idea: Theme / Presentation & Onboarding
_Created: 2026-06-15_
_Slug: presentation-theme_

## Description
The skin layer that keeps the pedagogical core age-neutral. Persona specificity — visual theme, tone/register, onboarding — is **isolated from the core** so a future "kids" theme can drop in without refactoring. The MVP ships a default skin and onboarding **tuned for the 16+ anxious persona** (calm, no condescension, sense of progress). The theme owns **color, typography, motion, copy register, flavor — and never difficulty/entry point** (that is a pedagogy output, decision #12).

**Decided shape:** a **hand-rolled, context-injected token provider** behind a thin seam (no token library) supplies the variation axes (color/type/motion/flavor) and passes a `register` into the `(key, locale, register)` string lookup — it holds **no string copies**. Persona is an **enum** (`adult-16+ | kid | enthusiast`) selecting a *coherent bundle* of those axes; dark/light is an **orthogonal** system-inherited axis, not part of the persona; persona is stored in [[local-persistence]], **changeable post-onboarding, and a change never touches difficulty/progress**. The **no-pressure error-feedback visual language** is *derived* from gamification's no-subtraction invariant — never a "wrong" state, forward motion, softer timing, and the structured `diagnosticPayload`/`failedStep` personalizes the *hint* (help), never blame. **Onboarding** is a **separate flow** that orchestrates three existing owners (diagnostic placement → pedagogy; three language fields → i18n; persona → theme) and owns none; it is **partially skippable** — persona/language skip cleanly to defaults, but diagnostic placement may only be *shortened*, never nulled, and a skip starts conservatively low and calibrates up.

## Priority
core

## Maturity
ready

## Notes
- Brief §3 (age-neutral core), §11/§12 (presentation separated from core), phase 5 (onboarding for 16+).
- Open (Q7): structure the separation so a future "kids" theme drops in without touching pedagogy.
- The core (skill graph + generators + checking) must know only skills and difficulty — never age/persona.

## Triage
_Seeded: 2026-06-15 via /architector:triage_

### Discussion Points
Questions and topics to work through during `/architector:explore`:

- **Token system — adopt vs hand-roll** — `restyle` / `tamagui` / `unistyles` / `nativewind` vs a hand-rolled context-injected token provider (color, type, spacing, motion). The acceptance test: a full reskin (16+ ↔ kids) touches **zero screens**.
  _Context: tamagui/unistyles give performant runtime theme switching; restyle is lighter and simpler._

- **Variation axes — RESOLVED scope (R1 / decision #12)** — theme owns color, typography, motion, **copy register**, flavor. Theme **never** owns difficulty/entry point — that is an output of diagnostic placement + [[difficulty-model]]. Enumerate the axes so the seam covers motion + register, not just color.

- **Copy register — RESOLVED (R2 / decision #13)** — strings are keyed `(key, locale, register)`, `register ∈ { neutral, warm, playful }`; the theme passes a register into the lookup and holds **no string copies**. Resolve this **before** [[i18n-localization]] catalog tooling is chosen, or strings get duplicated.

- **No-pressure error-feedback visual language** — the north star is enforced here: no red/buzzer "wrong" states, calm motion, progress-forward framing. A deliberate sub-design, not aesthetics.

- **Persona/theme selection model** — persona enum (adult-16+, kid, enthusiast) vs free theme selection; relationship to device dark/light mode; where stored ([[local-persistence]]); changeable post-onboarding?

- **Onboarding as a separate flow** — distinct from the runtime theme: it runs diagnostic placement (entry point — pedagogy, not theme), sets the three language fields ([[i18n-localization]]) and the persona. Model it as configurable/skippable.

### Hidden Concerns
- **Entry difficulty** was originally bundled here but belongs to pedagogy ([[difficulty-model]] + diagnostic placement) — removed per R1 / decision #12.
- The **no-pressure error-feedback visual language** is a distinct north-star-driven sub-design worth its own attention.

### Gotchas
- Hardcoding color/spacing/strings in screens → a reskin becomes a refactor (exactly what Q7 forbids).
- Treating "theme" as color-only and discovering motion/register/flavor also vary, late.
- Conflating device dark-mode with persona theme.

### Suggested Reading for /architector:explore
1. Adopt a token library (which) or hand-roll the provider?
2. The full enumerated variation-axis list (color/type/motion/register/flavor)?
3. Confirm the register set `{neutral, warm, playful}` and the `(key, locale, register)` lookup jointly with [[i18n-localization]].
4. What is the concrete no-pressure error-feedback visual language?
5. Persona-enum vs free theme — storage and post-onboarding mutability?

## Decision
_Decided: 2026-06-22_

### What Was Decided
Four linked rulings that take the node from `explored` to `ready`. The two pre-locked items (R1/#12 variation-axis scope; R2/#13 register model) are inputs, not re-decided.

**D1 — Token system: HAND-ROLLED context-injected provider, behind a thin seam (no token library).**
A small (~100–200 line) React-context provider injects the token set (color/type/space/motion) and passes `register` into the `(key, locale, register)` lookup — and does exactly that, nothing more. It sits behind a thin seam (same discipline as `ExplanationProvider` / `loadGraph()`) so a library can later slot under the *identical* interface if styling complexity ever explodes. No library adopted in MVP.

**D2 — Error-feedback visual language: DERIVED from gamification's no-subtraction invariant (a spec, not a new philosophy).**
The error moment is the direct application of "only gained / not-yet-gained, never subtracted." Concretely: **never** rendered as "wrong" — no red, no buzzer, no ✗, no shake (a somatic "no"); instead a calm neutral "not yet — try it this way" with motion **forward** toward a hint/next attempt. The structured `diagnosticPayload` / `failedStep` is consumed to **personalize the hint as help** ("looks like the sign here"), never to highlight blame — same payload feeds routing (invisibly) and the hint (visibly *as help*). **Timing is part of the spec:** a brief beat and smooth transition, never a hard same-millisecond flash — the difference between "caught" and "let's look."

**D3 — Persona/theme selection: persona enum, changeable, stored in local-persistence, orthogonal to dark/light.**
Selection is a **persona enum** (`adult-16+ | kid | enthusiast`), not free theme selection — a persona selects a *coherent bundle* (color+type+motion+register+flavor together); free assembly produces incoherent combos and defeats the seam's purpose. **Dark/light is an orthogonal axis** inherited from the system (kid-in-dark-mode is a valid intersection, not a separate theme). Stored in [[local-persistence]] as materialized state; **changeable post-onboarding** (dignity-of-exit — a 16+ given a kid skin switches without feeling they broke something). **Hard consequence of R1/#12:** a persona change MUST NOT touch difficulty or progress — persona owns no difficulty; a reskin leaves mastery state untouched.

**D4 — Onboarding: separate flow orchestrating three owners; partially skippable, subordinate to the north star.**
A **separate flow** from runtime theming that does three heterogeneous things and **owns none of them**: (a) diagnostic placement (entry difficulty — pedagogy, [[diagnostic-loop]]/[[difficulty-model]]), (b) sets the three language fields (UI/content/explanation — [[i18n-strings]]), (c) sets persona (this node). **Partially skippable:** persona and language have sensible defaults and skip cleanly; **diagnostic placement may be *shortened* but not nulled** — skipping it entirely defaults entry difficulty and risks starting an anxious learner too high (frustration) or too low (condescension). If shortened/skipped, **start conservatively low and calibrate upward fast** (starting low and rising is non-shaming; starting high and failing is shaming). The skip policy is itself subordinate to the north star.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Token library (tamagui / unistyles / restyle / nativewind) | Each solves a *broader* problem (styling DX, variants, responsiveness, compile-time opt) most of which isn't needed, carries its own model + upgrade risk + Expo constraints, and thinks in `(token, theme)` — so the non-standard 3-axis `(key, locale, register)` model fights the tool. Same pattern as dropping MathLive/CAS: the requirement is narrower than the library, and its shape is known. (Kept reachable via the seam.) |
| Error feedback as a fresh aesthetic/philosophy | Re-invents what gamification's no-subtraction invariant already dictates; risks drift from the north star. Deriving it makes the spec falsifiable (no red / no ✗ / forward motion / soft timing). |
| Free theme selection (user assembles color/type/etc.) | Lets users build incoherent combinations and breaks the bundle integrity the seam exists to guarantee; persona-enum keeps each skin coherent. |
| Persona owns dark/light | Conflates device dark-mode with persona (a named gotcha); they are orthogonal — dark/light inherits from the system and intersects every persona. |
| Onboarding merged into theme / or fully skippable | Merging couples three independently-owned concerns into the skin; fully nulling placement defaults entry difficulty and can start an anxious learner at a shaming level. Separate orchestrating flow + shorten-not-null placement preserves both separation and the north star. |

### Rationale
Every ruling falls along a seam the architecture already uses. The hand-rolled provider mirrors the `ExplanationProvider`/`loadGraph()` "thin seam, defer the heavy implementation" discipline and refuses a library whose data shape (`token, theme`) can't express the locked `(key, locale, register)` model. The error-feedback language is *derived*, not invented, from gamification's single anti-shame invariant — so the most north-star-critical surface isn't a matter of taste. Persona-as-coherent-bundle is the whole point of the R1/#12 variation-axis seam (color/type/motion/register/flavor move together), and quarantining difficulty out of it is the structural guarantee that R1/#12 demanded. Onboarding-as-orchestrator keeps the three owners (pedagogy/i18n/theme) un-merged while the shorten-not-null placement rule keeps even the skip path subordinate to "I'll give it a try."

### Implications
- **[[i18n-strings]]** (`explored`) — **unblocked**: D1 confirms the theme passes `register` into the `(key, locale, register)` lookup and holds **no string copies**, and the register set `{neutral, warm, playful}` (R2/#13) is final. i18n-strings can now decide catalog tooling against a fixed 3-axis key without risk of per-theme string duplication.
- **[[difficulty-model]]** (`decided`) — confirmed consumer relationship unchanged: entry difficulty stays a pedagogy output (#12); onboarding's placement step *sets* the entry coordinate but the theme never owns it. A persona change must not perturb difficulty/progress.
- **[[local-persistence]]** — gains a small materialized field: the selected persona enum + (orthogonal) dark/light preference. No new event class; consistent with the hybrid truth-model.
- **[[gamification]]** — its no-subtraction invariant is now also the *source* of the error-feedback visual spec (D2); the two must not diverge.
- **[[constrained-answer-entry]]** / **[[step-level-checking]]** — the `diagnosticPayload`/`failedStep` they already emit is the input D2 turns into a personalized *hint*; the contract is unchanged (theme reads it, never alters the verdict path).
- **[[diagnostic-loop]]** — its placement traversal is the engine onboarding's (shortenable) placement step drives; the shorten-not-null rule is a presentation-side constraint, not a routing change.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[difficulty-model]] — entry point is a pedagogy output, NOT theme-owned (#12)

**Blocks (→):**
- → [[i18n-localization]] — register set resolved before catalog tooling (#13)

**Shared concern:**
- [[i18n-localization]] — (key, locale, register) lookup: theme selects register, holds no string copies

_Skin layer: wraps [[gamification]] / [[constrained-answer-entry]] visually but must not leak into the age-neutral core._

## History
- 2026-06-15 /architector:new — age-neutral core vs isolated skin/onboarding; MVP skin tuned for 16+, alternate themes deferred.
- 2026-06-15 /architector:triage — advanced raw-idea → explored; theme scope locked to color/type/motion/register/flavor (R1/#12); register model resolved (R2/#13); token system and error-feedback language remain open.
- 2026-06-22 /architector:decide — resolved all four open decisions → `ready`. D1 token system = **hand-rolled context-injected provider behind a thin seam** (no library; the `(key,locale,register)` 3-axis model fights `(token,theme)` libs — same narrower-than-the-library logic as dropping MathLive/CAS). D2 error-feedback = **derived from gamification's no-subtraction invariant**, not a new philosophy (never "wrong": no red/✗/buzzer/shake; forward motion; `diagnosticPayload` personalizes the hint as help; soft timing in-spec). D3 persona = **enum selecting a coherent bundle** (not free selection), dark/light orthogonal (system-inherited), stored in local-persistence, changeable post-onboarding, and a change MUST NOT touch difficulty/progress (R1 consequence). D4 onboarding = **separate flow orchestrating three owners** (placement/i18n/persona), owning none; partially skippable — placement shortenable but not nulled, skip starts conservatively low and calibrates up (subordinate to north star). Unblocks i18n-strings (register lookup confirmed, theme holds no string copies).
