# Submission notes

## What CORD is

An authority lattice for agents. When one agent sub-delegates to another, CORD
settles whether the child's limits are strictly narrower than the parent's —
including limits written as English sentences — and later settles whether a
particular action stayed inside them, using web evidence validators fetch for
themselves. Bonds make a false verdict expensive. `can_invoke` fails closed.

## Where GenLayer is load-bearing

Two judgments, both reconciled by `gl.eq_principle.strict_eq`:

1. **SEMANTIC REVIEW** — `NARROWER_OR_EQUAL` / `EXPANDS_AUTHORITY` /
   `AMBIGUOUS` / `UNVERIFIABLE`, over natural-language clause pairs.
2. **PROVE_USE** — `WITHIN_SCOPE` / `OUT_OF_SCOPE` / `INCONCLUSIVE`, over HTTPS
   evidence each validator fetches independently.

Deterministic subset checks run first, with no model and no network: capability
and resource coverage, depth, expiry. Objective widening is rejected before any
validator is asked to think, so non-determinism is spent only on questions that
genuinely need judgment and an attacker cannot burn validator time with
obviously invalid proposals.

`strict_eq` re-executes the whole judgment inside every validator and requires
the canonicalised results to match. The judge function returns
`json.dumps(review_comparable(...), sort_keys=True)` — a verdict class plus
sorted clause-id sets — because raw model prose would never match across
independent runs while genuinely equivalent judgments do.

`UNVERIFIABLE` and `INCONCLUSIVE` are technical failures: inactive, refunded,
retryable, never authority.

## Steward hardening

Two rules only ever mattered at the edge, where a judgment and its own evidence
disagree. Both now fail closed.

**A narrower verdict that admits it did not cover the prohibitions cannot
activate.** `review_comparable()` forces `AMBIGUOUS` when the agreed verdict is
`NARROWER_OR_EQUAL` and `prohibitions_covered` is false. Before this, a review
could return `NARROWER_OR_EQUAL` while its own `prohibitions_covered` flag said
the parent's prohibited actions were not shown to survive — and the child would
activate anyway. A child now clears that bar only when the review explicitly
confirms the prohibitions carried through.

**A substantive PROVE_USE verdict rests on evidence that was actually read.**
`judgment.all_evidence_available()` decides, deterministically, whether *every*
submitted evidence URL was fetched and returned a non-empty body. That flag rides
inside the `strict_eq` comparable as `evidence_ok`, and after consensus
`core.gate_use_by_evidence()` downgrades any `WITHIN_SCOPE`/`OUT_OF_SCOPE` to
`INCONCLUSIVE` unless it is true on every side. A fetch that fails, or a page
with an empty body, can never become approval. `prove_use` records now carry
`evidence_ok` so the fact is auditable after the run.

Both rules are covered by adversarial contract tests, including the case where
validators *agree* on a self-contradictory review.

## Live evidence

| | |
|---|---|
| Network | GenLayer Studio Dev, chain 61997 |
| Contract | `0xC05bfCbeaB47Bf9e934FBE459C2a853039f26E9D` |
| Deploy tx | `0xda9071787f37a03b1c7113b7c6458141694d51cc3ef6c3a8b085d12d54286747` |
| Consensus | `FINALIZED` / `MAJORITY_AGREE`, leader execution `SUCCESS` |
| Bundle | 44,437 bytes, sha256 in [`deploy/deployments.json`](../deploy/deployments.json) |

Run against the live contract, not a mock. Full record, including the
transaction hashes, in [`deploy/deployments.json`](../deploy/deployments.json).

**Both judgments, both directions.** The prior deployment had every one of
CORD's nine write methods exercised on chain; this deployment re-proves the
paths the steward fix touches.

| Case | Verdict | Evidence |
|---|---|---|
| Child that widens its parent in prose only | `EXPANDS_AUTHORITY` | `expansion_clause_ids: ["c0","c1"]`, `prohibitions_covered: false`, grant PROPOSED → **DENIED**, bond slashed |
| Real readable evidence page, action it does not establish | `INCONCLUSIVE` | `evidence_ok: true` — readable evidence is necessary, not sufficient |
| Real unreachable evidence URL | `INCONCLUSIVE` | `evidence_ok: false` — the deterministic evidence flag computed live |

**A nonzero bond really moves through the contract.** A 0.01 GEN review bond was
posted with `msg.value`, an `EXPANDS_AUTHORITY` verdict slashed it in full, and
the contract credited the split — 0.009 GEN to the parent's grantor and 0.001 GEN
to the treasury, readable via `get_claimable`. The contract's own balance held
0.02 GEN while both bonds were posted. This used `genlayer-py`'s
`write_contract(value=...)`, which attaches `msg.value`; the CLI has no flag for
it, which is why the earlier record could not show this.

**The cheap check really does run first.** Proposing a child that widens its
parent's structured scope still reverts deterministically, before any validator
runs — the property the whole design rests on.

**GEN really leaves the contract.** The bond credit is delivered, not just
recorded. `claim()` emits the payout as an *external* message
(`@gl.evm.contract_interface` + `emit_transfer`), the write carries the Studio
fee estimate's External `messageAllocation`, and the grantor's on-chain EOA
balance rises by the slashed amount. Claim tx
`0xf3f3876700f71ff0b6da4d7978b4a5d9e62eab2c79f682c985acb222801348e9`: the
receipt shows `messageType: "External"`, `message_value_effects[..].phase:
"finalized"` with no `skipped`/`skippedRefunded`, `message_effect_delivered:
true`, and `external_message_events[0].executionRecorded: true`. The grantor's
balance went `1962009940749976244 → 1970883636249975421` (**+8,873,695,499,999,177
wei** net of the claim's own fee), and the contract balance dropped to the
treasury's 0.001 GEN share. The earlier internal-message path is recorded in
[`deploy/deployments.json`](../deploy/deployments.json) as `previousDeployments`.

### What is not proven live

The two steward downgrades are proven by the test suite, not by a live trigger.
Forcing a model to return exactly `NARROWER_OR_EQUAL` + `prohibitions_covered
false`, or `WITHIN_SCOPE` over evidence it could not read, is not reproducible on
demand. Their plumbing is visible live (`prohibitions_covered` reads back,
`evidence_ok` is computed true and false), but the specific downgrades were not
forced on chain. Nothing else is outstanding.


## Bonds

| Action | Bond by | Lost when |
|---|---|---|
| `request_review` | delegator | `EXPANDS_AUTHORITY` → parent's grantor, minus fee |
| `challenge` | challenger | re-review still `NARROWER_OR_EQUAL` → grant holder |
| `prove_use` | acting agent | `OUT_OF_SCOPE` → grantor, and the grant is tainted |

Everything else refunds in full. Nobody is charged for a validator's inability
to reach a conclusion. Payouts are pull-only via `claim()`.

## Verifying this repo

```powershell
python contracts\build_bundle.py
python -m pytest tests\ -q
python -m ruff check contracts tests
$env:GENVM_ALLOW_PRERELEASE = "1"
$env:GENVM_VERSION = "v0.6.0-rc8"
genvm-lint contracts\build\Cord.bundled.py
```

`GENVM_VERSION` is pinned to the runner bundle that ships the contract's
`Depends` pin; see [`docs/DEPLOY.md`](DEPLOY.md) for why rc8 and not the latest.

The bundle is generated and CI fails if the committed copy is stale, so the
sha256 in `deploy/deployments.json` can be reproduced from source.

## Threat model and known limits

[`docs/audit.md`](audit.md) — each finding with the test that covers it, and an
explicit list of what is deliberately *not* claimed.
