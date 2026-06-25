# Feature Brief: Answer Pipeline — Input · Locale Parsing · Step-Level Checking
_Stage: 03_
_Created: 2026-06-24 via /architector:finalize_
_Arch nodes covered: constrained-answer-entry, locale-numeric-parsing, step-level-checking_

## Goal
Build the single data-flow that turns a learner's constrained input into a precise `failedStep` (or "correct"): a blind, modality-keyed input-widget registry → a locale-aware numeric normalizer → one generic step-level checking engine. This is where the product's most expensive architectural decision (step-level, not binary, checking) and its most fatal correctness trap (locale decimal-separator mis-parsing) both live. Every choice here is risk-profiled against the single worst failure: **marking a correct answer wrong** for an anxious learner.

## Context
- **The user never free-types an expression.** Input is via constrained per-step widgets in a **registry keyed by modality** — mirroring the generator registry. (constrained-answer-entry, decision #11.)
- **All five modalities ship in MVP** — `choice`, `number`, `tokens`, `manipulative`, `finalOnly` — forced by the four committed generators + mastery-gates' `finalOnly` abstract stage, not optional breadth.
- **Checking is step-level and first-break.** One generic engine walks the unified, ordered, semantic `steps[]` (shape from stage 02); the **first** step whose normalized input ≠ canonical `expected` becomes `failedStep` (carrying that step's `skillNode`), and checking **stops there**. First-break gives the single cleanest routing signal and avoids cascade noise.
- **Strict canonical matching, no `math.js`/CAS** — `normalize(input, policy) === step.expected`. Inherited from tech-stack D2 + task-generation. The `tokens` modality is the *trivial* canonicalization case (an ordered token sequence from a constrained palette), so strict matching suffices; multi-form acceptance stays a per-generator normalization-policy opt-in, never an engine.
- **Locale parsing is fatal-if-wrong and lives in exactly one tested place.** `3,5` (UA/EU) vs `3.5` (EN) affects answer parsing, not just display. Mis-parse → correct answer marked wrong → the exact failure the product exists to avoid.

## What Needs to Be Built
1. **Constrained input-widget registry (the load-bearing interface):**
   - Five widgets: `choice` (tap an option; distractors can encode common mistakes), `number` (numeric keypad), `tokens` (tap-to-assemble from a constrained tile palette; deterministically parseable), `manipulative` (drag/tap a visual — the interactive CPA-pictorial layer; best fit for fractions), `finalOnly` (bare answer for mastered speed drills).
   - **Widget INPUT:** `prompt` + modality-specific config derived from the step (choice → option set incl. distractors; tokens → allowed tile palette; manipulative → the visual model). **The widget NEVER receives `expected`** — it collects input blind; no answer-judging in the UI.
   - **Widget OUTPUT — structured, NOT a bare value:** `{ rawInput, inputStructure?, diagnosticPayload? }`. `diagnosticPayload` (optional, modality-specific): choice → chosen distractor's id + its encoded error type; tokens → optionally where the sequence diverged; number/manipulative → usually empty. This preserves the *nature* of a divergence at the source for the diagnostic loop.
   - **The widget does NOT normalize** — both locale and canonical normalization stay in the checking pipeline.
2. **Locale-aware numeric normalizer** — `normalize(rawInput, locale, policy?) → { ok: canonicalString } | { error: ParseError }`:
   - **Source of truth = an explicit `locale → { decimalSep, groupSep, signGlyphs }` config table**, NOT `Intl`-derived (Hermes ships without full ICU; `Intl.NumberFormat.formatToParts` is platform-variable on Android — that's the "auto-detection" the brief forbids). `Intl` is a **test-time cross-check only**.
   - **Output = a canonical *string*, not a JS `number`** (strict string matching downstream; `parseFloat` reintroduces float noise + loses form distinctions). Strip group separators, map locale decimal sep → canonical `.`, normalize sign glyphs (`×`/`·` → `*`, `÷` → `/`, Unicode minus `−` U+2212 → `-`), trim whitespace.
   - **Parse failure → a distinct `ParseError`, never a `failedStep`** and never counted as an error/routing event — a gentle re-prompt / format hint instead. The checker therefore branches on **three** outcomes: parse-error (soft re-prompt), match (correct), mismatch (`failedStep`).
   - **Decimal policy is an explicit term of the canonical contract** — leading-zero required-or-forbidden, trailing zeros stripped-or-not — and MUST be the **same policy the generator applied to `expected`** (stage 02). **Boundary:** the locale step folds only the *separator*; the generator's policy folds the *number form*. Both fold inside the one `normalize(...)` pipeline (`policy?` carries the form half) and reference one documented canonical standard.
   - **One scalar slot at a time:** composite shapes (fraction `□/□`, multi-slot) are decomposed into per-slot `rawInput`s upstream by the step/widget; the `/` never reaches the numeric normalizer as data.
   - **Its own test matrix (owned here):** UA (`3,5`, space group `1 000`), EN (`3.5`, comma group `1,000`), one EU comma-decimal (`de`/`fr`); plus the fatal-class cases — ambiguous grouping-vs-decimal (`1,000` = 1000 in EN but 1.0 in UA/EU; **active locale, never a guess, decides**), non-config/perceptual-twin glyphs → `ParseError` (never silent misparse), leading `+`, Unicode minus, doubled/trailing separator, surrounding whitespace, empty input.
3. **Generic step-level checking engine** — walks the unified ordered `steps[]` in semantic order; per step: hand `rawInput` to the locale normalizer → compare canonical result to the step's canonical `expected` via the contract's normalization policy → on **first mismatch**, record `failedStep` (with `skillNode`) and stop; all match ⇒ correct. **One engine, not per-domain checkers** — task-type differences are absorbed by `inputMode` + the per-step normalization policy. May consume `diagnosticPayload` to enrich `failedStep` divergence nature.

## Dependencies
- **Requires:** 02 (generators emit the ordered semantic `steps[]`, each `inputMode`, the modality-config the widgets render, and the canonical `expected` + normalization policy).
- **Enables:** 04 (emits the single first-break `failedStep.skillNode` — the routing entry point), 06 (supplies `steps` + `failedStep` to ExplanationProvider context, and `diagnosticPayload`/`failedStep` to the theme's personalized hint).

## Key Decisions Already Made
- **First-break over evaluate-all** — cleanest routing signal, avoids cascade noise from an early wrong value poisoning later steps.
- **Strict canonical matching, no `math.js`** — including for `tokens`. CAS already dropped upstream; tokens is the trivial canonicalization case.
- **Locale parsing delegated, never inlined** — the deliberate split that made locale-numeric-parsing its own blocking node with its own test suite.
- **Explicit locale config table as runtime authority** — `Intl` rejected at runtime (Hermes/Android ICU incomplete/variable; its failure mode is the fatal one); kept as a test cross-check.
- **Canonical *string* output, not JS `number`** — aligns with strict string matching, avoids float noise.
- **`ParseError` ≠ wrong answer** — a formatting slip must never be scored against an anxious learner or pollute routing.
- **Blind widget + structured output** — the widget never sees `expected`, never normalizes, and emits `{ rawInput, inputStructure?, diagnosticPayload? }` not a bare value. Adding `diagnosticPayload` later would re-bind all five widgets, so it's fixed now.

## Open Technical Questions
- Concrete widget component APIs and the modality-config shapes each consumes (choice option-set, tokens tile-palette, manipulative visual model).
- The exact `diagnosticPayload` schema per modality and how the checker reads it into `failedStep`.
- The exact `normalize(...)` signature/return and how the `policy?` form-half is threaded from the step.
- Where composite-shape decomposition (`□/□` → per-slot `rawInput`) physically happens (step config vs widget) — must be specified, not left undefined.
- The shared documented canonical standard (coordinate with stage 02 — must not diverge from the generator's `expected`).

## Out of Scope for This Stage
- Diagnostic routing over `failedStep` → **stage 04** (this stage only *emits* `failedStep`).
- Mastery computation / scaffolding-fade logic → **stage 04** (this stage renders whatever `elicitFromMastery`/`inputMode` the step carries).
- The ExplanationProvider and the theme's hint rendering → **stage 06** (this stage produces the `failedStep` + `diagnosticPayload` they consume).
- The format-hint *copy* shown on `ParseError` (string surface owned by i18n-strings, stage 06) — this stage owns the `ParseError` *signal*, not its wording.

## Notes for /interview
/interview first. The decisions are locked, but the **concrete interfaces** are correctness-critical and bind three nodes together: pin (1) the five widget component APIs + modality-config shapes; (2) the exact `normalize(...)` signature and the three-outcome branch in the engine; (3) the `diagnosticPayload` schema; (4) where composite decomposition happens. Above all, lock the **one documented canonical standard** for number form *with stage 02's owner* — a mismatch between the generator's `expected` and the checker's `normalize` is the single fatal failure this whole stage exists to prevent. Build the locale test matrix as a first-class deliverable, not an afterthought.
