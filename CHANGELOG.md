# Changelog

All notable changes to CORD. Dates are UTC.

## [1.2.0] — 2026-10-19

Redeployed on GenLayer Studio Dev (chain 61997) at
`0xC05bfCbeaB47Bf9e934FBE459C2a853039f26E9D`. External payouts are now delivered
for real.

### Fixed — claim() delivers the payout

- `claim()` emitted its value transfer through `gl.chain.Account(...)
  .emit_transfer`, which produces an **internal** message. Studio Dev skips a
  value transfer to an EOA carried on an internal message and refunds the value
  to the contract (`message_value_effects: {declaredBudget: 0, skipped: true,
  skippedRefunded: true}`), so the call looked successful while the recipient's
  balance never moved. `claim()` now emits an **external** message through an EVM
  interface: a typed `@gl.evm.contract_interface` handle,
  `_EoaRecipient(sender).emit_transfer(value=...)`. The write that triggers it
  carries the Studio fee estimate's External `messageAllocation` so the message
  has a non-zero budget.
- `tests/fake_genlayer.py` supplies `gl.evm.contract_interface` and records the
  external transfer into the same chain log, keeping the payout assertions
  meaningful.

### Live

- `claim()` tx
  `0xf3f3876700f71ff0b6da4d7978b4a5d9e62eab2c79f682c985acb222801348e9`: receipt
  shows `messageType: "External"`, `message_value_effects[..].phase:
  "finalized"` with no `skipped`/`skippedRefunded`,
  `message_effect_delivered: true`, and the grantor's EOA balance rose by
  **8,873,695,499,999,177 wei** net of the claim's own fee. GEN has left the
  contract. Bundle is now 44,437 bytes, sha256 `871a78ee…`.

## [1.1.0] — 2026-10-16

Redeployed on GenLayer Studio Dev (chain 61997) at
`0x4e976D69483d4d1f8bb17dF23E2137436881A307`.

### Changed — fail closed at the judgment edges

- `review_comparable()` now forces `AMBIGUOUS` when the agreed verdict is
  `NARROWER_OR_EQUAL` but `prohibitions_covered` is false. A child can only
  activate when the review explicitly confirmed the parent's prohibitions
  survived; a self-contradictory review no longer activates one.
- PROVE_USE gained a deterministic evidence gate. `all_evidence_available()`
  reports whether every submitted URL was fetched and returned a non-empty body;
  it rides inside the `strict_eq` comparable as `evidence_ok`, and
  `gate_use_by_evidence()` downgrades any substantive verdict to `INCONCLUSIVE`
  unless every side agrees the evidence was readable. A failed fetch is never
  approval. `prove_use` records now carry `evidence_ok`.
- CI: `genvm-lint check` is a blocking gate (`GENVM_VERSION` pinned), no longer
  `continue-on-error`. `genvm-linter` is pinned to `0.11.1rc2`: 0.11.0 resolves
  runner bundles from the pre-split `genlayerlabs/genvm` repository, where the
  `v0.6.0-rc*` tags do not exist and every download 404s. The runner is pinned
  to `v0.6.0-rc8`. The rc9 asset was later republished to rc10's content, which
  dropped the contract's `py-genlayer:5jycge4q...` runner, so rc8 is the newest
  bundle that still ships it. CI runs Python 3.12: the runner's
  `py-lib-genlayer-std` uses PEP 695 generics (`def inmem_allocate[T]`) that
  3.11 cannot parse.
- Frontend: a non-activating `prohibitions_covered: false` review and an
  `evidence_ok: false` use are shown explicitly rather than as ordinary states.

### Live

- A real nonzero bond (0.01 GEN) was posted, slashed on an `EXPANDS_AUTHORITY`
  verdict, and credited 0.009 GEN to the parent's grantor and 0.001 GEN to the
  treasury — verified on chain.
- `claim()` executes and zeroes the ledger, but the outgoing value transfer is
  skipped and refunded by Studio Dev (the emitted message declares a fee budget
  of `0`). No GEN has left the contract. Recorded in
  `deploy/deployments.json` and `docs/STATUS.md`.

## [1.0.0] — 2026-09-30

First deployment. Live on GenLayer Studio Dev (chain 61997) at
`0x0dE4f140aD4Df0D3d24D645A86d4fd8B5769204d`; the address, deploy transaction
and the sha256 of the deployed bundle are in `deploy/deployments.json`.

### Fixed — deploy blockers found against the live runner

Each of these was invisible to the test suite, both linters and CI, because
`tests/fake_genlayer.py` supplied the APIs the contract assumed rather than the
ones the runner has. All were established by probing the live VM.

- The bundler silently dropped `from genlayer.types import *`. isort had sorted
  it inside the region the bundler replaces wholesale, so the deployable had no
  `Address` and no `u256` and could not be imported at all. `build_bundle.py`
  now asserts every non-library import in the source survives into the bundle.
- `TreeMap` is imported from `genlayer.storage`, not `genlayer.types`.
- `gl.block` does not exist and `gl.vm.get_timestamp()` raises on chain. Time
  is read from `gl.message.datetime`, which is also the better source: it is
  part of the message, so every validator sees the identical value.
- Value leaves through `gl.chain.Account(addr).emit_transfer(...)`;
  `gl.evm.send_value` does not exist.
- `grantee`, `can_invoke`'s `actor` and `get_claimable`'s `addr` rejected
  address-typed arguments, which is how the calldata layer encodes a bare hex
  token — locking out every such caller with CORD's own "grantee required".
- The bundler wrote its output with platform newline translation, so it could
  never produce a valid deployable on Windows. Added `.gitattributes`.

### Fixed — security

- Evidence URLs accepted three loopback encodings `inet_aton` resolves:
  `127.1`, `0177.0.0.1` and `0x7f.0x0.0x0.0x1`. The host's last label must now
  look like a real public suffix, which closes the family rather than chasing
  encodings.
- `sanitize_untrusted` stripped backticks while the prompt's fence is
  `=== BEGIN/END UNTRUSTED ... ===` — it was defending a delimiter the prompt
  never uses, so quoted text could forge a closing marker. Runs of `=` are now
  collapsed.
- `capabilities` and `resources` reached the prompt unsanitized while clauses,
  the action and fetched evidence did not.

### Fixed — frontend

- The app rendered a blank page: an `async`-shaped `useEffect` returned a value
  React took as a cleanup function, unmounting the whole tree. Added an error
  boundary so a render throw can never again be indistinguishable from a dead
  deployment.
- Liveness was probed with `eth_getCode`, which returns `0x` for a GenLayer
  contract that is demonstrably live. It now uses `gen_getContractSchema`.
- The transaction classifier's consensus check skipped itself when the field
  was absent, turning a whitelist back into a blacklist. It now has its own
  test suite, built from a receipt copied off a real transaction.

### Added

- `deploy/deployments.json` — address, deploy transaction, bundle sha256, and
  the live checks run against it, including what is *not* proven.
- CI now runs `genvm-lint lint` as a gate and the frontend tests.

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
