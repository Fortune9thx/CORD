# CORD — Constraint On Recursive Delegation

**Delegation may only shrink — even when the limits are written in plain language.**

CORD is a GenLayer authority lattice for agents. When one agent sub-delegates to
another, CORD settles whether the child's limits are *strictly narrower* than the
parent's — including the limits written as English sentences — and later settles
whether a particular action stayed inside them, using web evidence the validators
fetch for themselves. Bonds make a false verdict expensive.

---

## What GenLayer decides

Structured scope is checked deterministically first, with no model involved:
capability and resource sets must be covered by the parent, depth must be exactly
one deeper and at most 8, and expiry must not outlast the parent. Objective
widening is rejected before any validator is asked to think.

What is left is the part only judgment can settle. GenLayer makes two calls:

**1. SEMANTIC REVIEW** — validators read the parent's and child's natural-language
clauses and return one of:

| Verdict | Meaning | Grant becomes |
|---|---|---|
| `NARROWER_OR_EQUAL` | the child cannot exceed the parent | `ACTIVE` |
| `EXPANDS_AUTHORITY` | the child claims something the parent does not hold | `DENIED` |
| `AMBIGUOUS` | the text cannot be settled either way | `AMBIGUOUS` (locked) |
| `UNVERIFIABLE` | technical failure — no consensus, no answer | `RETRYABLE` |

`UNVERIFIABLE` is never treated as authority. It is inactive and retryable.

**2. PROVE_USE** — given an `ACTIVE` grant, an action description and HTTPS
evidence URLs, each validator independently fetches the evidence and returns
`WITHIN_SCOPE`, `OUT_OF_SCOPE` or `INCONCLUSIVE`. A fetch that fails is
`INCONCLUSIVE`, never approval — absence of evidence is not consent.

## Who loses GEN if wrong

| Action | Bond posted by | Lost when |
|---|---|---|
| `request_review` | the delegator | verdict is `EXPANDS_AUTHORITY` — the bond goes to the parent's grantor, minus the protocol fee |
| `challenge` (on an `ACTIVE` grant) | the challenger | the re-review still reads `NARROWER_OR_EQUAL` — the bond goes to the grant holder |
| `prove_use` | the acting agent | decision is `OUT_OF_SCOPE` — the bond goes to the grantor, and the grant is tainted |

Returned in full: an honest review, an ambiguous or unverifiable outcome, a
successful challenge, and any `WITHIN_SCOPE` or `INCONCLUSIVE` use. Nobody is
ever charged for a validator's inability to reach a conclusion. Payouts are
pull-only via `claim()`, so no funds are ever trapped.

## Equivalence rule

Validators must agree on the **decision and its evidence**, never on prose.

*Semantic review* — must match: the verdict class, the set of clause ids flagged
as expanding, the set flagged as ambiguous, and the prohibition-coverage flag.
May differ freely: reasoning text, raw model output. A verdict is also forced
into consistency with its own evidence before comparison: a model that answers
`NARROWER_OR_EQUAL` while naming expanding clauses is read as
`EXPANDS_AUTHORITY`, and one that answers `EXPANDS_AUTHORITY` while naming
nothing is read as `AMBIGUOUS`.

*prove_use* — must match: the decision, and the set of clause ids said to be
violated. An `OUT_OF_SCOPE` that names no violated clause is read as
`INCONCLUSIVE`, so no bond is slashed on an unsupported accusation.

Validators re-derive everything from **stored** parent and child text. No verdict
is ever accepted from a caller.

## Network

**GenLayer Studio Dev — chain `61997`** (and only 61997).

| | |
|---|---|
| RPC | `https://studio-dev.genlayer.com/api` |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| Contract address | **not deployed** — see [docs/STATUS.md](docs/STATUS.md) |

The RPC was verified live from this workspace (`eth_chainId` → `0xf22d` = 61997),
but no valid deploy key was available in the environment, so no address is
claimed. The frontend reads `VITE_CONTRACT_ADDRESS` and shows an honest
"not deployed" banner while it is unset; it never invents a grant to fill the
screen. Studio Dev state may reset.

## Fail-closed authority

`can_invoke(grant_id, actor, capability, resource)` denies unless *every* one of
these holds: the grant exists, the actor is its grantee, the capability and
resource are inside its scope, the grant is `ACTIVE`, unexpired and untainted,
and **every ancestor up to the root is equally effective**. Revoking a parent
de-authorizes its whole subtree instantly, with no bookkeeping — the check walks
the chain on every call. A missing ancestor, a cycle, or any internal
inconsistency is a denial with a stable reason string.

## Layout

```
contracts/Cord.py            the intelligent contract
contracts/cordlib/           pure logic — no genlayer import, directly testable
contracts/build_bundle.py    inlines cordlib into the single deployable file
contracts/build/             generated single-file bundle
tests/                       141 tests: pure logic, contract state machine, bundle gates
frontend/                    Vite + React + TS + Tailwind app
docs/                        architecture, audit, status, steward packet
```

## Running it

```bash
pip install pytest
python3 contracts/build_bundle.py     # -> contracts/build/Cord.bundled.py
python3 -m pytest tests/ -q           # 141 passed

cd frontend && npm install && npm run dev
```

Tests run on plain CPython: `cordlib` imports nothing from GenLayer, and
`tests/fake_genlayer.py` supplies a small GenVM stand-in that reproduces the two
behaviours safety depends on — `run_nondet_default` raising when the validator
disagrees, and each side fetching evidence independently.

## License

MIT — see [LICENSE](LICENSE). Security policy: [SECURITY.md](SECURITY.md).
