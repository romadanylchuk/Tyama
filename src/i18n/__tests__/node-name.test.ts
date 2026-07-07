/**
 * node-name.test.ts — nodeDisplayName resolves localized names, falls back safely.
 */

import { nodeDisplayName } from '../node-name';
import type { LocalizedRef } from '@/core/types';

describe('nodeDisplayName', () => {
  it('returns the localized name when the node.<id> key is authored', () => {
    const t = (ref: LocalizedRef): string =>
      ref.key === 'node.addition-within-20' ? 'Додавання в межах 20' : ref.key;
    expect(nodeDisplayName(t, 'addition-within-20')).toBe('Додавання в межах 20');
  });

  it('falls back to the dash-spaced slug when no name is authored (key echoed back)', () => {
    // i18next echoes the key on a miss — the helper must not print the raw key.
    const t = (ref: LocalizedRef): string => ref.key;
    expect(nodeDisplayName(t, 'some-future-node')).toBe('some future node');
  });
});
