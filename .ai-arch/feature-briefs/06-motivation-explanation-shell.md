# Feature Brief: Motivation, Explanation & Presentation Shell
_Stage: 06_
_Created: 2026-06-24 via /architector:finalize_
_Arch nodes covered: gamification, explanation-provider, i18n-strings, presentation-theme_

## Goal
Build the app shell the learner actually sees and the explanation seam that closes their "explain my mistake" need offline: the skill-graph-as-mastery-map with graded rings, the light no-shame motivation layer (streak/XP), the hand-rolled theme/persona system with its no-pressure error-feedback language, the i18next string catalogs with the register axis, and the `ClipboardPromptProvider`. This is where the north star (dissolve fear/avoidance) becomes a felt surface — every choice here is governed by a single anti-shame invariant.

## Context
- **The gamification core IS the skill graph**, made visible. Rings render the single `masteryLevel` scalar (stage 04) under their own cut-point — **no independent fill semantics, no second progress source**. Because the scalar runs along the CPA trajectory, a novice sees nonzero fill immediately (north-star relevant).
- **One anti-shame invariant governs everything:** *no UI state ever shows the user something subtracted — only gained or not-yet-gained.* Streak-miss → silent, no red/loss; XP never deducted; a ring never empties; an unavailable node is "not-yet-open" (muted, no padlock), never "locked."
- **"Where to next" is owned by gamification, never read off prerequisite edges:** `next = diagnostic-debt ?? due-reviews(capped) ?? curated-entry-path`. The graph says what's *possible*; "worthwhile next" is a product/pedagogy claim (a curated path that *respects* the graph but isn't derived from it).
- **Theme = hand-rolled context-injected token provider behind a thin seam, no library.** The non-standard `(key, locale, register)` 3-axis model fights `(token, theme)` libraries (same narrower-than-the-library logic as dropping MathLive/CAS). Theme owns color/type/motion/register/flavor — **never difficulty/entry point** (#12).
- **Error-feedback visual language is DERIVED from the anti-shame invariant, not a fresh philosophy** — never "wrong" (no red/✗/buzzer/shake), forward motion, soft timing; the structured `diagnosticPayload`/`failedStep` (stage 03) personalizes the *hint as help*, never blame.
- **i18n: three separate language fields** (UI / content / explanation), MVP-bound to one selection. Tooling = `expo-localization` + `i18next`, with `register` mapped onto i18next's native `context` axis. **Ukrainian default**; English/others are additions, not rewrites.
- **ExplanationProvider** deterministically renders a prompt from a dedicated template and copies it to the clipboard — no built-in LLM, no API key, fully offline. The same `context`/`result` types later plug in `ApiExplanationProvider` with only the transport changing.

## What Needs to Be Built
1. **Gamification / progress map:**
   - Graded **mastery rings** over node IDs, rendering the `masteryLevel` scalar. States: `not-yet-open` (muted, no padlock), `available`, `in-progress` (partial fill = current scalar), `mastered` (full).
   - **"Where to next"** = prioritized merge `diagnostic-debt ?? capped-due-reviews ?? curated-entry-path`. The **curated entry path** is new data owned here — an ordered progression sequence that respects the graph (never proposes a not-yet-open node) but isn't derived from it; **mechanism + shipped default now**, calibrated sequence deferred to `pedagogy-pass`. Due-reviews (stage 05) are **capped** so repetition can't dominate forward movement.
   - **Motivation primitives:** node-mastery = primary signal. **Streak:** a "kept" day = any session meeting a low achievable bar (≥1 completed task, not a quota); a miss is silent (pauses/resets upward, never a penalty display). **XP:** awarded on task completion + mastery milestones, never lost; secondary. **Comparison/leaderboards off by default.**
   - Persists streak/XP/curated-path-position via stage 01; emits streak/milestone events into the activity-event-stream durable class.
2. **Theme / persona system:**
   - A small (~100–200 line) hand-rolled React-context token provider injecting color/type/space/motion and passing `register` into the `(key, locale, register)` lookup — behind a thin seam (library slot-in-able later under the identical interface). Holds **no string copies**.
   - **Persona = enum** (`adult-16+ | kid | enthusiast`) selecting a *coherent bundle*; **dark/light is orthogonal**, system-inherited. Stored in stage 01 as materialized state; **changeable post-onboarding**; a persona change **MUST NOT touch difficulty/progress** (R1/#12).
   - **Error-feedback visual spec (D2):** never "wrong" — no red/buzzer/✗/shake; calm "not yet — try it this way" with forward motion; consume `diagnosticPayload`/`failedStep` to personalize the hint as help; **timing is part of the spec** (a brief beat + smooth transition, never a hard same-millisecond flash). MVP skin tuned for the 16+ anxious persona.
3. **i18n string layer:**
   - `expo-localization` + `i18next` catalogs; **three language fields** (UI/content/explanation) modeled separately though MVP-bound to one selection; device-language detection with explicit override; **Ukrainian default**.
   - `register` via i18next `context`: `t('error.wrong', { context: register }) → error.wrong_warm`, with `_neutral` as fallback. One catalog, register as a key suffix, theme supplies the value.
   - **Register-completeness CI gate by criticality:** silent fallback-to-neutral allowed for ordinary strings, but a **build error** for no-shame-critical strings (error-feedback, hints, lapse/streak-miss) where all three register variants are required. New build obligation: a per-key **criticality tag** + a **lint/CI completeness check**.
   - Owns the `ParseError` format-hint *copy* (the signal comes from stage 03), under the no-pressure register.
4. **ExplanationProvider (`ClipboardPromptProvider`):**
   - Seam `explain(context) → result`, where `context = { problem, studentAnswer, correctAnswer, method, steps, failedStep, skillNode, contentLanguage, explanationLanguage }` (two language fields — `contentLanguage` so the model reads the problem, `explanationLanguage` for the reply; **no UI language**) and `result = { kind: 'clipboard' | 'inline', promptText, status }`.
   - MVP returns `kind: 'clipboard'` — render the prompt deterministically from a **dedicated, localizable prompt-template asset owned by the provider** (keyed by `explanationLanguage`, **separate from the i18n-strings UI catalog**) and copy to clipboard. Prompt meta-instruction: explain exactly this step, in the user's language, encouragingly, no shaming, assume weak fundamentals, **do not give the final answer — lead them to it**.
   - Privacy: prompt contains only math, no personal data; nothing leaves the device without explicit user action.

## Dependencies
- **Requires:** 04 (rings read the `masteryLevel` scalar; the staged-descent framing + anti-loop escalation surface render here; diagnostic-debt is the top "where to next" source), 03 (`steps` + `failedStep` for ExplanationProvider context; `diagnosticPayload`/`failedStep` for the personalized hint), 01 (persists streak/XP/persona/languages via the hot-state seam; emits durable events).
- **Enables:** 07 (the onboarding flow orchestrates this stage's persona + language owners; the shell is what gets hardened); deferred: cosmetic-companion (consumer of the motivation layer + durable events), social (consumer of the durable class).

## Key Decisions Already Made
- **Graded single-scalar rings (not binary)** — binary re-introduces a second progress source and hides early CPA motion.
- **`not-yet-open` not `locked`** — a padlock reads as "you haven't earned this" to an anxious 16+.
- **One anti-shame invariant, not a list of bans** — lifted to a cross-cutting product principle; every case derives from it.
- **"Next" never derived from prerequisite edges** — graph = possible, curated path = worthwhile; the path is new data owned here (shipped default; sequence deferred to pedagogy-pass).
- **Hand-rolled token provider, no library** — `(key,locale,register)` fights `(token,theme)` libs.
- **Error-feedback derived from the no-subtraction invariant** — makes the spec falsifiable (no red/✗/forward motion/soft timing); the two must not diverge.
- **Persona enum (coherent bundle), dark/light orthogonal, change ≠ difficulty change** — free theme selection breaks bundle integrity.
- **Three language fields; i18next with register-as-context; criticality gate** — hand-rolled lookup rejected (re-implements plurals/interpolation), namespaces rejected (triples catalogs/loses fallback), global silent register-fallback rejected (degrades tone unnoticed for the most vulnerable users).
- **ExplanationProvider: two language fields, dedicated template asset, clipboard-only MVP, structured `result`** — a single `language` field breaks when content ≠ explanation language; `void` return forces a breaking change when the API provider lands.

## Open Technical Questions
- Concrete ring component + map layout (and the on-screen placement that cosmetic-companion later depends on — note it, don't build the companion).
- The curated-entry-path data shape + its shipped default sequence.
- The streak/XP rules' exact thresholds and event emissions.
- The token-provider API surface and the persona→bundle mapping.
- The i18next catalog structure, the criticality-tag mechanism, and the CI completeness-check implementation.
- The prompt-template asset format and the exact meta-instruction wording per `explanationLanguage`.

## Out of Scope for This Stage
- The **onboarding flow** that *sets* persona + languages + entry difficulty → **stage 07** (this stage builds the owners it orchestrates: theme/persona, i18n, and — via stage 04 — placement).
- `ApiExplanationProvider` / deep-linking into chat apps (fast-follow; the seam reserves them).
- The cosmetic companion (deferred — but note placement constraints so the motivation layout leaves room).
- Calibrated curated-path sequence / threshold values → `pedagogy-pass`.

## Notes for /interview
/interview before /deep-plan — this stage has the most UI surface and several concrete shapes to pin (ring/map layout, token-provider API, i18next catalog + criticality gate, prompt-template format). The decisions are locked; interview the **implementation shapes** and, importantly, confirm the **anti-shame invariant and the derived error-feedback spec are honored uniformly** (they are the north star made visible — the error moment, the streak-miss, the locked-node rendering, and the register gate are all the same principle). Coordinate the ExplanationProvider `context` with stage 03 (it consumes `steps`/`failedStep` verbatim) and the persona/language storage with stage 01's hot-state seam.
