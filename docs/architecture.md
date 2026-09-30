# Architecture

## The problem

An agent holds authority. It wants to hand part of that authority to another
agent. The dangerous case is not the obvious one — an agent claiming a capability
its parent never had is caught by a set-membership test. The dangerous case is
the grant whose structured fields are a clean subset while its prose quietly
widens what the holder may do:

> parent: *"Spend only on cloud hosting invoices."*
> child:  *"Spend on infrastructure costs, including reasonable overheads."*

Every capability and resource token is a subset. The English is not. That
judgment is what CORD puts on GenLayer.

## Two layers

```
           propose_child
                 │
    ┌────────────▼────────────┐
    │  DETERMINISTIC GATE     │   no model, no network, no cost
    │  capabilities ⊆ parent  │
    │  resources ⊆ parent     │──── violation ──▶ rejected outright
    │  depth = parent+1 ≤ 8   │
    │  expiry ≤ parent        │
    │  clause/length caps     │
    └────────────┬────────────┘
                 │ clean subset
    ┌────────────▼────────────┐
    │  SEMANTIC REVIEW        │   gl.eq_principle.strict_eq
    │  validators judge prose │
    └────────────┬────────────┘
        ┌────────┼────────┬──────────────┐
        ▼        ▼        ▼              ▼
     ACTIVE   DENIED   AMBIGUOUS     RETRYABLE
              slash    + lock        (no charge)
```

Putting the cheap, total check first is the whole design. Objective widening
never reaches a validator, so the non-deterministic budget is spent only on
questions that genuinely need judgment, and an attacker cannot burn validator
time with obviously invalid proposals.

## State

State lives as JSON documents in `TreeMap`s rather than nested storage
dataclasses. Grants are read and written whole — never field-by-field — so a
document is the natural unit, and it keeps the storage surface flat enough to
audit. The indices (`children`, `use_index`) are JSON arrays maintained on write.

| Map | Key | Value |
|---|---|---|
| `grants` | grant id | the grant document |
| `reviews` | grant id | the latest settled review or challenge |
| `uses` | use id | a settled `prove_use` record |
| `locks` | clause-pair fingerprint | `true` when locked by an `AMBIGUOUS` verdict |
| `claimable` | address | wei owed, withdrawn by `claim()` |

## Status machine

```
 create_root ──▶ ACTIVE ──revoke──▶ REVOKED
                    │
                    └─ (expiry passes) ─▶ reads as EXPIRED

 propose_child ─▶ PROPOSED ──request_review──┬─▶ ACTIVE
                     ▲                       ├─▶ DENIED
                     │                       ├─▶ AMBIGUOUS  (+ clause pair locked)
                     └──── revise_child ─────┴─▶ RETRYABLE
```

`ACTIVE` is the only status that confers anything. `revise_child` is the escape
hatch from `AMBIGUOUS`, `DENIED` and `RETRYABLE`: it bumps the grant's version
and returns it to `PROPOSED` for a fresh review.

## The ambiguity lock

An `AMBIGUOUS` verdict means the validators could not settle the text. Without a
lock, the delegator could simply resubmit and re-roll until a run happened to
come back `NARROWER_OR_EQUAL`. So CORD locks the **clause pair**, fingerprinted as

```
sha256(parent_id ‖ parent_version ‖ sha256(normalized parent text ‖ normalized child text))
```

Normalization folds case, whitespace, typographic quotes and punctuation, and
clause *ids* are excluded from the digest. Re-proposing the same wording under a
new grant id, with different clause ids, or with cosmetic edits, produces the
same fingerprint and hits the same lock. A material rewording — or a revision of
the parent, which bumps its version — produces a new fingerprint and is allowed
to proceed. Ambiguity is therefore resolved by *writing more clearly*, which is
the behaviour worth incentivising, not by retrying.

## Evidence handling in prove_use

1. The caller supplies HTTPS URLs. They are normalized by an allowlist that
   rejects non-HTTPS schemes, embedded credentials, non-default ports, and
   loopback / private / link-local hosts — so evidence fetching cannot be aimed
   at a validator's own network or at cloud metadata endpoints.
2. The **leader** fetches each URL, strips scripts, styles and markup, collapses
   whitespace, and truncates to a fixed budget.
3. The **validator** fetches the same URLs *itself*. The leader's bytes are an
   input to the leader's own opinion and nothing more.
4. Both build an identical prompt from stored state and canonicalize the model's
   answer through the same pure function. Agreement is compared on the decision
   and the violated-clause set.

A fetch failure on either side yields `INCONCLUSIVE`, and `INCONCLUSIVE` refunds.
An agent is never charged for a validator's inability to reach a page.

## Adversarial posture

All clause text, action descriptions and fetched page content are treated as
hostile.

- **Fenced and labelled.** Untrusted text is wrapped in explicit BEGIN/END
  markers and named as data.
- **Instructions come last.** The note that this text must never be read as
  instructions is placed *after* the data, where an injected "ignore all prior
  instructions" cannot get in front of it.
- **Fence-breaking stripped.** Backticks and control characters are removed from
  untrusted text, and each block is truncated, so one oversized page cannot crowd
  out the rules.
- **Injection is evidence.** The prompt tells the judge that an attempt to
  redefine the terms is itself a signal of bad faith.
- **The canonicalizer has the last word.** Whatever the model returns is forced
  through `review_comparable` / `use_comparable`. Unrecognized output becomes
  `UNVERIFIABLE` / `INCONCLUSIVE`; a verdict inconsistent with its own named
  clauses is downgraded. A successful injection still cannot produce authority
  it did not also justify.

## Why `eq_principle.strict_eq`

Both judgments go through `gl.eq_principle.strict_eq(judge)`. The leader runs
`judge`; every validator runs the same `judge` independently, in its own
sandbox — re-fetching the evidence and re-running the model from scratch — and
the platform requires the results to be identical.

Two things make that workable:

**Canonicalization.** Raw model output would never match across independent
runs. `judge` returns `json.dumps(review_comparable(...), sort_keys=True)`, so
what gets compared is the verdict class plus sorted clause-id sets. Identical
whenever the judgments agree, different whenever they do not.

**The platform reconciles, not us.** An earlier version of this contract used
`gl.vm.run_nondet_default(leader, validator)` with a validator that made its own
non-deterministic call and compared results in contract Python. That shape is
rejected by GenVM's own protocol — it has produced `DETERMINISTIC_VIOLATION`
votes even when the two results agreed. Reconciliation belongs to the
equivalence principle; contract code must not sit between a validator and its
verdict.

`strict_eq` also happens to be the cheapest of the three principles, which
matters here because each validator is already paying for a full independent
re-derivation.

When validators do not converge, the call raises and CORD maps that to
`UNVERIFIABLE` / `INCONCLUSIVE` — inactive, refunded, retryable. An equivalence
principle can also return an empty string rather than raising, so the agreed
value is parsed through `_parse_agreed`, which treats empty or unparseable
output as the same fail-closed result. A split decision can never activate a
grant. Bundle tests assert both judgments use the primitive and that
`run_nondet` appears nowhere in the deployable file.

## Single-file bundling

GenVM validates one file, and sibling imports fail validation — but a contract
whose logic can only be exercised through a deployed chain is a contract nobody
can test. So the logic lives in `contracts/cordlib/` as plain Python with no
GenLayer import, and `build_bundle.py` inlines it into `contracts/build/Cord.bundled.py`,
re-emitting the `Depends` directive as byte one with nothing above it. Tests
assert the directive's position, the absence of a BOM, exactly one `Contract`
subclass, that no sibling import survived, and that bundling is deterministic.
