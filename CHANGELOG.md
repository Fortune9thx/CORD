# Changelog

All notable changes to CORD. Dates are UTC.

## [Unreleased]

### Changed — consensus reconciliation

- Both judgments now reconcile through **`gl.eq_principle.strict_eq`** instead of
  a hand-rolled `gl.vm.run_nondet_default(leader, validator)` whose validator
  made its own non-deterministic call and compared results in contract Python.
  That shape is rejected by GenVM's own protocol — it has produced
  `DETERMINISTIC_VIOLATION` votes even when both results agreed.
  The guarantee is unchanged and arguably stronger: every validator still runs
  the whole judgment independently, re-fetching evidence and re-running the
  model, but the platform performs the comparison.
  Verified against the canonical v0.3 API reference before changing.
- An equivalence principle can return an empty string rather than raising, so
  the agreed value is parsed through `_parse_agreed`, which treats empty or
  unparseable output as the same fail-closed result.

### Added

- `describeOutcome` — a single allow-list transaction classifier. Success
  requires `FINISHED_WITH_RETURN`, an agreeing consensus vote and a terminal
  status; anything missing or unrecognized is failure. Validator disagreement,
  cancellation and timeouts each get their own honest state.
- Writes are followed to a settled outcome before success is reported, with a
  real confirming stage and a 100 × 5s budget matching the GenLayer CLI's own
  `receipt` default. Value transfers and grant creation additionally require
  `FINALIZED`, since `ACCEPTED` can still be appealed.
- Pages refetch **before** success is displayed, so the UI never reports a
  change above state that has not caught up.
- `/app/revise/:id` — the `revise_child` escape hatch from `AMBIGUOUS`,
  `DENIED` and `RETRYABLE` now has a UI, with the flagged clauses highlighted.
  It was previously unreachable from the app.
- A "finalizing" state distinct from "not found", resolved by a cheap
  id-was-issued check rather than by the failing read itself.
- Wallet resolution via EIP-6963 announcement instead of bare
  `window.ethereum`, which misses WalletConnect, Coinbase Smart Wallet and Safe.
- `consensusMaxRotations: 6` on writes, above the platform default of 3, since
  each validator here performs a full independent re-derivation.
- Security headers, including a CSP with `frame-ancestors 'none'` — every
  primary action in the app is a signed transaction.
- Docstrings are stripped from the generated bundle only. The deployable file
  went from 59,278 to 49,057 bytes, back under the ~50KB deploy trim trigger,
  while the source keeps every docstring. A test asserts both.

### Fixed

- Evidence URLs now reject numeric-encoded IP hosts explicitly
  (`2130706433`, `0x7f000001`, `017700000001` are all `127.0.0.1`) and bare
  dotted quads, rather than relying on the dotted-domain check to exclude them
  incidentally.
- The `treasury` constructor argument accepts a hex string or an
  already-decoded `Address`. Deploy tooling infers argument types from their
  shape, so the deploy could have reverted inside the constructor.
- Stale test counts across README, STATUS.md and STEWARD.md.

### Documented

- The elevated validator-timeout rate that independent re-derivation causes —
  expected, not a defect.
- Direct-signed-transaction-only requirement: invoked via another contract,
  `sender_address` is that contract, and a value transfer to it can fail
  silently. GenVM offers no way to tell the two apart in code.

## [1.0.0] — 2026-09-28

Initial build: authority lattice, bonded semantic review, `prove_use` against
independently fetched evidence, fail-closed `can_invoke`, and the app.
