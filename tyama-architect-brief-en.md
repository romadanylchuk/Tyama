# Architect Brief: Tyama — Mental Math Fluency App

> **Product name:** **Tyama** (Ukrainian *тяма* — "the knack of getting it"; canonical Latin spelling **Tyama**)
> **Brief version:** 0.2 (draft for discussion)
> **Author:** Roma
> **Purpose of this document:** give the architect enough context, domain model, and locked decisions to design the MVP and lay in extensibility. This is not a technical design — it is the input for one.

---

## 1. Context & problem

The trigger is a concrete case: an adult (16+) who considers themselves "a humanities person" and fears math, despite years of tutors and courses. The author's observation: the problem is not understanding advanced topics, but the **lack of automaticity in basic skills** (multiplication tables, simplifying fractions, linear equations). As a result, every "big" task floods working memory with trivia, leaving no capacity for the actual reasoning. Subjectively this is experienced as "hard" and "not for me," which breeds avoidance.

This is a classic **fluency gap** — a gap in the automatization of foundational skills. Key conclusion: tutors structurally **do not close** this gap, because they explain, whereas automaticity is built only through spaced repetition, which no one provides. This is exactly the gap the app must close.

**Core thesis for the architecture:** the most valuable part of the product is not "serving tasks," but **diagnosing precisely which basic skill the user fails on, and routing them back there.** This must be baked into the domain model from day one, not bolted on later.

---

## 2. Goals & non-goals

### Primary goal (success metric #1)
The disappearance of fear / avoidance of math. The user moves from "I can't do this" to "I'll give it a try." This is the primary metric; everything else is subordinate to it.

### Secondary goal (nice bonus)
Improving specific school topics. Does not drive design, but should follow naturally from the primary goal.

### Non-goals (the MVP deliberately does NOT do)
- Does not cover advanced math (logarithms, integrals, trigonometry) — only the foundation and the bridge to algebra.
- Is not a replacement for school/tutor — it is an automaticity trainer, not a course.
- Has no social mechanics in the MVP (see §9).
- Has no built-in LLM integration in the MVP (see §8).
- Does not try to be "for all ages" in its UI in the MVP — the core is age-neutral, but the skin/onboarding is tuned for 16+ first.

---

## 3. Audience

- **Primary persona:** 16+ / adult with math anxiety and weak fundamentals. Needs calm, the absence of pressure or condescension, and a sense of progress.
- **Secondary personas (we lay in extensibility, but do not optimize the UI for them in the MVP):** school students of various ages; adult enthusiasts who enjoy the process itself (like the author).

Architectural consequence: the **pedagogical core must be age-neutral**, with age specificity isolated into a separate presentation/theme/entry-difficulty layer. The core (skill graph + generators + checking) must not know about age — only about skills and difficulty.

---

## 4. Pedagogical core (principles that shape the domain model)

The architect should treat these principles as requirements on the model, not as "features."

1. **CPA: Concrete → Pictorial → Abstract.** Every skill atom exists at three representation levels. The author's idea of fruits instead of numbers is precisely the pictorial bridge between the concrete and the abstract "x." Moving between representation levels = one axis of increasing difficulty. *The task model must carry representation level as a parameter.*
2. **Mastery gates.** Advancing to the next node only after reaching **both accuracy and speed** (automaticity), not after a single correct answer.
3. **Spaced repetition.** Mastered skills periodically return to retain automaticity.
4. **Diagnostic loop.** On error, the system identifies the **broken prerequisite in the skill graph** and routes back there, rather than simply serving "more of the same."
5. **No punishment/shame.** An error is a routing signal, not a loss event. This is a direct consequence of the primary goal (§2).

---

## 5. Domain model

### 5.1 Skill graph
Skills form a **directed acyclic graph of dependencies (DAG)**, not a line and not a tree. Example dependency: simplifying fractions requires fluent multiplication/division; equations rely on both multiplication and inverse operations. The graph is what lets the diagnostic loop (§4.4) route precisely back to the cause rather than the symptom.

### 5.2 Skill atoms
Graph nodes are atoms, not "task types." Draft atoms by layer:

**Number sense (foundation):**
- subitizing / counting (sticks)
- number bonds (compose/decompose: "7 = 5+2 = 4+3")
- addition/subtraction fluency
- **multiplication tables to automaticity** (the main culprit of the fluency gap)
- division as the inverse operation

**Operation structure:**
- order of operations and parentheses
- properties (commutativity, distributivity) — shown visually
- negative numbers

**Fractions / parts / ratios:**
- part–whole
- equivalent fractions and simplification (relies on GCD intuition → pulls back to multiplication)
- operations on fractions
- decimals ↔ common fractions
- percentages (as fractions of 100)
- ratios and proportions

**Bridge to algebra:**
- the unknown as a "missing number" (fruits)
- single-variable equations
- systems of equations (fruits → letters)
- substitution / elimination
- expressions and their simplification

> This list is a starting draft for the architect/pedagogue, not final. The graph must be **data (config)**, not hardcoded.

### 5.3 Task generators
Each task type is a **procedural code generator** (not an LLM, not a bank of stored tasks). The key technique: **backward generation from a pre-chosen answer** — this guarantees correctness, a unique solution, and free deterministic checking.

Example (fruit system):
```
1. Pick the solution:      🍎=3, 🍏=5
2. Pick coefficients:      2·🍎+1·🍏 = 11   (we compute it ourselves)
                           1·🍎+2·🍏 = 13
3. Show to the learner:    2🍎 + 🍏 = 11
                           🍎 + 2🍏 = 13
   The answer (3,5) is already known — we built it in.
```

Why code, not an LLM, for the math core:
- **Correctness guaranteed** (an LLM may produce a system with non-integer roots or a degenerate one — catastrophic precisely for the insecure learner).
- **Checking is free** (the answer is constructed).
- **Step-level checking becomes possible** (we know the method → we know the intermediate steps → we know where the error is).
- **Difficulty = function parameters** (number range, count of unknowns, negatives allowed, fruits/letters).

### 5.4 Generator interface (extensibility contract)
Indicative contract (final form is the architect's call):
```
generate(difficulty: DifficultyParams) → {
  problem,          // statement (with CPA representation level)
  solution,         // answer
  steps,            // ordered solution steps
  representation,   // concrete | pictorial | abstract
  skillNode         // which graph node it belongs to
}
```
- A registry of generators; **a new level = a new module implementing the contract and registered in the graph.** No hardcoded tasks.
- This is the answer to the author's requirement to "lay in the ability to add levels."

### 5.5 Step-level checking
Answer checking is **not binary** "correct/incorrect," but step-level. The task model decomposes the solution into steps; on error, the system identifies **which step** broke, and this is the input for diagnostic routing (§4.4). This is the most expensive architectural decision — made deliberately at the start.

---

## 6. Gamification

**Core:** the skill graph with progress visualization (fillable "mastery rings" per node). The skill structure is visible to the user — it is both motivation and a map.

**Motivation layer (light, age-neutral, no pressure):** streaks, XP, node mastery. Optionally — a cosmetic companion that **grows from success but does not suffer from inactivity.**

**Deliberately rejected:** tamagotchi as the core. Guilt mechanics ("the character dies because you didn't check in") work against the primary goal for an anxious user and are infantile for 16+.

---

## 7. Social (deferred, but laid in architecturally)

There is no social in the MVP. The reason is not only scope: **comparison is the main amplifier of math anxiety** precisely in the users the product exists for. Leaderboards and a "someone is already at level 40" feed harm the primary goal.

What to lay in **now**, even without a UI:
- **A user identity model.**
- **An activity-event stream abstraction** (node mastered, streak, milestone — as events).

Then the future social layer is **a new consumer of already-existing events**, not a rewrite of the core. The default format when added: **cooperative and opt-in** (share milestones, shared goals, support). Competition/leaderboards — a separate, toggleable mechanic, off by default.

---

## 8. Solution explanation (ExplanationProvider)

**MVP decision:** the app **generates a ready-made prompt** and places it on the clipboard; the user pastes it into their preferred chat (ChatGPT/Claude/etc.). No built-in LLM integration, no API key, **no proxy** in the MVP.

The value lies in the prompt's quality, because the core provides rich structured context:
```
ExplanationProvider.explain(context) → result

context = { problem, studentAnswer, correctAnswer,
            method, steps, failedStep, skillNode, language }
```
The generated prompt contains the statement, the method, the answer, and **the specific error step**, with a meta-instruction: explain exactly this step, **in the user's language**, encouragingly, without shaming, assuming weak fundamentals, do not give the final answer — lead them to it.

**Architectural seam:** this is the same interface where the real integration is plugged in later.
- MVP: `ClipboardPromptProvider` — renders the prompt **deterministically from a template** (no LLM needed even to build the prompt; fully offline), copies to clipboard, optionally deep-links into popular apps.
- Future: `ApiExplanationProvider` — the same `context`, but an API call through a proxy (as in the "Companion" project), with the explanation shown in-app. **The input is identical; only the transport changes.**

**Known MVP trade-off:** the explanation from the external chat does not return into diagnostics (the loop is not closed). Acceptable for the MVP; closed in `ApiExplanationProvider`.

**Privacy:** the prompt contains only math, no personal data; nothing leaves the device without an explicit user action.

---

## 9. Localization & Internationalization (i18n)

Although the primary persona is Ukrainian-speaking and the MVP ships in Ukrainian, language handling is an architectural concern from the start, because this is a **math** app and that introduces non-obvious traps.

**Guiding principle:** the **deterministic core is language-neutral; language lives only in the presentation and explanation layers.** Generators emit structured data (numbers, operators, step types, skill-node references) — never localized strings. This keeps the core testable and lets a new language be added without touching pedagogy.

**Language-dependent layers:**
- UI chrome (buttons, navigation, settings) — a standard i18n catalog.
- Problem presentation text & flavor (fruit names, word-problem wrappers).
- Hint / step-description templates.
- The generated explanation prompt — `ExplanationProvider` already carries `language`, and the prompt must instruct the external LLM to answer in the user's language.
- Skill/atom display names.
- App-store metadata.

**Three conceptually distinct "languages" — model them separately even if MVP ties them together:**
1. **UI language** — the interface chrome.
2. **Content language** — problem text and flavor.
3. **Explanation language** — what the explanation prompt requests.

In the MVP a single language selection can drive all three, but they should be separate fields in the model so they can diverge later (e.g., a polyglot user wanting UI in one language and explanations in another).

**Critical math-specific trap — locale-sensitive number formatting:**
- The decimal separator differs: Ukrainian/European **"3,5"** vs English **"3.5"**. For a math app this is **not cosmetic** — it affects both **display AND answer parsing in step-level checking (§5.5)**. The input parser must be locale-aware (accept the user's decimal convention) or normalize explicitly. Get this wrong and correct answers get marked wrong — fatal for an anxious learner.
- Also: thousands separators, the multiplication sign (× vs *), division (÷ vs /), and the choice of variable letters.

**Recommended approach:**
- `expo-localization` + `i18next` (or equivalent) for catalogs.
- Device-language detection with an explicit override in settings.
- Locale-aware number formatting via `Intl` where available, with **explicitly tested fallbacks** for decimal-separator parsing in the answer checker (do not rely on locale auto-detection alone here).
- Default language: **Ukrainian** (primary persona). The architecture must allow English and others as **additions, not rewrites.**

---

## 10. MVP scope

### In
- The skill graph (a starting set of atoms — to be agreed with pedagogy; orientation: number sense + the first bridges to algebra with fruits).
- 3–5 task generators behind the single contract (minimum: sticks/number bonds, multiplication, fruit equations, fraction simplification — final set by priority).
- Step-level checking for these generators.
- Mastery gates + basic spaced repetition.
- Diagnostic routing back to a prerequisite in the graph.
- A light motivation layer (per-node progress, streak, XP).
- `ClipboardPromptProvider` for explanations.
- Local progress persistence (offline-first).
- Ukrainian UI with the i18n architecture from §9 in place.

### Out (explicitly)
- Any runtime LLM integration (only prompt generation).
- Backend / proxy / server-side accounts.
- Social mechanics and leaderboards.
- The cosmetic companion (can be a fast-follow, not a blocker).
- Advanced math.

---

## 11. Stack & non-functional requirements

- **Platform:** React Native / Expo.
- **Offline-first:** the core (generation, checking, progress, explanation-as-prompt) works without a network.
- **Local persistence:** progress and graph state on the device (the specific DB/format is the architect's choice).
- **No backend in the MVP.** A proxy for the future `ApiExplanationProvider` is a separate later task.
- **Extensibility is a first-class requirement:** graph = data; generators = plugins behind a contract; the presentation/theme layer is separated from the pedagogical core.
- **i18n-ready from the start** (§9), with locale-aware number parsing in the answer checker.
- **No runtime dependency on external APIs** in the MVP (cost, offline, no hallucinations in math).

---

## 12. Locked decisions (decision log)

| # | Decision | Status |
|---|----------|--------|
| 1 | Gamification core — skill graph (DAG) + a light motivation layer | Locked |
| 2 | No tamagotchi guilt mechanic | Locked |
| 3 | Task generation — procedural, in code, backward from the answer | Locked |
| 4 | Checking — step-level, not binary | Locked |
| 5 | Pedagogy — CPA, mastery gates, spaced repetition, diagnostic loop | Locked |
| 6 | MVP explanations — generated prompt to clipboard (`ExplanationProvider` seam) | Locked |
| 7 | Social — not in the MVP; lay in identity + event stream; cooperative opt-in | Locked |
| 8 | Extensibility — generator registry behind a single contract | Locked |
| 9 | Stack — React Native / Expo, offline-first, no backend in the MVP | Locked |
| 10 | i18n — language-neutral core; Ukrainian default; locale-aware number parsing | Locked |

---

## 13. Open questions for the architect

1. **Graph state persistence:** which local DB/format (SQLite / MMKV / files)? How to version the graph schema when adding nodes?
2. **Difficulty model:** is `DifficultyParams` a single universal structure or per-generator specific? How to describe a "smooth" progression within one generator?
3. **Solution-step representation:** a unified `steps` format across all task types or per-domain? How to build step-level checking generically on top of it?
4. **Diagnostic routing algorithm:** how exactly to get from `failedStep` to a prerequisite node (direct step→skill mapping, or a separate rules layer)?
5. **Generator registry:** static registration at build time, or the ability to load the graph config / new levels without a release (OTA via Expo)?
6. **Mastery criterion:** the concrete accuracy/speed thresholds — config or hardcoded? Who calibrates them?
7. **Theme/presentation layer:** how to separate the age-neutral core from the skin so a "kids" theme can be added later without refactoring?
8. **Spaced repetition:** a simple in-house algorithm or an off-the-shelf model (SM-2, etc.)? Where to store the repetition queue?
9. **i18n model:** confirm UI / content / explanation language as three separate fields even if MVP binds them; decide the catalog tooling and the exact decimal-separator parsing strategy in the answer checker.

---

## 14. Indicative phases

1. **Domain skeleton:** the skill graph as data + the generator contract + one generator end-to-end (e.g., fruit equations) with step-level checking.
2. **Diagnostic loop:** `failedStep` → prerequisite routing; mastery gates.
3. **Content:** the remaining MVP generators; spaced repetition.
4. **Shell:** graph progress visualization, streak/XP, `ClipboardPromptProvider`, Ukrainian UI with i18n scaffolding.
5. **Polish:** offline resilience, local persistence, onboarding tuned for 16+, locale-aware number input.
6. **Fast-follow (beyond MVP):** the cosmetic companion, `ApiExplanationProvider` + proxy, then event-stream-based social.
