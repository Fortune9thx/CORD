# Status

Living summary of what is proven and where. Machine-readable detail, with
transaction hashes, lives in [`deploy/deployments.json`](../deploy/deployments.json).

## Deployment

| | |
|---|---|
| Network | GenLayer Studio Dev, chain 61997 |
| Contract | `0xC05bfCbeaB47Bf9e934FBE459C2a853039f26E9D` |
| Deploy tx | `0xda9071787f37a03b1c7113b7c6458141694d51cc3ef6c3a8b085d12d54286747` |
| Consensus | `FINALIZED` / `MAJORITY_AGREE`, leader execution `SUCCESS` |
| Bundle | 44,437 bytes, sha256 `871a78ee…` (in `deploy/deployments.json`) |

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
  the treasury** (`get_claimable`).
- **External payout.** `claim()` now emits the value as an *external* message
  (`@gl.evm.contract_interface` + `emit_transfer`). The receipt records
  `messageType: "External"`, `message_value_effects[..].phase: "finalized"`
  with no `skipped`/`skippedRefunded`, `message_effect_delivered: true`, and the
  grantor's on-chain balance rises by **8,873,695,499,999,177 wei** net of the
  transaction's own fee — the 0.009 GEN credit genuinely leaves the contract and
  arrives in the EOA. This is the fix for the internal-message path, which
  emitted `messageType: "Internal"` and had its value refunded.
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

- Nothing outstanding on the payout path. The earlier internal-message skip is
  recorded in [`docs/APPEAL.md`](APPEAL.md) as the before/after the fix closes.

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
