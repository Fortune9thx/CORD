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
| Contract | `0x87a4948504c60a74d65A8Db6592DB79f639c22E0` |
| Deploy tx | `0x48ce232ad262a9c6af6b55e17aa721c264807a9fd62a821add3e70c3fb25b343` |
| Consensus | `ACCEPTED`, leader execution `SUCCESS` |
| Bundle | 50,131 bytes, sha256 in [`deploy/deployments.json`](../deploy/deployments.json) |

Run against the live contract, not a mock:

- `gen_getContractSchema` returns all 19 methods
- `get_config` reads back the constructor state
- `create_root` wrote grant `g1` with a real chain timestamp
- `can_invoke` on the active grant → `{"allowed": true}`
- after `revoke` → `{"allowed": false, "reason": "grant status is revoked"}`

That last flip is the property the design rests on, confirmed against a real
chain rather than against the test suite's fake runtime.

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
