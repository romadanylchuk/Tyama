/**
 * parse-error.ts — Structured parse-failure outcome for the locale numeric parser.
 *
 * ParseError is the third outcome from parseLocaleNumber() — distinct from
 * { ok: true, value } and from a failedStep. It is:
 *
 *   - RETURNED, never thrown. Throwing would force try/catch at every call site
 *     and risk conflation with programmer errors.
 *   - NON-SCORING: never routed, never emitted to the firehose, never shown as
 *     a deduction. The UI shows a gentle format-hint; the copy is stage-06 i18n.
 *   - NON-ROUTING: carries no skillNode field. Structurally incapable of becoming
 *     a routing event. A formatting slip is not a skill failure.
 *   - ANTI-SHAME structural invariant: ParseError is invisible to the scoring,
 *     routing, and event-stream layers by construction, not by runtime guards.
 *
 * ParseErrorKind is a closed union so TypeScript's exhaustiveness checking works
 * at all switch/discriminated-union sites.
 */

// ---------------------------------------------------------------------------
// ParseErrorKind — closed reason enum
// ---------------------------------------------------------------------------

/**
 * Closed union of parse-failure reasons.
 *
 *   'empty'              — rawInput is empty or whitespace-only after trim.
 *   'unrecognized-glyph' — a character is present that is not a digit, the
 *                          locale decimal separator, a known group separator,
 *                          or a recognized sign glyph. Never silently misparsed.
 *   'malformed'          — the cleaned string passes glyph checks but
 *                          Number() returns NaN or a non-finite value.
 *   'doubled-separator'  — a group separator appears adjacent (e.g. '1  000')
 *                          or a decimal separator appears trailing / leading
 *                          in an ambiguous position.
 *   'multiple-decimals'  — more than one decimal separator survives after
 *                          group-separator stripping (e.g. '3.5.2').
 *   'not-a-number'       — Number(cleaned) is NaN (catch-all for edge cases
 *                          not caught by glyph rejection).
 */
export type ParseErrorKind =
  | 'empty'
  | 'unrecognized-glyph'
  | 'malformed'
  | 'doubled-separator'
  | 'multiple-decimals'
  | 'not-a-number';

// ---------------------------------------------------------------------------
// ParseError — the structured failure object
// ---------------------------------------------------------------------------

/**
 * Structured parse-failure returned (never thrown) by parseLocaleNumber().
 *
 * Intentionally carries NO skillNode — the structural guarantee that a parse
 * failure can never be confused with a routing event (stage 04 only receives
 * failedStep, which requires a skillNode).
 *
 * rawInput is retained for the UI's format-hint display (stage-06 i18n renders
 * the hint using the kind + the raw value; the core never localizes it).
 *
 * `kind` carries the closed-union failure reason directly (not a constant
 * discriminant). Stage-06 consumes ParseError.kind for i18n format-hint copy
 * via switch(error.kind) { case 'empty': ... case 'unrecognized-glyph': ... }.
 * If CheckResult needs an outer discriminant to distinguish parse-error from
 * failed-step, that discriminant lives on CheckResult.outcome — NOT here.
 */
export interface ParseError {
  /** The failure reason (closed union; used by stage-06 for i18n format-hint dispatch). */
  readonly kind: ParseErrorKind;
  /** The raw input string that failed to parse. Retained for UI format-hint display. */
  readonly rawInput: string;
}

// ---------------------------------------------------------------------------
// Factory — the single constructor site
// ---------------------------------------------------------------------------

/**
 * makeParseError(kind, rawInput) → ParseError
 *
 * Creates a structured ParseError object. The factory is the single constructor
 * site so all consumers produce consistent shapes.
 *
 * Module-internal — not re-exported from the @/parsing barrel.
 *
 * @param kind     — The closed-union parse-failure reason.
 * @param rawInput — The raw input string that caused the failure.
 */
export function makeParseError(kind: ParseErrorKind, rawInput: string): ParseError {
  return {
    kind,
    rawInput,
  };
}
