/**
 * Figures quoted on the marketing page.
 *
 * These are asserted against their real sources by tests/test_frontend_stats.py,
 * which fails if either drifts. The test count sat at a stale 141 while the
 * suite had grown to 159; a number on the landing page is a claim like any
 * other, so it gets checked like one.
 */

/** Count of tests in tests/. Checked against pytest's own collection. */
export const TEST_COUNT = 172;

/** Mirrors MAX_DEPTH in contracts/Cord.py. */
export const MAX_DELEGATION_DEPTH = 8;

/** SEMANTIC REVIEW and PROVE_USE. */
export const GENLAYER_JUDGMENTS = 2;
