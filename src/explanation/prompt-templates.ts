/**
 * prompt-templates.ts — Config-as-data explanation prompt-template asset.
 *
 * OWNED BY THE PROVIDER, SEPARATE FROM THE i18n UI CATALOG:
 *   This asset is keyed by `explanationLanguage` (a raw BCP-47 tag), NOT by the
 *   `src/i18n` register/UI catalog. The UI catalog resolves `LocalizedRef`s for
 *   on-screen chrome (rings, streak, staged-descent framing, the "copied to
 *   clipboard" affordance copy). This asset instead supplies the META-INSTRUCTION
 *   text that frames the prompt sent to an external chat app / LLM. Keeping the
 *   two separate means a change to UI copy (register/persona tone) can never
 *   accidentally alter the instructions sent off-device, and vice versa.
 *
 * NO LLM, FULLY OFFLINE:
 *   These are static, hand-authored template strings. Nothing here calls a
 *   network API or an LLM — the "prompt" IS the deterministic template plus the
 *   math-only context, assembled by `render-prompt.ts`.
 *
 * FALLBACK:
 *   `resolvePromptTemplate` NEVER blocks `explain()`: any unrecognised or absent
 *   `explanationLanguage` falls back to the `uk` default template.
 */

// ---------------------------------------------------------------------------
// PromptTemplate — the per-language template shape
// ---------------------------------------------------------------------------

/** Section-header labels used when assembling the rendered prompt. */
export interface PromptTemplateSectionLabels {
  /** Header for the problem statement section. */
  readonly problem: string;
  /** Header for the ordered solution-steps section. */
  readonly steps: string;
  /** Inline marker appended to the step where the learner broke. */
  readonly failedStep: string;
  /** Header for the learner's submitted answer. */
  readonly studentAnswer: string;
  /**
   * Header for the correct answer. Includes the "for reference only — do not
   * just reveal it" guidance inline so the instruction travels with the value
   * itself, reinforcing `instructionMeta`.
   */
  readonly correctAnswer: string;
  /** Header for the solution-method label. */
  readonly method: string;
}

/**
 * A single language's explanation prompt template.
 *
 * Every field is a plain string (NOT a `LocalizedRef` — this asset is resolved
 * directly by `render-prompt.ts`, never through `src/i18n`).
 */
export interface PromptTemplate {
  /** Frames the assistant's role and the learner's context. */
  readonly intro: string;
  /**
   * The core meta-instruction: explain exactly this step, encouragingly, no
   * shaming, assume weak fundamentals, do NOT give the final answer — lead
   * the learner to it.
   */
  readonly instructionMeta: string;
  /** Section-header labels. */
  readonly sectionLabels: PromptTemplateSectionLabels;
  /**
   * Appended ONLY when `ExplanationRequestContext.priorApproach` is present:
   * instructs the model to use a DIFFERENT modality/approach than what was
   * already tried (anti-loop escalation).
   */
  readonly differentModality: string;
  /**
   * Closing instruction. Contains the literal placeholder `{{language}}`,
   * substituted by `render-prompt.ts` with `ctx.explanationLanguage`.
   */
  readonly closing: string;
}

// ---------------------------------------------------------------------------
// Shipped templates — uk default, en addition
// ---------------------------------------------------------------------------

const UK_TEMPLATE: PromptTemplate = Object.freeze({
  intro:
    'Ти — терплячий, доброзичливий помічник з математики. Тобі пише доросла людина, ' +
    'яка опановує базову математику і має тривогу через математику через попередній ' +
    'негативний досвід.',
  instructionMeta:
    'Поясни рівно цей один крок простою мовою, підбадьорливо і без жодного натяку на ' +
    'сором, критику чи оцінювання. Вважай, що базові навички ще слабкі — не пропускай ' +
    'нічого як "очевидне". НЕ називай кінцеву відповідь одразу — веди учня до неї ' +
    'поступовими навідними запитаннями чи підказками.',
  sectionLabels: Object.freeze({
    problem: 'Задача',
    steps: 'Кроки розв’язання',
    failedStep: '← тут учню потрібна допомога',
    studentAnswer: 'Відповідь учня',
    correctAnswer:
      'Правильна відповідь (лише для твоєї довідки — НЕ називай її одразу, а веди ' +
      'учня до неї власними навідними підказками)',
    method: 'Метод розв’язання',
  }),
  differentModality:
    'Учню вже намагались пояснити саме цей крок раніше іншим способом, і це не ' +
    'спрацювало. Цього разу, будь ласка, обери ІНШИЙ підхід — іншу аналогію, інший ' +
    'спосіб візуалізації або інший метод, ніж стандартний.',
  closing: 'Будь ласка, відповідай мовою: {{language}}.',
});

const EN_TEMPLATE: PromptTemplate = Object.freeze({
  intro:
    'You are a patient, encouraging math helper. An adult learner who is building ' +
    'up foundational math skills and carries some math anxiety from past negative ' +
    'experiences is asking for your help.',
  instructionMeta:
    'Explain exactly this one step, in plain language, encouragingly, with no hint ' +
    'of shaming, criticism, or grading. Assume the underlying fundamentals are still ' +
    'weak — do not skip anything as "obvious". Do NOT give the final answer straight ' +
    'away — lead the learner to it with gradual guiding questions or hints.',
  sectionLabels: Object.freeze({
    problem: 'Problem',
    steps: 'Solution steps',
    failedStep: '<- learner needs help here',
    studentAnswer: "Learner's answer",
    correctAnswer:
      'Correct answer (for your reference only — do NOT reveal it right away; guide ' +
      'the learner to it with your own hints)',
    method: 'Solution method',
  }),
  differentModality:
    'This exact step was already explained to the learner once before using a ' +
    "different approach, and it didn't land. This time, please use a DIFFERENT " +
    'approach — a different analogy, a different way to visualise it, or a ' +
    'different method than the usual one.',
  closing: 'Please reply in this language: {{language}}.',
});

/**
 * Config-as-data map of `explanationLanguage` prefix (lower-cased primary
 * subtag, e.g. `'uk'` from `'uk-UA'`) → `PromptTemplate`.
 *
 * `uk` is the default/fallback; `en` is an addition. Add a new entry here to
 * support another explanation language — no code change beyond this map.
 */
export const PROMPT_TEMPLATES: Readonly<Record<string, PromptTemplate>> = Object.freeze({
  uk: UK_TEMPLATE,
  en: EN_TEMPLATE,
});

/** The template used when no more specific match is found. */
const DEFAULT_TEMPLATE_KEY = 'uk';

// ---------------------------------------------------------------------------
// resolvePromptTemplate — never blocks explain()
// ---------------------------------------------------------------------------

/**
 * Resolve the `PromptTemplate` for a given `explanationLanguage` BCP-47 tag.
 *
 * Matches on the lower-cased PRIMARY language subtag (e.g. `'en-US'` → `'en'`).
 * Falls back to the `uk` default for any unrecognised, malformed, or absent tag.
 *
 * PURE, NEVER THROWS: this function must never block `ClipboardPromptProvider.explain()`.
 *
 * @param explanationLanguage — BCP-47 language tag (e.g. `'uk'`, `'en-US'`, `'uk-UA'`).
 */
export function resolvePromptTemplate(explanationLanguage: string): PromptTemplate {
  const primarySubtag = (explanationLanguage ?? '')
    .trim()
    .toLowerCase()
    .split('-')[0];
  return PROMPT_TEMPLATES[primarySubtag] ?? PROMPT_TEMPLATES[DEFAULT_TEMPLATE_KEY];
}
