/**
 * en.ts — English (additions) i18n catalog for Tyama.
 *
 * This catalog is ADDITIVE — it supplements the default 'uk' catalog.
 * Keys absent here fall back to the 'uk' catalog, then to the bare key.
 *
 * No-shame-critical keys (those matching CRITICAL_KEY_PREFIXES) MUST supply
 * both _warm and _neutral variants here if the English locale is used in the
 * completeness gate. The gate checks EVERY locale in the supplied catalog
 * resource map.
 *
 * ANTI-SHAME INVARIANT: same as uk.ts — no string may contain shaming vocab.
 */

import type { CatalogResource } from '../catalog-types';

const en: CatalogResource = {
  // -------------------------------------------------------------------------
  // error.* — Error-feedback / "not yet" surfaces
  // -------------------------------------------------------------------------

  'error.notYet_warm':
    "Not quite yet — give it another try, you've got this! 💪",
  'error.notYet_neutral':
    "Not quite right — try again.",

  'error.tryAgain_warm':
    "No worries — let's look at this together.",
  'error.tryAgain_neutral':
    'Try again.',

  'error.firmUpFirst_warm':
    "Let's build up \"{{node}}\" first — that'll make everything else feel easier!",
  'error.firmUpFirst_neutral':
    'Practice "{{node}}" first.',

  // -------------------------------------------------------------------------
  // hint.* — Step-level guidance
  // -------------------------------------------------------------------------

  'hint.stepGuide_warm':
    'Hint: {{hint}}',
  'hint.stepGuide_neutral':
    'Hint: {{hint}}',

  'hint.formatHeader_warm':
    "Just a small formatting thing — here's how:",
  'hint.formatHeader_neutral':
    'Answer format:',

  // -------------------------------------------------------------------------
  // parse.* — ParseError kind format-hint copy
  // -------------------------------------------------------------------------

  'parse.empty_warm':
    "Looks like the answer is empty — enter a number to continue.",
  'parse.empty_neutral':
    'Enter a number.',

  'parse.unrecognized-glyph_warm':
    "There's a character I don't recognise — only digits and a decimal point, please.",
  'parse.unrecognized-glyph_neutral':
    'Digits and decimal separator only.',

  'parse.malformed_warm':
    "That number looks a little unusual — can you check the format?",
  'parse.malformed_neutral':
    'Invalid number format.',

  'parse.doubled-separator_warm':
    "Looks like there are two separators together — just leave one (e.g. 3.5).",
  'parse.doubled-separator_neutral':
    'Extra separator. Example: 3.5.',

  'parse.multiple-decimals_warm':
    "More than one decimal point — just leave one (e.g. 3.5).",
  'parse.multiple-decimals_neutral':
    'One decimal point only. Example: 3.5.',

  'parse.not-a-number_warm':
    "I can't read that as a number — try entering digits only.",
  'parse.not-a-number_neutral':
    'Enter a valid number.',

  // -------------------------------------------------------------------------
  // lapse.* — Lapse / regression framing
  // -------------------------------------------------------------------------

  'lapse.noted_warm':
    "These felt a bit trickier — that's okay, let's go through them again.",
  'lapse.noted_neutral':
    'Reviewing again.',

  // -------------------------------------------------------------------------
  // descent.* — Staged-descent routing framing
  // -------------------------------------------------------------------------

  'descent.header_warm':
    'Great chance to strengthen the foundations!',
  'descent.header_neutral':
    'Moving to an earlier topic.',

  'descent.body_warm':
    "We'll look at \"{{node}}\" — once you feel confident here, everything else gets easier.",
  'descent.body_neutral':
    'Practice "{{node}}", then return.',

  // -------------------------------------------------------------------------
  // escalation.* — Anti-loop escalation copy
  // -------------------------------------------------------------------------

  'escalation.clipboardCopied_warm':
    "📋 I've prepared an explanation and copied it to your clipboard — paste it into your chat app for detailed help.",
  'escalation.clipboardCopied_neutral':
    'Explanation copied to clipboard.',

  'escalation.clipboardFailed_warm':
    "Couldn't copy automatically — but the explanation is below; you can copy it manually.",
  'escalation.clipboardFailed_neutral':
    'Copy the text below manually.',

  // -------------------------------------------------------------------------
  // streak.* — Streak display
  // -------------------------------------------------------------------------

  'streak.kept_warm':
    '🔥 {{count}} day streak — keep it up!',
  'streak.kept_neutral':
    '{{count}} day streak.',

  'streak.milestone_warm':
    "🎉 {{count}} days in a row — that's becoming a habit!",
  'streak.milestone_neutral':
    '{{count}} days in a row.',

  // -------------------------------------------------------------------------
  // feedback.* — Generic task-feedback surfaces
  // -------------------------------------------------------------------------

  'feedback.correct_warm':
    '✓ Yes! Excellent!',
  'feedback.correct_neutral':
    'Correct.',

  'feedback.inProgress_warm':
    "You're on the right track — keep going!",
  'feedback.inProgress_neutral':
    'Keep practising.',

  // -------------------------------------------------------------------------
  // ring.* — Ring-state labels
  // -------------------------------------------------------------------------

  'ring.notYetOpen_warm':
    'Coming soon',
  'ring.notYetOpen_neutral':
    'Coming soon',

  'ring.available_warm':
    "Let's start!",
  'ring.available_neutral':
    'Available',

  'ring.inProgress_warm':
    'In progress',
  'ring.inProgress_neutral':
    'In progress',

  'ring.mastered_warm':
    '🌟 Mastered!',
  'ring.mastered_neutral':
    'Mastered',

  // -------------------------------------------------------------------------
  // clipboard.* — Clipboard explanation affordance
  // -------------------------------------------------------------------------

  'clipboard.requestExplanation_warm':
    'Help me understand',
  'clipboard.requestExplanation_neutral':
    'Explanation',

  'clipboard.pasteInstruction_warm':
    'Paste this into your favourite chat app (Claude, ChatGPT, etc.) for a detailed explanation.',
  'clipboard.pasteInstruction_neutral':
    'Paste the copied text into a chat app.',

  // -------------------------------------------------------------------------
  // onboarding.* — First-run onboarding framing
  // -------------------------------------------------------------------------

  'onboarding.welcomeTitle_warm':
    "Hi there! Glad you're here 👋",
  'onboarding.welcomeTitle_neutral':
    'Welcome',

  'onboarding.welcomeBody_warm':
    "Tyama will help you build up your math skills — one step at a time, at your own pace. Every answer here just leads to a next step. Just give it a try — that's enough.",
  'onboarding.welcomeBody_neutral':
    'Tyama helps you build math skills gradually, at a comfortable pace.',

  'onboarding.placementIntro_warm':
    "Let's get to know each other a bit — a few short tasks will help pick the right starting level. There's nothing to fail here.",
  'onboarding.placementIntro_neutral':
    'A few short tasks to pick a starting level.',

  'onboarding.placementSlowOk_warm':
    "No rush — only accuracy matters here, time isn't counted.",
  'onboarding.placementSlowOk_neutral':
    "Time isn't counted — only correctness.",

  'onboarding.doneTitle_warm':
    "All set! Starting your journey 🌟",
  'onboarding.doneTitle_neutral':
    'Setup complete',

  // -------------------------------------------------------------------------
  // nav.* — Navigation / shell chrome (ordinary)
  // -------------------------------------------------------------------------

  'nav.nodeMap': 'Skill Map',
  'nav.task': 'Task',
  'nav.settings': 'Settings',
  'nav.back': 'Back',

  // -------------------------------------------------------------------------
  // task.* — Task-screen chrome (ordinary)
  // -------------------------------------------------------------------------

  'task.submit': 'Check',
  'task.next': 'Next',
  'task.loading': 'Loading...',
  'task.xpEarned': '+{{xp}} XP',
  // Shown when diagnostic routing lands on a foundation whose tasks aren't ready yet.
  'task.comingSoonBody':
    "We're still preparing tasks for this foundation. We'll come back to it soon — for now you can continue with another topic.",
  'task.comingSoonBack': 'Back to the map',
  // Shown after a correct answer once this node reaches mastery — invites moving on.
  'task.masteredBody': "You've got this topic down! Pick your next one on the map — you're ready to move on.",
  'task.chooseNext': 'Choose next topic',

  // -------------------------------------------------------------------------
  // common.* — Shared UI labels (ordinary). Also holds ORDINARY onboarding
  // chrome, deliberately kept OUT of the `onboarding.*` critical namespace.
  // -------------------------------------------------------------------------

  'common.close': 'Close',
  'common.retry': 'Try again',
  'common.allCaughtUp': "Great job! You're all caught up. 🎉",
  'common.appName': 'Tyama',

  'common.begin': 'Begin',
  'common.skip': 'Skip',
  'common.continue': 'Continue',

  'common.languageLabel': 'Choose your language',
  'common.languageUk': 'Українська',
  'common.languageEnglish': 'English',

  'common.personaLabel': "What's comfortable for you?",
  'common.personaAdult': 'Adult (16+)',
  'common.personaKid': 'Kid',
  'common.personaEnthusiast': 'Enthusiast',

  'common.placementPlaceholderNote': 'A short diagnostic (tasks are coming soon here).',

  'common.doneBody': "You're all set — you can start practising right now.",

  // -------------------------------------------------------------------------
  // number_bonds.* — Number-bond generator problem/step prompts (ordinary).
  // -------------------------------------------------------------------------

  'number_bonds.problem.part_a': 'Number bond: find the missing part.',
  'number_bonds.problem.part_b': 'Number bond: find the missing part.',
  'number_bonds.problem.whole': 'Number bond: find the whole.',

  'number_bonds.step.part_a':
    'The whole is {{knownB}}, one part is {{knownA}}. What is the other part?',
  'number_bonds.step.part_b':
    'The whole is {{knownB}}, one part is {{knownA}}. What is the other part?',
  'number_bonds.step.whole':
    'The parts are {{knownA}} and {{knownB}}. What is the whole?',

  // -------------------------------------------------------------------------
  // multiplication.* — Multiplication generator prompts (vars: a, b).
  // -------------------------------------------------------------------------

  'multiplication.problem': 'What is {{a}} × {{b}}?',
  'multiplication.step.product': 'Find the product: {{a}} × {{b}}.',

  // -------------------------------------------------------------------------
  // fraction_simpl.* — Fraction-simplification prompts (vars: num, den).
  // -------------------------------------------------------------------------

  'fraction_simpl.problem': 'Simplify the fraction {{num}}/{{den}} to lowest terms.',
  'fraction_simpl.step.numerator': 'What is the numerator of {{num}}/{{den}} simplified?',
  'fraction_simpl.step.denominator': 'What is the denominator of {{num}}/{{den}} simplified?',

  // -------------------------------------------------------------------------
  // fruit_eq.* — Fruit-equations prompts (problem vars: total; step vars: slot).
  // -------------------------------------------------------------------------

  'fruit_eq.problem.unknowns_1':
    'Fruit equation: find how much the fruit is worth. The total is {{total}}.',
  'fruit_eq.problem.unknowns_2':
    'Fruit equation: find the value of each fruit. Their total is {{total}}.',
  'fruit_eq.step.apple': 'How much is 🍎 (apple)?',
  'fruit_eq.step.banana': 'How much is 🍌 (banana)?',

  // -------------------------------------------------------------------------
  // widget.* — Answer-widget chrome labels (ordinary).
  // -------------------------------------------------------------------------

  'widget.confirm': 'Confirm',
  'widget.backspace': 'Backspace',
  'widget.number.final_only': 'Enter your answer',
  'widget.manipulative.number-bond': 'Number bond',
  'widget.manipulative.fraction-bar': 'Fraction bar',
  'widget.tokens.tap_to_assemble': 'Tap to assemble your answer',
  'widget.tokens.remove_last': 'Remove last',
};

export default en;
