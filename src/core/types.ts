/**
 * types.ts — Core contract types for the Tyama domain core (Stage 02).
 *
 * These types are the extensibility spine. Stages 03 and 05 bind directly to
 * them. Do NOT relitigate locked decisions (D1–D5 in interview-brief.md).
 *
 * LANGUAGE-NEUTRAL INVARIANT:
 *   No field in any type here carries a localized string. All human-readable
 *   text is a `LocalizedRef` — a structured { key, vars } reference resolved
 *   later by the presentation/explanation layer. The domain core emits
 *   structured data only, never strings intended for display.
 *
 * TWO VERSION AXES:
 *   - DB_SCHEMA_VERSION (src/db/types.ts) — SQLite table shape, PRAGMA user_version.
 *   - graphVersion (GraphDefinition.graphVersion) — skill-graph content, settings key.
 *   These are NEVER conflated.
 *
 * ANTI-SHAME INVARIANT:
 *   Availability vocabulary is `'available' | 'coming-soon'` only. No
 *   `'locked'`, `'disabled'`, `'error'`, or `'unavailable'` anywhere.
 */

import type { NodeId } from '@/db/types';
import type { NormalizationPolicy } from '@/core/canonical';
import type { MasteryConfigOverride } from '@/core/mastery/mastery-config';

// Re-export NodeId so consumers of this module need only one import surface.
export type { NodeId };

// ---------------------------------------------------------------------------
// RepresentationLevel — the CPA (Concrete → Pictorial → Abstract) axis
// ---------------------------------------------------------------------------

/**
 * Closed union of representation levels (CPA model).
 * Every skill atom exists at all three levels; the task model carries this
 * as a first-class parameter so the UI layer can render accordingly.
 *
 * Stage 02 ships fruit-equations at `pictorial` (the fruits-instead-of-numbers
 * bridge) through to `abstract`.
 */
export type RepresentationLevel = 'concrete' | 'pictorial' | 'abstract';

// ---------------------------------------------------------------------------
// InputMode — the answer-entry modality
// ---------------------------------------------------------------------------

/**
 * Closed union of answer-entry input modalities.
 *
 * Closed so the stage-03 widget/checker registry gets exhaustiveness checking
 * via TypeScript's never-guard pattern.
 *
 * MVP members and their semantics:
 *   'manipulative' — physical/virtual manipulatives (concrete level; drag/drop).
 *   'choice'       — multiple-choice selection (one correct option from N).
 *   'number'       — single numeric keypad entry (abstract; free input).
 *   'tokens'       — discrete token selection (pictorial; pick fruit tiles).
 *   'multi-slot'   — multi-field entry for ordered multi-value steps.
 *
 * Fruit-equations uses `'tokens'` (pictorial) and `'number'` (abstract).
 */
export type InputMode =
  | 'manipulative'
  | 'choice'
  | 'number'
  | 'tokens'
  | 'multi-slot';

// ---------------------------------------------------------------------------
// LocalizedRef / PromptSpec — language-neutral text reference
// ---------------------------------------------------------------------------

/**
 * A language-neutral reference to a localized string resource.
 *
 * The domain core NEVER produces display strings. Instead, it emits
 * `LocalizedRef` values — structured keys that the presentation/explanation
 * layer resolves against the appropriate i18n bundle.
 *
 * Example: `{ key: 'fruit_eq.prompt', vars: { apple: 3, banana: 5 } }`
 * renders in the UI as the localized template with the given substitutions.
 *
 * NEVER store a localized string in a `LocalizedRef` field.
 */
export interface LocalizedRef {
  /** i18n resource key. Must be a stable, version-controlled identifier. */
  readonly key: string;
  /**
   * Template variable substitutions. Values are scalars only — never nested
   * structures or localized strings. The presentation layer formats them.
   */
  readonly vars?: Record<string, string | number>;
}

/**
 * Alias for LocalizedRef used in prompt positions.
 * The two names are interchangeable; `PromptSpec` is used where the intent
 * is "this is the prompt text reference" for clarity at call sites.
 */
export type PromptSpec = LocalizedRef;

// ---------------------------------------------------------------------------
// DifficultyParams — the hybrid envelope (D2)
// ---------------------------------------------------------------------------

/**
 * The hybrid difficulty envelope passed to every generator.
 *
 * Universal envelope fields (inspector of ALL generators):
 *   - `representationLevel`: the CPA level for this task.
 *   - `elicitFromMastery`: a 0..1 scalar derived from the learner's mastery
 *     coordinate (stage 04). Controls how much scaffolding to fade at the
 *     envelope level — e.g. 0.0 = full scaffolding, 1.0 = no scaffolding.
 *     Stage 02 only defines the shape; stage 04 computes the value.
 *
 * Opaque per-generator payload:
 *   - `params`: the numeric-range axis for the specific generator.
 *     Typed as `unknown` (NOT `any`) — the deterministic core NEVER inspects
 *     it; only the owning generator narrows it via a type predicate or cast.
 *     For fruit-equations: `{ unknowns: number; range: number; negatives: boolean }`.
 *
 * `elicitFromMastery` appears at the envelope level AND at the step level,
 * with distinct meanings. See `Step.elicitFromMastery` for the step-level
 * semantics.
 */
export interface DifficultyParams {
  /** CPA representation level for this task. */
  readonly representationLevel: RepresentationLevel;
  /**
   * Scaffold-fade cut-point (0..1, inclusive).
   * Derived from the learner's mastery coordinate by stage 04.
   * 0.0 = maximum scaffolding (beginner); 1.0 = no scaffolding (expert).
   * Stage 02 defines the shape only; stage 04 supplies the runtime value.
   */
  readonly elicitFromMastery: number;
  /**
   * Opaque per-generator payload — NOT `any`.
   * The core never inspects this field; the owning generator narrows it.
   */
  readonly params: unknown;
}

// ---------------------------------------------------------------------------
// SeededRng — deterministic pseudo-random number generator contract
// ---------------------------------------------------------------------------

/**
 * Contract for the seeded deterministic PRNG used by all generators.
 *
 * Forward-declared here (Phase 2) so `Generator` and `Step` can reference it.
 * Implemented in `src/core/rng/seeded-rng.ts` (Phase 3) via mulberry32 (DL-4).
 *
 * Generators MUST draw all randomness from this interface — never from
 * `Math.random()` directly (enforced by the `no-adhoc-number-format` ESLint
 * rule in `src/core/**`).
 *
 * Property: same seed + same band → identical `GeneratedTask` (reproducibility).
 */
export interface SeededRng {
  /**
   * Returns the next pseudo-random float in [0, 1).
   * Advances the internal state.
   */
  next(): number;
  /**
   * Returns the next pseudo-random integer in [min, max] (inclusive).
   * Derived from `next()`. Generators prefer this over raw `next()` to avoid
   * ad-hoc float→integer conversions.
   */
  nextInt(min: number, max: number): number;
}

// ---------------------------------------------------------------------------
// ProblemSpec — the language-neutral problem statement
// ---------------------------------------------------------------------------

/**
 * The language-neutral problem statement carried by a `GeneratedTask`.
 *
 * `prompt` is always a `PromptSpec` (never a raw string).
 * `representation` records the CPA level at which the problem is presented
 * so the UI layer can render the appropriate concrete/pictorial/abstract form.
 */
export interface ProblemSpec {
  /** Language-neutral reference to the problem's display text. */
  readonly prompt: PromptSpec;
  /** CPA level of this problem's presentation. */
  readonly representation: RepresentationLevel;
}

// ---------------------------------------------------------------------------
// Step — one solution step with its checking contract
// ---------------------------------------------------------------------------

/**
 * A single ordered solution step within a `GeneratedTask`.
 *
 * `steps[]` is the input to:
 *   - Stage 03's step-level checker (reads `expected`, `normalizationPolicy`, `inputMode`).
 *   - Stage 04's diagnostic routing (reads `skillNode`, `elicitFromMastery`).
 *
 * ORDERING SEMANTICS:
 *   Steps are ordered — the checker processes them in order and reports the
 *   first-failing step as `failedStep` for diagnostic routing.
 *
 * LANGUAGE-NEUTRAL:
 *   `prompt` is a `LocalizedRef`, never a display string.
 */
export interface Step {
  /** Language-neutral reference to this step's question/prompt text. */
  readonly prompt: LocalizedRef;
  /**
   * Optional secondary language-neutral reference (e.g. a sub-problem or hint).
   * Present when the step needs to display additional context alongside its prompt.
   */
  readonly problem?: LocalizedRef;
  /**
   * Optional SHORT label naming the quantity this step solves for (e.g. "🍎"),
   * used by the presentation layer to recap an already-answered step while a
   * LATER step is being answered — rendered as `{recap} = {learner's answer}`
   * (e.g. "🍎 = 2" shown while solving 🍌). Purely presentational; the checker
   * never reads it. Absent for single-step tasks (no recap to show).
   */
  readonly recap?: LocalizedRef;
  /** Which answer-entry modality the UI should render for this step. */
  readonly inputMode: InputMode;
  /**
   * The canonical lexical string of the expected answer, produced by
   * `canonicalize()` from `src/core/canonical`. This is the load-bearing field
   * of the 02↔03 spine — the generator stamps it here; the checker compares
   * the normalized learner input against it with exact string equality.
   */
  readonly expected: string;
  /**
   * The graph node this step exercises. Used by stage-04 diagnostic routing
   * to identify which skill to reroute to on a first-break step.
   */
  readonly skillNode: NodeId;
  /**
   * Step-level scaffold-fade marker (0..1, inclusive).
   *
   * DISTINCT from `DifficultyParams.elicitFromMastery`:
   *   - Envelope `elicitFromMastery`: gates overall scaffolding fade for the task.
   *   - Step `elicitFromMastery`: marks whether THIS step is elicited (the learner
   *     must produce it) vs. shown (the system fills it in as scaffolding) at the
   *     current mastery level. 0.0 = always shown (maximum scaffolding); 1.0 =
   *     always elicited (no scaffolding). Stage 04 computes the threshold from
   *     the mastery coordinate; stages 02–03 only carry the shape.
   */
  readonly elicitFromMastery: number;
  /**
   * The normalization policy the generator applied when producing `expected`.
   * Carried per-step so the stage-03 checker reads the identical policy off the
   * same `Step` object — divergence is structurally impossible (DL-3).
   */
  readonly normalizationPolicy: NormalizationPolicy;
}

// ---------------------------------------------------------------------------
// GeneratedTask — the full output of a generator
// ---------------------------------------------------------------------------

/**
 * The complete output of a `Generator.generate()` call.
 *
 * `solution` is the answer to the task as a whole (a single canonical string —
 * guaranteed correct by backward construction). `steps[]` decompose it into
 * ordered sub-answers for step-level checking.
 *
 * All text fields are `LocalizedRef` / `ProblemSpec` — never raw strings.
 */
export interface GeneratedTask {
  /**
   * The language-neutral problem statement (prompt + representation level).
   * The UI layer renders it according to `representation` (concrete/pictorial/abstract).
   *
   * STAGE-03 INTEGRATION NOTE — `problem` is a `ProblemSpec` WRAPPER, not a bare
   * `LocalizedRef`. The localized text reference lives at `task.problem.prompt`
   * (i.e. `task.problem.prompt.key` / `task.problem.prompt.vars`), NOT at
   * `task.problem.key`. This deviates from the D2 sketch (`problem: LocalizedRef`)
   * to co-locate the problem's CPA `representation` with its prompt.
   *
   * `representation` is therefore carried in TWO places and they are always equal:
   *   - `task.problem.representation` (the problem statement's CPA level), and
   *   - `task.representation` (the task-level CPA level, below).
   * The duplication is intentional and kept in sync by the generator; consumers
   * may read either. Prefer the top-level `task.representation` for task routing.
   */
  readonly problem: ProblemSpec;
  /**
   * The single canonical solution string for the whole task.
   * Guaranteed correct by construction (backward generation from a pre-chosen answer).
   */
  readonly solution: string;
  /**
   * Ordered solution steps for step-level checking and diagnostic routing.
   * Multi-value answers are split into one step each (D1 multi-value rule).
   */
  readonly steps: Step[];
  /** CPA level at which this task was generated. */
  readonly representation: RepresentationLevel;
  /** The primary skill-graph node this task exercises. */
  readonly skillNode: NodeId;
}

// ---------------------------------------------------------------------------
// Band — one difficulty tier (config-as-data)
// ---------------------------------------------------------------------------

/**
 * A single difficulty band in a node's `difficultyHooks` ladder.
 *
 * Bands are config-as-data — shipped as working defaults inside the graph
 * asset (`GraphNode.difficultyHooks.bands`). `pedagogy-pass` calibrates the
 * values later as a pure data change with no code change.
 *
 * The `selectBand(coordinate, bands)` pure function (Phase 3) picks the highest
 * band whose `minCoordinate <= coordinate` (half-open interval ladder).
 * Bands MUST be ordered ascending by `minCoordinate`; `validateGraph` enforces this.
 */
export interface Band {
  /**
   * The inclusive lower bound of this band's mastery-coordinate interval.
   * Bands are selected half-open: `[minCoordinate, nextMinCoordinate)`.
   * The lowest band's `minCoordinate` is the floor (covers all coordinates below it).
   */
  readonly minCoordinate: number;
  /** CPA level for tasks generated within this band. */
  readonly representationLevel: RepresentationLevel;
  /**
   * Opaque per-generator params for this band.
   * Typed as `unknown` — only the owning generator narrows it.
   * For fruit-equations: `{ unknowns: number; range: number; negatives: boolean }`.
   */
  readonly params: unknown;
}

// ---------------------------------------------------------------------------
// DifficultyHooks — per-node config-as-data container
// ---------------------------------------------------------------------------

/**
 * Holds the ordered difficulty band ladder for a graph node, plus an optional
 * per-node mastery configuration override.
 * Attached to each `GraphNode` as `difficultyHooks`.
 *
 * `bands` must be non-empty and ordered ascending by `minCoordinate`.
 * `validateGraph` asserts both invariants.
 */
export interface DifficultyHooks {
  /**
   * Ordered (ascending by `minCoordinate`) difficulty bands for this node.
   * Must be non-empty. `validateGraph` rejects empty band ladders.
   */
  readonly bands: Band[];
  /**
   * Optional per-node mastery configuration override (stage 04).
   *
   * When absent, `resolveMasteryConfig(node)` returns `DEFAULT_MASTERY_CONFIG`
   * (the global shipped default). When present, any field in this object
   * overrides the corresponding default — fields not specified inherit the
   * global default. Calibrated by `pedagogy-pass` as data; never hardcode
   * pedagogy values into engine or routing logic.
   *
   * ADDITIVE OPTIONAL FIELD — does not affect any existing consumer:
   *   - `validateGraph` reads `.bands` only → unchanged.
   *   - `selectBand` callers read `.bands` only → unchanged.
   *   - `GRAPH_FIXTURE` has no `mastery` key → compiles as-is (uses defaults).
   */
  readonly mastery?: MasteryConfigOverride;
  /**
   * Optional per-node spaced-repetition configuration override (stage 05).
   *
   * When absent, `resolveSpacedRepetitionConfig()` returns `SR_POLICY`
   * (the global shipped default). When present, any field in this object
   * overrides the corresponding default — fields not specified inherit the
   * global default. Calibrated by `pedagogy-pass` as data; never hardcode
   * pedagogy values into engine or routing logic.
   *
   * ADDITIVE OPTIONAL FIELD — does not affect any existing consumer:
   *   - `validateGraph` reads `.bands` only → unchanged.
   *   - `GRAPH_FIXTURE` has no `spacedRepetition` key → compiles as-is.
   */
  readonly spacedRepetition?: {
    readonly intervalsMs?: readonly number[];
  };
}

// ---------------------------------------------------------------------------
// GraphNode — one skill atom in the DAG
// ---------------------------------------------------------------------------

/**
 * A single node (skill atom) in the skill graph DAG.
 *
 * Edges live on the consumer node as `prerequisites` — prerequisite dependencies
 * ONLY. "Where to go next" is a UI/gamification concern, never a graph edge.
 *
 * `id` is the stable slug identifier (NodeId = string). It is the primary key
 * for progress rows and the registry key for the generator lookup.
 */
export interface GraphNode {
  /** Stable slug identifier for this skill atom (e.g. `'fruit-equations'`). */
  readonly id: NodeId;
  /**
   * Prerequisite node ids. This node may only be presented after all listed
   * prerequisites reach mastery. Empty = no prerequisites (root node).
   */
  readonly prerequisites: NodeId[];
  /**
   * Which CPA levels this node supports.
   * Used by the UI to decide which representation to attempt.
   */
  readonly representationLevels: RepresentationLevel[];
  /**
   * Ordered difficulty band ladder for this node.
   * Config-as-data; must be non-empty; bands must ascend by `minCoordinate`.
   */
  readonly difficultyHooks: DifficultyHooks;
}

// ---------------------------------------------------------------------------
// GraphDefinition — the full skill graph asset
// ---------------------------------------------------------------------------

/**
 * The complete skill graph, loaded via `loadGraph(): GraphDefinition`.
 *
 * `graphVersion` is the graph-content axis version (semver string).
 * It is tracked separately from `DB_SCHEMA_VERSION` (NEVER conflate the two axes).
 *
 * `fixture: true` marks a smoke-test fixture (not the MVP catalog).
 * The `pedagogy-pass` delivers the real atom catalog as a pure data swap via
 * `loadGraph()` — no code change needed.
 */
export interface GraphDefinition {
  /**
   * In-asset semver version for the graph-content migration axis.
   * Tracked in the `appliedGraphVersion` settings key (NOT `PRAGMA user_version`).
   * Example: `'0.1.0'` (stage-02 smoke-test fixture).
   */
  readonly graphVersion: string;
  /**
   * Present and `true` on smoke-test fixtures only.
   * Absent (or `false`) on real production graph assets.
   * Consumers may use this to skip fixture data from analytics, etc.
   */
  readonly fixture?: boolean;
  /** All skill-graph nodes in this asset. */
  readonly nodes: GraphNode[];
}

// ---------------------------------------------------------------------------
// Generator — the extensibility contract
// ---------------------------------------------------------------------------

/**
 * The generator contract — the extensibility spine of the Tyama domain core.
 *
 * "A new level = a new module implementing this contract + a graph node."
 *
 * Generators:
 *   - Are STATIC (registered at build time in `GENERATORS`; never OTA-injected).
 *   - Build tasks BACKWARD from a pre-chosen answer (guarantees correctness).
 *   - Draw ALL randomness from the passed `rng` (never `Math.random()`).
 *   - Emit structured data only — never localized strings.
 *
 * The `generate()` method is the public entry point.
 * The `instantiate()` method performs the mechanical band → concrete-numbers
 * step; it is called inside `generate()` and exposed for testing.
 */
export interface Generator {
  /** The graph node this generator handles. Must match a `GraphNode.id`. */
  readonly skillNode: NodeId;
  /**
   * Generate a complete task for the given difficulty and RNG state.
   *
   * @param difficulty - The hybrid envelope (CPA level, scaffold fade, opaque params).
   * @param rng        - Seeded deterministic PRNG; all randomness must flow through this.
   * @returns          - A fully specified `GeneratedTask` with canonical `steps[]`.
   *
   * CONTRACT: same `difficulty` + same `rng` seed → byte-identical `GeneratedTask`.
   */
  generate(difficulty: DifficultyParams, rng: SeededRng): GeneratedTask;
  /**
   * Instantiate a specific band into concrete task parameters.
   *
   * Called inside `generate()` after `selectBand()` picks the appropriate
   * difficulty tier. Exposed for testing (allows unit-testing band instantiation
   * independently of the full generate pipeline).
   *
   * @param band - The selected difficulty band (with opaque `params` the generator narrows).
   * @param rng  - Seeded PRNG; same band + seed → same concrete parameters.
   * @returns    - Opaque concrete parameters (generator-specific shape).
   */
  instantiate(band: Band, rng: SeededRng): unknown;
}
