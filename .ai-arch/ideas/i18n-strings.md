# Idea: i18n / String Localization

_Created: 2026-06-15_
_Slug: i18n-strings_

## Description
String-localization half of the former i18n node. Guiding principle: the **deterministic core is language-neutral** — generators emit structured data (numbers, operators, step types, skill-node refs), **never localized strings**; language lives only in presentation and explanation layers. Three conceptually distinct languages are modeled as **separate fields** even though the MVP binds them to one selection: **UI language**, **content language** (problem text/flavor), **explanation language**. This node owns catalogs, the register model, and the language-field model — but **not** the numeric-parsing trap (split out to [[locale-numeric-parsing]]).

## Priority
core

## Maturity
ready

## Decision
_Decided: 2026-06-22_

### What Was Decided
1. **Decision A — Three-field language model CONFIRMED.** UI language / content language / explanation language are **three separate fields**, even though the MVP binds all three to one selection. The `explanation language` field is exactly what [[explanation-provider]] consumes in its `context`.
2. **Decision B — Catalog tooling = `expo-localization` + `i18next`, with the `register` axis mapped onto i18next's native `context` feature.** `t('error.wrong', { context: register }) → error.wrong_warm`, with `_neutral` as the built-in fallback. One catalog; register is a key suffix; the theme supplies the register *value* and holds no copies (satisfies R2 "no per-theme duplication").
3. **Required refinement — register-completeness gate, by criticality.** i18next's silent fallback-to-base-when-a-register-variant-is-missing is allowed for **ordinary strings**, but is a **build error (CI-enforced), not a silent fallback, for no-shame-critical strings** (error-feedback, hints, lapse/streak-miss messages). All three register variants are required on those keys.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| **B3 — hand-rolled 3-tuple `(key, locale, register)` lookup, no i18next** | Re-implements plurals / interpolation / locale-load that i18next gives for free. The asymmetry that made hand-rolling right for *theme tokens* (poor, structureless) makes it wrong for *strings* (rich linguistic needs). |
| **B2 — i18next with register as separate namespaces** | Triples catalog files and loses automatic fallback-to-neutral; more bookkeeping than B1's `context` suffix for no gain. |
| **B1 with global silent register-fallback (no gate)** | Trap exactly where register matters most: a missing `warm`/`playful` variant on an error string silently degrades to `neutral`, so an anxious user gets a dry "incorrect" where gentle encouragement was designed — and **nobody notices, because fallback throws no error.** Same silent-misbehaviour class as locale mis-parsing. Rejected in favour of the criticality gate. |

### Rationale
- **A:** decoupling is cheap now (three fields), merging is expensive later (a polyglot wanting UI in one language, explanations in another). Confirms brief #10.
- **B:** i18next's `context` is purpose-built for a suffix-axis, so `register` maps onto it almost exactly — `_neutral` doubles as fallback, one catalog, register as suffix. tech-stack's warning ("do not *default* to vanilla i18next before register-mapping is solved") is **satisfied, not bypassed**: we arrive at i18next *through* the register-mapping resolution, so it's a justified choice rather than a default.
- **Gate:** the no-shame tone *is* the product on error/hint/lapse strings; a silently-colder-than-designed string is wrong behaviour passing unnoticed on the most vulnerable users. The fix (a criticality tag on the key + a CI completeness check) is cheap now and impossible to retrofit after shipping a release where warm-errors sounded neutral for months.

### Implications
- **[[explanation-provider]]** — the confirmed three-field model supplies its `language` field; unchanged interface, dependency now resolved on this end.
- **[[presentation-theme]]** — confirmed as the supplier of the `register` *value* into the `(key, locale, register)` lookup; holds no string copies. The `context`-suffix mechanism is the concrete realization of that hand-off.
- **[[locale-numeric-parsing]]** — unaffected; still keys on the same active content-locale field but runs on its own (blocking) clock.
- **New build obligation:** a per-key **criticality tag** (ordinary vs no-shame-critical) and a **lint/CI register-completeness check** enforcing all three variants on critical keys. This is an implementation artifact owned by this node.

## Notes
- Brief §10, locked decision #10. Default language: **Ukrainian** (primary persona); English and others must be **additions, not rewrites**.
- Recommended: `expo-localization` + `i18next` catalogs; device-language detection with explicit override.
- Language-dependent layers: UI chrome, problem text/flavor (fruit names, word-problem wrappers), hint/step-description templates, the explanation prompt (`language` field), skill/atom display names, app-store metadata.
- **Copy register (triage R2 / locked decision #13):** strings are keyed `(key, locale, register)`, `register ∈ { neutral, warm, playful }`. The [[presentation-theme]] passes a register into the lookup; it holds **no string copies** (no per-theme catalog duplication). A single **"no-pressure tone"** product principle governs all string surfaces (UI copy, error-feedback, explanation-prompt meta-instruction). **Resolve register before choosing catalog tooling.**
- The active **content locale** selected here is the input the sibling [[locale-numeric-parsing]] node keys on for separator convention — the two share the locale field but run on different clocks (this node is non-blocking core; the parser is blocking/fatal-if-wrong).
- ~~Open (Q9): confirm the three-field model; pick catalog tooling.~~ **RESOLVED 2026-06-22 /decide** — three-field model confirmed; tooling = `expo-localization` + `i18next` with `register` via i18next `context`; register-completeness gate added for no-shame-critical strings. See `## Decision`.

## Connections
_Split from i18n-localization 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[tech-stack]] — catalog tooling (expo-localization/i18next)
- ← [[presentation-theme]] — register set must be resolved before catalog tooling, or strings duplicate (#13)

**Blocks (→):**
- → [[explanation-provider]] — supplies the `language` field

**Shared concerns:**
- [[presentation-theme]] — (key, locale, register) lookup: i18n holds strings, theme selects register
- [[locale-numeric-parsing]] — both key on the same active content-locale field (split lineage)

## History
- 2026-06-15 /architector:new — language-neutral core; three separate language fields (UI/content/explanation); Ukrainian default. Catalog tooling open. (as i18n-localization)
- 2026-06-15 /architector:map — split from i18n-localization; this half covers string catalogs, the language-field model, and copy register. The locale-aware number-parsing trap moved to [[locale-numeric-parsing]] (different owner, different blocking profile, different test suite).
- 2026-06-22 — UNBLOCKED by [[presentation-theme]] /decide (D1): register set `{neutral, warm, playful}` is final and the theme is confirmed to pass `register` into the `(key, locale, register)` lookup while holding **no string copies** (hand-rolled token provider, no token-library catalog model). Catalog tooling (Q9) can now be chosen against a fixed 3-axis key with no per-theme duplication risk. Node still `explored` — catalog-tooling + three-field confirmation pending its own /decide.
- 2026-06-22 /architector:decide — explored → **ready**. Confirmed three-field language model (A); chose `expo-localization` + `i18next` with `register` mapped onto i18next's native `context` axis (B1) over hand-rolled (B3, re-implements plurals/interpolation) and namespaces (B2, triples catalogs/loses fallback) — arriving at i18next *through* the register-mapping resolution satisfies tech-stack's "don't default" warning. Added a register-completeness gate: silent fallback allowed for ordinary strings but a **CI build error** for no-shame-critical strings (error/hint/lapse), so a missing warm/playful variant can't silently degrade tone for anxious users. New build obligation: per-key criticality tag + CI completeness check.
