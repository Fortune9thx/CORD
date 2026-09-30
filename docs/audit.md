# Audit notes

Where the value is, what could go wrong, and what stops it.

## Trust boundaries

| Input | Trust | Handling |
|---|---|---|
| `msg.sender` | trusted | the only basis for authorization |
| stored grant text | **untrusted** | fenced as data in every prompt |
| `action` in `prove_use` | **untrusted** | fenced, length-capped |
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
after the data, backtick and control-character stripping, and a canonicalizer
that downgrades any verdict inconsistent with the clauses it names. Covered by
`test_use_prompt_fences_hostile_page_content`.

**SSRF through evidence URLs.** Pointing validators at `169.254.169.254` or an
internal host.
*Addressed:* allowlist rejects non-HTTPS, credentials in the authority,
non-default ports, and loopback / private / link-local hosts, and requires a
dotted public domain. Covered by `test_hostile_evidence_urls_rejected`.

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
- **Wall-clock expiry.** Expiry uses `gl.block.timestamp` and inherits whatever
  precision the chain provides.
