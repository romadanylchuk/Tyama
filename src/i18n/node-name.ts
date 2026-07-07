/**
 * node-name.ts — resolve a skill-graph NodeId to a localized display name.
 *
 * Skill nodes are identified by stable slugs (`addition-within-20`,
 * `fruit-equations`, …). Those slugs are language-neutral ids, NOT display text
 * — showing them raw (or dash-spaced) surfaces English jargon like
 * "addition within 20" to a Ukrainian learner. This helper resolves the
 * `node.<id>` catalog entry, falling back to the dash-spaced slug only when a
 * name has not been authored yet (e.g. a future node), so the UI degrades
 * gracefully instead of printing a raw key.
 */

import type { LocalizedRef } from '@/core/types';

/** The resolver shape returned by `useT()`. */
type Resolve = (ref: LocalizedRef) => string;

/**
 * Localized display name for a skill node.
 *
 * @param t      - a `useT()` resolver.
 * @param nodeId - the node slug (e.g. 'addition-within-20').
 * @returns the localized name, or a dash-spaced fallback if none is authored.
 */
export function nodeDisplayName(t: Resolve, nodeId: string): string {
  const key = `node.${nodeId}`;
  const resolved = t({ key });
  // i18next echoes the key back on a miss — treat that as "no name authored".
  return resolved === key ? nodeId.replace(/[-_]+/g, ' ') : resolved;
}
