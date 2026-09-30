# Steward packet

## Portal notes

CORD is a GenLayer authority lattice for agents. Structured limits are checked
deterministically; natural-language clauses are judged so children can only
narrow parents. `prove_use` re-fetches HTTPS evidence to decide if an action
stayed in scope. Review and challenge bonds make expansion costly. Ambiguity
stays inactive until clause text changes. `can_invoke` is fail-closed. Studio Dev
chain 61997; state may reset.

## Evidence

| Item | Value |
|---|---|
| Repository | `https://github.com/Fortune9thx/CORD` (branch `claude/vigilant-babbage-8197tv`) |
| Chain | GenLayer Studio Dev, `61997` |
| RPC | `https://studio-dev.genlayer.com/api` — verified live, `eth_chainId` → `0xf22d` |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| Contract address | **none — not deployed.** See [STATUS.md](STATUS.md) |
| Live app URL | not deployed from this workspace |
| Tests | 146 passed — `python3 -m pytest tests/ -q` |
| Bundle | `contracts/build/Cord.bundled.py`, ~58 KB, one `Contract` class, `Depends` at byte one |

The deploy key exposed to this workspace is a placeholder, not a funded 64-hex
key, so no transaction could be signed. STATUS.md records the exact command and
the exact error rather than claiming an address that does not exist.

## The decision GenLayer makes

Two, both through `gl.eq_principle.strict_eq` — the leader and every validator
run the identical judgment independently, and the platform requires the
canonicalized results to match:

1. **Semantic review** — is the child's written scope narrower than or equal to
   its parent's? `NARROWER_OR_EQUAL` / `EXPANDS_AUTHORITY` / `AMBIGUOUS`, plus
   `UNVERIFIABLE` for technical failure.
2. **prove_use** — did this action stay inside the grant, per independently
   fetched HTTPS evidence? `WITHIN_SCOPE` / `OUT_OF_SCOPE` / `INCONCLUSIVE`.

Everything objectively checkable — capability and resource subsets, depth,
expiry, lengths — is settled deterministically *before* either judgment runs, so
validators are only asked what cannot be computed.

## The adversary

Someone delegating authority that is a clean structural subset while its prose
quietly widens what the holder may do, and an agent later justifying an
out-of-scope action with evidence it controls.

Concretely defended: re-rolling an ambiguous verdict (clause-pair lock over
normalized text), prompt injection in clause and page content (fencing,
instruction-after-data, canonicalizer with the last word), SSRF via evidence URLs
(public-HTTPS allowlist), a dishonest leader (validators re-fetch), split
decisions treated as approval (raise → `RETRYABLE`, refunded), and orphaned
authority after revocation (`can_invoke` walks to the root every call).
Full list with the test that covers each: [audit.md](audit.md).

## The equivalence rule

Agreement is on the decision and its evidence, never prose.

*Review* — verdict class, expansion clause-id set, ambiguity clause-id set,
prohibition-coverage flag. *prove_use* — decision, violated clause-id set.
Reasoning text and raw model output are excluded by construction. A verdict is
forced into consistency with its own named clauses before comparison, so
`NARROWER_OR_EQUAL` alongside named expansions is read as `EXPANDS_AUTHORITY`.
Both sides derive everything from stored state; no verdict is ever accepted from
a caller.

## Who loses money

Delegator posts the review bond and loses it on `EXPANDS_AUTHORITY`. Challenger
posts the challenge bond and loses it if the grant really was narrower. Acting
agent posts the optional use bond and loses it on `OUT_OF_SCOPE`. Every
inconclusive or unverifiable outcome refunds in full — nobody pays for a
validator's failure to reach an answer. Payouts are pull-only; no funds can be
trapped.

## Reviewing this quickly

```bash
pip install pytest && python3 -m pytest tests/ -q     # 146 passed
python3 contracts/build_bundle.py                     # single deployable file
```

- The judgments: `_judge_review` and `_judge_use` in `contracts/Cord.py`.
- The rules that decide authority: `can_invoke` / `chain_effective` in
  `contracts/cordlib/core.py`.
- The prompts and the hostile-input handling: `contracts/cordlib/judgment.py`.
- What is deliberately *not* claimed: `docs/STATUS.md`.
