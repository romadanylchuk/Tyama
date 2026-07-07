/**
 * build-widget-config.ts — Pure GeneratedTask + Step → WidgetConfig synthesis
 * (Stage 06, Phase 6).
 *
 * WHY THIS MODULE EXISTS:
 *   The stage-02/05 generators deliberately emit ONLY the language-neutral
 *   `Step` shape (prompt ref, inputMode, canonical `expected`, normalization
 *   policy) — never choice distractors, a token palette, or a manipulative
 *   model. Every generator's own file header says so explicitly (e.g.
 *   number-bonds.ts: "choice-option construction (distractors) is a
 *   presentation/widget-config concern (stage 06)"). This module is that
 *   concern: it is the SOLE site that turns a `Step`'s bare `expected`
 *   canonical string into a concrete, mode-specific `WidgetConfig`.
 *
 * PURE, DETERMINISTIC, TESTABLE WITHOUT RN:
 *   No randomness (deliberately NOT `Math.random()` — distractors are derived
 *   by fixed offset from the canonical answer and sorted ascending), no I/O,
 *   no clock. Same `(task, step, contentLanguage, masteryConfig)` in →
 *   byte-identical `WidgetConfig` out.
 *
 * NUMERIC LABELS AS LOCALE-INVARIANT LocalizedRef KEYS (implementation-shape
 * decision):
 *   A digit/number label (a choice option's numeral, a token-palette digit)
 *   carries no natural-language translation — "7" reads the same in every
 *   shipped locale. Rather than inventing new i18n catalog keys for every
 *   possible numeral (an unbounded key space), this module uses the numeral
 *   STRING ITSELF as `LocalizedRef.key`. i18next's default behaviour when a
 *   key has no catalog entry is to return the key verbatim — which is exactly
 *   the correct locale-invariant rendering for a digit. This mirrors the
 *   existing stage-03 widget placeholder pattern (`ChoiceWidget`/`TokensWidget`
 *   already render `option.label.key`/`tile.label.key` directly as text).
 *
 * finalOnly DERIVATION (`Step.elicitFromMastery` → NumberWidgetConfig.finalOnly):
 *   `mastery-config.ts` documents `abstractFade` as exactly the cut-point at
 *   which "abstract-level tasks transition from stepped to finalOnly
 *   (speed-drill) presentation" — this module is that documented consumer.
 *   `finalOnly = task.representation === 'abstract' && step.elicitFromMastery
 *   >= masteryConfig.abstractFade`. Concrete/pictorial tasks are never
 *   finalOnly (scaffolding fade only applies once the learner has reached the
 *   abstract representation).
 *
 * TOKEN-ASSEMBLY / DECIMAL-GLYPH INTEROP (verified against @/parsing):
 *   `TokensWidget` emits `rawInput` as a SPACE-joined string of tapped token
 *   ids. `parseLocaleNumber` strips every `profile.groupSeps` occurrence
 *   (which includes the space variants for 'uk') BEFORE mapping the decimal
 *   separator — so a space-joined digit sequence (e.g. '3 , 5' under 'uk')
 *   parses identically to a keypad-typed '3,5'. The minus-sign token uses the
 *   ASCII hyphen '-' directly (not the locale's Unicode minus glyph): the
 *   parser's final regex already accepts a leading ASCII '-' before any
 *   sign-glyph substitution is needed, so this requires no special handling.
 *
 * MANIPULATIVE MODEL PAYLOAD:
 *   `step.prompt.vars` already carries the concrete numeric values the
 *   generator drew (e.g. number-bonds' `knownA`/`knownB`, fraction-
 *   simplification's `presentedNum`/`presentedDen`) — this module forwards
 *   them verbatim as the `ManipulativeModel.payload` (an opaque per-kind
 *   payload the widget narrows). `kind` is derived from `step.skillNode`:
 *   the only two generators using 'manipulative' today are 'number-bonds'
 *   ('number-bond' kind) and 'fraction-simplification' ('fraction-bar' kind).
 *
 * MULTI-SLOT SYNTHESIS:
 *   `fraction-simplification`'s pictorial/abstract bands mark BOTH of their
 *   steps `inputMode: 'multi-slot'` — per `WidgetConfig`'s own doc, a
 *   multi-slot widget renders ONCE for the whole task and emits N outputs
 *   (one per slot), not once per step. This module therefore builds ONE
 *   `MultiSlotWidgetConfig` covering every 'multi-slot' step in `task.steps`
 *   (not just the single `step` argument) when `step.inputMode ===
 *   'multi-slot'` — the caller (the task-screen shell) mounts this ONE config
 *   for the whole task rather than iterating per step.
 */

import type { GeneratedTask, Step } from '@/core/types';
import {
  keypadDecimalGlyph,
  type ChoiceOption,
  type CompareOption,
  type ManipulativeModel,
  type NumberWidgetConfig,
  type TokenTile,
  type WidgetConfig,
} from '@/widgets';
import { resolveLocaleProfile, type LocaleNumericProfile } from '@/parsing';
import { canonicalize } from '@/core/canonical';
import { DEFAULT_MASTERY_CONFIG, type MasteryConfig } from '@/core/mastery/mastery-config';

// ---------------------------------------------------------------------------
// finalOnly derivation
// ---------------------------------------------------------------------------

function deriveFinalOnly(
  task: GeneratedTask,
  step: Step,
  masteryConfig: Pick<MasteryConfig, 'abstractFade'>
): boolean {
  return task.representation === 'abstract' && step.elicitFromMastery >= masteryConfig.abstractFade;
}

// ---------------------------------------------------------------------------
// choice — synthesize distractors around the canonical answer
// ---------------------------------------------------------------------------

/**
 * Deterministically synthesize up to 3 distinct distractors around the
 * canonical numeric answer, then sort the full option set (answer +
 * distractors) ascending. NEVER uses randomness — same `step.expected` always
 * produces the same option set.
 */
function buildChoiceOptions(step: Step): ChoiceOption[] {
  const correctValue = Number(step.expected);
  const OFFSETS = [-2, -1, 1, 2] as const;

  const values = new Set<number>([correctValue]);
  for (const offset of OFFSETS) {
    if (values.size >= 4) break; // correct answer + 3 distractors
    values.add(correctValue + offset);
  }

  return [...values]
    .sort((a, b) => a - b)
    .map((value) => ({
      id: String(value),
      label: { key: String(value) },
    }));
}

// ---------------------------------------------------------------------------
// tokens — digit + sign + decimal-glyph palette
// ---------------------------------------------------------------------------

const DIGIT_TOKENS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

function buildTokenPalette(step: Step, contentLanguage: string): TokenTile[] {
  const profile = resolveLocaleProfile(contentLanguage);
  const tiles: TokenTile[] = DIGIT_TOKENS.map((digit) => ({
    id: digit,
    label: { key: digit },
  }));

  if (step.normalizationPolicy.numberClass === 'decimal') {
    tiles.push({ id: profile.decimalSep, label: { key: profile.decimalSep } });
  }

  // ASCII hyphen — parseLocaleNumber's final glyph check already accepts a
  // leading '-' directly; no locale-specific minus-glyph mapping is needed.
  tiles.push({ id: '-', label: { key: '-' } });

  return tiles;
}

// ---------------------------------------------------------------------------
// compare — two locale-formatted display strings from step.prompt.vars
// ---------------------------------------------------------------------------

/**
 * formatLocaleDisplay(value, profile): string
 *
 * Renders a scalar as a locale-formatted display string by routing through
 * `canonicalize()` (the SOLE number→string authority — see @/core/canonical)
 * and then substituting the locale's decimal separator glyph for the
 * canonical ASCII '.'. This is a DISPLAY-layer substitution, not a parsing
 * concern: the inverse direction (string → number) is `parseLocaleNumber`,
 * which the checking pipeline applies to whatever this function produces.
 * Never hardcode ',' or '.' — always source the glyph from `profile.decimalSep`.
 */
function formatLocaleDisplay(value: number, profile: LocaleNumericProfile): string {
  const canonical = canonicalize(value);
  return profile.decimalSep === '.' ? canonical : canonical.replace('.', profile.decimalSep);
}

/**
 * buildCompareOptions(step, contentLanguage): CompareOption[]
 *
 * Reads the two candidate values from `step.prompt.vars.left` / `.right`
 * (numbers — the decimal-comparison generator's contract), formats each with
 * the content-language locale profile's decimal separator, and returns them
 * in the SAME order the generator emitted them (deterministic: no sorting or
 * randomness here — the generator already decided which slot holds the
 * larger value, varying it per seed so the answer is never always the same
 * position).
 */
function buildCompareOptions(step: Step, contentLanguage: string): CompareOption[] {
  const profile = resolveLocaleProfile(contentLanguage);
  const vars = step.prompt.vars ?? {};
  const left = Number(vars.left);
  const right = Number(vars.right);

  return [
    { id: 'left', display: formatLocaleDisplay(left, profile) },
    { id: 'right', display: formatLocaleDisplay(right, profile) },
  ];
}

// ---------------------------------------------------------------------------
// manipulative — derive ManipulativeModel kind from skillNode
// ---------------------------------------------------------------------------

function buildManipulativeModel(step: Step): ManipulativeModel {
  const kind = step.skillNode === 'fraction-simplification' ? 'fraction-bar' : 'number-bond';
  return { kind, payload: step.prompt.vars ?? {} };
}

// ---------------------------------------------------------------------------
// number / multi-slot — decimalGlyph + finalOnly
// ---------------------------------------------------------------------------

function buildNumberConfig(
  task: GeneratedTask,
  step: Step,
  contentLanguage: string,
  masteryConfig: Pick<MasteryConfig, 'abstractFade'>
): NumberWidgetConfig {
  const profile = resolveLocaleProfile(contentLanguage);
  return {
    mode: 'number',
    decimalGlyph: keypadDecimalGlyph(profile),
    finalOnly: deriveFinalOnly(task, step, masteryConfig),
  };
}

// ---------------------------------------------------------------------------
// buildWidgetConfig — the public pure synthesis function
// ---------------------------------------------------------------------------

/**
 * buildWidgetConfig(task, step, contentLanguage, masteryConfig?): WidgetConfig
 *
 * Synthesizes the correct discriminated `WidgetConfig` for `step.inputMode`.
 *
 * @param task           - The full generated task (needed for `representation`
 *                         and, for 'multi-slot', ALL of `task.steps`).
 * @param step           - The individual step to build a config for. Ignored
 *                         (beyond mode detection) for 'multi-slot' — see file
 *                         header ("MULTI-SLOT SYNTHESIS").
 * @param contentLanguage - BCP-47 tag for `resolveLocaleProfile` (decimal glyph).
 * @param masteryConfig  - `Pick<MasteryConfig, 'abstractFade'>`, defaults to
 *                         `DEFAULT_MASTERY_CONFIG`. Injectable so callers with a
 *                         per-node override (`resolveMasteryConfig(node)`) can
 *                         supply it; kept optional so existing call sites and
 *                         tests need not thread it through.
 */
export function buildWidgetConfig(
  task: GeneratedTask,
  step: Step,
  contentLanguage: string,
  masteryConfig: Pick<MasteryConfig, 'abstractFade'> = DEFAULT_MASTERY_CONFIG
): WidgetConfig {
  switch (step.inputMode) {
    case 'number':
      return buildNumberConfig(task, step, contentLanguage, masteryConfig);
    case 'choice':
      return { mode: 'choice', options: buildChoiceOptions(step) };
    case 'tokens':
      return { mode: 'tokens', palette: buildTokenPalette(step, contentLanguage) };
    case 'manipulative':
      return { mode: 'manipulative', model: buildManipulativeModel(step) };
    case 'compare':
      return { mode: 'compare', options: buildCompareOptions(step, contentLanguage) };
    case 'multi-slot': {
      const slots = task.steps
        .filter((s) => s.inputMode === 'multi-slot')
        .map((s) => buildNumberConfig(task, s, contentLanguage, masteryConfig));
      return { mode: 'multi-slot', slots };
    }
    default: {
      // Exhaustiveness guard: a new InputMode added to the closed union without
      // a case here is a build mistake, not a learner-facing error.
      const _exhaustive: never = step.inputMode;
      throw new Error(
        `[build-widget-config] Unhandled InputMode: ${String(_exhaustive)}`
      );
    }
  }
}
