# Audit notes

Where the value is, what could go wrong, and what stops it.

## Trust boundaries

| Input | Trust | Handling |
|---|---|---|
| `msg.sender` | trusted | the only basis for authorization |
| stored grant text | **untrusted** | fenced as data in every prompt |
| `action` in `prove_use` | **untrusted** | fenced, length-capped |
| capabilities / resources | **untrusted** | fenced, length-capped, same sanitizer as clause text |
| fetched page content | **untrusted** | scripts/styles dropped, markup stripped, fenced, truncated |
| model output | **untrusted** | canonicalized; unrecognized → fails closed |
| caller-supplied verdicts | **rejected** | no entry point accepts one |

## Findings considered and addressed

**Re-rolling an ambiguous verdict.** Resubmit until a run returns favourably.
*Addressed:* the clause pair is locked by a fingerprint over normalized text,
excluding clause ids and the grant id. Cosmetic edits, new ids and new grants all
collide with the same lock. Covered by `test_cosmetic_edits_do_not_unlock_an_ambiguous_pair`
and `test_revision_to_the_same_text_still_hits_the_lock`.

**Prompt injection in clause or page text.** Text that instructs the judge to
return `NARROWER_OR_EQUAL` or `WITHIN_SCOPE`.
*Addressed:* defence in depth — fenced blocks, the controlling instruction placed
after the data, and a canonicalizer that downgrades any verdict inconsistent
with the clauses it names. Covered by `test_use_prompt_fences_hostile_page_content`.

**Forging a fence close.** The prompt's own block delimiter is a run of `=`
(`=== BEGIN/END UNTRUSTED ... ===`). An earlier version of the sanitizer
stripped only backticks and control characters while its docstring claimed
that stopped text closing its fence — it was defending a delimiter this
prompt never uses, so any clause, action description or fetched page
containing its own `===` run could forge a closing marker and have whatever
followed it read as instruction rather than quoted data.
*Addressed:* runs of `=` are collapsed before the text is embedded. Covered by
`test_sanitizer_cannot_be_used_to_forge_a_fence_close`.

**Unsanitized capability/resource tokens.** Clauses, the action and fetched
evidence were all sanitized before reaching a prompt; `capabilities` and
`resources` were joined in raw — 32 tokens × 128 chars of attacker-controlled
text per grant, on both the parent and child sides of every review.
*Addressed:* tokens go through the same sanitizer as clause text. Covered by
`test_capability_and_resource_tokens_are_sanitized_into_the_prompt`.

**SSRF through evidence URLs.** Pointing validators at `169.254.169.254`, an
internal host, or a loopback address written to slip past a naive filter.
*Addressed:* the allowlist rejects non-HTTPS, credentials in the authority,
non-default ports, the canonical loopback/private/link-local dotted forms, and
requires the host's last label to look like a real public suffix — every real
TLD begins with a letter, including punycode, and no packed-IP encoding can
satisfy that. This closes the whole family (`127.1`, `0177.0.0.1`,
`0x7f.0x0.0x0.0x1` all resolve to loopback via `inet_aton` and were each
individually accepted by an earlier, narrower version of this filter — found
by running the validator against them, not by reading it) without enumerating
encodings one at a time. What it cannot catch: an ordinary public hostname
whose DNS record resolves to a private address. Every validator resolves and
fetches independently, so the network those validators run on is the real
boundary for that case, disclosed in SECURITY.md. Covered by
`test_hostile_evidence_urls_rejected` and
`test_legitimate_evidence_urls_still_accepted`.

**Leader-supplied evidence.** A dishonest leader reporting bytes it never fetched.
*Addressed:* the validator re-fetches independently; the leader's bytes never
enter shared state. Covered by `test_both_sides_fetch_the_evidence_independently`.

**Split decision treated as approval.** Disagreement silently resolving to
"active".
*Addressed:* `strict_eq` raises on disagreement, and CORD maps that to `RETRYABLE` /
`INCONCLUSIVE` with a full refund. Covered by
`test_validator_disagreement_is_retryable_not_authority`.

**Orphaned authority after revocation.** A child still authorized after its
parent is revoked.
*Addressed:* `can_invoke` walks to the root on every call, so there is no stale
cached state to miss. Covered by `test_revoking_the_root_denies_the_child_immediately`.

**Delegation cycles / unbounded chains.** A malformed parent pointer causing an
infinite walk.
*Addressed:* the walker tracks visited ids and caps hops at `MAX_DEPTH + 1`,
failing closed on either. Covered by `test_cycle_fails_closed`.

**Rounding a slash into thin air.** Fee split creating or stranding wei.
*Addressed:* `split_slash` computes the fee and takes the remainder, so the parts
always re-add to the whole. Property-checked across amounts and rates in
`test_split_is_exact_and_loses_no_wei`.

**Trapped funds / push-payment failure.** A payout to an address that cannot
receive it reverting a settlement.
*Addressed:* settlements only ever credit an internal balance. `claim()` is
pull-only and zeroes the balance before transferring.

**Treasury fees accumulating with no reachable drain.** A protocol-fee share
credited to the treasury on every slash, with the treasury keyed by a
different expression (`self.treasury.as_hex`, checksummed) than every other
party (already-lowercased stored strings) — exactly where a key-normalization
mismatch would hide. `_credit` lowercases centrally so it is correct, but
nothing had proven it: the existing `claim()` test only ever drained an
ordinary party's balance.
*Addressed:* `_credit` normalizes every key the same way regardless of source.
Covered by `test_the_treasury_can_actually_drain_its_accrued_fees`, which
seeds a real balance and asserts the exact recipient and amount `claim()`
pays out — not proven live, since every live verdict run against a zero-bond
deployment produces a zero-amount split by construction (see
`deploy/deployments.json`'s disclosed gap on real fund movement).

**Charging for infrastructure failure.** Slashing an agent because a page was
down.
*Addressed:* `INCONCLUSIVE` and `UNVERIFIABLE` both refund in full. Covered by
`test_inconclusive_never_costs_the_agent`.

**Griefing by challenge.** Freezing someone's authority with repeated challenges.
*Addressed:* a challenge requires a bond, does not suspend the grant while it
runs, and is slashed if wrong. An ambiguous re-review refunds but changes
nothing. Covered by `test_ambiguous_challenge_refunds_without_disturbing_the_grant`.

**Wildcard prefix leakage.** `payments.*` matching `paymentsx`.
*Addressed:* prefix matching requires the separator or an exact match. Covered by
`test_prefix_wildcard_does_not_cover_sibling_with_shared_prefix`.

## Accepted limitations

- **`prove_use` is after the fact.** CORD records and prices what an agent did;
  it does not sit in the execution path. V1 is authority and evidence, not a tool
  runner.
- **`OUT_OF_SCOPE` taints rather than revokes.** A tainted grant authorizes
  nothing, but the grantor decides what happens next via `clear_taint` or
  `revoke`. Automatic revocation on a single adverse judgment was judged too
  sharp for a system whose inputs include fetched web pages.
- **No appeal window.** Review and challenge settle in the transaction that
  requests them. GenLayer's own appeal mechanism applies at the transaction
  level; CORD adds no second layer of its own.
- **Bond floors are configurable at construction and fixed thereafter.** There is
  no governance path to change them on a live deployment.
- **Clause text is public.** Everything stored is on-chain and world-readable.
  Grants should not carry secrets.
- **Wall-clock expiry.** Expiry is compared against `gl.message.datetime`, the
  timestamp carried by the message being executed. Every validator re-executing
  a call sees the identical value, so expiry cannot be a source of consensus
  disagreement. It inherits whatever precision the chain stamps messages with.
