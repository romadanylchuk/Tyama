# Idea: ExplanationProvider
_Created: 2026-06-15_
_Slug: explanation-provider_

## Description
The seam for "explain my mistake." The app **deterministically renders a high-quality prompt from a dedicated template** and places it on the clipboard; the user pastes it into their preferred chat (ChatGPT/Claude/etc.). No built-in LLM, no API key, no proxy, fully offline. The same `context` interface and the same `result` type later plug in a real in-app integration without touching the core.

The seam is `ExplanationProvider.explain(context) → result`:
- `context = { problem, studentAnswer, correctAnswer, method, steps, failedStep, skillNode, contentLanguage, explanationLanguage }` — two language fields (no UI language; the prompt never uses it): `contentLanguage` so the model reads the problem correctly, `explanationLanguage` for the reply.
- `result = { kind: 'clipboard' | 'inline', promptText, status }` — transport-neutral; the MVP returns `kind: 'clipboard'`, the future API provider returns `kind: 'inline'` with the answer text, through the identical type.

The prompt template is a **dedicated, localizable prompt-template asset owned by the provider**, keyed by `explanationLanguage` — distinct from the `i18n-strings` UI catalog. MVP scope is **clipboard-only**; deep-linking into chat apps is deferred (fast-follow).

## Priority
core

## Maturity
ready

## Notes
- Brief §8, locked decision #6.
- Interface: `ExplanationProvider.explain(context) → result`, where `context = { problem, studentAnswer, correctAnswer, method, steps, failedStep, skillNode, language }`. The richness comes from the core already knowing the method, steps, and the **specific failed step**.
- Prompt meta-instruction: explain exactly this step, in the user's language, encouragingly, no shaming, assume weak fundamentals, **do not give the final answer — lead them to it**.
- MVP impl: `ClipboardPromptProvider` (template-rendered, offline; optional deep-link into chat apps). Future: `ApiExplanationProvider` — same `context`, only the transport changes; closes the diagnostic loop the MVP leaves open.
- Known MVP trade-off: the external chat's explanation does not return into diagnostics (loop not closed). Acceptable for MVP.
- Privacy: prompt contains only math, no personal data; nothing leaves the device without explicit user action.
- Language fields tie to [[i18n-strings]] (replaces the archived `i18n-localization`).

## Decision
_Decided: 2026-06-22_

### What Was Decided
The brief-locked seam (#6) is confirmed and its four residual ambiguities resolved:

1. **Two language fields, not one.** Context carries `contentLanguage` (so the model reads the problem correctly) and `explanationLanguage` (the reply language). UI language is **not** carried — the prompt never consumes it. This satisfies the CLAUDE.md three-language hard rule for this seam (UI language is simply out of scope here) and survives the case where content and explanation languages diverge.
2. **Dedicated prompt-template asset.** The prompt lives in a localizable template module owned by the provider, keyed by `explanationLanguage` — separate from the `i18n-strings` UI catalog. It is structured meta-instruction, not UI chrome, and renders in the explanation (not UI) language.
3. **Clipboard-only MVP.** `explain()` copies the rendered prompt and confirms; deep-linking into chat apps is deferred to fast-follow.
4. **Structured return type.** `explain(context) → result` where `result = { kind: 'clipboard' | 'inline', promptText, status }`. Transport-neutral so `ClipboardPromptProvider` (`kind: 'clipboard'`) and the future `ApiExplanationProvider` (`kind: 'inline'`, carrying answer text) satisfy one signature.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Single `language` field | Violates the three-language hard rule and silently breaks when content ≠ explanation language — marking the wrong-language reply or mis-reading the problem. |
| Carry all three language fields (incl. UI) | The prompt never uses UI language; carrying it is dead weight and implies a coupling that does not exist. |
| Prompt template inside the `i18n-strings` UI catalog | Couples a long structured instruction to UI-chrome tooling and the UI-language axis, when it must key on explanation language and is not chrome. |
| Deep-link to chat apps in MVP | Per-platform/per-app URL-scheme handling and failure modes for marginal polish; conflicts with the minimal, robust offline MVP surface. |
| `void` / side-effect-only return | Forces a breaking signature change when `ApiExplanationProvider` must return inline answer text. |

### Rationale
Every choice protects the locked invariant that the future API provider reuses the **identical `context` and `result`** — only transport changes. Splitting language into content/explanation is the same locale discipline the rest of the core enforces (cf. [[locale-numeric-parsing]]); the dedicated template asset mirrors the established "structured data, not UI strings" separation; the structured `result` is what makes the clipboard→API swap a transport detail rather than a signature break. Clipboard-only keeps the MVP fully offline and platform-robust.

### Implications
- **[[i18n-strings]]** — must expose `contentLanguage` and `explanationLanguage` independently; the prompt-template asset is localized **outside** the UI string catalog but through the same locale selection.
- **[[step-level-checking]]** — confirmed as the source of `steps` + `failedStep`; no change to its contract.
- **[[task-generation]]** / **[[skill-graph]]** — supply `problem`/`method`/`skillNode`; unchanged.
- **[[diagnostic-loop]]** — the open-loop trade-off (external explanation not fed back) remains accepted for MVP; closing it is the future `ApiExplanationProvider`'s job via the same seam.
- Pure consumer — blocks nothing; advancing to `ready` unblocks no other node but completes the consumer set for `/architector:finalize`.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[step-level-checking]] — context = steps + failedStep (the richness comes from knowing the exact failed step)
- ← [[i18n-strings]] — supplies `contentLanguage` and `explanationLanguage`
- ← [[task-generation]] / [[skill-graph]] — context also carries problem/method/skillNode (aggregated)

_Pure consumer node: it sources context, blocks nothing in the MVP._

## History
- 2026-06-15 /architector:new — clipboard prompt provider behind an explain(context) seam; deterministic template, offline. Future ApiExplanationProvider reuses the identical context and closes the loop. Trade-off (external explanation not fed back) accepted for MVP.
- 2026-06-22 /architector:decide — confirmed seam (#6) and resolved 4 residuals: context carries `contentLanguage` + `explanationLanguage` (no UI lang); prompt template is a dedicated provider-owned asset keyed by explanation language (not the i18n-strings UI catalog); MVP is clipboard-only (deep-link deferred); `explain → result = { kind, promptText, status }` so the future API provider reuses one signature. Advanced explored → ready.
