/**
 * Barrel for the canonical-number module.
 *
 * This is the single import surface for all consumers (generators, checkers).
 * The ESLint rule `local/no-adhoc-number-format` exempts `src/core/canonical/**`
 * as the sole legitimate site for number→string normalization.
 */

export {
  CANONICAL_NUMBER_STANDARD,
  SCALAR_DECIMAL_POLICY,
  SCALAR_INTEGER_POLICY,
  canonicalize,
  canonicalizeFraction,
  CanonicalError,
} from './canonical-number';

export type { NormalizationPolicy } from './canonical-number';
