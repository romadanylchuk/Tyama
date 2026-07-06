/**
 * routing-types.ts — Pure routing decision types for stage-04 diagnostic loop.
 *
 * All types in this module are pure data — no DB, no clock, no I/O, no
 * localized strings. The `route()` function (phase 4) is the only consumer
 * that populates `RoutingDecision`; these types are defined in phase 1 so
 * phase 2 and 3 can type-check against the final routing surface.
 *
 * READ-NOT-WRITE BOUNDARY:
 *   `MasteryLookup` is a read-only function type — it returns a scalar but
 *   exposes NO write method. The structural boundary is enforced by the type:
 *   `route()` receives only a `MasteryLookup` and therefore structurally
 *   CANNOT mutate mastery state. This is intentional and non-negotiable.
 *
 * ANTI-SHAME INVARIANT:
 *   `AntiLoopMemory` is session-scoped and in-memory ONLY — never persisted.
 *   Persisting "you keep failing here" is a shame surface; the most vulnerable
 *   learner must not carry a stored loop history across sessions.
 *
 * LANGUAGE-NEUTRAL:
 *   No type here carries a localized string. `ExplanationContext` carries
 *   `unknown`-typed fields for problem/steps/etc. — the exact shapes are
 *   owned by the stage-05/06 `ExplanationProvider` and will be pinned there
 *   without requiring a contract rewrite here.
 *
 * TWO VERSION AXES UNTOUCHED:
 *   This module touches neither PRAGMA user_version nor graphVersion.
 */

import type { NodeId, RepresentationLevel } from '@/core/types';

// ---------------------------------------------------------------------------
// MasterySnapshot — the read-only mastery view for routing
// ---------------------------------------------------------------------------

/**
 * The mastery snapshot returned by `MasteryLookup` for a single node.
 *
 * `aggregate` is the node's current aggregate mastery scalar (0..1),
 * computed as `max(slice scalars)` by the mastery engine.
 *
 * `untouched` is true when the node has no attempt history at all (no window
 * data for any representation level). The routing algorithm treats untouched
 * nodes as the weakest possible candidate — more aggressively descended into
 * than a node with in-progress data.
 */
export interface MasterySnapshot {
  /** Aggregate mastery scalar (0..1); 0 when no attempts have been recorded. */
  readonly aggregate: number;
  /** True when no window data exists for any representation level. */
  readonly untouched: boolean;
}

// ---------------------------------------------------------------------------
// MasteryLookup — the read-only mastery reader passed to route()
// ---------------------------------------------------------------------------

/**
 * A read-only function that returns the current mastery snapshot for a node.
 *
 * READ-NOT-WRITE BY TYPE:
 *   `MasteryLookup` is a plain function — it has no setter method.
 *   `route()` receives only this type; it structurally cannot mutate mastery.
 *   The session layer builds the lookup from `getProgress` + `parseMasteryMetrics`
 *   OUTSIDE `route()` and passes a plain reader in.
 *
 * @param nodeId - The node to look up.
 * @returns      - The mastery snapshot, or `{ aggregate: 0, untouched: true }`
 *                 when the node has no progress row.
 */
export type MasteryLookup = (nodeId: NodeId) => MasterySnapshot;

// ---------------------------------------------------------------------------
// RoutingReason — the closed discriminated union of routing outcomes
// ---------------------------------------------------------------------------

/**
 * The closed union of reasons a `RoutingDecision` was reached.
 *
 * These are structural routing signals — not UI copy. The stage-06 presentation
 * layer maps them to localized framing copy; this stage emits the signal only.
 *
 * - `'symptom-is-target'` — all prerequisites of the entry node are mastered;
 *   the entry node itself is the target (local gap, not a missing foundation).
 *   (Named 'symptom-is-target' to distinguish from 'symptom-local-gap' used in
 *   the plan/interview-brief; the feature-plan's 'symptom-local-gap' is realized
 *   as 'symptom-is-target' here — same semantics, clearer name.)
 *
 * - `'deepest-unmastered'` — the traversal descended into prerequisites and
 *   found the deepest unmastered prerequisite (the causal root).
 *
 * - `'probe'` — a genuine tie (≥2 candidates with equal or zero aggregate)
 *   — a single gentle probe task is chosen rather than an arbitrary descent.
 *
 * - `'descend-further'` — anti-loop fired: the learner was just routed here
 *   and broke again; there are deeper unmastered prerequisites to descend into.
 *
 * - `'escalate'` — anti-loop fired: the learner was just routed here and broke
 *   again; there are no deeper prerequisites, so the decision escalates to the
 *   ExplanationProvider for a different modality/explanation.
 */
export type RoutingReason =
  | 'symptom-is-target'
  | 'deepest-unmastered'
  | 'probe'
  | 'descend-further'
  | 'escalate';

// ---------------------------------------------------------------------------
// AntiLoopDirective — carried in RoutingDecision when anti-loop fires
// ---------------------------------------------------------------------------

/**
 * Carried in `RoutingDecision.antiLoop` when the anti-loop logic fires.
 *
 * The session layer uses this to:
 *   - Record the new target into `AntiLoopMemory` (after acting on the decision).
 *   - Optionally hand off to the `ExplanationProvider` when `escalateToExplanation`
 *     is true (stage-06 concern; this stage emits the signal only).
 */
export interface AntiLoopDirective {
  /**
   * The node the learner was just routed to before breaking again.
   * Helps the session layer distinguish "we already tried node X" from a
   * fresh descent.
   */
  readonly priorTarget: NodeId;
  /**
   * True when the routing decision is an escalation to the ExplanationProvider
   * (reason = 'escalate'). The session layer should invoke `explain()` with
   * `explanationContext`.
   * False when the routing decision is a further descent (reason = 'descend-further').
   */
  readonly escalateToExplanation: boolean;
  /**
   * Present only when `escalateToExplanation = true`.
   * The context to pass to the `ExplanationProvider.explain()` call.
   * Carries the additive `priorApproach` hint documenting what was already tried.
   */
  readonly explanationContext?: ExplanationContext;
}

// ---------------------------------------------------------------------------
// RoutingDecision — the pure output of route()
// ---------------------------------------------------------------------------

/**
 * The pure output of `route(entry, graph, masteryLookup, antiLoopMemory)`.
 *
 * `target` is the node the learner should be sent to NOW.
 * `descentPath` is the full traversal path from entry → target (inclusive),
 * so stage 06 can present a staged-descent frame ("let's firm up X before Y").
 *
 * `route()` NEVER persists anything — it only returns this decision.
 * The session layer acts on the decision and updates `AntiLoopMemory`.
 */
export interface RoutingDecision {
  /**
   * The node to send the learner to for their next task.
   * May equal `entry` (when all prerequisites are mastered or anti-loop escalates).
   */
  readonly target: NodeId;
  /**
   * The traversal path from `entry` (inclusive) to `target` (inclusive).
   * `descentPath[0] === entry`, `descentPath[descentPath.length - 1] === target`.
   * When `target === entry`, `descentPath = [entry]`.
   * Stage 06 uses this to frame the staged-descent narrative.
   */
  readonly descentPath: readonly NodeId[];
  /** The structural reason this decision was reached. */
  readonly reason: RoutingReason;
  /**
   * Present only when the anti-loop logic fired (reason is 'descend-further'
   * or 'escalate'). Contains prior-target metadata and optional escalation context.
   */
  readonly antiLoop?: AntiLoopDirective;
}

// ---------------------------------------------------------------------------
// AntiLoopMemory — session-scoped, in-memory, NOT persisted
// ---------------------------------------------------------------------------

/**
 * Session-scoped short-horizon memory tracking recently-routed-to nodes.
 *
 * ANTI-SHAME: this object is NEVER persisted. It lives only for the duration
 * of a session and is discarded at session end. Persisting loop history would
 * be a shame surface — the most vulnerable learner must not carry it across sessions.
 *
 * USAGE PATTERN:
 *   1. The session layer creates a fresh `AntiLoopMemory` at session start.
 *   2. `route()` reads it via `recentlyRoutedTo(nodeId)` — pure read.
 *   3. The session layer calls `record(target)` AFTER acting on the `RoutingDecision`
 *      (route() itself never writes to AntiLoopMemory — it remains a pure function).
 *
 * `priorApproach` tracks the `RepresentationLevel` most recently used at the
 * node, so the escalation context can report what was already tried.
 */
export interface AntiLoopEntry {
  /** Number of times the learner has been routed to this node in the current session. */
  readonly visits: number;
  /** The representation level most recently used when routing to this node. */
  readonly lastApproach: RepresentationLevel;
}

/**
 * A type alias for the AntiLoopMemory Map shape.
 * `Map<NodeId, AntiLoopEntry>` — keyed by node id, valued by visit record.
 *
 * The session layer holds this MUTABLE shape: it creates a fresh instance per
 * session via `createAntiLoopMemory()` and records new targets via `.set(...)`
 * AFTER acting on a `RoutingDecision`.
 */
export type AntiLoopMemory = Map<NodeId, AntiLoopEntry>;

/**
 * The READ-ONLY view of `AntiLoopMemory` accepted by `route()`.
 *
 * `route()` only ever reads the memory (via `.get(...)`); it never writes.
 * Typing the `route()` parameter as `ReadonlyAntiLoopMemory` enforces the
 * read-only contract at COMPILE TIME — a `.set(...)` inside `route()` is a
 * type error, not merely a convention. A mutable `AntiLoopMemory` is assignable
 * to this type, so all existing callers continue to work unchanged.
 */
export type ReadonlyAntiLoopMemory = ReadonlyMap<NodeId, AntiLoopEntry>;

/**
 * createAntiLoopMemory(): AntiLoopMemory
 *
 * Factory for a fresh (empty) `AntiLoopMemory` at session start.
 * Sessions MUST start with a fresh instance — do not reuse across sessions.
 */
export function createAntiLoopMemory(): AntiLoopMemory {
  return new Map<NodeId, AntiLoopEntry>();
}

// ---------------------------------------------------------------------------
// ExplanationContext — thin additive type for escalation hand-off
// ---------------------------------------------------------------------------

/**
 * The context passed to `ExplanationProvider.explain()` on anti-loop escalation.
 *
 * INTENTIONALLY LOOSE-TYPED:
 *   Most fields are `unknown` so stage 06 can pin exact types without requiring
 *   a contract rewrite here (DL-5 in feature-plan.md). The `ExplanationProvider`
 *   interface itself is NOT introduced here — it belongs to stage 06.
 *
 * ADDITIVE `priorApproach`:
 *   The one concrete addition this stage makes. Carries what was already tried
 *   so the explanation deliberately differs from the prior approach.
 *
 * LANGUAGE-NEUTRAL:
 *   No field here is a localized string. All text resolution happens in the
 *   stage-06 presentation layer.
 */
export interface ExplanationContext {
  /** The problem that was presented to the learner. Shape pinned by stage 06. */
  readonly problem: unknown;
  /** The learner's answer to the problem. Shape pinned by stage 06. */
  readonly studentAnswer: unknown;
  /** The correct answer. Shape pinned by stage 06. */
  readonly correctAnswer: unknown;
  /** The solution method used. Shape pinned by stage 06. */
  readonly method: unknown;
  /** The ordered solution steps. Shape pinned by stage 06. */
  readonly steps: unknown;
  /** The first-break step (from stage-03 CheckResult). Shape pinned by stage 06. */
  readonly failedStep: unknown;
  /** The skill-graph node this problem exercised. */
  readonly skillNode: NodeId;
  /** The BCP-47 language tag for the explanation to be rendered in. */
  readonly language: string;
  /**
   * ADDITIVE optional hint for the anti-loop escalation hand-off.
   *
   * Carries what was already tried before escalation, so the
   * `ExplanationProvider` can deliberately present a different approach.
   * Absent when `ExplanationContext` is used outside the anti-loop path.
   */
  readonly priorApproach?: {
    /** The node the learner was routed to immediately before escalation. */
    readonly target: NodeId;
    /** The routing reason that led to the prior approach. */
    readonly reason: RoutingReason;
  };
}
