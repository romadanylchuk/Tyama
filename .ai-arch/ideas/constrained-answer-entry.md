# Idea: Constrained Answer Entry / Input Modality
_Created: 2026-06-15_
_Slug: constrained-answer-entry_

## Description
The user **never free-types an expression**; they answer narrow per-step questions through constrained widgets. `inputMode` is a property of the skill/generator (per step), and the UI is a **registry of input widgets keyed by modality** — a new task type declares its modality and reuses existing widgets, mirroring the generator registry. The modality spectrum (lightest → heaviest): **choice** (tap an option; distractors can encode common mistakes for diagnostic signal), **number** (numeric keypad), **tokens** (tap-to-assemble from a constrained tile palette; deterministically parseable, no syntax errors), **manipulative** (drag/tap a visual; the interactive CPA-pictorial layer; best fit for fractions), **finalOnly** (bare answer, for mastered speed drills).

**All five modalities ship in MVP** — forced by the four committed generators plus the mastery-gates abstract stage, not optional breadth. The **registry contract** is the load-bearing surface: a widget receives `prompt` + modality-specific config derived from the step (choice → option set incl. distractors; tokens → allowed tile palette; manipulative → the visual model) and **never receives `expected`** — it collects input blind and emits structured input, never a verdict. Widget output is **`{ rawInput, inputStructure?, diagnosticPayload? }`** (NOT a bare value), so the *nature* of a divergence is preserved at the source for the diagnostic loop. The widget does **not** normalize; both locale and canonical normalization stay in the step-level-checking pipeline.

## Priority
core

## Maturity
ready

## Notes
- Brief v0.3 input section, locked decision #11.
- Framed as **lower barrier**, not merely "no worse," than final-answer entry: the user who freezes at "where do I start" is held through the method.
- Each step: `{ prompt, inputMode, expected, skillNode, elicitFromMastery }`; `inputMode ∈ { choice | number | tokens | manipulative | finalOnly }`. Note `expected` lives on the step for the *checker*, NOT for the widget — the widget is never handed it.
- Step elicitation count fades with mastery — see [[difficulty-model]] and [[mastery-gates]].
- ~~Open (Q10): the MVP widget set and its contract; whether `tokens` needs `math.js` equivalence checking or strict-form matching.~~ **RESOLVED 2026-06-18 /decide** — see Decision. No open questions remain.
- Library stance: no full math editor (MathLive) in the core; see [[tech-stack]]. Khan Academy's custom constrained keyboard is the precedent.

## Decision
_Decided: 2026-06-18_

### What Was Decided
Three linked rulings closing Q10:

1. **Tokens strict-matching — CONFIRMED as a consequence (not a new decision).** [[tech-stack]] already killed CAS and [[step-level-checking]] already locked strict canonical matching. Tokens is the *easiest* case: input assembled from a constrained tile palette is already an ordered token sequence with no syntactic chaos, so canonicalization is trivial (normalize order/form → strict-match canonical `expected`). No residual case needs semantic equivalence; "accept multiple forms" stays a per-generator opt-in via the **normalization policy**, never an engine. **Tokens emits a canonical sequence; the checker strict-matches.**

2. **MVP widget set = ALL FIVE** (`choice`, `number`, `tokens`, `manipulative`, `finalOnly`). Forced by upstream, not bloat: the four committed generators were deliberately chosen to stretch the modalities (sticks → manipulative/choice; multiplication → number; fruit-equations → tokens/number; fraction-simplification → manipulative + multi-slot), and `finalOnly` is required by [[mastery-gates]] for the abstract stage of *any* node. Cutting a modality would orphan a generator or break scaffolding-fade at finalOnly.

3. **Registry contract** (the load-bearing part):
   - **Widget INPUT (from the step):** `prompt` + modality-specific config derived from the step (choice: option set incl. distractors; tokens: the allowed tile palette; manipulative: the visual model). **The widget does NOT receive `expected`** — it must not know the correct answer, or checking logic leaks into the UI. The widget collects input blind; the checker compares. **Widget emits input, never a verdict.**
   - **Widget OUTPUT — structured, NOT a bare value:** `{ rawInput, inputStructure?, diagnosticPayload? }`. A bare normalized value would discard the diagnostics half the product depends on. `diagnosticPayload` (optional, modality-specific): choice → chosen distractor's identifier + its encoded error type; tokens → optionally where the sequence diverged; number/manipulative → usually empty.
   - **Normalization boundary:** the widget emits `rawInput` (+ `inputStructure` for tokens/choice) and does **NOT** normalize. Both **locale normalization and canonical normalization stay in the [[step-level-checking]] pipeline** (locale → canonical → compare). Normalization in the widget would duplicate it across two places.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Trim the MVP widget set (< 5 modalities) | Each surviving generator and the mastery-gates abstract stage already commits to a specific modality; cutting one orphans a generator or breaks scaffolding-fade at `finalOnly`. The set is forced, not chosen. |
| Widget receives `expected` and self-checks | Leaks checking logic into the UI layer; the widget would emit a verdict instead of input, forking the single checker. Boundary violation. |
| Widget output = bare normalized value | Discards the *nature* of a divergence (which distractor, sign-flip vs off-by-one) the diagnostic loop depends on. Locking this now would force re-binding all five widgets later when diagnostic-loop wants "*how* did they err." Same failure class as `failedStep` without divergence nature. |
| Tokens needs CAS / `math.js` semantic equivalence | CAS already dropped upstream ([[tech-stack]]); tokens is the trivial canonicalization case, so strict matching is sufficient. Multi-form acceptance stays a per-generator normalization-policy opt-in, not an engine. |
| Widget normalizes before emitting | Duplicates locale + canonical normalization across widget and checker (two places to keep in sync). Normalization stays solely checker-side. |

### Rationale
The expensive, hard-to-reverse part is the **interface shape**, so it is fixed deliberately up front. Two invariants carry the decision: (1) the widget is *blind* — it never sees `expected` and never normalizes, keeping all answer-judging in the single checker pipeline and out of the UI; (2) the widget output is *structured*, carrying an optional `diagnosticPayload` so the *nature* of an error is preserved at the source. Adding `diagnosticPayload` as an optional field now is cheap; adding it after locking "widget → normalized value" would break the interface and require re-binding all five widgets. The widget set being all-five is not a scope expansion — it is a read-out of generator and mastery-gates decisions already made.

### Implications
- **[[step-level-checking]]:** owns the entire normalization pipeline (locale → canonical → compare); consumes `{ rawInput, inputStructure? }`. The Q10 shared-concern (tokens equivalence) collapses to "strict-match a canonical token sequence" — no engine needed. May consume `diagnosticPayload` to enrich `failedStep` divergence nature.
- **[[task-generation]]:** the step's modality-config (option set, tile palette, visual model) is authored by the generator; `expected(canonical)` stays on the step for the checker, not the widget. No contract change beyond confirming config is widget-renderable.
- **[[diagnostic-loop]]:** future "how did they err" signal is already available via `diagnosticPayload` (choice distractor error-type, tokens divergence point) without re-binding widgets.
- **[[mastery-gates]] / [[difficulty-model]]:** `elicitFromMastery` controls how many steps are elicited; `finalOnly` is the fully-faded abstract terminus. No change to those nodes.
- **[[tech-stack]]:** no-MathLive stance confirmed sufficient; the constrained-keyboard / tile-palette approach covers all five modalities.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[task-generation]] — steps carry the inputMode + modality-config the widgets render
- ← [[tech-stack]] — no-MathLive stance + widget/rendering libs

**Shared concerns:**
- [[step-level-checking]] — RESOLVED: tokens emits a canonical sequence, checker strict-matches; widget never normalizes (normalization is checker-side); checker may read `diagnosticPayload`
- [[mastery-gates]] / [[difficulty-model]] — elicited step count fades with mastery (elicitFromMastery); `finalOnly` is the faded terminus

## History
- 2026-06-15 /architector:new — NEW in brief v0.3. Constrained per-step entry via a modality-keyed widget registry (choice/number/tokens/manipulative/finalOnly); never free-typed. MVP widget set and tokens-equivalence strategy are open.
- 2026-06-18 /architector:decide — RESOLVED Q10 → `ready`. (1) Tokens strict-matching confirmed as a consequence of the dropped-CAS / strict-canonical decisions — tokens is the trivial canonicalization case, no semantic equivalence engine. (2) MVP widget set = all five, forced by the four generators + mastery-gates `finalOnly`, not optional breadth. (3) Registry contract: widget IN = `prompt` + modality-config, NEVER `expected`; widget OUT = structured `{ rawInput, inputStructure?, diagnosticPayload? }` (not a bare value) so divergence *nature* survives at the source; widget does NOT normalize — locale + canonical normalization stay entirely in the step-level-checking pipeline. Rationale: lock the blind-widget + structured-output interface now because adding `diagnosticPayload` later would break all five bindings.
