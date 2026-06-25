# Project Context: Tyama — Mental Math Fluency App

_Created: 2026-06-15_
_Source: tyama-architect-brief-en.md (brief v0.3)_

> This is shared context for all subsequent `/architector:*` skills. It captures what is **already known**, not a plan or a design.

## What this product is
**Tyama** (Ukrainian *тяма* — "the knack of getting it") is a **mental-math fluency trainer** that closes the *fluency gap*: the lack of automaticity in foundational skills (multiplication tables, simplifying fractions, linear equations). Its differentiating thesis is not "serving tasks" but **diagnosing precisely which basic skill the user fails on and routing them back there** — so the diagnostic capability must be baked into the domain model from day one, not bolted on.

## Who it is for
- **Primary persona:** 16+ / adult with math anxiety and weak fundamentals. Needs calm, no pressure, no condescension, a felt sense of progress.
- **Secondary (extensibility only, UI not optimized for them in MVP):** school students of various ages; adult enthusiasts.
- **Consequence:** the pedagogical core must be **age-neutral** (knows only skills + difficulty); age specificity lives in a separate presentation/theme/entry-difficulty layer.

## North star (primary success metric)
Disappearance of **fear / avoidance** of math: "I can't do this" → "I'll give it a try." Every other decision is subordinate to this.

## Key constraints (locked in the brief)
- **Stack:** React Native / Expo. **Cross-platform mobile — iOS + Android** (author will test on both real platforms).
- **Offline-first:** generation, checking, progress, and explanation-as-prompt all work with no network.
- **No backend / proxy / server accounts in the MVP.**
- **No runtime LLM** in the math core or anywhere in the MVP (cost, offline, and LLMs hallucinate in math — catastrophic for an anxious learner).
- **Extensibility is first-class:** skill graph = data/config; generators = plugins behind a single contract; input widgets = a registry keyed by modality; presentation/theme layer separated from the pedagogical core.
- **i18n from the start:** deterministic core is language-neutral; locale-aware decimal-separator parsing in the answer checker is critical (mis-parsing "3,5" vs "3.5" would mark correct answers wrong).
- **No punishment / shame:** an error is a routing signal, never a loss event.

## Explicitly out of scope (MVP)
- Advanced math (logarithms, integrals, trigonometry).
- Any runtime LLM integration (only deterministic prompt generation to clipboard).
- Backend / proxy / server-side accounts.
- Social mechanics and leaderboards (comparison amplifies math anxiety).
- The cosmetic companion (fast-follow, not a blocker).
- A "for-all-ages" UI (core is age-neutral; MVP skin/onboarding tuned for 16+).

## Notes on terminology
- **"from MCP"** in the author's request is recorded as: build cross-platform mobile, to be verified/tested on Android and iOS device tooling. Flag for confirmation if it meant something more specific.
- The brief carries 11 **locked decisions**. Within this workflow they remain at `explored` maturity until formally confirmed via `/architector:decide`; the lock status is noted per node so decide can move quickly.

## Decision-log addendum (triage, 2026-06-15)
Five further decisions locked by the author during triage, resolving the cross-node overlaps surfaced in the triage report. To be formally advanced to `decided` via `/architector:decide`.

| # | Decision | Status |
|---|----------|--------|
| 12 | Entry difficulty owned by pedagogy/placement, never by theme; theme = color/type/motion/register/flavor only | Locked |
| 13 | Tone: catalog owns strings keyed `(key, locale, register)`; theme selects register; single "no-pressure tone" principle | Locked |
| 14 | Backup via local user-initiated JSON export/import (share-sheet/Files); no sync backend | Locked |
| 15 | Node identity ships with a split/merge/deprecate mastery-migration strategy; event log gets snapshot/compaction | Locked |
| 16 | Activity-event stream reclassified as core substrate; event schema decided early; social UI stays out of MVP | Locked |

**Structural changes from triage:**
- New node **`activity-event-stream`** (core substrate) split out of `social-deferred`.
- **`local-persistence`** promoted `core` → **blocking** (node identity + versioning constrains the blocking graph/generator nodes).
- **`local-persistence`** and **`presentation-theme`** advanced `raw-idea` → `explored`.
