# CORD — Handoff to Claude Code Desktop

**Read this first, in full, before touching anything.**

Everything below was built and verified in a cloud container. Nothing is
stranded there — all of it is pushed. This document is the complete state of
the project, the decisions behind it, and the exact order to do the remaining
work in.

| | |
|---|---|
| Repo | `https://github.com/Fortune9thx/CORD` |
| Branch | `claude/vigilant-babbage-8197tv` — **not `main`** |
| HEAD | `e7366c9` |
| Tests | 156 passing |
| CI | green (contract + frontend jobs) |
| Contract | **not deployed** |
| App | **not deployed** |

---

## 0. First five minutes

```powershell
git clone https://github.com/Fortune9thx/CORD.git
cd CORD
git checkout claude/vigilant-babbage-8197tv

pip install pytest "ruff==0.16.9"
python contracts\build_bundle.py      # -> contracts\build\Cord.bundled.py
python -m pytest tests\ -q            # expect: 156 passed
python -m ruff check contracts tests  # expect: All checks passed!

cd frontend
npm install
npm run typecheck
npm run build
```

**If any of that fails, stop and fix it before doing anything else.** It all
passed on a clean CI runner at `e7366c9`, so a failure means a local
environment difference — which is exactly the class of thing that has bitten
this project before (see §6, "ruff drift").

---

## 1. What CORD is

One sentence: **CORD settles whether a child grant's limits are strictly
narrower than its parent's — including limits written in plain English — and
whether a later action stayed inside them, using web evidence validators fetch
for themselves. Bonds make a false verdict expensive.**

### The design decision everything rests on

The cheap, total check runs **first**:

```
propose_child
     │
┌────▼─────────────────────┐
│ DETERMINISTIC GATE       │  no model, no network, no cost
│ capabilities ⊆ parent    │
│ resources ⊆ parent       │──── violation ──▶ rejected outright
│ depth = parent+1 ≤ 8     │
│ expiry ≤ parent          │
└────┬─────────────────────┘
     │ clean subset
┌────▼─────────────────────┐
│ SEMANTIC REVIEW          │  gl.eq_principle.strict_eq
│ validators judge prose   │
└────┬─────────────────────┘
  ┌──┴───┬────────┬──────────┐
  ▼      ▼        ▼          ▼
ACTIVE DENIED AMBIGUOUS  RETRYABLE
       slash  + lock     (no charge)
```

Objective widening never reaches a validator. Non-determinism is spent only on
questions that genuinely need judgment, and an attacker cannot burn validator
time with obviously invalid proposals.

### Two GenLayer judgments

1. **SEMANTIC REVIEW** → `NARROWER_OR_EQUAL` | `EXPANDS_AUTHORITY` |
   `AMBIGUOUS` | `UNVERIFIABLE`
2. **PROVE_USE** → `WITHIN_SCOPE` | `OUT_OF_SCOPE` | `INCONCLUSIVE`

`UNVERIFIABLE` and `INCONCLUSIVE` are technical failures: inactive, refunded,
retryable, **never** authority.

### Who loses money

| Action | Bond by | Lost when |
|---|---|---|
| `request_review` | delegator | `EXPANDS_AUTHORITY` → parent's grantor, minus fee |
| `challenge` | challenger | re-review still `NARROWER_OR_EQUAL` → grant holder |
| `prove_use` | acting agent | `OUT_OF_SCOPE` → grantor, and the grant is tainted |

Everything else refunds in full. Nobody is ever charged for a validator's
inability to reach a conclusion. Payouts are pull-only via `claim()`.

---

## 2. Repository map

```
contracts/Cord.py            the intelligent contract (single class, Cord)
contracts/cordlib/core.py    pure logic: subsets, fingerprints, bonds, can_invoke
contracts/cordlib/judgment.py prompts + hostile-input handling
contracts/build_bundle.py    inlines cordlib -> the single deployable file
contracts/build/Cord.bundled.py   GENERATED — never edit by hand

tests/fake_genlayer.py       in-process GenVM stand-in
tests/test_core.py           82 tests — pure logic
tests/test_contract.py       64 tests — contract state machine
tests/test_bundle.py         10 tests — deploy invariants

frontend/src/lib/tx.ts       transaction outcome classifier  ← read this
frontend/src/lib/chain.ts    RPC, contract reads, wallet, write+confirm
frontend/src/components/Forms.tsx   TxButton (submit → confirm → refetch)

docs/architecture.md   how it works and why
docs/audit.md          threat model, each finding + the test covering it
docs/STATUS.md         honest deployment state
docs/STEWARD.md        submission packet
docs/DEPLOY.md         PowerShell runbook          ← you will use this
docs/genlayer/genlayer-master-audit-prompt.md   149-item reusable audit
docs/genlayer/AUDIT-cord-2026-09-28.md          the run against CORD
```

### Critical invariant

`contracts/build/Cord.bundled.py` is **generated**. Edit `contracts/Cord.py` or
`contracts/cordlib/*.py`, then re-run `python contracts\build_bundle.py`. CI
fails if the committed bundle is stale.

The bundler strips docstrings **from the generated file only** — source keeps
every one. That is what holds the deployable under the ~50KB deploy trim
trigger (49,057 bytes now; it was 59,278 before stripping).

---

## 3. Decisions that must not be silently reversed

These were each made against evidence. If a future change appears to need one
reversed, re-verify against the canonical source first — don't just change it.

### 3.1 `gl.eq_principle.strict_eq`, not a hand-rolled validator

**Do not** rewrite the judgments as
`gl.vm.run_nondet_default(leader, validator)` with a validator that makes its
own `exec_prompt` call and compares in Python. That shape draws
`DETERMINISTIC_VIOLATION` votes from GenVM's own protocol *even when both
results agree*. It is the single highest-rejection-risk pattern in this
ecosystem.

**Why `strict_eq` specifically**, and not `prompt_non_comparative`: the latter's
validator judges the leader's output via NLP and does **not** re-run the
function — which would silently destroy CORD's core claim that validators
independently re-fetch evidence. `strict_eq` re-executes the whole judgment
inside every validator and requires the canonicalized results to match. Same
guarantee, platform-owned reconciliation, and it's the cheapest of the three
principles.

**What makes it work:** the judge function returns
`json.dumps(review_comparable(...), sort_keys=True)`. Raw model prose would
never match across independent runs; a verdict class plus sorted clause-id sets
matches exactly when the judgments agree.

Verified against the v0.3 API reference:
```
genlayer.eq_principle.strict_eq(fn) -> T
genlayer.eq_principle.prompt_comparative(fn, principle) -> T
genlayer.eq_principle.prompt_non_comparative(fn, *, task, criteria) -> str
```
Corroborated by the accepted `intelligent-oracle` reference, which uses
`prompt_comparative` for the same purpose.

A bundle test enforces this: both judgments must use the primitive, and
`run_nondet` must appear nowhere in the deployable file.

### 3.2 Transaction success is an allow-list

`frontend/src/lib/tx.ts` — success requires `FINISHED_WITH_RETURN` **and** an
agreeing consensus vote **and** a terminal status. Anything missing or
unrecognized is failure.

**Never** write `x && x !== "FINISHED_WITH_ERROR"`. A missing field passes that
test. This exact mistake caused two consecutive Portal rejections on a prior
build, and then a third when the *fix* was also written as a deny-list.

Validator disagreement (`DISAGREE` / `UNDETERMINED`) is checked **before** the
execution result, because it reads as a clean success otherwise while having
persisted nothing.

### 3.3 Fail-closed everywhere

- `can_invoke` walks to the root on **every** call. No cached state to go stale.
- Unrecognized model output → `UNVERIFIABLE` / `INCONCLUSIVE`, never approval.
- A verdict inconsistent with the clauses it names is downgraded before
  comparison — `NARROWER_OR_EQUAL` alongside named expansions reads as
  `EXPANDS_AUTHORITY`.
- An equivalence principle can return `""`; `_parse_agreed` treats empty or
  unparseable output as the same fail-closed result.
- The UI renders **no** synthetic grant in any state.

### 3.4 The ambiguity lock

`AMBIGUOUS` locks the clause pair by a fingerprint over *normalized* text,
excluding clause ids and the grant id. Cosmetic edits, new ids and new grants
all collide with the same lock. Only a material rewording — or a parent
revision, which bumps its version — produces a new fingerprint.

Without this, a delegator could resubmit and re-roll until a run came back
favourably.

**The hash takes the full clause text.** Truncation happens afterwards and only
for prompt embedding. Do not let those two touch — hashing a truncated prefix
caused a real Portal rejection on another project.

---

## 4. Do this next, in this order

### Step 1 — Verify the SDK import convention ⚠️ **UNFINISHED**

This is the one genuinely open question, and it is a **deploy blocker**.

CORD uses, per the original build spec:
```python
import genlayer as gl
from genlayer.types import *

class Cord(gl.contract.Contract):
```

The accepted `intelligent-oracle` reference uses:
```python
from genlayer import *
import genlayer.gl as gl
```

Those are different SDK generations with different `Depends` hashes
(ours `5jycge4q…`, theirs `1jb45aa8…`). The v0.3 API reference documents
`genlayer.contract.Contract`, `genlayer.nondet.web`, `genlayer.eq_principle.*`
as `genlayer.X` submodules, which matches ours — but **I did not finish
confirming the canonical import statement for our specific pinned hash.**

**Do this before deploying:**
1. Read `https://sdk.genlayer.com/main/executors/v0.3/python-sdk/introduction.html`
   for the canonical import form.
2. Cross-check `https://sdk.genlayer.com/main/executors/v0.3/python-sdk/available-runners.html`
   that `5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` is still a
   current v0.3 runner.
3. If they disagree with CORD's imports, fix `contracts/Cord.py`, rebuild,
   re-run tests.
4. Cheapest possible proof: deploy a minimal hello-world with the **same**
   `Depends` line and CORD's **same** import style. If that deploys and reads
   back, the convention is right and any later failure is CORD's own.

Do **not** skip to step 2 assuming it's fine. A wrong import fails at deploy
after you've paid for it.

### Step 2 — Deploy the contract

Follow `docs/DEPLOY.md` exactly. Three things that will bite otherwise:

- **You need a real 64-hex funded key.** The cloud container's
  `GENLAYER_PRIVATE_KEY` was a 32-character placeholder — that is why nothing
  is deployed. The runbook has a shape probe that checks without printing it.
- **Do NOT `genlayer network set studionet`.** That is chain **61999**
  (`studio.genlayer.com`), not Studio Dev's **61997**. Every command in the
  runbook passes `--rpc https://studio-dev.genlayer.com/api` explicitly.
- **Verify `genlayer network info` immediately before deploying.** The CLI's
  active network has been observed silently differing from the project's.

**The gate:** `eth_getCode` must return non-empty before an address is written
anywhere. An address recorded before that is a claim, not a fact.

### Step 3 — Deploy the frontend

`docs/DEPLOY.md` §6. Four env vars; only `VITE_CONTRACT_ADDRESS` is new
information. `vercel.json` already carries the SPA rewrite and security
headers.

### Step 4 — Verify live

Walk one delegation end to end (`docs/DEPLOY.md` §7). The step worth doing
deliberately:

> Run `can_invoke` for an active child's grantee. Then revoke the root and run
> it again. It **must** flip to denied, citing the ancestor.

That is the fail-closed behaviour the whole design rests on, confirmed against
a real chain rather than a fake VM.

Also watch for, and expect, at least one `UNDETERMINED` outcome under real
testing volume. CORD's independent re-derivation makes it *more* likely than
typical. The UI handles it; confirm that with your own eyes before claiming
end-to-end verification.

---

## 5. Known gaps — honest list

| Gap | Why | Severity |
|---|---|---|
| **Not deployed** | No funded key in the container | Blocks everything |
| **`genvm-lint` never run** | Not installed, not in the CLI | **Run it on desktop.** Bundle tests cover the invariants I know of; that is not the same as the real linter |
| SDK import convention unconfirmed | §4 step 1 | **Deploy blocker** |
| `gl.block.timestamp` not live-probed | Timestamp APIs are runtime-specific; some pinned hashes lack them entirely | Probe before trusting expiry |
| No live fund-movement proof | Needs a real nonzero balance delta | Before claiming it works |
| `revise_child` UI is new | Never exercised against a chain | Test it live |
| No CHANGELOG entry for 1.0.0 details | Cosmetic | Low |
| Commits carry a Claude co-author line | Portal hygiene prefers sole-author | **Your call before submission** |

---

## 6. Mistakes already made here — don't repeat them

Each cost real time in this build:

1. **I reported the build complete without checking CI.** It was red — `ruff`
   was unpinned in CI and resolved to 0.16.9 while local had 0.15.8, a wider
   default rule set, 32 CI-only findings. Both the version and the rule set are
   now pinned. **Check `gh run list` after pushing; zero runs is itself a
   signal.**

2. **I said the validators satisfied the independent-re-derivation requirement
   and stopped there.** True of the *re-derivation* (A1), false of the
   *reconciliation mechanism* (A2) — and A2 is the one that gets rejected.
   Checking half a requirement and reporting it as met is the failure mode.

3. **I built the audit prompt, offered to run it, and didn't.** Then reported
   as if the work were done. If you produce a checklist, run it.

4. **My own audit's remediation was wrong.** It recommended
   `prompt_non_comparative` from a historical note. Reading the actual API
   reference showed its validator doesn't re-run the function, which would have
   quietly broken CORD's core claim. **Verify against canonical sources before
   applying a recommendation — including one from this document.**

5. **A test was written to match a bug.** A slash-beneficiary assertion was
   corrected by re-deriving the expected value from the settlement logic, not by
   adjusting to observed output. Never "fix" a test by copying what the code
   currently does.

---

## 7. Working style that fits this repo

- **Tests are the contract.** 156 of them, fast (~1s). Run them constantly.
  `tests/fake_genlayer.py` deliberately reproduces the two behaviours safety
  depends on: `strict_eq` raising on disagreement, and each side fetching
  evidence independently (asserted by counting fetches).
- **Comments explain *why*, not *what*.** Match that density. Several comments
  record a specific failure that a change would reintroduce — read them before
  editing that code.
- **Never claim a state you haven't verified.** `docs/STATUS.md` says "not
  deployed" and records the exact command and error rather than inventing an
  address. Keep that standard.
- **The audit prompt is reusable.**
  `docs/genlayer/genlayer-master-audit-prompt.md` — 149 items, section-prefixed
  IDs so new findings append without renumbering. Run it again before
  submission, and append anything new you learn.

---

## 8. Quick reference

```powershell
# contract
python contracts\build_bundle.py
python -m pytest tests\ -q
python -m ruff check contracts tests

# frontend
cd frontend; npm run dev        # http://localhost:5173
npm run typecheck; npm run build

# network
curl -X POST https://studio-dev.genlayer.com/api `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# expect {"result":"0xf22d"}  = 61997
```

| Constant | Value |
|---|---|
| Chain | 61997 (Studio Dev) — and only this |
| RPC | `https://studio-dev.genlayer.com/api` |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| Runner | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |
| Max depth | 8 |
| Bonds | review 0.01 GEN · challenge 0.02 GEN · use 0 (opt-in) |
| Fee | 1000 bps (10%) on slash only |

Studio Dev state may reset. A deployment that was live can become `no code` at
the same address; the app treats that as its own banner state rather than an
error.
