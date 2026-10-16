# Status

Living summary of what is proven and where. Machine-readable detail, with
transaction hashes, lives in [`deploy/deployments.json`](../deploy/deployments.json).

## Deployment

| | |
|---|---|
| Network | GenLayer Studio Dev, chain 61997 |
| Contract | `0x4e976D69483d4d1f8bb17dF23E2137436881A307` |
| Deploy tx | `0x7668d9ea87ec4ce6df2156c573d0009e07c8a101ce85df985e621b6bda669f66` |
| Consensus | `FINALIZED` / `MAJORITY_AGREE`, leader execution `SUCCESS` |
| Bundle | 44,323 bytes, sha256 `993abdd2…` (in `deploy/deployments.json`) |

## Proven live (on the deployed contract)

- Liveness: `gen_getContractSchema` returns all 19 methods.
- `get_config` reads the constructor state back.
- `create_root` writes an `ACTIVE` root with a real chain timestamp.
- `propose_child` accepts a structured subset that widens in prose.
- SEMANTIC REVIEW returns `EXPANDS_AUTHORITY` (clauses `c0`,`c1`,
  `prohibitions_covered: false`), the grant goes `PROPOSED → DENIED`, and
  `can_invoke` denies it.
- A **nonzero bond** (0.01 GEN) is posted with `msg.value`, slashed in full on
  that verdict, and credited **0.009 GEN to the parent's grantor, 0.001 GEN to
  the treasury** (`get_claimable`). The contract custodied 0.02 GEN while both
  bonds were posted.
- PROVE_USE computes and stores `evidence_ok`: `true` for a readable page,
  `false` for a host that does not resolve, `INCONCLUSIVE` either way when the
  evidence does not establish the action.

## Proven only by the test suite (not triggered on chain)

- The fail-closed review rule: `NARROWER_OR_EQUAL` with
  `prohibitions_covered: false` is forced to `AMBIGUOUS`. Not triggered live
  because a model cannot be made to return exactly that contradiction on demand.
- The evidence-gate downgrade: a `WITHIN_SCOPE`/`OUT_OF_SCOPE` over unreadable
  evidence is forced to `INCONCLUSIVE`. The flag itself is proven live; the
  downgrade needs a model that returns a substantive verdict over evidence it
  could not read, which is not reproducible on demand.

## Not proven live

- **External payout.** `claim()` executes and zeroes the ledger, but the
  outgoing `emit_transfer` value is skipped and refunded by Studio Dev because
  the emitted message declares a fee budget of `0`
  (`message_value_effects: {declaredBudget: 0, skipped: true, skippedRefunded: true}`).
  Attaching a Studio-estimated `messageAllocations` entry did not change it. No
  GEN has left the contract. This is a platform behaviour, pinned to a specific
  receipt field — not merely a missing CLI flag as the earlier record stated.

## Verify this repo

```powershell
python contracts\build_bundle.py
python -m pytest tests\ -q
python -m ruff check contracts tests
$env:PYTHONIOENCODING = "utf-8"
$env:GENVM_ALLOW_PRERELEASE = "1"
$env:GENVM_VERSION = "v0.6.0-rc8"
genvm-lint contracts\build\Cord.bundled.py
```

`GENVM_VERSION` must be pinned to the runner bundle that ships the contract's
`Depends` pin; see [`docs/DEPLOY.md`](DEPLOY.md). CI fails on a stale bundle, on
a failing test, and on a `genvm-lint check` that does not pass.
