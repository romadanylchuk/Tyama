/**
 * canonical-number.ts — The single authoritative number-canonicalization module.
 *
 * CANONICAL NUMBER STANDARD (MVP rules — version 1.0, stage 02):
 *
 * This module is the SOLE authority on the canonical lexical form of a number
 * within the Tyama domain core. It is imported by the fruit-equations generator
 * (to produce each step's `expected`) and by stage-03's checker (to normalize the
 * learner's parsed input before comparison). Comparison is exact string equality
 * of two canonical lexical strings — no CAS, no fuzzy match.
 *
 * RULES:
 *   1. Decimal separator is '.' (ASCII full stop, U+002E). Locale display/parse
 *      (e.g. UA '3,5') is a stage-03 presentation/parsing concern; canonical
 *      form is always '.'.
 *   2. No trailing zeros in the fractional part:
 *        3.50 → '3.5'    3.0 → '3'    2.00 → '2'
 *   3. Leading zero required for values with magnitude < 1:
 *        .5 → '0.5'    -.75 → '-0.75'
 *   4. Integers are bare digits — no decimal point, no fractional part:
 *        4 → '4'    not '4.0'
 *   5. Negatives use U+002D hyphen-minus ('-'), no spaces, e.g. '-3'.
 *      Any Unicode minus/dash variant in numeric input must be normalized to U+002D.
 *      Negative zero is forbidden: -0 → '0'.
 *   6. Multi-value answers are split into one ordered Step each — the canonical
 *      form governs a single scalar per step; an answer with N values becomes N
 *      ordered steps, not one delimited string. (Multi-value set-rule: ascending
 *      join by ',' — dormant, reserved for future use.)
 *   7. Fractions (IMPLEMENTED, stage 05 - canonicalizeFraction):
 *      A fraction p/q in canonical form satisfies ALL of:
 *        - q > 0 (sign on numerator only; denominator always positive).
 *        - gcd(|p|, |q|) = 1 (lowest terms; 2/4 -> 1/2).
 *        - q === 1 collapses to an integer: canonicalize(p) is returned.
 *        - numerator 0 -> '0' (sign-neutral).
 *        - Separator is ASCII '/' (U+002F) between numerator and denominator.
 *        - denominator === 0 throws CanonicalError (programmer error).
 *        - Non-integer or non-finite args throw CanonicalError.
 *   8. Non-finite values (NaN, Infinity, -Infinity) are programmer errors —
 *      they throw CanonicalError, not a failedStep (stage-03 concerns).
 *
 * ENFORCEMENT:
 *   An ESLint rule (no-adhoc-number-format) flags ad-hoc number-to-string
 *   normalization (.toFixed, .toLocaleString, String(n)) in src/core/** outside
 *   this module. This file is the single exempt implementation site.
 */

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown when canonicalize() receives a non-finite value.
 * This is a programmer-error path (not a learner failedStep).
 */
export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalError';
  }
}

// ---------------------------------------------------------------------------
// NormalizationPolicy
// ---------------------------------------------------------------------------

/**
 * A typed descriptor that travels with each Step to record which canonical rules
 * the generator applied. The stage-03 checker reads the same policy off the same
 * Step so generator and checker cannot diverge.
 *
 * The policy is intentionally wide so that a single `Step.normalizationPolicy`
 * field type serves ALL generators across stages 02–05 without a breaking change:
 *
 *   - Fruit-equations (stage 02):          decimalForm 'standard', ordering 'n/a', lowestTerms false, numberClass 'decimal'
 *   - Multiplication   (stage 05):         decimalForm 'standard', ordering 'n/a', lowestTerms false, numberClass 'integer'
 *   - Fraction-simplification (stage 05):  uses SCALAR_INTEGER_POLICY for its TWO integer steps
 *                                          (numerator p and denominator q are separate integer scalar
 *                                          steps, NOT a 'fraction' numberClass step). The fraction form
 *                                          is proven via task.solution = canonicalizeFraction(p, q),
 *                                          which flows through the canonical spine. The checker uses the
 *                                          integer path for both steps; the Phase-2 'fraction' checker
 *                                          branch is NOT exercised by fraction-simplification tasks.
 *
 * DL-3: A structured descriptor was chosen over a bare string enum so stage-05 can
 * add fraction rules (`lowestTerms: true`, `numberClass: 'fraction'`) with no change
 * to the Step field type and no breakage of stage-02/03 consumers.
 */
export interface NormalizationPolicy {
  /** 'standard' = U+002E decimal, no trailing zeros, leading zero required. */
  readonly decimalForm: 'standard';
  /**
   * Ordering rule for multi-value steps.
   *   'n/a'       — single scalar per step; ordering handled by step sequence.
   *   'ascending' — set-valued step; canonical form is ascending join by ','.
   *   'none'      — legacy alias for 'n/a'; kept for compatibility.
   */
  readonly ordering: 'n/a' | 'ascending' | 'none';
  /**
   * Whether the fraction must be in lowest terms.
   *   false — not a fraction step (integers / terminating decimals).
   *   true  — fraction step; stage-05 fraction generator sets this.
   */
  readonly lowestTerms: boolean;
  /**
   * The numeric class this step's expected value belongs to.
   *   'integer'  — bare integer (no fractional part).
   *   'decimal'  — terminating decimal (may have fractional part).
   *   'fraction' — rational p/q form (stage-05; lowest-terms when lowestTerms:true).
   */
  readonly numberClass: 'integer' | 'decimal' | 'fraction';
}

/**
 * The frozen default policy instance for all scalar/decimal steps.
 * Fruit-equations stamps this onto every Step.expected it emits.
 * Stage-05 defines its own policy instances for integer and fraction steps.
 */
export const SCALAR_DECIMAL_POLICY: NormalizationPolicy = Object.freeze({
  decimalForm: 'standard',
  ordering: 'n/a',
  lowestTerms: false,
  numberClass: 'decimal',
} as const);

/**
 * The frozen policy instance for all integer scalar steps.
 * Used by number-bonds, multiplication, and fraction-simplification generators
 * (stages 05) for steps whose expected value is a bare integer.
 * Integer steps compare via canonicalize(), not canonicalizeFraction().
 */
export const SCALAR_INTEGER_POLICY: NormalizationPolicy = Object.freeze({
  decimalForm: 'standard',
  ordering: 'n/a',
  lowestTerms: false,
  numberClass: 'integer',
} as const);

// ---------------------------------------------------------------------------
// Documented standard constant (the auditable prose spec)
// ---------------------------------------------------------------------------

/**
 * CANONICAL_NUMBER_STANDARD — prose spec, co-located with the implementation.
 *
 * This constant is the auditable contract for the 02↔03 spine. Any change to
 * the canonical rules must update BOTH this constant AND the canonicalize()
 * implementation, and must be accompanied by updated unit tests.
 */
export const CANONICAL_NUMBER_STANDARD = `
Tyama Canonical Number Standard — MVP v1.0

A canonical number is the unique lexical string representing a numeric value.

Rules (all apply simultaneously):
  [R1] Decimal separator is ASCII full stop '.' (U+002E) only.
       Locale decimal variants (comma, etc.) are normalized before canonicalization.
  [R2] No trailing zeros in the fractional part.
       '3.50' → '3.5', '3.0' → '3', '2.000' → '2'
  [R3] Leading zero required when |value| < 1.
       '.5' → '0.5', '-.75' → '-0.75'
  [R4] Integers are bare digit strings with no decimal point.
       7.0 and 7 both → '7'
  [R5] Sign: negative values use U+002D hyphen-minus, no spaces.
       Negative zero is forbidden: -0 → '0'
  [R6] Multi-value answers are split into one ordered Step per scalar.
       (Reserved set-rule: ascending join by ',' — dormant, for future use.)
  [R7] Fractions: lowest-terms p/q form (IMPLEMENTED, stage-05, canonicalizeFraction).
       q > 0; sign on numerator only; gcd(|p|,|q|) = 1 (lowest terms).
       q === 1 collapses to integer (canonicalize delegation); 0 numerator -> '0'.
       ASCII '/' separator; den === 0 throws CanonicalError (programmer error).
       Non-integer or non-finite args throw CanonicalError.
  [R8] Non-finite input (NaN, Infinity) throws CanonicalError (programmer error).

Generator contract: step.expected === canonicalize(constructedValue)
Checker contract:   canonicalize(parseLocale(learnerInput)) === step.expected
`.trim();

// ---------------------------------------------------------------------------
// canonicalize()
// ---------------------------------------------------------------------------

/**
 * canonicalize(value: number): string
 *
 * Converts a finite JS number to its canonical lexical string per the
 * CANONICAL_NUMBER_STANDARD rules above.
 *
 * This is the SINGLE canonicalization function. Both the generator (which
 * stamps step.expected) and stage-03's checker (which normalizes the learner's
 * parsed input) must import and call THIS function. Divergence is impossible
 * by construction.
 *
 * @throws {CanonicalError} If value is NaN or non-finite.
 */
export function canonicalize(value: number): string {
  // R8 — non-finite is a programmer error
  if (!isFinite(value) || isNaN(value)) {
    throw new CanonicalError(
      `canonicalize() received a non-finite value: ${value}. ` +
        'Non-finite values are a programmer error, not a learner failedStep.'
    );
  }

  // R5 — negative zero → positive zero
  // Object.is(-0, value) is the only reliable way to detect -0
  if (Object.is(value, -0)) {
    return '0';
  }

  // Use JS's built-in toString() as the base — it produces the shortest
  // decimal representation that round-trips, using '.' as separator,
  // with no locale influence (always '.' in all environments).
  // It does NOT produce trailing zeros (e.g. 3.5 → '3.5', not '3.50').
  // It DOES produce a leading zero for |value| < 1 (e.g. 0.5, -0.5).
  // Scientific notation appears only for very large or very small numbers;
  // generators work with terminating decimals in human ranges, so this is
  // not a concern for MVP, but we guard against it defensively.
  const raw = value.toString(10);

  // Guard: if JS chose scientific notation (e.g. 1e-7), parse it into a
  // plain decimal. For the MVP generator range this path is unreachable,
  // but we make the function correct for all finite inputs.
  if (raw.includes('e') || raw.includes('E')) {
    return canonicalizeScientific(value, raw);
  }

  // At this point raw is a plain decimal string like:
  //   '0.5', '-0.5', '3.5', '-3', '4', '0', '-0' (handled above), etc.
  // JS toString already satisfies R1 (uses '.'), R3 (leading zero for |x|<1),
  // R4 (integers are bare digits), R5 (uses '-'), R2 (no trailing zeros).
  // We only need to verify R2 explicitly for safety (JS is spec-compliant but
  // adding an explicit strip makes the invariant auditable in code).
  return stripTrailingFractionalZeros(raw);
}

// ---------------------------------------------------------------------------
// canonicalizeFraction()
// ---------------------------------------------------------------------------

/**
 * Internal pure GCD helper (Euclidean algorithm on absolute values).
 * gcd(0, n) === |n|; gcd(a, b) === gcd(b, a % b).
 * Works only with non-negative integers.
 */
function gcd(a: number, b: number): number {
  // Both a and b are expected to be non-negative integers.
  let x = a;
  let y = b;
  while (y !== 0) {
    const tmp = y;
    y = x % y;
    x = tmp;
  }
  return x;
}

/**
 * canonicalizeFraction(num, den): string
 *
 * The SOLE fraction-emission site in the Tyama domain core. Both the fraction
 * generator (to produce task.solution) and stage-05's checker fraction branch
 * (to normalize the learner's entered numerator/denominator) must import and
 * call THIS function. Divergence between generation and checking is impossible
 * by construction — the same function, same rules, same output.
 *
 * Rules (all integer arithmetic; see CANONICAL_NUMBER_STANDARD R7):
 *   - Non-integer or non-finite num/den throws CanonicalError (programmer error).
 *   - den === 0 throws CanonicalError (programmer error; never learner-facing).
 *   - num === 0 returns '0' (sign-neutral).
 *   - Sign is placed on the numerator; denominator is always positive.
 *   - Both are divided by gcd(|num|, |den|) to reach lowest terms.
 *   - If the reduced denominator is 1, delegates to canonicalize(p)
 *     so 4/2 -> '2' and -6/3 -> '-2' (same comparand as a bare integer step).
 *   - Otherwise returns p/q with ASCII '/' (U+002F).
 *
 * Examples:
 *   canonicalizeFraction(1, 2)   -> '1/2'
 *   canonicalizeFraction(2, 4)   -> '1/2'   (reduced)
 *   canonicalizeFraction(-3, 4)  -> '-3/4'  (sign on numerator)
 *   canonicalizeFraction(3, -4)  -> '-3/4'  (sign moved to numerator)
 *   canonicalizeFraction(-3, -4) -> '3/4'   (double negative -> positive)
 *   canonicalizeFraction(4, 1)   -> '4'     (q === 1 collapses to integer)
 *   canonicalizeFraction(6, 2)   -> '3'     (reduces to 3/1 -> integer)
 *   canonicalizeFraction(0, 5)   -> '0'
 *   canonicalizeFraction(5, 0)   throws CanonicalError
 *
 * @throws {CanonicalError} If den === 0, or if either arg is non-integer or non-finite.
 */
export function canonicalizeFraction(num: number, den: number): string {
  // Guard: non-finite inputs are programmer errors (R8 extended to fraction args).
  if (!isFinite(num) || isNaN(num) || !isFinite(den) || isNaN(den)) {
    throw new CanonicalError(
      `canonicalizeFraction() received a non-finite argument: num=${num}, den=${den}. ` +
        'Non-finite values are a programmer error, not a learner failedStep.'
    );
  }

  // Guard: non-integer inputs are programmer errors (generators always pass integers).
  if (!Number.isInteger(num) || !Number.isInteger(den)) {
    throw new CanonicalError(
      `canonicalizeFraction() requires integer arguments: num=${num}, den=${den}. ` +
        'Non-integer arguments are a programmer error.'
    );
  }

  // Guard: denominator zero is a programmer error (never a learner-facing path).
  // The checker pre-validates den !== 0 before calling this function.
  if (den === 0) {
    throw new CanonicalError(
      'canonicalizeFraction() received denominator === 0. ' +
        'This is a programmer error; the learner-entered 0 denominator must be ' +
        'caught by the checker before calling canonicalizeFraction.'
    );
  }

  // Zero numerator is sign-neutral (both +0/n and -0/n -> '0').
  if (num === 0) {
    return '0';
  }

  // Normalize sign: ensure denominator is positive, sign lives on numerator.
  // XOR-style: if exactly one of num, den is negative, result is negative.
  const negative = (num < 0) !== (den < 0);
  let absP = Math.abs(num);
  const absQ = Math.abs(den);

  // Reduce to lowest terms.
  const g = gcd(absP, absQ);
  absP = absP / g;
  const q = absQ / g;
  const p = negative ? -absP : absP;

  // q === 1 collapses to a bare integer (same form as a directly-emitted integer step).
  if (q === 1) {
    return canonicalize(p);
  }

  // General case: ASCII '/' separator, sign on numerator.
  return `${p}/${q}`;
}
// ---------------------------------------------------------------------------
// Internal helpers (not exported — implementation detail)
// ---------------------------------------------------------------------------

/**
 * Strip trailing zeros from the fractional part of a plain decimal string.
 * Also removes a trailing decimal point (e.g. '3.' → '3').
 *
 * Examples:
 *   '3.50'  → '3.5'
 *   '3.00'  → '3'
 *   '3.'    → '3'
 *   '3'     → '3'     (no-op — no fractional part)
 *   '0.5'   → '0.5'   (no-op — no trailing zeros)
 *   '-3.50' → '-3.5'
 */
function stripTrailingFractionalZeros(s: string): string {
  if (!s.includes('.')) return s;
  // Remove trailing zeros
  let result = s.replace(/0+$/, '');
  // Remove trailing decimal point
  if (result.endsWith('.')) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Convert a number in scientific notation (e.g. 1e-7) to a plain canonical
 * decimal string.
 *
 * This path is unreachable for the MVP generator range (integers and simple
 * terminating decimals), but makes canonicalize() correct for all finite inputs.
 */
function canonicalizeScientific(value: number, _raw: string): string {
  // Use toFixed with enough precision, then strip trailing zeros.
  // We determine required precision from the value itself.
  // For very small numbers, toFixed(20) gives enough precision.
  // For very large numbers, JS produces non-scientific toString anyway above 1e21.
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  // Find how many decimal places we need.
  // Strategy: try increasing precision until the toFixed representation
  // round-trips back to the original value.
  let precision = 0;
  let candidate = '';
  for (precision = 0; precision <= 20; precision++) {
    candidate = abs.toFixed(precision);
    if (parseFloat(candidate) === abs) break;
  }

  const full = sign + candidate;
  return stripTrailingFractionalZeros(full);
}
