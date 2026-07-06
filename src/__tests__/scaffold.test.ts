/**
 * Phase 1 scaffold smoke test.
 *
 * Verifies the Jest pipeline is wired up correctly. A trivial passing assertion
 * so `jest` exits 0 from this stage forward. Real substrate tests land in
 * Phases 2–5.
 */

describe('scaffold', () => {
  it('jest pipeline is wired up', () => {
    expect(true).toBe(true);
  });

  it('module system resolves correctly', () => {
    const add = (a: number, b: number): number => a + b;
    expect(add(1, 2)).toBe(3);
  });
});
