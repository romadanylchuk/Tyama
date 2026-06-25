# Idea: i18n / Localization
_Created: 2026-06-15_
_Slug: i18n-localization_

## Description
Language handling is an architectural concern from the start because this is a **math** app with non-obvious traps. Guiding principle: the **deterministic core is language-neutral** (generators emit structured data — numbers, operators, step types, skill-node refs — never localized strings); language lives only in presentation and explanation layers. Three conceptually distinct languages are modeled as **separate fields** even though the MVP binds them to one selection: **UI language**, **content language** (problem text/flavor), **explanation language**.

## Priority
core

## Maturity
explored

## Notes
- Brief §10, locked decision #10. Default language: **Ukrainian** (primary persona); English and others must be **additions, not rewrites**.
- **Critical math-specific trap — locale-sensitive number formatting:** decimal separator "3,5" (UA/EU) vs "3.5" (EN) is **not cosmetic** — it affects display AND **answer parsing in step-level checking**. Mis-parse and correct answers get marked wrong — fatal for an anxious learner. Also: thousands separators, × vs *, ÷ vs /, choice of variable letters. (This sub-decision is effectively a blocking constraint on [[step-level-checking]].)
- Recommended: `expo-localization` + `i18next` catalogs; device-language detection with explicit override; locale-aware formatting via `Intl` where available, with **explicitly tested fallbacks** for decimal-separator parsing (don't rely on auto-detection alone).
- Language-dependent layers: UI chrome, problem text/flavor (fruit names, word-problem wrappers), hint/step-description templates, the explanation prompt (`language` field), skill/atom display names, app-store metadata.
- **Copy register (triage R2 / locked decision #13):** strings are keyed `(key, locale, register)`, `register ∈ { neutral, warm, playful }`. The [[presentation-theme]] passes a register into the lookup; it holds **no string copies** (no per-theme catalog duplication). A single **"no-pressure tone"** product principle governs all string surfaces (UI copy, error-feedback, explanation-prompt meta-instruction). **Resolve register before choosing catalog tooling.**
- Open (Q9): confirm the three-field model; pick catalog tooling; fix the exact decimal-separator parsing strategy in the checker.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[tech-stack]] — catalog tooling (expo-localization/i18next) + Intl formatting
- ← [[presentation-theme]] — register set must be resolved before catalog tooling, or strings duplicate (#13)

**Blocks (→):**
- → [[step-level-checking]] — locale-aware decimal parsing (blocking, fatal-if-wrong)
- → [[explanation-provider]] — supplies the `language` field

**Shared concerns:**
- [[step-level-checking]] — locale decimal separator is checker correctness wearing an i18n hat
- [[presentation-theme]] — (key, locale, register) lookup: i18n holds strings, theme selects register

**Split signal:**
- bundles string-localization (core) + locale-aware number parsing in the checker (blocking) — different owners, different test suites; consider splitting before catalog tooling is chosen

## History
- 2026-06-15 /architector:new — language-neutral core; three separate language fields (UI/content/explanation); Ukrainian default. Locale-aware decimal parsing flagged as fatal-if-wrong. Catalog tooling and exact parsing strategy open.
