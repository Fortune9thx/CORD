# GenLayer Master Audit Prompt

A consolidated, deduplicated adversarial pre-submission audit for GenLayer
Intelligent Contract projects. Every item is drawn from a real Portal rejection,
a live-confirmed platform behaviour, or a bug found in a strict self-audit —
none of it is generic best practice.

**Portable.** Nothing here is specific to one project. Paste the whole file, or
paste §0 plus whichever sections apply.

---

## How this file is maintained

Item IDs are **section-prefixed** (`A1`, `F13`, …) so new findings append to a
section without renumbering anything else — cross-references stay valid forever.

Each item carries a confidence tag:

| Tag | Meaning |
|---|---|
| **[REJECTED]** | A real GenLayer Portal steward rejected a submission over this. Highest priority. |
| **[LIVE]** | Confirmed by live testing on a real network. |
| **[PLATFORM]** | A GenVM / network / SDK defect or hard constraint, not your code. |
| **[PATTERN]** | A design pitfall found in self-audit; not yet a live rejection. |

Items tagged **[VERIFY]** were true on a specific runtime/network at a specific
date and have been observed to change. Re-probe them before relying on them.

**Superseded findings are marked inline.** Where a later finding narrowed or
overturned an earlier one, the earlier claim is corrected in place rather than
left to contradict itself.

---

## §0 — Instructions to the auditor

You are acting as a senior GenLayer Portal reviewer performing a strict,
adversarial pre-submission audit of this Intelligent Contract project.

Do not assess whether the code runs. Assess whether a real steward would
**accept or reject** it.

Rules for this audit:

1. **Read the code.** Never mark an item PASS from memory, from a prior
   session's conclusion, or from this project's own documentation. Cite a
   file:line or a command you ran *in this session*.
2. **A prior "verified" claim is not evidence** — including one you made
   earlier in this same audit. Re-derive it. (See J5: a real replay bug was
   found only on a re-read *after* the contract had been reported PASSED
   several times.)
3. **Verify the checklist itself.** If an item below describes an API or
   pattern that does not exist in the installed SDK, that discrepancy is a
   finding to report — not something to silently apply. (See J1.)
4. **Never swap a live-proven pattern for one this checklist merely names**
   without confirming the alternative exists and is better. (See J2.)
5. **Work in priority order**: §A and §B first (highest rejection risk), then
   §C–§E, then §F–§J.

### Required output format

For every item: `PASS` / `FAIL` / `N/A`, one line, citing actual evidence.

```
A1  FAIL  contracts/X.py:212 — validator_fn only json.loads()es the leader's
          output and checks keys; never re-derives. Matches the exact text of
          three prior Portal rejections.
F13 PASS  Ran `wc -c` → 31KB source; deploy succeeded at 0x… this session.
D1  N/A   No caller-supplied URL reaches any fetch in this contract.
```

Close with:

- **Would a steward reject this today? Yes/No**, and the single most likely
  rejection reason in their words.
- Every FAIL ranked by rejection risk.
- Anything you could **not** verify in this session, stated as unverified
  rather than assumed.

---

## §A — Consensus & validator integrity

*The highest-rejection-risk section. Three separate Portal rejections in this
history came from A1 alone.*

**A1. [REJECTED ×3] The validator must independently re-derive the answer, not
check the leader's output shape.**
A `validator_fn` that only confirms well-formed JSON / correct keys / plausible
ranges / field combinations will be rejected. Three separate verbatim
rejections:
> "checks only that the leader returned well-formed answer/reasoning strings;
> it never independently derives or verifies the answer"
> "checks only verdict shape, ranges, and a few field combinations; it does not
> independently review the evidence"
> "bind every fund- or reputation-affecting output to independent assessment"

**Check:** does `validator_fn` re-acquire the evidence and re-run the judgment
from scratch, then compare a *normalized substantive field*? If it stops at
structure, this is an automatic reject.

**A2. [LIVE] Use `gl.eq_principle.prompt_non_comparative`, not a hand-rolled
`run_nondet` + second nondet call in the validator.**
A validator making its own free-standing second non-deterministic call and
reconciling in plain Python produced a real `DETERMINISTIC_VIOLATION` vote (4/5
validators) on Bradbury — *even though the results matched*. GenVM's protocol
rejects the pattern. `prompt_non_comparative` reconciles through the platform's
own `EqNonComparativeValidator` path.
**Trade-off:** no `response_format="json"` and no `images=` parameter — JSON
compliance rests on prompt wording, so the caller-side parser needs real
fallback handling.

**A3. [PATTERN] Every field anything *acts on* must be inside the equivalence
check.**
Comparing only `decision` + `confidence` while a `recommended_action_payload`
drives real execution means two validators can agree on the verdict and disagree
on the action taken. For each output field ask: does anything automate off this?
If yes it is in scope; if advisory-only, document it *and* don't wire it to
execution.

**A4. [REJECTED] Nested non-determinism fails `genvm-lint` and is a recurring
rejection.**
Exactly **one** non-deterministic call reachable per write method. The leader
must be a named `def`, never a `lambda:`. Two *sequential* top-level
eq_principle calls (fetch, then reason) count as nested even when both are named
— fold the fetch inside the single reasoning call's leader closure.
`genvm-lint check` must run on every contract file, in CI, and be *observed
green at least once*. A workflow file that exists is not evidence.

**A5. [LIVE] Independent validation is measurably heavier — expect more
TIMEOUT votes.**
Post-A1-fix probes settled 3/5 AGREE + 2 TIMEOUT and 4/5 + 1 TIMEOUT, versus
clean 5/5 before. Quorum still reached. Disclose this as an expected
characteristic of a correct validator, not a bug.

**A6. [PATTERN] Capping how many evidence items get fetched creates an
evidence-burying vulnerability.**
Every validator applies the identical first-N selection, so a submitter can put
a favourable item first and a contradicting one later, guaranteeing it is never
checked by *any* validator. This is a security regression introduced *by* a
liveness optimisation. Mitigation (not a close): the "skipped due to cap" note
must tell the adjudicator the content is **unknown, not neutral**, and forbid
rating evidence "strong" while unfetched items remain. Verify the caution text
actually reaches the LLM input, not just that it exists in source.

**A7. [PATTERN] A pre-check on declared evidence *type* cannot check fetch
*success* — and that boundary is correct.**
Whether a fetch succeeded is per-validator non-deterministic information living
inside the nondet execution. Reading it back into a deterministic pre-check
recreates the exact A1 hazard. The real check belongs in the agreed verdict's
own quality/confidence fields, which deterministic code then enforces.

**A8. [PATTERN] The contract does the arithmetic; the LLM only judges.**
Never ask the model to compute an overall/weighted score — validator rounding
divergence follows. Take per-dimension judgments, compute the total
deterministically.

**A9. [PATTERN] Echo-transcription binds the model to contract-fetched
evidence.**
Require the model to transcribe the contract-fetched excerpt and its
`content_hash` verbatim, and to quote that excerpt in its reasoning. Reasoning
describing content absent from the excerpt is rejected. Avoids a second
consensus round, which would break A4.

**A10. [PATTERN] Bind citations by integer index into a numbered list.**
The contract resolves indices to the actual submitted URLs, so a hallucinated
citation is structurally impossible. Grounding notes must be index-bound too.

**A11. [PATTERN] Validate output schema strictly, before storage.**
Exactly one score per configured dimension — no duplicates, no missing, no
unknown keys. Reject early with a specific error.

**A12. [PATTERN] Don't require exact phrasing agreement on reasoning.**
Judge structural validity (ranges, "reasonably close"). Phrasing divergence on
weak evidence is expected, not failure.

**A13. [PATTERN] Match verdict strings case-insensitively; store canonically.**
A model writing `Faithful` for `FAITHFUL` is a casing inconsistency, not
dishonesty. Fail-closed on case punishes the wrong thing.

**A14. [LIVE] Bucket definitions must be precise enough to predict, before
testing, which bucket a careful reader picks.**
Live consensus judged a *silently omitted* field as `INCOMPLETE`, not
`MISLEADING` as the test assumed — and was right per the contract's own
definitions (omission ≠ active contradiction). When live behaviour disagrees
with a pre-written test's assumption, fix the test, not the contract.

**A15. [PLATFORM] `prompt_non_comparative` can return an empty string rather
than raising.**
`agreed_text == ""` when validators don't converge → `json.loads("")` raises
`JSONDecodeError`. Catch it specifically and store `type(e).__name__`,
`str(e)[:N]`, and a truncated repr of `agreed_text`. A static "no reasoning"
fallback hides what happened.

**A16. [PLATFORM] `prompt_non_comparative` / `prompt_comparative` leaders must
return `str`, not `dict`.** `json.dumps()` parsed LLM JSON before returning it.

**A17. [PLATFORM] Cross-contract calls are forbidden inside a nondet closure**
(`SystemError: 6`). Any `.view()` precedent read happens outside the
leader/validator functions.

**A18. [LIVE] Code-generation-under-consensus has a blind spot neither
structural nor topical validation closes.**
AST validation proves *legality*; a second round judging "does this address the
request" proves *topical fit*. Neither proves absence of malicious intent — a
legitimate-sounding prompt can yield structurally legal, topically on-point code
with a hidden fund-drain. Don't merely assert this in docs: build an adversarial
fixture (a real backdoored-but-legal contract) and run it through the actual
pipeline to prove the gap mechanically.

**A19. [LIVE] An AST check keyed on `ast.Subscript` misses bare and aliased
annotations.**
`items: list[str]` was correctly rejected while `items: list` (bare) and
`items: List[str]` (via `typing`) both passed. Any storage-type or decorator
legality check needs an explicit bare-`ast.Name` branch *and* must match every
case-variant spelling.

**A20. [LIVE] `consensusMaxRotations` defaults to 3 on every chain — raise it
for multi-round writes.**
Confirmed by reading installed SDK source. A write with two sequential nondet
judgments exhausts the default budget far more easily.
`client.writeContract({..., consensusMaxRotations: N})`.

**A21. [LIVE] `FINISHED_WITH_RETURN` / `ACCEPTED` does **not** mean an
eq_principle write committed.**
Check `resultName` and `statusName` independently. `resultName: "DISAGREE"` +
`statusName: "UNDETERMINED"` means validators independently re-ran and got
genuinely different outputs (`DETERMINISTIC_VIOLATION` votes in
`lastRound.validatorVotesName`) — **no state persisted**, despite no Python
exception and the outer transaction reading fine. Hit twice in a handful of live
attempts; not rare enough to design around.
**Handling:** (a) make `resultName !== "DISAGREE" && statusName !==
"UNDETERMINED"` its own explicit success condition; (b) on UNDETERMINED retry
with a **fresh caller-supplied identifier** where the method takes one — the
"already exists" guard passes since nothing was written; where the target is
fixed by design, retry identically (confirmed to eventually succeed). Document
it in SECURITY.md. Do not claim "fully verified end-to-end" without having
observed and handled one live.

**A22. [LIVE] A below-threshold confidence verdict must be re-labelled, not
stored under its raw claim.**
A low-confidence audit correctly skipped consequences but stored
`outcome: "violation"` verbatim — rendering an indistinguishable "Violation"
badge. Override to an explicit `INCONCLUSIVE` outcome.
*Meta-finding:* the project's own regression test asserted the **buggy** value,
hiding it indefinitely. See J7.

**A23. [LIVE] A missing field and a wrong value are different failure modes.**
A correctly-reasoned response omitting `payout_amount` was force-rejected
identically to a wrong value, killing valid claims. If the correct value is
independently derivable from trusted state, fall back to it; an explicit wrong
value still rejects. Note this cuts *opposite* to fail-closed defaults — the
deciding question is whether a real fallback is derivable or merely guessed.

**A24. [LIVE] A defensive fallback must never render identically to a genuine
negative verdict.**
An unparseable-JSON fallback and a real "poor match" stored the same value and
displayed the same. A high-confidence, on-topic generation showed as flatly
rejected. Match the fallback's own exact marker and give it a distinct neutral
UI state.

**A25. [LIVE] Prefer a stable/historical endpoint over a live one for facts
about a past event.**
A `/live/flight/{ident}` endpoint genuinely drifted between two validator
fetches seconds apart, causing a real DISAGREE with zero code bug. `/history`
fixed it. If the fact is about something concluded, fetch the concluded view.

**A26. [LIVE] `gl.nondet.web.render` alone causes VALIDATORS_TIMEOUT —
no image pipeline required.**
13–18 minute timeouts observed from rendering cost alone. Default to
`gl.nondet.web.get` unless JS execution is genuinely required. If `.get()` then
can't see a JS-rendered page, disclose the "may resolve as no record found"
limitation explicitly.
Screenshot + `images=[...]` vision calls are heavier still and cause real
LEADER_TIMEOUT / VALIDATORS_TIMEOUT — confirmed via `genlayer trace` showing 0
module calls and `run_time: '0s'` (killed before round-trip). "Other contracts
work" is not evidence unless they carry an equivalent nondet payload.

**A27. [PLATFORM] Never re-encode an image with PIL inside a nondet closure.**
JPEG re-encode, PNG resize+re-encode, and `.convert()` **all three** caused
VmError crashes (`result_code: 2`, `exit_code 1`, zero module calls, no
traceback). Two were *intermittent* — passing local gltest and some live rounds
before crashing on unchanged code. Send original untouched bytes only.

**A28. [PLATFORM] `genlayer trace --round N` has a short retention window.**
Query within seconds of a round deciding. After finalization it reliably returns
`leader public data is empty` regardless of what happened. Never conclude "the
leader crashed" from a stale trace.

**A29. [PLATFORM] `exit_code 1` VmErrors occur with zero custom image code.**
There is a separate intermittent GenVM crash mode on nondet-heavy calls.
Removing custom image code removes a known controllable factor, not every
factor. Also: an identical unchanged contract succeeded once and then failed 9/9
rounds on pure LEADER_TIMEOUT an hour later — **do not treat a failed live
attempt as proof the code needs changes if a code-identical attempt already
succeeded.** Re-test at a different time first.

**A30. [REJECTED] Bind evaluations to the policy version they were made
against.**
(a) Store the policy version/hash so consumers detect stale results; (b) the
consumer gates on FINALIZED, not ACCEPTED; (c) the consumer validates the
payload's shape against the declared action type before executing — missing
fields are a hard reject, not a silent no-op.

**A31. [REJECTED ×2] Bind every consensus-relevant temporal window to fields
stored on the record.**
Never an arbitrary or freshly-computed window. Return the actual dates used, and
enforce expiry against those same returned dates.

---

## §B — Fund safety & liveness

**B1. [REJECTED] A bounded escape hatch is required when resolution may never
converge.**
> "a proposal's stake can remain locked forever if evaluation never reaches
> validator agreement… add a bounded cancellation or expiry path that returns
> the recorded stake exactly once, cannot run after evaluation, and cannot
> bypass a resolved forfeiture."

This **overturned a prior benchmark-pass conclusion** that a permissionless
resolution method sufficed. *"Permissionlessly retriable" is not "guaranteed to
converge."* Treat these as two separate questions on every project:
1. Who can call resolution?
2. What if resolution itself never converges, no matter how many retries?

**B2. [LIVE] A third liveness question: what if a party with exclusive
permission simply never acts?**
A "funded, awaiting delivery" milestone where only the provider could call the
next state-advancing method had **no exit** if they ghosted — the resolution
method only accepted a *later* status, and no working on-chain clock existed
(see F12). Funds permanently locked. Needs a permissionless or arbitrator
fallback resolving to a bounded, correctly-directed outcome — typically full
refund to whichever party is *not* at fault for the stall.

**B3. [LIVE] The escape hatch must cover *every* pre-terminal status a
fund-accepting write can leave a record in.**
Confirmed twice:
- A covenant that genuinely received GEN but never reached `min_bond` sat at
  `PENDING_BOND` with **zero** recovery path — no adversary required.
- A `slash` verdict with no treasury configured produced a status distinct from
  the one the recovery method checked, creating a permanent lock in a plausible
  non-adversarial flow.

Enumerate every status a deposit method can leave a record in and confirm the
recovery precondition covers all of them. Prefer routing every such status into
the *same* recoverable status over inventing one per branch.

**B4. [REJECTED] The contract's own accumulated balance needs a withdrawal
path.**
Protocol fees/stakes flowing into the contract's own balance (not a per-user
tracked position) strand permanently without an owner-gated withdrawal. Distinct
from B1–B3, which concern distributing *already-tracked* positions.

**B5. [REJECTED] Parimutuel payout must handle a winning side with zero
stakers.**
`total // winning_pool` either divides by zero or, if guarded, leaves no path to
return capital. Refund every staker their own stake — there is no legitimate
winner.

**B6. [PATTERN] A discretionary manual override moving the funder's own escrow
is still "a fund-affecting output not bound to independent assessment."**
Easy to judge acceptable in isolation ("they only spend their own money"), but a
steward re-reading their own rejection language literally can flag it as the
same class of gap, relocated. Prefer exactly two fund-moving paths: (a) bound to
the assessed verdict, (b) a permissionless, strictly refund-only timed fallback.
**Removing the method is cleaner than adding gates to it.**

**B7. [REJECTED] A retry built on an unverifiable precondition is an
unconditional action — capping it is not a fix.**
> "either party can send the full tranche a second time without proving the
> first transfer failed, and that extra payment can consume escrow held for
> other programs."

A prior self-review had "fixed" the uncapped version by adding `MAX_RETRIES=1`
and passed three internal rounds. Still rejected: `emit_transfer` gives contract
code **no delivery confirmation**, so neither a capped nor an uncapped retry can
distinguish "the first transfer failed" from "it succeeded and someone is
retrying." **Remove the mechanism; document the platform limitation.**
**Check:** for any payout-retry on pooled (non-segregated) custody — can the
contract verify *why* it is being called, or does it trust the caller?

**B8. [LIVE] Every fund-moving method needs a natural state-change guard.**
In the contract above, every *other* write flipped state blocking re-entry (a
status to terminal, a balance to zero) — the one method that didn't was exactly
the one a steward flagged. Enumerate every `emit_transfer` caller and ask: *if
this exact call landed twice, would the second be rejected by a state check?*
Any "it would fire again" is a live finding, cap or no cap.

**B9. [PATTERN] A fixed lifetime-count cap on a gate two opposed parties can
call is itself a griefing vector — use a cooldown.**
A count cap added to stop farming a stochastic LLM gate handed the party who
benefits from *failure* a tool to exhaust the shared budget on honest early
calls, permanently locking the gate before the counterparty got a fair chance. A
time-based cooldown bounds the rate without ever creating an exhaustible
ceiling.

**B10. [PATTERN] A fixed timeout on a resource whose real duration is
caller-defined free text is a griefing vector.**
A 30-day escape hatch silently assumes every instance runs ~30 days; free text
can describe a 1-year engagement. Make the timeout a counterparty-chosen,
min/max-bounded value committed at creation, visible before the other party
commits, never renegotiable after.

**B11. [PATTERN] Reject self-dealing between two supposedly adversarial
parties at registration.**
Where a single-stake design makes self-dealing a harmless no-op, a two-sided
arrangement lets one party stage a fake outcome against themselves off-chain.
Compare normalized addresses and reject equality outright.

**B12. [PLATFORM] `emit_transfer` to another Intelligent Contract silently
fails with no rescue path.**
Never record a contract address as a payout recipient. Always resolve to a real
EOA at the point value changes hands — thread an `on_behalf_of` parameter if
needed.

**B13. [PATTERN] `gl.message.sender_address` is not guaranteed to be an EOA,
even with zero address parameters.**
Invoked via cross-contract `.emit()`, it resolves to the *calling contract's*
address — so an "owner"/"reporter" field with no address parameters can still
hold a contract address, and a later `emit_transfer` to it silently fails (B12).
GenVM has no EOA-vs-contract check; this is a documentation-level hard
requirement (direct signed transactions only).

**B14. [LIVE] Permissionless top-ups need per-funder accounting — or the
deposit must not be permissionless.**
`fund_bond()` allowed any caller to top up, while withdrawal paid the entire
bond to the seller with no per-funder tracking: a non-seller top-up was an
irrevocable gift. Fixed by making the deposit seller-only. For any escrow open
to permissionless top-ups, trace every disbursement — if it always goes to one
fixed party, restrict the deposit.

**B15. [PATTERN] Choose the fail-closed direction by which party's cost is more
reversible.**
Default ambiguous outcomes to the bucket whose cost falls on the party
*initiating* the adversarial action (recoverable, same as losing on the merits),
not the party being acted upon (often permanent).

**B16. [PATTERN] An unauthenticated caller-supplied identity tag feeding a
reputation system is a distinct gap.**
Easy to miss because reputation is "optional and additive." Without binding to
the caller's address, anyone can attribute any outcome to any identifier. Fix:
first-claim-wins ownership via `TreeMap[str, str]` mapping identity → first
sender. A later settlement from a different sender still executes (don't revert
over a secondary concern) but silently skips the reputation update. Supports one
caller legitimately managing many tags.

**B17. [PATTERN] An unverifiable self-reported cross-reference must be
disclosed as self-reported where it is displayed.**
`mark_deployed(generation_id, contract_address)` accepts any well-formed address
with no way to confirm it holds that bytecode. Where the platform offers no
verification primitive, disclosure at the display layer is the correct fix — not
a guessed-at on-chain check.

**B18. [LIVE] EOA-directed value transfers execute only at true FINALIZED, not
ACCEPTED** — despite genlayer-js's `DECIDED_STATES` classifying ACCEPTED as
decided. A factory's balance did not decrease at ACCEPTED/READY_TO_FINALIZE.
Also: a balance check done *minutes* later cannot distinguish "moved at
ACCEPTED" from "moved at FINALIZED" — if a risk disclosure depends on that
distinction, check the balance immediately after ACCEPTED, not at the end of a
multi-step script.

**B19. [REJECTED] Bind submitted actions to the configured agent or an
independently verifiable transaction.**
> "any outsider can submit an unauthenticated over-cap action and permanently
> halt a funded mandate without evidence or validator review."

---

## §C — Idempotency, replay & state integrity

**C1. [LIVE] A write consuming an upstream approved record must track
consumption in its *own* storage.**
`form_agreement(agreement_id, negotiation_id, …)` checked `agreement_id not in
map` but never whether `negotiation_id` had already backed an agreement — the
same accepted negotiation replayed into unlimited agreements, each reserving a
counterparty's capacity for free. A caller-chosen id for the *new* commitment
does not protect the *upstream* record. Cross-contract writes cannot mark X's
record consumed from Y (F4), so the guard must live on Y.
**Check:** `assert record_id not in consumed_map` before any state mutation.

**C2. [REJECTED] One favourable comparison settles that comparison only —
never a permanent terminal state.**
For duplicate-detection / prior-art / "is this the same as X" designs, the
terminal state must be reached separately, later, and permissionlessly, once a
fixed window has elapsed with nothing open and no disqualifying ruling ever
recorded — uniformly covering the "never challenged at all" case.

**C3. [PATTERN] Enforce at most one open challenge per target.**
A single `open_<x>_id` pointer, cleared only when that challenge resolves or
expires. Without it, two independently valid challenges resolve in arrival
order, the second silently orphaning the first's effect.

**C4. [PATTERN] A "confirm after the window" method must also re-check for an
in-flight competing process** — otherwise a dispute opened late can resolve
*after* the window and be confirmed out from under.

**C5. [PATTERN] Bind a stored diff/artifact to the version it was computed
against.**
Two proposals against the same baseline, accepted in sequence, silently
overwrite each other's changes for any untouched field — no error, no trace.
Store `based_on_version` and verify it hasn't moved before applying. **General
check:** for any propose-then-apply flow, does "apply" verify the world hasn't
moved since "propose"?

**C6. [REJECTED] Hash the complete value, never a truncated prefix.**
> "the current code slices serialized state at 4,000 characters and hashes that
> sliced prefix, so a later state whose change occurs after the cutoff is
> treated as unchanged and can never be re-verified."

This arose purely from the **interaction** of two independently-correct
decisions (a size cap for cost; a hash-based unchanged-state gate) that were
never re-examined together. Three self-review rounds checked each in isolation
and missed it. **Check:** wherever a contract has both (a) size truncation and
(b) a hash/dedup check on the same value, verify explicitly which variant feeds
the hash.

**C7. [LIVE] Key normalization must be verified on *every* method, not just
create/read.**
`register_agreement`/`get_agreement` stripped the id before keying; the other
five methods taking the same parameter didn't — making a real record invisible
to them given incidental whitespace. Grep every method for the key computation
and diff-check each. Related: any address-keyed map must normalize at write
*and* every lookup; keep the checksummed form only in display fields, never in
the lookup key.

**C8. [LIVE] Order guards most-specific-first when two states are written
atomically.**
`status = PAID` and `claimed[id] = "1"` set together means the status guard
always fires first on a double-claim — the idempotency guard is permanently
unreachable and its error message never appears. Trace which guard fires first
on a repeated call.

**C9. [PATTERN] A re-entry form gates on "does an ACTIVE record exist," never
"has one ever existed"** — otherwise an action the contract still permits is
hidden forever after the first instance reaches a terminal state.

---

## §D — Input trust & injection

**D1. [PATTERN] SSRF protection on every caller-supplied fetch URL.**
Reject `localhost`/`*.localhost`, literal IPv4/IPv6 hosts, **numeric-encoded IP
hosts** (decimal/octal — `2130706433` == `127.0.0.1`), explicit ports, and
embedded credentials. Every validator's own infrastructure independently tries
to reach whatever a caller supplies.

**D2. [LIVE] Prompt-injection length bounds are broader than D1.**
Check every `str`-typed `@gl.public.write` parameter that traces forward into
*any* prompt call anywhere in the contract graph — **including a different
contract reading this one's stored value via `.view()` and embedding it.** Each
needs an explicit `assert len(x) <= N` at the write that stores it, not
"validated somewhere eventually." Confirmed missing live: intent title,
description, requirements and offer capability fields all interpolated into an
LLM prompt with no bound at all.

**D3. [LIVE] Validate small fixed-value fields against their actual set.**
A `pricing_model`/`priority` enum other code assumes needs `assert x in {...}`
at write time, not a documented assumption. Undefended enum drift is a distinct
risk from string length and was missing in the same audit.

**D4. [LIVE] Manipulation screening must cover *every* free-text field reaching
the prompt.**
An append-only log's entries fed the identical prompt as the screened
completion-report claim but were left unscreened — the "obvious" untrusted field
gets attention, a secondary one that quietly joins the same prompt gets
forgotten. Grep every string concatenated into the prompt builder.

**D5. [PATTERN] Any fact gating money or a consequential decision must be
fetched in contract code and echoed into the validated output** — so it is part
of what consensus agrees on. Never asserted by the LLM from training knowledge
with no live citation.

**D6. [LIVE] A fail-closed injection defense has a real false-positive rate.**
Identical benign PR text was flagged once and not flagged on immediate re-run —
LLM variance, not a deterministic defect. Re-run the identical call before
treating a harsh single result as a fixable bug.

---

## §E — Transaction status, finality & success classification

**E1. [REJECTED ×2, +1 recurrence] Success checks are allow-lists, never
deny-lists.**
Rejected twice consecutively for two instances:
(a) treating `UNDETERMINED`/`CANCELED`/`VALIDATORS_TIMEOUT`/`LEADER_TIMEOUT` as
equally "done" as FINALIZED; (b) the *first fix* only rejected
`txExecutionResultName === "FINISHED_WITH_ERROR"` — so a missing/undefined
result or `NOT_VOTED` fell through as success.
**Require `=== FINISHED_WITH_RETURN` explicitly; everything else throws.**
A truthy-guarded deny-list (`x && x !== SUCCESS`) lets a *missing* field pass —
seen again on a later project.
**And:** once one field is flagged, audit every other field with similar
semantics. `resultName` (AGREE/MAJORITY_AGREE = success, everything else
including undefined = not) had never been checked at all.

**E2. [REJECTED] ACCEPTED-vs-FINALIZED depends on what the UI is *claiming* —
different claims in one app legitimately differ.**
> "wait for the generated contract deployment to reach FINALIZED and confirm the
> mark_deployed transaction through consensus before showing completion."

A record being *readable* was empirically safe at ACCEPTED (verified by reading
it back through the same client well before FINALIZED). "This contract is now
live and permanent" deserves FINALIZED, since ACCEPTED can be appealed.
Two distinct gaps found: the deploy poll accepted ACCEPTED (logic correct for a
*different* read-only claim elsewhere in the same app), and a **second**
transaction recording the result was awaited only for its hash — fire-and-forget,
never polled to any status, while the UI showed success.
**Ask what claim the UI is making, not just "is this write done."**

**E3. [LIVE] Requiring FINALIZED must widen the timeout budget too.**
FINALIZED was observed several minutes past ACCEPTED (a deploy sat at ACCEPTED
8+ minutes; the CLI's own `receipt` timed out at its 500s default on the same
tx). Not raising `maxAttempts`/`intervalMs` reproduces the exact "stuck" symptom
being fixed. Match the platform's own default (CLI `receipt`: 100 × 5s).

**E4. [LIVE] A poller's stop condition must derive from the same sets used for
classification.**
A stop-set including ACCEPTED unconditionally, while the success-set required
FINALIZED, threw out genuinely successful transactions the instant they reached
ACCEPTED. Trace every status × mode combination by hand before shipping any
status-classifier change.

**E5. [PLATFORM] `waitForTransactionReceipt({status: "ACCEPTED"})` resolves on
a *different* terminal status, including CANCELED.** It appears to treat any
terminal state as satisfying the wait. Always check the resolved receipt's
actual `status_name`/`resultName`; "the promise resolved without throwing" is
not proof.

**E6. [REJECTED] Never set frontend success before the refetch that shows the
result has resolved.**
Order: submit → poll consensus → refetch state → *then* declare success. The
reverse reproduces the exact "says it worked but nothing changed" complaint.

**E7. [LIVE] UI success detection must gate on `txExecutionResultName`, not
`statusName`.**
Real Bradbury shape: `statusName: "ACCEPTED"` + `txExecutionResultName:
"FINISHED_WITH_ERROR"` for a `gl.vm.UserError` revert — checking status alone
displayed every reverted write in the app as success. Use one shared
`describeTransactionOutcome()` helper with its own unit tests. Distinct from E5:
this is the same mistake one layer up, at display logic, with a correctly
fetched receipt.

**E8. [LIVE] Revert detection needs *both* signal shapes.**
(a) a literal `"Traceback (most recent call last)"` string in the receipt JSON —
for asserts firing after prior logic; (b) `txExecutionResultName ===
"FINISHED_WITH_ERROR"` — for asserts firing immediately, with **no Traceback
anywhere**. A test string-matching only "Traceback" mis-reports every
early-firing access-control assert as "did NOT revert" (confirmed across every
check in a real run). Absence of a Traceback is inconclusive, not proof.

**E9. [LIVE] A queue backlog is a distinct failure mode from a round timeout.**
The explorer shows `Current Queue Position: N of N` before activation. A
transaction exhausting its ~1-hour validity while queued resolves to
`status_name: CANCELED`, `resultName: IDLE`, `txExecutionResultName: NOT_VOTED`,
`numOfRounds: 0` — it never reached a validator. Distinct from A21
(DISAGREE/UNDETERMINED) and A29 (LEADER_TIMEOUT).
**Diagnose:** check other accounts' transactions in the same explorer feed; if
they finalize normally, cross-check `getTransactionCount(address, "pending")` vs
`"latest"` to rule out a nonce backlog on your own account.

**E10. [LIVE] The CLI's printed write JSON is the *first round snapshot only*.**
A transaction can show `Decided: Accepted` mid-flight and still be overturned on
appeal. Poll `genlayer receipt <tx> --status FINALIZED` or a matching state read.

**E11. [REJECTED] `writeContract` returns only the tx hash, never the
contract's return value.**
Recover via `debugTraceTransaction({hash})`'s `return_data` hex, decoded with
`abi.calldata.decode()` (a **nested** export despite the `.d.ts`), checking
`decoded.get("kind") === "Return"` before trusting `.get("data")`. Using the
bare tx hash as a new record's id is a steward-flagged defect class.

**E12. [LIVE] A generic error-prettifier must special-case timeouts first.**
Extracting the first ALL-CAPS word turned "Timed out waiting for transaction …
FINALIZED" into the single word "finalized" — reading as success, not error.

---

## §F — Platform bugs & runtime constraints

*All **[VERIFY]** — several here have already changed once. Re-probe on the
specific target network before relying on any of them.*

**F1. [PLATFORM] Calldata has no float type.**
Any public method **return value** (not just arguments) containing a raw float
anywhere in a nested structure crashes every call. Invisible to gltest
direct-mode, which only roundtrips *arguments*. Stringify any
division/average/LLM decimal before returning or storing. Grep the whole
computed structure for float-producing arithmetic.

**F2. [PLATFORM][VERIFY] TreeMap value-type reliability has fluctuated.**
2026-07-30: only `TreeMap[str, str]` reliably readable post-deploy (dataclass/
scalar values deployed ACCEPTED then became permanently unreadable).
2026-08-20: dataclass/u256 values readable live on the *same* dependency hash.
**Assume neither.** Run a live probe before trusting either. Zero-risk default:
`TreeMap[str, primitive]` with composite string keys (`"{parent_id}:{index}"`)
instead of complex value types.

**F3. [PLATFORM] Two differently-typed TreeMaps with more than one bare-init
crashes gltest direct-mode deploy** (`AssertionError: Is right the same storage
type?`). A single TreeMap type per class is safe. Fix: drop the bare-init for
extra differently-typed fields and rely on the class-level annotation alone.

**F4. [PLATFORM] Cross-contract writes via `.emit()` work — asynchronously.**
They are a separate child transaction. Check state *after* it lands (poll
`getTriggeredTransactionIds`), not after the parent's ACCEPTED. Narrow real gap:
a value-carrying internal `emit()` with `on='finalized'` does not reliably
deliver — default to `on='accepted'` unless finality is specifically needed and
verified. (See also B12, C1.)

**F5. [PLATFORM] A cross-contract `.view(state=LATEST_FINAL)` against a target
whose state is only ACCEPTED is a VM-level fault, not a Python exception** — it
bypasses the caller's own try/except entirely. Wait for FINALIZED before
triggering a dependent read.

**F6. [PLATFORM] Read unavailability is real, network-wide, and can be
*sustained*, not just flaky.**
`gen_call` reads intermittently fail ("contract not found" / "failed to get
latest accepted transactions: caller error") for valid, deployed contracts. Not
fixed by redeploying, retrying account context, or forcing a finality variant.
Cross-check against `getTransaction()`'s `txExecutionResultName` before
concluding the contract is broken.
**Sustained case confirmed:** 12 retries at 5s all failed identically, then a
fresh unretried call minutes later failed identically too. Distinguish transient
from sustained by trying **one simple unretried read in isolation** — if that
alone fails cleanly, poll open-endedly for a recovery signal rather than burning
a fixed budget.
A GenLayer reviewer independently hitting this during their own verification is
real corroboration, not something to argue away — redeploy fresh and verify it
reads cleanly before responding.

**F7. [PLATFORM] One stuck unfinalized transaction can make an *entire
contract* unreadable.**
A `withdraw_fees()` call stuck at `READY_TO_FINALIZE` for hours caused
`get_owner`/`get_balance`/`get_claims_count`/`get_claims` to all fail
identically — reproduced from a plain Node script with zero frontend code. No
recovery found besides fresh redeploy. **When told "the frontend isn't reading
state," rule this out first with a frontend-free reproduction.**

**F8. [PLATFORM] A `gl.deploy_contract()` child takes dramatically longer to
become readable than a top-level deploy.** A call against a fresh child reverted
"contract not found" well after the parent tx was ACCEPTED.

**F9. [PLATFORM] Read-propagation lag after ACCEPTED is highly variable.**
Under 15s to over 180s for the *same* call shape across runs in direct
succession, same day, same contracts. A 6 × 10s budget is not sufficient; budget
20–30 × 15s for any read depending on an LLM-consensus write. Even plain non-LLM
writes showed brief real lag — give every write-then-read a few retries, never
zero.

**F10. [PLATFORM] `getBalance()` lags independently of, and behind, a
contract's own `.view()` state.** A record showing "settled" does not mean the
recipient's balance reflects it. Poll balance separately against the
formula-derived delta.

**F11. [PLATFORM] Header format.**
Either a one-line `# { "Depends": "py-genlayer:<hash>" }` or a two-line
(version-comment then Depends) form works live — do not treat the two-liner as
broken. Only the `# { "Depends": … }` line must be line 1.
**Confirmed failure mode (~1 day misdiagnosed as a network stall):** a
`# { "Seq": [{ "Depends": "…" }] }` wrapped header deploys, reaches 5/5 AGREE
and `FINISHED_WITH_RETURN`, status ACCEPTED — then **never finalizes** and stays
permanently unqueryable, indistinguishable from a network stall. The runner logs
"comment does not start with version, using default."
**Diagnostic before blaming the network:** read a view on an already-working
contract on the same network at the same moment. If that reads fine while the
fresh deploy never does, suspect the header.
Never reproduce the literal `"Depends": "` substring elsewhere with an
unbalanced quote (corrupts gltest's SDK auto-detector).
Minor: match the canonical blank line between header and first import
(cosmetic, but a reviewer reads it). Enforce **LF-only endings in committed
source**, not just normalized at deploy time — verify with `od -c | grep '\r'`,
not by inspecting the deploy script.

**F12. [PLATFORM][VERIFY] Timestamp APIs are runtime-specific — probe before
designing.**
On some pinned runtimes `datetime.now(timezone.utc)` / `time.time()` /
`gl.message_raw['datetime']` are safe for deadline comparisons without an
eq_principle call. On a *different* pinned hash, both `gl.message.datetime` and
`gl.vm.get_timestamp()` were **completely absent** — live `AttributeError` on
both, despite `gl.message.datetime` being documented in the SDK reference.
**Documentation is not proof of runtime behaviour for a specific pinned hash.**
Live-probe in isolation before trusting it (including for B1–B3 escape-hatch
timing). If absent, redesign around per-action ceilings instead of rolling
windows and disclose it.
Separately confirmed: `genvm_linter`'s `safety.py` forbids
`time.time`/`uuid.uuid4` by name but **excludes `datetime.now()`**, with a
comment saying so — it is explicitly sanctioned as deterministic.

**F13. [LIVE ×3] Bradbury deploy-size wall, ~50–53KB.**
Confirmed three times independently:
- accepted at ~53,316 bytes of **outer-encoded payload**, failed at ~53,348 (a
  ~32-byte margin);
- raw source 49,017 → 57,120 bytes (docstrings only) failed with `intrinsic gas
  too low`; trimming to 49,244 with zero functional change deployed cleanly.

Raw source bytes and outer-encoded payload are **not** directly comparable —
don't reason about margin from `wc -c` alone. Treat raw source crossing ~50KB as
the trigger to trim.

**F14. [LIVE] Bradbury enforces real gas on every writing account; other
networks don't.**
An account-funding assumption proven safe on studionet ("the provider account
never needs real GEN") failed on Bradbury with `LackOfFundForMaxFee`. Before any
multi-account live test on Bradbury: fund **every** distinct signing account
with a plain native `sendTransaction`, and check the funder's actual
`getBalance()` before choosing contract-level value amounts.

**F15. [PLATFORM] A gas/fee error can be the network's own FeeManager
reverting.**
`genlayer estimate-fees`/`deploy` failed for ~an hour, tracing to the network's
configured feeManager reverting on `messageFeeParamsBudgetFloor()` /
`quoteGasPrice()` — zero-argument view calls unrelated to the deploying
contract.
**Diagnostic:** re-run `genlayer estimate-fees --json` in isolation; if that
also fails with a reverted-view trace pointing at feeManager, it is an
infrastructure outage. No contract or flag change fixes it. Retry patiently — do
**not** guess `--fee-value` overrides, since the true fee policy can't be read
anyway. The outage is intermittent (one attempt returned an ordinary "node is at
capacity" instead), so retry a few times per interval before concluding it
cleared.

**F16. [LIVE] The CLI's active network can silently differ from the project's.**
Mid-project, `genlayer network info` reported `studio-dev` (61997) instead of
`testnet-bradbury` (4221) under the same account name, with a correspondingly
different balance — no operator action taken. Caught only because the resulting
error looked unusual. **Verify `genlayer network info` + `genlayer account`
(name, chain id, balance) immediately before every deploy.** For a project whose
entire evidence trail is anchored to one network, a silent wrong-network deploy
produces evidence that doesn't match its own claims.

**F17. [LIVE] `gl.deploy_contract(code: bytes, args: list, salt_nonce: int) ->
Address` is a real, working on-chain factory pattern** (source-as-str
constructor arg, `.encode("utf-8")`'d at deploy). Don't hand-roll around it.

**F18. [LIVE] In a factory child's `__init__`, `gl.message.sender_address` is
the *factory's* address, not the human caller's.**
The child's `__init__` runs in the factory's execution context. Capture
`gl.message.sender_address.as_hex` **before** calling `gl.deploy_contract` and
pass it explicitly as a constructor argument. Otherwise the wrong address is
stored as owner — silently, no error — and every later
`assert sender == self.sponsor` reverts for every legitimate caller.

**F19. [LIVE] Studio Network (`studionet`, 61999) is a viable fallback when
Bradbury is congested** — same consensus mechanics, no code changes.
Use genlayer-js's built-in chain presets from `genlayer-js/chains`; a
hand-rolled config with the right RPC but wrong `consensusMainContract` silently
failed every write with "no NewTransaction/CreatedTransaction event found."
Fund via the `sim_fundAccount` JSON-RPC method directly (amount must be a JSON
**number**, not a string) — the SDK's own `fundAccount` action is hard-gated to
localnet and throws against studionet even though the RPC works.

**F20. [LIVE] A hosted explorer can be down independently of the network.**
A `503 DEPLOYMENT_PAUSED` (Vercel-side) while RPC and all contract calls worked
normally. Portal evidence fields appear to reject a URL that doesn't resolve —
**load-test every explorer URL in a real browser immediately before finalizing
submission evidence**, and prefer a custom-domain explorer over a
`*.vercel.app` subdomain when both are viable.

**F21. [PLATFORM] No contract → wallet native transfer on Bradbury.**
`emit_transfer` does not actually move funds there. Off-chain settlement plus a
`mark_paid` recording pattern is required.

---

## §G — Tooling: gltest, genvm-lint, genlayer-js, CLI

**G1. [PLATFORM] Validator testability in gltest direct-mode — corrected.**
- `gl.eq_principle.prompt_comparative`'s validator **IS** testable via
  `direct_vm.run_validator()`. Confirmed by reading installed SDK source: it is
  a plain `vm.run_nondet.lazy(fn, validator_fn)`, no sandbox spawn. **This
  narrows an earlier, wider claim that it could not be tested.**
- `strict_eq`'s validator genuinely cannot be exercised
  (`ModuleNotFoundError: cloudpickle`).
- gltest's WASI-mock skips leader/validator consensus in direct mode and runs
  the leader once, so a hand-rolled `run_nondet` validator has zero direct-mode
  coverage.

**Workaround for the untestable cases:** unit-test the exact pure functions the
validator is built from (normalizers, comparators) directly against the contract
module, stubbing the `genlayer` import scoped in try/finally so it doesn't leak
into other fixtures. Document the gap rather than implying coverage that can't
exist.
**And:** never repeat a prior project's "cannot be tested here" disclaimer
without re-verifying against the installed SDK source — one such claim turned
out to be two bugs in the project's *own* test mock: a boolean override
`json.dumps()`'d into a truthy string (flipping every disagreement into
agreement), and a no-override default returning truthy regardless of input.

**G2. [LIVE] gltest API shapes that bite repeatedly.**
- `Contract` methods return `ContractFunction` descriptors, not results — reads
  need `.call()`, writes need `.transact(...)`.
- `get_contract_factory` is a **plain importable function**
  (`from gltest import get_contract_factory`), *not* a pytest fixture, despite
  the name. Confirmed a **recurring** mistake written into more than one
  project's test file, including one never run end-to-end. Run any unrun gltest
  file once and watch specifically for this before assuming it's correct.
- gltest's `accounts` fixture returns `LocalAccount` objects — use `.address`
  where a string is needed.

**G3. [PLATFORM] gltest's own pass/fail assertion helpers are broken against
real receipts.**
`tx_execution_succeeded()`/`tx_execution_failed()` check
`result["consensus_data"]["leader_receipt"][0]["execution_result"]`, but real
Bradbury receipts return `consensus_data: {}` — producing a spurious failure on
a genuinely successful write (same receipt: `status_name: ACCEPTED`,
`tx_execution_result_name: FINISHED_WITH_RETURN`, 5/5 AGREE).
`extract_contract_address()` is suspected broken by the same cause. Check
`status_name`/`txExecutionResultName` off the raw receipt instead.

**G4. [PLATFORM] `direct_vm.warp()` only patches `datetime.now()`, not
`gl.message_raw['datetime']`.**
Confirmed by reading gltest's `vm.py`: `warp()` sets `self._datetime` and
`_refresh_gl_message()` only refreshes sender/origin, never datetime. A test
relying on `gl.message_raw` for both sides of an elapsed-time comparison cannot
simulate elapsed time at all. Use `gl.message_raw` for values you only *store*;
use `datetime.now(timezone.utc)` for the live "now" side of a timeout check —
the only one test tooling can fast-forward. (See F12: it is lint-sanctioned.)

**G5. [PLATFORM] gltest mock registrations match in registration order and
return the first match.**
Re-registering an identical pattern for a second round does **not** override the
first. Call `vm.clear_mocks()` before each round's registrations, or a later
call silently reuses a stale mock.

**G6. [PLATFORM] The local toolchain can auto-upgrade to a pre-release that
breaks every pinned project.**
`genlayer-test`/`genvm-linter` auto-upgraded to `0.30.0rc2`/`0.11.1rc2` with a
reworked `bundles-v2`/`trees-v2` cache layout, failing to load a long-standing
dependency hash with a WASM "unexpected end of memory" error. Downgrading to
`genlayer-test==0.29.2` / `genvm-linter==0.11.0` did **not** fix it — the
missing runner asset was on GenLayer's release-hosting side, confirmed by
testing an unrelated already-live contract on the same hash.
**Check local gltest/genvm-lint health at the start of every session**, never
from a prior session's confirmation.

**G7. [PLATFORM] Pin `genlayer-js` to `^1.x`** (check `npm view genlayer-js
dist-tags`). A stale `^0.9.x` silently resolves to a pre-1.0 version missing
`studionet`/`testnetBradbury` chain exports, with no build warning.

**G8. [LIVE] `genlayer write/call --args` is variadic, not a JSON array.**
`--args '["task text", 0]'` is type-inferred as **one list argument** bound to
the first parameter, leaving the rest unfilled. Confirmed live: 5/5 validators
DISAGREE, `FINISHED_WITH_ERROR`, `AttributeError: 'list' object has no attribute
'strip'` — a genuine on-chain execution error the whole panel independently hit,
not a clean rejection. Correct: `--args "task text" 0`.

**G9. [PLATFORM] `genvm-lint` UnicodeEncodeError on Windows cp1252.**
Fails on its own output checkmark (`✓`). The contract is fine. Run as
`PYTHONIOENCODING=utf-8 genvm-lint check …`, and add `env: PYTHONIOENCODING:
utf-8` to any Windows-hosted CI step.

**G10. [PLATFORM] `waitForTransactionReceipt({status: FINALIZED})` can time out
on a genuinely successful deploy.** Don't treat the timeout alone as failure —
check `txExecutionResultName` via `getTransaction()` or verify the address is
readable.

**G11. [LIVE] `try/catch` does not catch genlayer-js contract `UserError`
rejections — use `Promise.allSettled` and check `settled.status`.**

---

## §H — Frontend & wiring

**H1. [PATTERN] Bind the wallet's **real** provider** via
`connector.getProvider()` from wagmi's `useAccount()`. Assuming
`window.ethereum` misses WalletConnect / Coinbase Smart Wallet / Safe.

**H2. [PATTERN] A read client must never create a fresh ephemeral account per
call.** No `account`/`provider` at all — `createClient({ chain })`, memoized as
a module-level singleton.

**H3. [PATTERN] No mock or hardcoded data standing in for a real nondet call.**
The "AI evaluation" must actually touch the chain.

**H4. [PATTERN] Every write the contract exposes — especially the real
decision entry point — needs a real UI path.** A method that exists but is never
called from the UI is a red flag.

**H5. [PATTERN] No hardcoded values that should be dynamic** — addresses, chain
config, counts, statuses only the contract should produce.

**H6. [PATTERN] No schema drift.** No UI status the contract has no code path
to set.

**H7. [PATTERN] "Connect Wallet" must actually work.** A dead button is an
instant credibility red flag.

**H8. [PATTERN] Real pending/async states on every transaction.** Given F9's
variable lag, a genuine "confirming" stage must tolerate **minutes** — not a
spinner that hangs silently or times out early.

**H9. [PATTERN] Mirror contract-side validation client-side** so users get
useful errors instead of opaque reverts.

**H10. [CONFIRMED NON-ISSUE] Do NOT flag a placeholder WalletConnect/Reown
project id.** Injected wallets work fine with it.

**H11. [LIVE] Registry fan-out reads must use `Promise.allSettled`, never
`Promise.all`.** One sibling that isn't independently finalized yet (F8) blanks
the entire page. Filter to fulfilled, silently skip rejected.

**H12. [LIVE] Distinguish "still finalizing" from "never existed" using a
separate, cheaper existence signal.**
A detail page whose only signal is a failed read shows a dead-end "not found"
for a freshly-created object. Query a cheap registry/metadata source in
parallel: registry confirms + detail fails → show a "finalizing" state with real
content and keep polling. "Not found" only when **both** fail.

**H13. [LIVE] A query hook that "hangs forever" under headless testing can be
entirely correct code.**
TanStack Query v5's default retry pauses indefinitely via
`focusManager.isFocused()`, and automated tabs commonly report
`visibilityState: "hidden"`, which real users' tabs never do. Check
`document.visibilityState`/`hasFocus()` in that same tab before concluding a
bug. To force verification, override via `Object.defineProperty` and dispatch
`visibilitychange` on **`window`**, not `document` — that's where TanStack's
`FocusManager` listens.

**H14. [PATTERN] Set baseline security headers on a wallet-connected dApp**
(`X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`). Next.js/Vercel set none by default; this is specifically
about clickjacking on transaction-triggering buttons. Verify any `script-src`
against a **production** build — a CSP clean in dev can throw a real
`unsafe-eval` violation in production from the wallet-connector stack.

**H15. [LIVE] `.eslintrc.json` silently does nothing under eslint 9+.**
`npm run lint` fails with "couldn't find eslint.config file" — a broken command
a reviewer following your own README hits immediately. Migrate to flat
`eslint.config.mjs`, and note flat config does **not** auto-exclude `.next/`:
without explicit `ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts']`
you'll lint Next's generated files and get thousands of false positives.

---

## §I — CI, evidence & submission process

**I1. [PATTERN] CI must actually run `genvm-lint check` + the test suite on
every push, and be observed green.**
`gh run list --branch <default>` must show a recent `completed:success`. A
workflow file that exists is not evidence. Passing live tests is **not** evidence
of lint-cleanliness.

**I2. [LIVE ×3] Verify CI claims against a genuinely clean environment.**
Three separate maskings in one setup pass: (a) `pnpm install --frozen-lockfile`
failed on `ERR_PNPM_IGNORED_BUILDS` for native packages with stale local
approval state; (b) standalone `tsc --noEmit` failed on `Cannot find name
'LayoutProps'` — a Next-generated type that doesn't exist until a build has run,
passing locally only because `.next/types/` was already populated; (c) a
workflow **never ran at all** because it watched `main` while the repo's default
was `master` — **zero runs is itself a signal to check for**, not something to
infer from having pushed the file.
Before trusting "should pass in CI": `rm -rf node_modules .next`, hide local-only
env files, re-run the exact CI command with only CI env vars.

**I3. [PATTERN] For Next.js App Router, replace a standalone `tsc --noEmit` CI
step with the framework's own build** — it type-checks more thoroughly *and*
generates the framework types the standalone check depends on but can't produce.

**I4. [PATTERN] Repo hygiene.** Sole-author commits (no AI co-author line);
README / LICENSE / CHANGELOG / SECURITY.md + `docs/` matching an approved
reference repo; Portal Notes checked against its exact character limit
**programmatically**, not by eye.

**I5. [REJECTED ×3 — assume you will forget this] Update *every* Portal
evidence field after any redeploy, before resubmitting.**
Three confirmed occurrences across three different projects: the code was
correctly fixed and redeployed, but the stored explorer/contract evidence URL
still pointed at the pre-fix address — rejected again on a pure evidence
mismatch, unrelated to any code gap. One cost the single one-time appeal.
Verify live (`genlayer schema <address>` against both old and new) before
concluding "the code is wrong" vs "the link is stale." **Make this a literal
checked step at the moment of resubmission, every time.**

**I6. [PATTERN] Open resubmission notes with the rejection itself.**
`"Resubmission. Prior rejection: <exact text>."` *then* the fix. Notes that only
implicitly address it make the reviewer connect the dots. Worth the character
budget within the ~1000-char limit.

**I7. [PATTERN] An appeal argues the review missed context — not "we found more
gaps and fixed them."** The latter concedes the rejection was correct and risks
a bounce to a full new cycle. Map every named item 1:1 to checkable evidence
without conceding the framing.

**I8. [LIVE] Long sessions accumulate documentation drift — actively re-check.**
What went stale specifically: hardcoded test counts predating added tests; design
adjectives describing a since-redesigned UI; a submission doc with no link to the
live app, repo, or contract. Grep final docs for any adjective, count, or claim
that was true only earlier in the same session. Also review docblocks and
comments after any architecture change — old patterns linger there.

**I9. [PATTERN] Events are a real but non-mandatory reusability signal.**
An accepted repo emits `gl.Event` after every state-mutating write; another
accepted submission shipped with zero events. Low-risk strengthening of "would
someone import this," not a rejection-avoidance item.

**I10. [LIVE] Run any relayer/keeper/indexer live at least once.**
A relayer scanning `eth_getLogs` from `fromBlock: "earliest"` against an RPC
enforcing a 10,000-block cap failed **silently, every cycle, from deployment** —
indistinguishable from "no new events yet," and undetected through extensive
manual testing. Found only by running it and reading real stderr. Chunk scans
under the cap from a recorded deploy block. **Code that compiles is not evidence
it ever produced a side effect.**

**I11. [PATTERN] An integration test must assert the expected *specific* value.**
`assert result in {"COMPLIANT", "NON_COMPLIANT", …}` only proves it didn't crash.
Pick a known-good unambiguous input and assert the specific decision. Enum
membership = structural proof; expected value = semantic proof. Both required.

**I12. [PATTERN] An access-control test must prove *both* halves per write.**
(1) the attempt reverted (E8's two signal shapes), **and** (2) the state that
write would have changed, read back afterwards, is unchanged. The revert signal
is suggestive; the unchanged-state read-back is the proof, and is what to report.

**I13. [PATTERN] "Real fund movement confirmed" needs a balance delta.**
Read the recipient's balance before and (allowing for F10's lag) after, and
assert the delta equals the formula-derived amount. "The transaction succeeded"
or "the contract's view shows settled" are not equivalent. **A 0%-settlement run
proves the mechanism moved zero funds correctly** — get at least one nonzero run
to match before claiming fund movement is proven. (See B18 on ACCEPTED vs
FINALIZED timing.)

**I14. [PATTERN] A redeploy after any consensus/validator fix requires a full
re-verification cycle.**
Old addresses can't be patched in place: redeploy → re-lint → re-test locally →
re-probe live with a real write+read against the **new** address. A purely
deterministic bugfix doesn't need the full nondet proof re-run, but it does need
the specific bug re-verified live against the new address.

---

## §J — Audit process discipline

**J1. [LIVE] Verify every checkable claim — including from this file — against
a canonical source.**
Official `genlayer-docs` raw markdown, the `genlayer-project-boilerplate` /
`intelligent-oracle` reference repos, an installed SDK's actual contents, or a
live `genlayer trace`/`call`.
**Confirmed concretely:** a generic audit template's instruction to replace
`assert cond, "msg"` with `gl.vm.UserError(...)` could not be verified to exist
**anywhere** — not in genlayer-js, not in an installed `genlayer_py`, not in the
official boilerplate, which itself uses bare `raise Exception(...)`, the exact
pattern that same checklist said never to use.
**A checklist item describing a weaker or nonexistent pattern is itself a
finding to report.**

**J2. [LIVE] Never swap a live-proven pattern for one merely named here.**
If the alternative can't be confirmed, keep the proven pattern and note the
discrepancy. This applies **mid-audit**: stop and re-verify the instant an item
conflicts with something already proven working in this exact codebase, rather
than complying automatically.

**J3. [PATTERN] Clone 2–3 independently-accepted Portal repos
(`git clone --depth 1`) and diff source, README and layout directly.** Surfaces
concrete gaps (SSRF strictness, real CI, doc structure, a reviewer-facing doc) a
self-only re-audit misses.

**J4. [PATTERN] Report and fix in rejection-risk order** — §A, §B first. Don't
patch the first thing found.

**J5. [LIVE] A prior "verified"/"passed" claim is not evidence — including one
from earlier in this same session.**
The negotiation-replay bug (C1) was found by a strict re-read **after** the
contract had been live-tested and reported PASSED multiple times. Passing tests
exercise the happy path, not every method's access-control and idempotency
surface.

**J6. [LIVE] After any fix, ask the *compound* question, not just whether the
fix is internally correct.**
Two Portal rejections (B7, C6) survived three adversarial self-review rounds
because each round interrogated what it was newly introducing, but never
re-interrogated a *different, already-reviewed* piece the new fix now composed
with.
- After capping an unbounded drain: not "is the cap correct" but **"is the
  first permitted instance independently safe?"**
- After adding a marker gate: not "does the gate work" but **"what upstream
  value feeds this marker, and has *that* been re-verified since an unrelated
  change last touched it?"**

**J7. [LIVE] A passing test can be a test written to match the bug.**
A regression test asserted `record["outcome"] == "violation"` — the buggy value —
hiding A22 indefinitely. When auditing any threshold-gated field, re-derive the
correct expected value **from the gating logic**, never trust an existing
passing assertion.

**J8. [LIVE] `pytest.raises(Exception)` around a removed method still passes.**
An `AttributeError` from calling a nonexistent method is also an `Exception` —
a false-positive coverage trap. After removing any method a security fix
depended on, replace exception-only tests with (a) an explicit
`assert not hasattr(contract, "removed_method")`, and (b) a positive test of the
actual remaining security property.

**J9. [LIVE] Budget at least two independent adversarial passes before
submission** — the second genuinely hostile re-read of an already-deployed,
already-"passed" contract is what found C1.

**J10. [LIVE] When a rejection names a specific technical claim, verify which is
actually true** — code bug vs. stale reference — by re-reading current code
*and* checking the reference. Assume neither. (This is how I5 was finally
diagnosed.)

**J11. [PATTERN] The repeatable cycle for a multi-round steward exchange:**
implement → full local test pass → deploy → live test against the real network →
fix what live testing surfaces → redeploy → re-verify live → update the
steward-resolution doc → commit/push.

---

## Appendix — Fastest high-yield checks

If time is short, these produced the most real rejections and live bugs:

| Check | Item | Why |
|---|---|---|
| Does `validator_fn` re-derive, or just check shape? | A1 | 3 Portal rejections |
| Is every fund/reputation output bound to that assessment? | A1, B19 | Same rejection family |
| Can any pre-terminal funded status strand forever? | B1–B3 | 1 rejection + 2 live locks |
| Is success an allow-list or a deny-list? | E1 | 2 consecutive rejections |
| Did every Portal evidence field get updated after redeploy? | I5 | 3 occurrences |
| Does a hash feed off truncated or full state? | C6 | Rejection from composed fixes |
| Can a retry fire on an unverifiable precondition? | B7 | Cap ≠ fix |
| Is `genvm-lint` green *in CI*, observed? | A4, I1 | Recurring rejection |
| Any float in a public return value? | F1 | Invisible to direct-mode tests |
| Raw source over ~50KB? | F13 | 3 confirmed deploy failures |
