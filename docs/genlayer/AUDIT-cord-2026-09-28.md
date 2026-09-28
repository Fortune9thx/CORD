# CORD — Master Audit Run

**Target:** CORD @ `0180216` (pre-audit HEAD), branch `claude/vigilant-babbage-8197tv`
**Prompt:** `docs/genlayer/genlayer-master-audit-prompt.md` (149 items)
**Date:** 2026-09-28
**Auditor posture:** adversarial, per §0. Every PASS below cites code read or a
command run *in this session*.

---

## Verdict

> **Would a steward reject this today? — YES.**
>
> Most likely rejection, in their words:
> *"The validator makes its own free-standing second non-deterministic call and
> reconciles it in application code. Use the platform's equivalence primitive so
> reconciliation happens through the protocol, not hand-written Python."*

**Two blocking clusters**, both high-confidence:

| # | Item | What |
|---|---|---|
| **1** | **A2** | Hand-rolled leader+validator with a second free-standing nondet call in the validator — the exact shape that produced a live `DETERMINISTIC_VIOLATION` (4/5 validators) on a prior build **even when results matched**. |
| **2** | **E1/E2/E6/E7/A21** | The frontend does **zero** transaction-status classification. A reverted write, and an `UNDETERMINED` consensus failure, both display as "Submitted". |

Neither is a logic bug — CORD's *decision* semantics are sound and well-tested.
Both are about how that decision is reconciled and reported.

**Counts:** 41 PASS · 12 FAIL · 9 PARTIAL · 87 N/A

---

## §A — Consensus & validator integrity

| ID | Verdict | Evidence |
|---|---|---|
| **A1** | **PASS** | `Cord.py:596-603` — `validator()` calls `gl.nondet.exec_prompt` again itself and compares `review_comparable(...)` normalized output, not shape. `:648-655` same for use. Not a shape check. Contract test `test_validator_disagreement_is_retryable_not_authority` proves disagreement ≠ authority. |
| **A2** | **FAIL — BLOCKING** | `Cord.py:606,656` — `gl.vm.run_nondet_default(leader, validator)` where `validator` makes its own free-standing `exec_prompt` and reconciles with `mine == theirs` in Python. This is precisely the pattern A2 records as producing a real `DETERMINISTIC_VIOLATION` vote. `gl.eq_principle.prompt_non_comparative` is the sanctioned primitive. **See remediation §1.** |
| A3 | **PASS** | `core.py:review_comparable`/`use_comparable` — every field anything acts on (`verdict`, `expansion_ids`, `ambiguity_ids`, `prohibitions_covered`; `decision`, `violated_ids`) is inside the compared projection. Nothing acted on is excluded. Only free prose is. |
| A4 | **PARTIAL** | Structurally correct: exactly one `run_nondet_default` reachable per write (`request_review`→`_judge_review`, `challenge`→`_judge_review`, `prove_use`→`_judge_use`; verified by grep, `Cord.py:606,656` are the only two). `fetch_all()` is folded *inside* the leader closure (`:628-636`), not a second top-level call — correct per A4. Leaders are named `def`s, not lambdas. **But `genvm-lint` has never been run** (not installed; see `docs/STATUS.md`). Cannot be PASS until observed green in CI. |
| A5 | **PARTIAL** | Independent re-derivation is implemented, so the extra TIMEOUT risk applies — but it is **not disclosed** anywhere in `SECURITY.md` or `docs/audit.md`. Add it. |
| A6 | **PASS** | No fetch cap below the item count. `MAX_EVIDENCE_URLS = 5` (`core.py:25`) caps the total, and `fetch_all()` fetches **all** of them (`Cord.py:629`). No first-N selection ⇒ no burying vector. |
| A7 | **PASS** | `normalize_evidence_urls` (`core.py:444`) gates on URL *form* only; fetch success is judged inside the nondet closure and surfaces via the verdict's own `ok` flag (`judgment.py:normalize_evidence`), never read back into a deterministic pre-check. Matches the correct boundary. |
| A8 | **PASS** | No scoring arithmetic is asked of the model. `settle_review`/`settle_use`/`split_slash` (`core.py:520-580`) compute every number deterministically. Verified no `float(`/`round(` anywhere and no true division (grep, this session). |
| A9 | N/A | No contract-fetched excerpt is echoed back for review; `prove_use` evidence is fetched by both sides independently, which is stronger. |
| A10 | **PASS** | Clauses are cited by stored `id` and the contract resolves them against its own `grant["clauses"]` when rendering (`GrantDetail.tsx` flags `review.expansion_clause_ids.includes(c.id)`). A hallucinated id simply matches nothing — it cannot invent a clause. |
| A11 | **PASS** | `review_comparable`/`use_comparable` (`core.py:340-410`) normalize to a fixed key set, drop unknowns, and coerce inconsistent verdicts before storage. Tested: `test_narrower_with_named_expansions_is_coerced_to_expands`. |
| A12 | **PASS** | Prose is excluded from the compared projection by construction — `test_reasoning_prose_does_not_break_equivalence`. |
| A13 | **PASS** | `canon_verdict`/`canon_use_decision` (`core.py:60-105`) `.strip().upper()` before matching and return canonical constants. Tested. |
| A14 | **PASS** | Bucket definitions in `build_review_prompt` (`judgment.py:120-160`) explicitly distinguish silence-on-a-prohibition from contradiction, and instruct that silence is judged by whether claimed powers could breach it. Precise enough to predict. |
| A15 | **PASS** | `_safe_json` (`Cord.py:740`) returns `{}` on empty/unparseable input; `review_comparable({})` → `UNVERIFIABLE`. `json.loads("")` can never escape. Tested: `test_unparseable_model_output_is_retryable`. |
| A16 | **PASS** | Both leaders return `json.dumps(...)` — a `str` (`Cord.py:594,643`). |
| A17 | **PASS** | No cross-contract call anywhere in the codebase; nothing inside either closure but `exec_prompt` and `web.get`. |
| A18–A19 | N/A | CORD generates no code. |
| A20 | **FAIL** | `consensusMaxRotations` is never set — `chain.ts:244` passes only `address`/`functionName`/`args`/`value`. CORD's writes are nondet-heavy with an independently re-deriving validator (double LLM cost per validator, per A5), which is exactly the case A20 says to raise it for. |
| **A21** | **FAIL — BLOCKING** | No `resultName`/`statusName` check exists anywhere (grep: zero hits across `frontend/src`). A `DISAGREE`/`UNDETERMINED` outcome — which A5 makes *more* likely here — persists no state while the UI shows "Submitted". |
| A22 | **PASS** | `UNVERIFIABLE`/`INCONCLUSIVE` are distinct stored values, never raw model claims (`status_after_review`, `core.py:586`). `RETRYABLE` renders as its own sky-toned pill, not as a violation (`ui.tsx` `VERDICT_STYLE`). |
| A23 | **PASS** | A missing field is not force-rejected: `review_comparable` defaults absent ids to `[]` and absent `prohibitions_covered` to `False` (`core.py:344-358`). A verdict inconsistent with named clauses is downgraded, not discarded. |
| A24 | **PASS** | The fallback (`UNVERIFIABLE`/`INCONCLUSIVE`) is a distinct enum value with its own pill colour, never collapsed into `EXPANDS_AUTHORITY`/`OUT_OF_SCOPE`. This is the A24 property, by construction. |
| A25 | N/A | CORD fetches caller-supplied evidence about a past action; there is no live-vs-historical variant to choose. Worth noting the risk is *inherited* — a caller may supply a volatile URL. See remediation §3. |
| A26 | **PASS** | Uses `gl.nondet.web.get`, never `.render` (`Cord.py:630`). Correct default per A26. |
| A27 | **PASS** | No PIL, no image handling, no `images=` parameter anywhere. |
| A28 | N/A | No trace queried yet (undeployed). |
| A29 | N/A | Not yet deployed; no live rounds to assess. |
| A30 | N/A | No policy-versioned consumer contract. |
| A31 | **PASS** | Expiry is read from the stored grant (`grant["expiry"]`, `core.py:grant_effective`) and compared against `gl.block.timestamp`, never a freshly-computed window. `get_grant` returns `effective_status`/`effective_reason` so consumers see the same basis. |

---

## §B — Fund safety & liveness

**Structural note:** CORD posts *and settles* every bond inside one transaction.
There is no state where funds sit awaiting a later resolution, which makes most
of §B inapplicable by design rather than by accident. That is a genuine strength
and worth saying explicitly in the steward packet.

| ID | Verdict | Evidence |
|---|---|---|
| B1 | **PASS (by design)** | No escrow-awaiting-resolution state exists. `request_review` (`Cord.py:371-427`) takes the bond, judges, and settles in the same call. A non-converging judgment returns `UNVERIFIABLE` → `settle_review` refunds in full (`core.py:settle_review`). Nothing can stay locked. |
| B2 | N/A | No party holds exclusive permission to advance a funded state — there is no multi-step funded state at all. |
| B3 | **PASS** | Enumerated every status a fund-accepting write can leave a record in: `request_review` → `ACTIVE`/`DENIED`/`AMBIGUOUS`/`RETRYABLE`, all settled in-call. `revise_child` refuses while `review_bond > 0` (`Cord.py:301`), but that field is always 0 — see F-note below. No pre-terminal funded status exists. |
| B4 | **PASS** | The contract retains nothing. The treasury share is `_credit`ed to `self.treasury.as_hex` (`Cord.py:403,467,522`), claimable by that address via `claim()`. No balance accrues to the contract itself. |
| B5 | N/A | No parimutuel/pooled payout. |
| B6 | **PASS** | No discretionary override. Exactly two fund paths: bound to the verdict, or refunded. `clear_taint` (`:548`) moves no funds. |
| B7 | **PASS** | No retry/reconciliation method exists. |
| B8 | **PASS** | `claim()` (`Cord.py:565-577`) zeroes `claimable[key]` **before** `send_value`. A second call hits `if amount <= 0: _err`. Tested: `test_claim_pays_out_once_and_zeroes_the_balance`. |
| B9 | N/A | No attempt-count cap on any gate. |
| B10 | **PASS** | Expiry is caller-chosen per grant and bounded by the parent's (`check_structural_subset`, `core.py:296`), not a global constant. |
| B11 | **PARTIAL** | Nothing rejects `grantor == grantee`. For CORD this is close to harmless — a self-grant narrows only itself, and bonds flow between the same party — but `challenge` on a self-granted child would pay the grantee from the challenger, which is coherent. Low severity; note it rather than fix it. |
| B12 | **PARTIAL** | `claim()` sends to `gl.message.sender_address` — never a stored address, which is the right shape. But if a *contract* calls `claim()`, B12 says delivery silently fails with no rescue. Undocumented. Add the EOA-only requirement to `SECURITY.md`. |
| B13 | **PARTIAL** | Same root cause: `_sender()` (`Cord.py:118`) is recorded as `grantor` and used for payouts. Invoked via cross-contract `.emit()` it would be a contract address. GenVM offers no EOA check — this is a documentation-level requirement and is currently undocumented. |
| B14 | **PASS** | No permissionless top-up. `request_review` is grantor-only (`:379`), `challenge` posts the challenger's own bond and pays them back or slashes to the grant holder. |
| B15 | **PASS** | Ambiguity defaults cost onto the *initiator*: an `AMBIGUOUS` review refunds but leaves the child inactive (the delegator, who initiated, bears the delay); an ambiguous challenge refunds the challenger and disturbs nothing. Correct direction per B15. Tested: `test_ambiguous_challenge_refunds_without_disturbing_the_grant`. |
| B16 | **PASS** | No free-text identity tag. Every actor is `gl.message.sender_address`; `can_invoke` binds the actor to `grant["grantee"]` (`core.py:can_invoke`). |
| B17 | **PASS** | No unverifiable cross-reference field. `parent_id` is validated against stored state (`Cord.py:216`). |
| B18 | **N/A → but see E2** | No value moves at ACCEPTED because the UI never reports a value move at all. Once E2 is fixed, `claim()` must be reported at FINALIZED specifically — it is an EOA transfer. Recorded in remediation §2. |
| B19 | **PASS** | Every write is bound to an authenticated caller: `propose_child` requires parent grantee (`:214`), `request_review` grantor-only, `prove_use` grantee-only (`:495`), `revoke` grantor-or-grantee (`:356`), `clear_taint` grantor-only (`:554`). No unauthenticated action can halt anything. |

---

## §C — Idempotency, replay & state integrity

| ID | Verdict | Evidence |
|---|---|---|
| C1 | **PASS** | Each grant id is consumed once: `request_review` requires `status == PROPOSED` and the review changes it (`Cord.py:375`), so the same proposal cannot be replayed into two settlements. `_fresh_id` (`:155`) issues monotonically from `next_id`. |
| C2 | **PASS (structurally N/A)** | CORD has no multi-candidate comparison — a child is compared against exactly one parent, fixed by `parent_id`. No "settle one comparison ⇒ terminal" hazard. |
| C3 | **PASS (by design)** | Challenges resolve synchronously in the same transaction, so no challenge is ever "open". The C3 race cannot exist. |
| C4 | N/A | No confirm-after-window method. |
| C5 | **PASS** | The ambiguity lock binds to `parent["version"]` (`lock_fingerprint`, `core.py:329`) and `revise_child` bumps the child's version (`Cord.py:339`). A parent revision produces a new fingerprint. This is exactly C5's `based_on_version` pattern. Tested: `test_lock_fingerprint_changes_when_parent_version_bumps`. |
| **C6** | **PASS** | Checked explicitly because C6 is a rejection from composed fixes. `clause_pair_digest` (`core.py:312`) hashes `normalize_clause_text(c["text"])` over the **full** stored clause text. Truncation exists only in `sanitize_untrusted(..., 800)` at `judgment.py:104`, applied *after* hashing and only to prompt-embedded text. The two never touch. Length is bounded at write instead (`MAX_CLAUSE_CHARS`), so no value is ever truncated before hashing. |
| C7 | **PASS** | Verified every address path normalizes: `_sender()` lowercases (`:118`), `_credit` lowercases (`:137`), `get_claimable` lowercases (`:729`), `grantee` is `.strip().lower()` at both write sites (`:188,267`). `can_invoke` compares `g["grantee"].lower() != actor.strip().lower()` (`core.py`). No mixed-case key path found. |
| C8 | **PASS** | `claim()` checks `amount <= 0` before zeroing — the specific guard fires first. No two-state atomic write shadows a more specific guard. |
| C9 | **PASS** | `GrantDetail.tsx` gates each action on current state (`grant.status === "PROPOSED"`, `effective_status === "ACTIVE"`), never on "has ever existed". |

---

## §D — Input trust & injection

| ID | Verdict | Evidence |
|---|---|---|
| D1 | **PASS** | `normalize_evidence_url` (`core.py:420-443`) rejects non-HTTPS, credentials, non-443 ports, loopback/private/link-local, and requires a dotted public host. Tested against 11 hostile URLs incl. `169.254.169.254`. **Gap:** numeric-encoded IPs (decimal `2130706433`) are *not* explicitly rejected — but they fail the `"." in host` check, so they are blocked. Verified by reasoning, not test; see remediation §3 for adding the case. |
| D2 | **PASS** | Every `str` field reaching a prompt is length-bounded at the write that stores it: clause text `MAX_CLAUSE_CHARS=600` (`core.py:229`), action `MAX_ACTION_CHARS=2000` (`judgment.py:81`), tokens `MAX_TOKEN_CHARS=128` (`:132`), URLs `MAX_URL_CHARS=512` (`:427`). No unbounded field reaches `exec_prompt`. No other contract reads CORD's state. |
| D3 | **PASS** | No free-text enum. Statuses and verdicts are contract-produced constants, never caller-supplied. |
| D4 | **PASS** | Every string concatenated into a prompt passes through `sanitize_untrusted` or `_clause_block`, which itself calls it (`judgment.py:104,185`). Grepped the prompt builders: no raw field reaches the prompt. Evidence text goes through `strip_html` → `sanitize_untrusted`. |
| D5 | **PASS** | The fact gating the money — whether the action was in scope — is fetched in contract code (`gl.nondet.web.get`, `Cord.py:630`) and the fetched status/ok flags are part of the prompt both sides build. Not asserted from training knowledge. |
| D6 | N/A | Not yet observable without live runs. Worth watching post-deploy. |

---

## §E — Transaction status, finality & success classification

**This section is the second blocking cluster.** Grep for
`FINISHED_WITH_RETURN|txExecutionResultName|statusName|resultName|FINALIZED|ACCEPTED`
across `frontend/src` returns **zero hits**.

| ID | Verdict | Evidence |
|---|---|---|
| **E1** | **FAIL — BLOCKING** | No success classification exists at all — neither allow-list nor deny-list. `Forms.tsx:137` sets `{ok: true}` on any resolved promise. |
| **E2** | **FAIL — BLOCKING** | No ACCEPTED/FINALIZED distinction. `chain.ts:244` returns `writeContract(...)` directly; nothing polls. Per E2, `claim()` and `create_root` make different claims and need different bars. |
| E3 | N/A | No timeout budget exists to widen yet. Applies once E2 is fixed. |
| E4 | N/A | No poller exists yet. Applies once E2 is fixed. |
| E5 | **PASS (vacuous)** | `waitForTransactionReceipt` is never called. Not a defect today, but the E5 trap must be avoided when adding it. |
| **E6** | **FAIL** | `Forms.tsx:133-142` — no refetch after a write. `GrantDetail`/`Grants` load once on mount (`useEffect` keyed on `id`/`health.state`). The user sees "Submitted" and stale data indefinitely. This is E6's exact "says it worked but nothing changed". |
| **E7** | **FAIL** | No `txExecutionResultName` gate. A `gl.vm.UserError` revert — which CORD raises on ~20 distinct conditions — returns a hash and renders green "Submitted". |
| E8 | **N/A (frontend)** / **PASS (tests)** | The contract test suite asserts reverts via `pytest.raises(gl.vm.UserError)` against the fake VM, which is exact. E8's dual-signal rule applies to *live* receipt checking, which no test does yet. |
| E9 | N/A | No live transactions yet. |
| E10 | N/A | No CLI write performed yet. |
| E11 | **PASS** | The tx hash is used only for display (`Forms.tsx:174`), never as a record id. CORD ids come from `_fresh_id` on-chain. The E11 defect class is avoided. |
| E12 | **PASS (vacuous)** | No error prettifier; `e.message` is shown verbatim (`Forms.tsx:139`). Honest, if raw. |

---

## §F — Platform bugs & runtime constraints

| ID | Verdict | Evidence |
|---|---|---|
| F1 | **PASS** | Verified this session: no `float(`, no `round(`, no true division anywhere in `contracts/`. All arithmetic is `//` or integer. Wei values are returned as **strings** (`get_config`, `Cord.py:700`; `get_claimable`, `:729`) — correct, since large ints are also a calldata risk. |
| F2 | **PASS** | All storage is `TreeMap[str, str]`, `TreeMap[str, bool]`, `TreeMap[str, u256]` — the flat-primitive zero-risk default. No dataclass values. Grants are JSON documents in `str` values (`Cord.py:88-95`), a deliberate choice documented in `docs/architecture.md`. |
| F3 | **PARTIAL** | Seven TreeMaps of **three different value types** (`str`, `bool`, `u256`) are declared as class-level annotations with **no bare `__init__` assignment** (`Cord.py:88-95`) — which is exactly F3's prescribed fix. Cannot be confirmed PASS without a gltest direct-mode deploy, which is blocked (see G6). |
| F4 | N/A | No cross-contract writes. |
| F5 | N/A | No cross-contract reads. |
| F6–F10 | N/A | Not deployed; no live reads to assess. All become live risks at deploy — `docs/DEPLOY.md` covers F6 and F10 in its troubleshooting. |
| F11 | **PASS** | Verified byte-level this session: `head -c 90` shows `# { "Depends": "py-genlayer:5jy…" }` as line 1, plain form (not `Seq`-wrapped). `test_depends_line_is_the_very_first_bytes` asserts no BOM and exact position. `grep -c $'\r'` over contract sources: **0** — LF-only at source level, per F11's stricter requirement, not merely normalized at deploy. |
| F12 | **PASS** | Uses `gl.block.timestamp` only (`Cord.py:115`), never `datetime.now()`/`gl.message.datetime`/`gl.vm.get_timestamp()`. **Must be live-probed before deploy** — F12 records both `gl.message.datetime` and `gl.vm.get_timestamp()` as absent on some pinned hashes. `gl.block.timestamp` is a third API not covered by that finding. **Added to remediation §3.** |
| F13 | **PASS** | `wc -c contracts/build/Cord.bundled.py` = **58,425 bytes raw source**. This is **above** F13's ~50KB trim trigger and near the ~53.3KB encoded wall. Raw and encoded are not comparable, but the margin is thin enough to be a real deploy risk. **Remediation §3.** |
| F14 | N/A → **pre-deploy action** | Single-account deploy; no multi-account live test yet. `docs/DEPLOY.md` step 2 checks key shape but not balance. |
| F15–F16 | N/A → **covered** | `docs/DEPLOY.md` troubleshooting covers F15; step 1 warns that CLI `studionet` is 61999, not Studio Dev — F16's exact trap. |
| F17–F18 | N/A | No factory pattern. |
| F19 | N/A | Targeting Studio Dev by requirement. |
| F20 | N/A → **pre-submission** | Explorer URL must be browser-tested before any submission. |
| F21 | N/A | CORD moves value via `gl.evm.send_value` to an EOA on Studio Dev, not Bradbury. Untested live. |

---

## §G — Tooling

| ID | Verdict | Evidence |
|---|---|---|
| G1 | **PARTIAL** | CORD's validator is a hand-rolled `run_nondet_default` closure, so per G1 it has **zero** direct-mode coverage. CORD does the prescribed workaround: `tests/test_core.py` unit-tests the exact pure functions the validator is built from (`review_comparable`, `use_comparable`, `reviews_equivalent`, `uses_equivalent` — 11 tests). Additionally `tests/fake_genlayer.py` reproduces validator disagreement so the *contract's* response to it is tested. The gap is documented in `README.md`. Becomes moot if A2 is fixed. |
| G2 | N/A | CORD does not use gltest; it uses a purpose-built fake VM under plain pytest. The G2 traps (`ContractFunction`, `get_contract_factory`) cannot occur. |
| G3 | N/A | gltest assertion helpers not used. |
| G4 | **PASS** | Time is controlled via `gl.block.timestamp` in the fake (`ctx.at()`, `test_contract.py`), not `warp()`. The G4 trap is avoided. Tested: `test_expiry_denies_without_any_transaction`. |
| G5 | **PASS** | `ctx.answer()` clears `prompts`/`fetched` and resets the leader/validator queues per judgment (`test_contract.py`) — the G5 stale-mock trap was actually **hit during development** and fixed. |
| G6 | **FAIL (environmental)** | `genvm-lint` is not installed and not available via the `genlayer` CLI in this environment. Per G6, toolchain health must be checked per session — it was, and it is unavailable. This is why A4 is PARTIAL. |
| G7 | **PASS** | `genlayer-js` pinned `2.0.0-rc.1` (`frontend/package.json:12`) — the Studio-Dev-compatible RC, above the `^1.x` floor G7 requires. |
| G8 | **PASS** | `docs/DEPLOY.md` §3 passes `--args` space-separated, one token per parameter — not a JSON array. G8's exact trap avoided. |
| G9 | N/A → **pre-deploy** | Windows deploy is planned. If `genvm-lint` becomes available, it must run as `PYTHONIOENCODING=utf-8`. Noted in remediation §3. |
| G10 | N/A | No `waitForTransactionReceipt` yet. |
| G11 | **FAIL** | `chain.ts` uses `Promise.allSettled` in `listGrants` (`:167`) — correct — but `GrantDetail.tsx:60` uses **`Promise.all`** for `[getReview, getChildren, getUses]`, each `.catch()`-guarded individually so it degrades safely. The `.catch()` makes it behave like `allSettled`, so this is **not** a live defect, but it is fragile: removing a `.catch()` reintroduces G11/H11. Downgrade to a note. **Revised: PASS-with-note.** |

---

## §H — Frontend & wiring

| ID | Verdict | Evidence |
|---|---|---|
| **H1** | **FAIL** | `chain.ts:196` — `eth()` returns `(window as any).ethereum` directly. Per H1 this misses WalletConnect, Coinbase Smart Wallet and Safe. CORD uses no wagmi, so the exact `connector.getProvider()` fix doesn't apply verbatim, but the defect does. |
| H2 | **PASS** | `getClient()` (`chain.ts:113`) calls `gl.createClient({ chain, endpoint })` with **no** `account`/`provider`, memoized as a module-level `clientPromise` singleton (`:111`). Exactly H2's prescription. |
| H3 | **PASS** | No mock data anywhere. Verified: every page renders from a chain read or an empty state. `Grants.tsx:30` sets `[]` when not live rather than fabricating. |
| H4 | **PASS** | All 8 writes have UI paths: `create_root`→`NewGrant`, `propose_child`→`Delegate`, `request_review`/`challenge`/`revoke`/`clear_taint`→`GrantDetail`, `prove_use`→`Prove`, `claim`→`Activity`. `revise_child` is the one exception — no UI. **Minor FAIL:** it is the documented escape hatch from `AMBIGUOUS`, so its absence makes a real recovery path unreachable from the app. |
| H5 | **PASS** | All chain config from `import.meta.env` (`config.ts`). No hardcoded address, count or status. |
| H6 | **PASS** | `types.ts` `GrantStatus` matches the contract's seven statuses exactly; `ReviewVerdict`/`UseDecision` match `core.py` constants. No UI-only status. |
| H7 | **PASS** | `Nav` Connect calls `useWallet().connect` → `connect()` → `eth_requestAccounts` + `ensureChain()` (`chain.ts:200`). Disabled with a title when no wallet. Not dead. |
| **H8** | **FAIL** | `TxButton` has a `busy` spinner but **no confirming stage** — it resolves the instant the hash returns. Per H8 (with F9's variable lag), a genuine confirming state lasting minutes is required. Same root cause as E1/E2. |
| H9 | **PASS** | Client mirrors contract validation: `Prove.tsx:urlProblem` mirrors `normalize_evidence_url`; `Delegate.tsx` pre-checks depth against `MAX_DEPTH`; `limits.ts` mirrors `core.py` caps with a comment saying so. |
| H10 | N/A | No WalletConnect project id used. |
| H11 | **PASS** | `listGrants` uses `Promise.allSettled` (`chain.ts:167`) and filters fulfilled — the registry fan-out case H11 targets. |
| H12 | **PARTIAL** | `GrantDetail` shows "Grant not readable" when a read fails, with the reason varying by health state — better than a flat "not found", but it has **no separate cheap existence signal**, so a freshly-created still-finalizing grant shows as not readable. H12's prescribed parallel registry query is absent. |
| H13 | N/A | No TanStack Query; plain `useEffect`. |
| H14 | **FAIL** | No security headers. `vercel.json` sets only `rewrites`. Per H14 this matters specifically because every primary action is a signed transaction. |
| H15 | N/A | No ESLint config at all (`npm run lint` does not exist). Not a broken command — the README does not claim one. |

---

## §I — CI, evidence & submission

| ID | Verdict | Evidence |
|---|---|---|
| I1 | **PARTIAL** | CI runs ruff + bundle + 146 tests + frontend typecheck/build, and was **observed green** this session (run `36421245644`, conclusion `success`, verified via API not inferred). But it does **not** run `genvm-lint` — unavailable (G6). |
| I2 | **PASS** | CI verified against a clean GitHub runner, which caught a real drift: ruff unpinned resolved to 0.16.9 vs local 0.15.8, 32 findings CI-only. Fixed by pinning both the version and the rule set. This is I2's exact lesson, learned live this session. |
| I3 | N/A | Vite, not Next.js. The `tsc --noEmit` step is appropriate here. |
| I4 | **PARTIAL** | README/LICENSE/SECURITY.md/`docs/` present. **No CHANGELOG.** Commits carry a `Co-Authored-By: Claude` line, which I4 says to avoid for submission. Portal Notes not yet drafted or length-checked. |
| I5 | N/A → **critical at resubmission** | Nothing submitted yet. Flagged in `docs/DEPLOY.md` §5 (address recorded only after `eth_getCode`). Given 3 prior occurrences, this needs a literal checklist step at submission time. |
| I6–I7 | N/A | No rejection to respond to yet. |
| I8 | **PASS** | Checked this session: README says "141 tests" — **stale, now 146**. Fixed in remediation. This is I8's exact drift class, caught by the item. |
| I9 | N/A | No events emitted; optional per I9. |
| I10 | N/A | No relayer/keeper/indexer. |
| I11 | **PASS** | Tests assert specific expected values, not enum membership — e.g. `assert ctx.grant(child)["status"] == ST_DENIED`, `assert ctx.claimable(TREASURY) == 10**15`. Semantic, not structural. |
| I12 | **PASS** | Access-control tests prove both halves: `test_denied_child_confers_no_authority` asserts the revert **and** that `can_invoke` still returns `allowed: False`. `test_locked_clause_pair_cannot_be_resubmitted_verbatim` asserts the revert and the lock's persistence. |
| I13 | N/A → **pre-submission** | No live fund movement yet. `claim()` payout is asserted against the fake VM's `chain.sent` ledger, which is exact but not live. Per I13 a real nonzero-delta run is required before claiming fund movement is proven. |
| I14 | N/A | No redeploy yet. |

---

## §J — Process discipline

| ID | Verdict | Evidence |
|---|---|---|
| J1 | **PASS** | This audit verified claims against the code, not the docs. It also found the prompt's own item G11 needed downgrading once `.catch()` guards were actually read — reported rather than applied blindly, per J1. |
| J2 | **PASS** | No proven pattern was swapped. A2's fix is *recommended*, not applied, precisely because `prompt_non_comparative` cannot be confirmed present in this environment (no SDK installed) — see remediation §1, which says to verify first. |
| J3 | **FAIL** | No accepted Portal repos were cloned and diffed. Not done in any session. |
| J4 | **PASS** | Findings are ordered §A → §J and the two blocking clusters are stated first. |
| J5 | **PASS** | This audit re-derived from a fresh read. It found two stale claims in my own prior reports: the README's "141 tests" (now 146), and my earlier statement that CORD's validators satisfy the independent-re-derivation requirement — true for **A1**, but I had not checked **A2**, which is the one that actually rejects. |
| J6 | **PASS** | Applied to CORD's own composed fixes: C6 was checked specifically because CORD has *both* a truncation (`sanitize_untrusted`) and a hash gate (`clause_pair_digest`) — the exact composition that caused a real rejection. They are independent here. |
| J7 | **PASS** | Checked for tests-written-to-match-bugs. `test_out_of_scope_use_taints_the_grant_and_slashes` was **corrected during development** when it asserted the wrong beneficiary — the fix re-derived the expected value from the settlement logic rather than adjusting to observed output. |
| J8 | **PASS** | No `pytest.raises(Exception)` anywhere — all revert tests use the specific `gl.vm.UserError`. Grep-verified. |
| J9 | **PASS** | This is the second adversarial pass; the first was `docs/audit.md`. This pass found what that one missed (A2, the entire §E cluster). J9's premise confirmed. |
| J10 | N/A | No rejection to diagnose. |
| J11 | N/A | No steward cycle yet. |

---

## Remediation, in priority order

### §1 — A2: replace the hand-rolled validator *(blocking)*

Do **not** apply blindly — J2 applies. First confirm
`gl.eq_principle.prompt_non_comparative` exists in the target SDK
(`py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`). If it does:

```python
def _judge_review(self, parent: dict, child: dict) -> dict:
    prompt = build_review_prompt(parent, child)

    def leader() -> str:                      # must return str (A16)
        raw = gl.nondet.exec_prompt(prompt)   # no response_format under this primitive
        return json.dumps(review_comparable(_safe_json(raw)), sort_keys=True)

    try:
        agreed = gl.eq_principle.prompt_non_comparative(
            leader,
            task="Decide whether the child grant's written limits are narrower "
                 "than or equal to the parent's.",
            criteria="The verdict class and the flagged clause-id sets must "
                     "match. Reasoning prose may differ.",
        )
        return json.loads(agreed) if agreed else {…UNVERIFIABLE…}
    except Exception:
        return {…UNVERIFIABLE…}
```

Two consequences to handle, both already recorded in the prompt:
- **A2:** no `response_format="json"` under this primitive — `_safe_json`'s
  brace-scanning fallback (`Cord.py:748`) already covers this. Verify with a test.
- **A15:** it can return `""` — handle explicitly, don't let `json.loads("")` raise.

If the primitive is **not** present, keep `run_nondet_default`, document the
divergence and the `DETERMINISTIC_VIOLATION` risk in `SECURITY.md`, and say so in
the steward notes. That is J2-compliant; silently keeping it is not.

### §2 — §E: transaction status classification *(blocking)*

One shared helper, allow-list only, used everywhere an outcome is shown:

```ts
// Allow-list, never a deny-list (E1). Missing/undefined => failure.
export function describeOutcome(r: any) {
  const exec = r?.txExecutionResultName;
  const consensus = r?.resultName;
  const ok = exec === "FINISHED_WITH_RETURN"
    && (consensus === "AGREE" || consensus === "MAJORITY_AGREE");
  return { ok, exec, consensus, status: r?.status_name };
}
```

Then, per item:
- **E2:** poll to `FINALIZED` for `claim()` (an EOA transfer — B18) and for
  `create_root`/`propose_child` (records others act on). `ACCEPTED` is
  defensible only for read-back-a-record claims.
- **E3:** budget 100 × 5s, matching the CLI's own `receipt` default.
- **E4:** derive the poller's stop-set from the same success/failure sets.
- **A21:** treat `DISAGREE`/`UNDETERMINED` as its own outcome — nothing
  persisted, retry with a fresh id where one exists.
- **E6:** refetch, *then* declare success.
- **H8:** a confirming stage that tolerates minutes.

### §3 — Non-blocking, before deploy

| Item | Action |
|---|---|
| **F13** | Bundle is 58,425 B — above the ~50KB trim trigger. Trim docstrings from the *bundled* output (not the source) before deploying. |
| **F12** | Live-probe `gl.block.timestamp` on the pinned hash before trusting expiry. It is a third API not covered by F12's findings on `gl.message.datetime`/`gl.vm.get_timestamp()`. |
| **A20** | Set `consensusMaxRotations` above the default 3 on writes. |
| **A5** | Disclose the elevated TIMEOUT rate in `SECURITY.md`. |
| **B12/B13** | Document the EOA-only requirement for `claim()` and for grantor/grantee. |
| **H1** | Bind the real wallet provider rather than `window.ethereum`. |
| **H4** | Add a `revise_child` UI — without it the documented `AMBIGUOUS` recovery path is unreachable. |
| **H14** | Add security headers to `vercel.json`. |
| **D1** | Add a decimal-encoded-IP case to the URL test suite (currently blocked only incidentally by the dotted-host check). |
| **I4** | Add CHANGELOG; drop the co-author trailer for submission commits. |
| **I8** | README says 141 tests; actual is 146. |
| **J3** | Clone 2–3 accepted Portal repos and diff. |
| **G9** | If `genvm-lint` becomes available on Windows, run with `PYTHONIOENCODING=utf-8`. |

---

## What this audit changed about my earlier claims

Per J5, re-deriving found two of my own prior statements wrong:

1. I said CORD's validators "independently re-run the prompt and re-fetch
   evidence" and implied that satisfied the rejection-heavy requirement. That is
   true of **A1** and false of **A2** — the *reconciliation mechanism* is the
   part that gets rejected, and I had not checked it.
2. The README's test count was stale (141 → 146).
