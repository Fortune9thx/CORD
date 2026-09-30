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

## Live evidence

| | |
|---|---|
| Network | GenLayer Studio Dev, chain 61997 |
| Contract | `0x0dE4f140aD4Df0D3d24D645A86d4fd8B5769204d` |
| Deploy tx | `0xafac0b6aadd7e4b5f3764ce932d0f0dec915f40c96f27ebe36d1c508c2890093` |
| Consensus | `ACCEPTED`, leader execution `SUCCESS` |
| Bundle | 51,116 bytes, sha256 in [`deploy/deployments.json`](../deploy/deployments.json) |

Run against the live contract, not a mock. Full record, including the
transaction hashes, in [`deploy/deployments.json`](../deploy/deployments.json).

**Both judgments, both directions, on every write method.** Every one of
CORD's nine write methods has now been exercised on chain — see
`deploy/deployments.json` for the full list with transaction-level detail.

| Case | Verdict | Evidence |
|---|---|---|
| Child that genuinely narrows its parent | `NARROWER_OR_EQUAL` | `expansion_clause_ids: []`, `prohibitions_covered: true`, grant PROPOSED → ACTIVE |
| Child that widens its parent in prose only | `EXPANDS_AUTHORITY` | `expansion_clause_ids: ["c0","c1"]`, `prohibitions_covered: false`, grant PROPOSED → **DENIED** |
| Action proved against a real fetched page, within the grant | `WITHIN_SCOPE` | validators independently fetched the evidence URL |
| Action that claimed a power the grant forbade, evidence contradicted it | `OUT_OF_SCOPE` | `violated_clause_ids: ["c0"]`, grant tainted, `can_invoke` denies with status still ACTIVE |

The rejected child claimed both powers back in plain English while keeping a
strict subset of the structured capabilities, so nothing but the prose
distinguishes it — and consensus named both offending clauses by id, without
being told which they were. The same field is empty for the honest case, so
this is discrimination, not a contract that denies everything.

**The full AMBIGUOUS/DENIED escape hatch, live.** A DENIED proposal was
revised — `revise_child` bumped its version, returned it to PROPOSED — and
re-reviewed to `NARROWER_OR_EQUAL`, activating it. `challenge()` re-ran the
review on that now-ACTIVE grant (`upheld: false`, the challenger's bond
refunded, the grant unaffected). `prove_use` produced a real `OUT_OF_SCOPE`
verdict and tainted a grant; `clear_taint()` lifted it and `can_invoke`
returned to `allowed: true`. Every state transition the contract defines has
now been observed on a real chain, not only in a mock.

**The cheap check really does run first.** Proposing a child with a capability
the parent does not hold reverted with `structural widening rejected:
capability not covered by parent: admin`, and that transaction's `eq_outputs`
was `{}` — zero non-deterministic calls. Objective widening never reaches a
validator, so an attacker cannot burn validator time with obviously invalid
proposals.

**Authority is walked, never cached.** `can_invoke` on an active child
returned allowed. After revoking its **root**, the same call returned
`denied: ancestor g1: grant status is revoked`. The child's own status is
still ACTIVE — the walk to the root is what denies it, and it says which
ancestor.

### What is not proven live

`claim()` is the only path that moves GEN out of the contract, and every
other write listed above credits only an internal ledger. The GenLayer CLI
has no flag for attaching value to a payable call, so posting a real bond
requires a browser wallet or a raw signing key; neither was used here. Every
verdict above was produced on a second, identical deployment with all bonds
set to zero (address in `deployments.json`), which runs the same judgment and
settlement code for real with nothing at stake.

An adverse verdict and the slash it implies are two different milestones. The
verdicts, the state machine, and every write method are proven on chain. The
bond economics — a real nonzero credit, and `claim()` actually paying it out
— are proven by the test suite, not yet by an on-chain balance delta.

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
genvm-lint contracts\build\Cord.bundled.py
```

The bundle is generated and CI fails if the committed copy is stale, so the
sha256 in `deploy/deployments.json` can be reproduced from source.

## Threat model and known limits

[`docs/audit.md`](audit.md) — each finding with the test that covers it, and an
explicit list of what is deliberately *not* claimed.
