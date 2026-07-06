/**
 * uk.ts — Ukrainian (default) i18n catalog for Tyama.
 *
 * This is the COMPLETE default catalog. Every no-shame-critical key (those
 * matching CRITICAL_KEY_PREFIXES in criticality.ts) MUST supply both _warm
 * and _neutral register variants here. Ordinary keys may supply only the bare
 * key or a single variant.
 *
 * Ukrainian is the primary locale — all fallbacks resolve to 'uk' before
 * returning an empty string. English ('en') is additive.
 *
 * KEY NAMING:
 *   error.*      — Error-feedback / "not yet" surfaces
 *   hint.*       — Step-level guidance
 *   parse.*      — ParseError kind format-hint copy
 *   lapse.*      — Lapse / regression framing
 *   descent.*    — Staged-descent routing framing ("let's firm up X first")
 *   escalation.* — Anti-loop escalation copy
 *   streak.*     — Streak display
 *   feedback.*   — Generic task-feedback (not-yet, try-this-way)
 *   ring.*       — Ring-state labels
 *   clipboard.*  — Clipboard explanation affordance
 *   onboarding.* — First-run onboarding framing (welcome/placement/done)
 *   nav.*        — Navigation / shell chrome (ordinary)
 *   task.*       — Task-screen chrome (ordinary)
 *   common.*     — Shared UI labels (ordinary) — also holds ORDINARY
 *                  onboarding chrome (button labels, picker options) so it is
 *                  not swept into the `onboarding.*` critical prefix.
 *
 * INTERPOLATION: uses {{varName}} double-brace syntax (i18next default).
 *
 * ANTI-SHAME INVARIANT:
 *   No string here may contain: wrong, red, incorrect, fail, lost,
 *   penalty, locked, mistake, bad. Errors are framing signals only.
 */

import type { CatalogResource } from '../catalog-types';

const uk: CatalogResource = {
  // -------------------------------------------------------------------------
  // error.* — Error-feedback / "not yet" surfaces
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Calm "not yet" — primary feedback when a step answer doesn't match. */
  'error.notYet_warm':
    'Ще не зовсім — спробуй ще раз, у тебе вийде! 💪',
  'error.notYet_neutral':
    'Не зовсім вірно — спробуй ще раз.',

  /** Generic recovery hint. */
  'error.tryAgain_warm':
    'Нічого страшного — давай подивимось разом.',
  'error.tryAgain_neutral':
    'Спробуй ще раз.',

  /** Staged-descent lead-in (the "let's firm up X first" frame). */
  'error.firmUpFirst_warm':
    'Давай спочатку зміцнимо «{{node}}» — це допоможе тобі рухатись впевненіше!',
  'error.firmUpFirst_neutral':
    'Спочатку потрібно відпрацювати «{{node}}».',

  // -------------------------------------------------------------------------
  // hint.* — Step-level guidance
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Generic step hint. */
  'hint.stepGuide_warm':
    'Підказка: {{hint}}',
  'hint.stepGuide_neutral':
    'Підказка: {{hint}}',

  /** Format hint header (shown above parse-error details). */
  'hint.formatHeader_warm':
    'Трохи не той формат — давай я поясню:',
  'hint.formatHeader_neutral':
    'Формат відповіді:',

  // -------------------------------------------------------------------------
  // parse.* — ParseError kind format-hint copy
  //   Both _warm and _neutral required for each kind (no-shame-critical).
  //   Switch(error.kind) → 'parse.<kind>' key in formatParseHint().
  // -------------------------------------------------------------------------

  /** error.kind = 'empty' */
  'parse.empty_warm':
    'Здається, відповідь порожня — введи число, щоб продовжити.',
  'parse.empty_neutral':
    'Введіть число.',

  /** error.kind = 'unrecognized-glyph' */
  'parse.unrecognized-glyph_warm':
    'Тут є символ, якого я не розпізнаю — можна тільки цифри та кому для десяткового розділювача.',
  'parse.unrecognized-glyph_neutral':
    'Дозволено лише цифри та десятковий розділювач.',

  /** error.kind = 'malformed' */
  'parse.malformed_warm':
    'Число виглядає трохи незвично — перевір, будь ласка, формат.',
  'parse.malformed_neutral':
    'Перевірте формат числа.',

  /** error.kind = 'doubled-separator' */
  'parse.doubled-separator_warm':
    'Схоже, тут два розділювачі підряд — залиш тільки один (наприклад: 3,5).',
  'parse.doubled-separator_neutral':
    'Зайвий розділювач. Приклад: 3,5.',

  /** error.kind = 'multiple-decimals' */
  'parse.multiple-decimals_warm':
    'Більше одного десяткового розділювача — залиш тільки один (наприклад: 3,5).',
  'parse.multiple-decimals_neutral':
    'Тільки один десятковий розділювач. Приклад: 3,5.',

  /** error.kind = 'not-a-number' */
  'parse.not-a-number_warm':
    'Я не можу розпізнати це як число — спробуй ввести тільки цифри.',
  'parse.not-a-number_neutral':
    'Введіть дійсне число.',

  // -------------------------------------------------------------------------
  // lapse.* — Lapse / regression framing
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Shown when a node lapse is detected (scalar dropped). */
  'lapse.noted_warm':
    'Ці задачі давалися трохи важче — нічого страшного, давай пройдемо ще раз.',
  'lapse.noted_neutral':
    'Повторення — мати навчання.',

  // -------------------------------------------------------------------------
  // descent.* — Staged-descent routing framing
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Header for the staged-descent narrative. */
  'descent.header_warm':
    'Чудова нагода зміцнити основи!',
  'descent.header_neutral':
    'Переходимо до попередньої теми.',

  /** Body: explains which node and why. */
  'descent.body_warm':
    'Зараз подивимось на «{{node}}» — коли ти відчуєш себе впевніше тут, все далі піде легше.',
  'descent.body_neutral':
    'Відпрацюємо «{{node}}», а потім повернемось.',

  // -------------------------------------------------------------------------
  // escalation.* — Anti-loop escalation copy
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Shown when explanation prompt is copied to clipboard. */
  'escalation.clipboardCopied_warm':
    '📋 Я склав пояснення і скопіював його в буфер обміну — встав у свій чат-застосунок, щоб отримати детальну допомогу.',
  'escalation.clipboardCopied_neutral':
    'Пояснення скопійовано в буфер обміну.',

  /** Shown when clipboard copy fails (calm retry). */
  'escalation.clipboardFailed_warm':
    'Не вдалося скопіювати автоматично — але я підготував пояснення нижче, ти можеш скопіювати його вручну.',
  'escalation.clipboardFailed_neutral':
    'Скопіюйте текст нижче вручну.',

  // -------------------------------------------------------------------------
  // streak.* — Streak display
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Streak maintained/earned. */
  'streak.kept_warm':
    '🔥 {{count}} день поспіль — так тримати!',
  'streak.kept_neutral':
    '{{count}} день поспіль.',

  /** Streak milestone (first day, milestone counts). */
  'streak.milestone_warm':
    '🎉 {{count}} днів поспіль — це вже традиція!',
  'streak.milestone_neutral':
    '{{count}} днів поспіль.',

  // -------------------------------------------------------------------------
  // feedback.* — Generic task-feedback surfaces
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Correct answer. */
  'feedback.correct_warm':
    '✓ Так! Чудово!',
  'feedback.correct_neutral':
    'Правильно.',

  /** Encouragement during in-progress node. */
  'feedback.inProgress_warm':
    'Ти на правильному шляху — продовжуй!',
  'feedback.inProgress_neutral':
    'Продовжуй практику.',

  // -------------------------------------------------------------------------
  // ring.* — Ring-state labels
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Ring state: not yet open (coming-soon generator). */
  'ring.notYetOpen_warm':
    'Незабаром',
  'ring.notYetOpen_neutral':
    'Невдовзі',

  /** Ring state: available (untouched). */
  'ring.available_warm':
    'Починаємо!',
  'ring.available_neutral':
    'Доступно',

  /** Ring state: in progress. */
  'ring.inProgress_warm':
    'У процесі',
  'ring.inProgress_neutral':
    'У процесі',

  /** Ring state: mastered. */
  'ring.mastered_warm':
    '🌟 Освоєно!',
  'ring.mastered_neutral':
    'Освоєно',

  // -------------------------------------------------------------------------
  // clipboard.* — Clipboard explanation affordance
  //   Both _warm and _neutral required (no-shame-critical).
  // -------------------------------------------------------------------------

  /** Button / action to request explanation. */
  'clipboard.requestExplanation_warm':
    'Хочу зрозуміти краще',
  'clipboard.requestExplanation_neutral':
    'Пояснення',

  /** Instruction after copy. */
  'clipboard.pasteInstruction_warm':
    'Встав у свій улюблений чат-застосунок (Claude, ChatGPT тощо) і отримай детальне пояснення.',
  'clipboard.pasteInstruction_neutral':
    'Вставте скопійований текст у чат-застосунок.',

  // -------------------------------------------------------------------------
  // onboarding.* — First-run onboarding framing
  //   Both _warm and _neutral required (no-shame-critical, see criticality.ts).
  // -------------------------------------------------------------------------

  /** Welcome screen — north-star framing ("I'll give it a try"). No math yet. */
  'onboarding.welcomeTitle_warm':
    'Привіт! Раді, що ти тут 👋',
  'onboarding.welcomeTitle_neutral':
    'Ласкаво просимо',

  'onboarding.welcomeBody_warm':
    'Тяма допоможе тобі зміцнити математичні навички — крок за кроком, у своєму темпі. Тут немає неправильних відповідей, лише наступний крок. Просто спробуй — цього достатньо.',
  'onboarding.welcomeBody_neutral':
    'Тяма допомагає тренувати математичні навички поступово, у зручному темпі.',

  /** Placement intro — staged-descent framing for the shortened diagnostic ladder. */
  'onboarding.placementIntro_warm':
    'Тепер трохи познайомимось — кілька коротких завдань допоможуть підібрати правильний рівень для старту. Немає нічого, що можна «провалити».',
  'onboarding.placementIntro_neutral':
    'Кілька коротких завдань для підбору рівня.',

  /** Reassurance that a slower-but-correct probe still counts (no speed gate). */
  'onboarding.placementSlowOk_warm':
    'Не поспішай — тут важлива лише точність, час не рахується.',
  'onboarding.placementSlowOk_neutral':
    'Час не враховується — лише правильність.',

  /** Done screen — calm completion framing entering the main loop. */
  'onboarding.doneTitle_warm':
    'Готово! Починаємо твою подорож 🌟',
  'onboarding.doneTitle_neutral':
    'Налаштування завершено',

  // -------------------------------------------------------------------------
  // nav.* — Navigation / shell chrome (ordinary, no register requirement)
  // -------------------------------------------------------------------------

  'nav.nodeMap': 'Карта тем',
  'nav.task': 'Завдання',
  'nav.settings': 'Налаштування',
  'nav.back': 'Назад',

  // -------------------------------------------------------------------------
  // task.* — Task-screen chrome (ordinary)
  // -------------------------------------------------------------------------

  'task.submit': 'Перевірити',
  'task.next': 'Далі',
  'task.loading': 'Завантаження...',
  'task.xpEarned': '+{{xp}} XP',
  // Shown when diagnostic routing lands on a foundation whose tasks aren't ready yet.
  'task.comingSoonBody':
    'Ми ще готуємо завдання для цієї основи. Повернемось до неї згодом — а зараз можеш продовжити з іншою темою.',
  'task.comingSoonBack': 'До карти тем',
  // Shown after a correct answer once this node reaches mastery — invites moving on.
  'task.masteredBody': 'Ти впевнено освоїв цю тему! Обери наступну на карті — ти готовий рухатись далі.',
  'task.chooseNext': 'Обрати наступну тему',

  // -------------------------------------------------------------------------
  // common.* — Shared UI labels (ordinary). Also holds ORDINARY onboarding
  // chrome (button labels, picker options, placeholder note) deliberately
  // kept OUT of the `onboarding.*` no-shame-critical namespace.
  // -------------------------------------------------------------------------

  'common.close': 'Закрити',
  'common.retry': 'Спробувати ще раз',
  'common.allCaughtUp': 'Молодець! Поки що все опрацьовано. 🎉',
  'common.appName': 'Тяма',

  'common.begin': 'Почати',
  'common.skip': 'Пропустити',
  'common.continue': 'Продовжити',

  'common.languageLabel': 'Обери мову',
  'common.languageUk': 'Українська',
  'common.languageEnglish': 'English',

  'common.personaLabel': 'Як тобі зручніше?',
  'common.personaAdult': 'Дорослий (16+)',
  'common.personaKid': 'Дитина',
  'common.personaEnthusiast': 'Ентузіаст',

  'common.placementPlaceholderNote': 'Коротка діагностика (незабаром тут з’являться завдання).',

  'common.doneBody': 'Все готово — можеш почати тренуватись просто зараз.',

  // -------------------------------------------------------------------------
  // number_bonds.* — Number-bond generator problem/step prompts (ordinary).
  //   `problem.*` is the short framing headline; `step.*` is the actual
  //   question carrying the two KNOWN values ({{knownA}}, {{knownB}}) — never
  //   the answer. Slot segment (part_a | part_b | whole) comes from the
  //   generator's missingSlot.
  // -------------------------------------------------------------------------

  'number_bonds.problem.part_a': 'Числовий зв’язок: знайди частину, якої бракує.',
  'number_bonds.problem.part_b': 'Числовий зв’язок: знайди частину, якої бракує.',
  'number_bonds.problem.whole': 'Числовий зв’язок: знайди ціле.',

  'number_bonds.step.part_a':
    'Ціле — {{knownB}}, одна частина — {{knownA}}. Яка інша частина?',
  'number_bonds.step.part_b':
    'Ціле — {{knownB}}, одна частина — {{knownA}}. Яка інша частина?',
  'number_bonds.step.whole':
    'Частини — {{knownA}} і {{knownB}}. Яке ціле?',

  // -------------------------------------------------------------------------
  // multiplication.* — Multiplication generator prompts (vars: a, b).
  // -------------------------------------------------------------------------

  'multiplication.problem': 'Скільки буде {{a}} × {{b}}?',
  'multiplication.step.product': 'Обчисли добуток: {{a}} × {{b}}.',

  // -------------------------------------------------------------------------
  // fraction_simpl.* — Fraction-simplification prompts (vars: num, den).
  // -------------------------------------------------------------------------

  'fraction_simpl.problem': 'Скороти дріб {{num}}/{{den}} до найпростішого вигляду.',
  'fraction_simpl.step.numerator': 'Який чисельник скороченого дробу {{num}}/{{den}}?',
  'fraction_simpl.step.denominator': 'Який знаменник скороченого дробу {{num}}/{{den}}?',

  // -------------------------------------------------------------------------
  // fruit_eq.* — Fruit-equations prompts. Problem vars: total (+ slot markers);
  //   step keys encode the fruit slot (apple | banana), vars: slot.
  // -------------------------------------------------------------------------

  'fruit_eq.problem.unknowns_1':
    'Фруктова рівність: знайди, скільки становить фрукт. Сума дорівнює {{total}}.',
  'fruit_eq.problem.unknowns_2':
    'Фруктова рівність: знайди значення кожного фрукта. Їхня сума дорівнює {{total}}.',
  'fruit_eq.step.apple': 'Скільки становить 🍎 (яблуко)?',
  'fruit_eq.step.banana': 'Скільки становить 🍌 (банан)?',

  // -------------------------------------------------------------------------
  // widget.* — Answer-widget chrome labels (ordinary). Rendered via useT()
  //   inside the widgets. Manipulative kinds map to the ManipulativeModel
  //   tagged union ('number-bond' | 'fraction-bar').
  // -------------------------------------------------------------------------

  'widget.confirm': 'Підтвердити',
  'widget.backspace': 'Стерти',
  'widget.number.final_only': 'Введи відповідь',
  'widget.manipulative.number-bond': 'Числовий зв’язок',
  'widget.manipulative.fraction-bar': 'Смужка дробу',
  'widget.tokens.tap_to_assemble': 'Торкайся, щоб зібрати відповідь',
  'widget.tokens.remove_last': 'Прибрати останнє',
};

export default uk;
