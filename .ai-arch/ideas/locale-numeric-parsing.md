# Idea: Locale-aware Numeric Parsing (checker)

_Created: 2026-06-15_
_Slug: locale-numeric-parsing_

## Description
The number-parsing half of the former i18n node, split out because it is a **blocking, fatal-if-wrong correctness constraint on the checker**, not catalog work. Locale-sensitive number formatting — decimal separator `3,5` (UA/EU) vs `3.5` (EN) — is **not cosmetic**: it affects both display AND **answer parsing in [[step-level-checking]]**. Mis-parse a correct answer and it gets marked wrong — fatal for an anxious learner, the exact failure the product exists to avoid. This node owns the parsing/normalization strategy and its test suite; it keys on the active content locale supplied by [[i18n-strings]].

## Priority
blocking

## Maturity
ready

## Decision
_Decided: 2026-06-18_

### What Was Decided
A four-part package closing Q9. The normalizer is the single tested seam the checker calls before every comparison: `normalize(rawInput, locale, policy?) → { ok: canonicalString } | { error: ParseError }`.

1. **Source of truth = explicit locale config table, NOT `Intl`-derived.** A hand-maintained `locale → { decimalSep, groupSep, signGlyphs }` map is the runtime authority. Hermes (the [[tech-stack]] JS engine) ships without full ICU by default and its `Intl.NumberFormat.formatToParts` support is platform-variable on Android — relying on it to *discover* separators is exactly the "auto-detection" the brief forbids. The table is deterministic, engine-independent, and fully unit-testable. `Intl` may be used as a **test-time cross-check only**, never as the runtime parser.

2. **Output = canonical string, NOT a JS `number`.** [[step-level-checking]] does strict canonical *string* matching, so the normalizer emits a canonical string: strip group separators, map the locale decimal separator → canonical `.`, normalize sign glyphs (`×`/`·` → `*`, `÷` → `/`, Unicode minus `−` U+2212 → `-`), trim whitespace. Round-tripping through `parseFloat` is rejected — it reintroduces float noise (`0.1+0.2`) and discards trailing-zero/form distinctions the per-step normalization policy may rely on.

3. **Parse failure is NOT a wrong answer.** Unparseable input (empty, gibberish, ambiguous separator use) returns a distinct `ParseError` — it is **never** turned into a `failedStep` or counted as an error/routing event. The learner gets a gentle re-prompt / format hint. This is the no-shame product principle made load-bearing: a formatting slip must not be scored against an anxious learner. The checker therefore distinguishes three outcomes: parse-error (soft re-prompt), parsed-and-matches (correct), parsed-and-mismatches (`failedStep`).

4. **Test matrix (owned and maintained here).** Base: **UA** (`3,5`, space group `1 000`), **EN** (`3.5`, comma group `1,000`), one **EU comma-decimal** (`de`/`fr`). Edge cases asserted explicitly: leading `+`, Unicode minus, trailing/doubled separator, group separators present, surrounding whitespace, empty input. Active **content locale** is passed in from [[i18n-strings]] — device auto-detection is never the parse authority. Three additions earned by the fatal-if-wrong profile:
   - **Ambiguous grouping-vs-decimal (most dangerous class):** the *same string* means different numbers by locale — `1,000` = one-thousand in EN but `1.0` in UA/EU. Both "parse successfully" to different values, so a regression silently marks a correct answer wrong. Assert the **active locale (never a guess) decides** the interpretation.
   - **Multi-slot / composite input:** fraction-simplification (an MVP generator) emits `□/□`. Specify and test whether the normalizer receives `"3/4"` as one string or two independent `rawInput`s normalized separately — must not be left undefined. Ruling: the normalizer operates on **one scalar slot at a time**; composite shapes are decomposed into per-slot `rawInput`s upstream (by the step/widget), each normalized independently. The `/` then never reaches the numeric normalizer as data.
   - **Non-config glyphs / perceptual twins:** any digit/glyph absent from the active locale's config entry (full-width digits, an unlisted Unicode minus variant, a future non-UA/EN/EU locale) must resolve to **`ParseError`, never a silent misparse**. At least one test: unknown glyph → `ParseError`.

5. **Decimal policy is an explicit term of the canonical contract — NOT left implicit in "canonical string."** "Canonical string" silently hides a fatal decision: are `0.5` / `.5` / `0.50` one canonical form or several? Is `2` ≡ `2.0`? Under strict string matching, if `expected = "0.5"` but a learner's `,5` normalizes to `".5"`, a **correct answer fails to match.** Ruling: the canonical form carries a single explicit **decimal policy** — leading zero required-or-forbidden, trailing zeros stripped-or-not — and it MUST be the **same policy the generator applied to `expected`**, or the two canonicalizations diverge. **Boundary:** the locale step folds only the *separator* (locale decimal sep → `.`); the generator's normalization `policy` folds the *number form* (leading/trailing zeros, ordering, lowest-terms). Both halves are folded inside the one `normalize(...)` pipeline (the `policy?` argument carries the form half), and both must reference one documented canonical standard. Decimal form is never left to chance inside the word "canonical."

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| `Intl.NumberFormat.formatToParts` to discover separators at runtime | Hermes/Android ICU support is incomplete and variable; depending on it is the "auto-detection alone" the brief explicitly forbids, and its failure mode (silently wrong separators) is the fatal one. |
| Hybrid (Intl-derived with per-locale overrides) | Still couples the runtime to engine ICU presence; more moving parts for no gain once an explicit table exists. Intl is kept as a test cross-check instead. |
| Parse to JS `number` (`parseFloat` after separator fix) | Reintroduces float-precision noise and loses form distinctions, clashing with [[step-level-checking]]'s strict canonical *string* matching. |
| Treat unparseable input as a normal mismatch → `failedStep` | Shames the learner for a formatting slip and pollutes the diagnostic routing signal with non-skill errors — the exact failure the product exists to prevent. |

### Rationale
Every choice minimizes the one fatal failure: marking a correct answer wrong (or punishing a formatting slip). The explicit table removes the engine as a variable; the canonical-string output keeps this node's contract aligned with the strict-matching checker it feeds; the `ParseError`/`failedStep` split keeps formatting noise out of the diagnostic loop. The fatal logic lives in exactly one tested place — consistent with the deliberate split that made this its own blocking node ([[step-level-checking]] Decision C delegates here and never inlines parsing).

### Implications
- **[[task-generation]]** — **(decimal-policy cascade)** the generator contract's normalization `policy` must commit to an explicit decimal form (leading-zero, trailing-zeros) and apply it to `expected`; that exact policy is the one passed into `normalize(...)`. The locale step folds the separator; the generator policy folds the form — both reference one documented canonical standard. The contract already carries a normalization policy (tech-stack D2); this names its decimal-form term as mandatory, not optional.
- **[[step-level-checking]]** — consumes `normalize(...)` before every compare; must branch on **three** outcomes (parse-error → soft re-prompt, match → correct, mismatch → `failedStep`), not two. Confirms its Decision C delegation seam; the only addition is honoring the `ParseError` case as non-routing.
- **[[constrained-answer-entry]]** — unchanged for scalar widgets: they emit `rawInput` and still do not normalize. **Composite shapes** (fraction `□/□`, multi-slot) are decomposed into per-slot `rawInput`s by the step/widget so the numeric normalizer only ever sees one scalar — the `/` separator is structure, not a number to parse.
- **[[i18n-strings]]** — supplies the active content locale (shared field); the locale config table is keyed on it. The format-hint copy shown on `ParseError` is a string surface owned there (subject to the no-pressure tone register).
- **[[tech-stack]]** — the no-ICU-dependence stance is now explicit: the parser must not assume `Intl` at runtime. `Intl` allowed in tests only.

## Notes
- **The trap:** decimal separator `3,5` vs `3.5`; also thousands separators, `×` vs `*`, `÷` vs `/`, and choice of variable letters. Any of these can cause a correct answer to be rejected.
- Strategy: locale-aware formatting via `Intl` where available, with **explicitly tested fallbacks** for decimal-separator parsing — **do not rely on auto-detection alone**. Normalize input to a canonical numeric form before comparison in the checker.
- This is the input layer to step-level checking's correctness: the parser sits between [[constrained-answer-entry]] (which produces the raw input) and the comparison logic in [[step-level-checking]].
- Keys on the **active content locale** resolved by [[i18n-strings]] (shared locale field) — but is owned and tested separately because its failure mode is correctness, not copy.
- ~~Open (Q9): fix the exact decimal-separator parsing/normalization strategy in the checker; enumerate the locale matrix to test (at minimum UA, EU, EN).~~ **RESOLVED 2026-06-18 /decide** — see Decision. No open questions remain.

## Connections
_Split from i18n-localization 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[tech-stack]] — `Intl` formatting / parsing primitives set by the stack

**Blocks (→):**
- → [[step-level-checking]] — locale-aware decimal parsing (blocking, fatal-if-wrong)

**Shared concerns:**
- [[step-level-checking]] — locale decimal separator is checker correctness wearing an i18n hat
- [[i18n-strings]] — both key on the same active content-locale field (split lineage)
- [[task-generation]] — **(decimal-policy, decided 2026-06-18)** the generator's normalization policy must apply a named decimal-form policy (leading/trailing zeros) to `expected`; that same policy is passed into `normalize(...)`. Locale step folds the separator, generator policy folds the form — one documented canonical standard.

## History
- 2026-06-15 /architector:new — locale-aware decimal parsing flagged as fatal-if-wrong; exact parsing strategy open. (as part of i18n-localization)
- 2026-06-15 /architector:map — split from i18n-localization; this half covers the locale-aware numeric parsing/normalization in the checker — blocking and fatal-if-wrong, with its own test suite, distinct from string catalogs.
- 2026-06-18 /architector:decide — RESOLVED Q9 → `ready`. Strategy = explicit locale config table as runtime authority (NOT Intl — Hermes ICU is incomplete/variable; Intl is a test cross-check only); normalizer emits a **canonical string** (strip group seps, decimal sep → `.`, sign-glyph normalize), not a JS number, to match step-level-checking's strict string matching; **parse failure returns a distinct `ParseError`, never a `failedStep`** (formatting slips don't shame the learner). Seam = `normalize(rawInput, locale, policy?) → {ok}|{error}`. Test matrix owned here: UA/EN/EU comma-decimal + edge cases (Unicode minus, leading +, doubled/trailing sep, group seps, whitespace, empty).
- 2026-06-18 /architector:decide (enrichment) — added three fatal-class test cases (ambiguous grouping-vs-decimal `1,000` EN≠UA → active locale decides; composite/multi-slot `□/□` → normalizer is per-scalar-slot, decomposition is upstream; non-config glyph → `ParseError` never silent misparse) and made the **decimal policy an explicit term of the canonical contract** (leading/trailing-zero form must match the policy the generator applied to `expected`, else strict matching fails a *correct* answer). Boundary: locale step folds the separator, generator policy folds the form, one documented standard. New cascade edge → [[task-generation]] (its normalization policy must name a decimal-form term).
