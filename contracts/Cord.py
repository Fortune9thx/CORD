# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""CORD — Constraint On Recursive Delegation.

An authority lattice for agents. A child grant may only ever narrow its parent,
and CORD settles that question two ways:

  SEMANTIC REVIEW  after deterministic subset checks pass, validators judge each
                   natural-language clause pair as NARROWER_OR_EQUAL,
                   EXPANDS_AUTHORITY or AMBIGUOUS.
  PROVE_USE        given an ACTIVE grant and HTTPS evidence URLs, validators
                   independently fetch the evidence and decide WITHIN_SCOPE,
                   OUT_OF_SCOPE or INCONCLUSIVE.

Bonds make a false verdict expensive; `can_invoke` fails closed.

State is kept as JSON documents in TreeMaps rather than nested storage
dataclasses. Grants are read and written whole, never field-by-field, so a
single document is the natural unit; it also keeps the storage surface flat
enough to reason about in an audit.
"""

import json

import genlayer as gl

# --- cordlib (inlined by contracts/build_bundle.py for deployment) ---------
from cordlib.core import *
from cordlib.judgment import (
    build_review_prompt,
    build_use_prompt,
    normalize_action,
    normalize_evidence,
)
from genlayer.types import *

# --- end cordlib ----------------------------------------------------------

DEFAULT_REVIEW_BOND = 10**16       # 0.01 GEN
DEFAULT_CHALLENGE_BOND = 2 * 10**16  # 0.02 GEN
DEFAULT_USE_BOND = 0               # opt-in by default
DEFAULT_FEE_BPS = 1000             # 10% of a slash to the treasury


# The two fail-closed results. Every judgment failure — no consensus, an
# unreachable model, an empty or unparseable agreed value — lands on one of
# these. Neither confers authority and neither is ever charged for.
_UNVERIFIABLE_RESULT = {
    "verdict": UNVERIFIABLE,
    "expansion_ids": [],
    "ambiguity_ids": [],
    "prohibitions_covered": False,
}
_INCONCLUSIVE_RESULT = {"decision": INCONCLUSIVE, "violated_ids": []}


def _parse_agreed(agreed, fallback):
    """Read back what the validators agreed on, failing closed.

    An equivalence principle can return an empty string when the validators do
    not converge, so `json.loads` is never reached with an empty value — that
    path returns the fail-closed result instead of raising.
    """
    if not isinstance(agreed, str) or not agreed.strip():
        return dict(fallback)
    try:
        parsed = json.loads(agreed)
    except Exception:
        return dict(fallback)
    return parsed if isinstance(parsed, dict) else dict(fallback)


def _err(reason):
    """Raise a stable, lowercase, machine-comparable user error."""
    raise gl.vm.UserError(reason)


def _to_address(value):
    """Coerce a constructor argument into an Address, or None if unset.

    Deploy tooling infers argument types from their shape, so a 40-hex treasury
    can arrive already decoded as an Address rather than as the `str` this
    parameter is annotated with. Handling both means a deploy cannot revert in
    the constructor over an encoding detail.
    """
    if value is None or value == "":
        return None
    if isinstance(value, Address):
        return value
    return Address(value)


def _guard(fn):
    """Run pure-lib code, translating its CordError into a GenVM user error."""
    try:
        return fn()
    except CordError as e:
        _err(str(e))


class Cord(gl.contract.Contract):
    # --- storage ----------------------------------------------------------
    owner: Address
    treasury: Address
    review_bond: u256
    challenge_bond: u256
    use_bond: u256
    fee_bps: u256
    next_id: u256

    grants: TreeMap[str, str]        # grant id -> grant JSON
    reviews: TreeMap[str, str]       # grant id -> latest review JSON
    uses: TreeMap[str, str]          # use id   -> prove_use record JSON
    locks: TreeMap[str, bool]        # clause-pair fingerprint -> locked
    claimable: TreeMap[str, u256]    # address (lowercase hex) -> wei owed
    children: TreeMap[str, str]      # parent id -> JSON list of child ids
    use_index: TreeMap[str, str]     # grant id  -> JSON list of use ids

    def __init__(
        self,
        treasury: str = "",
        review_bond: int = DEFAULT_REVIEW_BOND,
        challenge_bond: int = DEFAULT_CHALLENGE_BOND,
        use_bond: int = DEFAULT_USE_BOND,
        fee_bps: int = DEFAULT_FEE_BPS,
    ):
        self.owner = gl.message.sender_address
        self.treasury = _to_address(treasury) or gl.message.sender_address
        if fee_bps < 0 or fee_bps > BPS_DENOM:
            _err("fee bps out of range")
        if review_bond < 0 or challenge_bond < 0 or use_bond < 0:
            _err("bond must not be negative")
        self.review_bond = u256(review_bond)
        self.challenge_bond = u256(challenge_bond)
        self.use_bond = u256(use_bond)
        self.fee_bps = u256(fee_bps)
        self.next_id = u256(1)

    # ------------------------------------------------------------------
    # internals
    # ------------------------------------------------------------------

    def _now(self) -> int:
        return int(gl.block.timestamp)

    def _sender(self) -> str:
        return gl.message.sender_address.as_hex.lower()

    def _load(self, grant_id: str):
        blob = self.grants.get(grant_id)
        if blob is None:
            return None
        return json.loads(blob)

    def _store(self, grant: dict) -> None:
        self.grants[grant["id"]] = json.dumps(grant, sort_keys=True)

    def _lookup(self):
        """A `lookup` callable for the pure-lib chain walker."""
        return lambda gid: self._load(gid)

    def _credit(self, addr: str, amount: int) -> None:
        """Owe wei to an address. Never pushes funds — claim() pulls."""
        if amount <= 0:
            return
        key = addr.lower()
        self.claimable[key] = u256(int(self.claimable.get(key, 0)) + amount)

    def _append_index(self, table, key: str, value: str) -> None:
        raw = table.get(key)
        items = json.loads(raw) if raw else []
        if value not in items:
            items.append(value)
        table[key] = json.dumps(items)

    def _fresh_id(self, prefix: str) -> str:
        n = int(self.next_id)
        self.next_id = u256(n + 1)
        return f"{prefix}{n}"

    def _effective_status(self, grant: dict) -> str:
        """Status as seen from now — ACTIVE grants past expiry read EXPIRED."""
        if grant["status"] == ST_ACTIVE and grant["expiry"] <= self._now():
            return ST_EXPIRED
        return grant["status"]

    # ------------------------------------------------------------------
    # writes: grant lifecycle
    # ------------------------------------------------------------------

    @gl.public.write
    def create_root(
        self,
        grantee: str,
        capabilities: list,
        resources: list,
        expiry: int,
        clauses: list = None,
    ) -> str:
        """Create a root grant. The sender is its grantor and its own authority.

        A root is ACTIVE immediately: there is no parent to be narrower than, so
        there is nothing for validators to settle.
        """
        caps = _guard(lambda: normalize_token_set(capabilities, "capabilities", MAX_CAPABILITIES))
        res = _guard(lambda: normalize_token_set(resources, "resources", MAX_RESOURCES))
        cls = _guard(lambda: normalize_clauses(clauses))
        if not isinstance(grantee, str) or not grantee.strip():
            _err("grantee required")
        if int(expiry) <= self._now():
            _err("expiry must be in the future")

        gid = self._fresh_id("g")
        grant = {
            "id": gid,
            "grantor": self._sender(),
            "grantee": grantee.strip().lower(),
            "parent_id": "",
            "version": 1,
            "depth": 0,
            "expiry": int(expiry),
            "capabilities": caps,
            "resources": res,
            "clauses": cls,
            "status": ST_ACTIVE,
            "tainted": False,
            "review_bond": 0,
            "review_bond_owner": "",
            "challenge_bond": 0,
            "challenger": "",
            "created_at": self._now(),
        }
        self._store(grant)
        return gid

    @gl.public.write
    def propose_child(
        self,
        parent_id: str,
        grantee: str,
        capabilities: list,
        resources: list,
        expiry: int,
        clauses: list = None,
    ) -> str:
        """Propose a narrower child of a grant the sender holds.

        Every objective widening is rejected here, before any validator is
        asked to think: capability and resource sets must be covered by the
        parent, depth must be exactly one deeper and within the cap, and expiry
        must not outlast the parent. A proposal that clears these checks is
        stored as PROPOSED — it confers no authority until a review settles.
        """
        parent = self._load(parent_id)
        if parent is None:
            _err("parent grant not found")
        if parent["grantee"] != self._sender():
            _err("only the parent grantee may delegate")

        ok, reason = grant_effective(parent, self._now())
        if not ok:
            _err("parent is not effective: " + reason)
        chain_ok, chain_reason = chain_effective(parent_id, self._lookup(), self._now())
        if not chain_ok:
            _err("parent chain is not effective: " + chain_reason)

        caps = _guard(lambda: normalize_token_set(capabilities, "capabilities", MAX_CAPABILITIES))
        res = _guard(lambda: normalize_token_set(resources, "resources", MAX_RESOURCES))
        cls = _guard(lambda: normalize_clauses(clauses))
        if not isinstance(grantee, str) or not grantee.strip():
            _err("grantee required")

        candidate = {
            "capabilities": caps,
            "resources": res,
            "depth": parent["depth"] + 1,
            "expiry": int(expiry),
            "clauses": cls,
        }
        violations = check_structural_subset(parent, candidate)
        if violations:
            _err("structural widening rejected: " + "; ".join(violations))
        if int(expiry) <= self._now():
            _err("expiry must be in the future")

        # A clause pair ruled AMBIGUOUS stays locked until its text materially
        # changes, so the same unclear wording cannot be resubmitted forever.
        fp = lock_fingerprint(parent_id, parent["version"], parent["clauses"], cls)
        if self.locks.get(fp, False):
            _err("clause pair is locked as ambiguous; revise the clause text")

        gid = self._fresh_id("g")
        grant = {
            "id": gid,
            "grantor": self._sender(),
            "grantee": grantee.strip().lower(),
            "parent_id": parent_id,
            "version": 1,
            "depth": parent["depth"] + 1,
            "expiry": int(expiry),
            "capabilities": caps,
            "resources": res,
            "clauses": cls,
            "status": ST_PROPOSED,
            "tainted": False,
            "review_bond": 0,
            "review_bond_owner": "",
            "challenge_bond": 0,
            "challenger": "",
            "created_at": self._now(),
        }
        self._store(grant)
        self._append_index(self.children, parent_id, gid)
        return gid

    @gl.public.write
    def revise_child(
        self,
        grant_id: str,
        capabilities: list,
        resources: list,
        expiry: int,
        clauses: list = None,
    ) -> str:
        """Rewrite a settled-but-inactive child and bump its version.

        This is the escape hatch from AMBIGUOUS and DENIED: the delegator
        rewrites the text, the version increments, and the proposal returns to
        PROPOSED for a fresh review. Rewriting to the *same* normalized text
        still hits the same lock, so this cannot be used to grind a stuck
        clause pair.
        """
        grant = self._load(grant_id)
        if grant is None:
            _err("grant not found")
        if grant["grantor"] != self._sender():
            _err("only the grantor may revise")
        if grant["status"] not in (ST_AMBIGUOUS, ST_DENIED, ST_RETRYABLE, ST_PROPOSED):
            _err("only an inactive proposal may be revised")
        if int(grant["review_bond"]) > 0:
            _err("settle the open review before revising")

        parent = self._load(grant["parent_id"])
        if parent is None:
            _err("parent grant not found")

        caps = _guard(lambda: normalize_token_set(capabilities, "capabilities", MAX_CAPABILITIES))
        res = _guard(lambda: normalize_token_set(resources, "resources", MAX_RESOURCES))
        cls = _guard(lambda: normalize_clauses(clauses))

        candidate = {
            "capabilities": caps,
            "resources": res,
            "depth": grant["depth"],
            "expiry": int(expiry),
            "clauses": cls,
        }
        violations = check_structural_subset(parent, candidate)
        if violations:
            _err("structural widening rejected: " + "; ".join(violations))
        if int(expiry) <= self._now():
            _err("expiry must be in the future")

        fp = lock_fingerprint(grant["parent_id"], parent["version"], parent["clauses"], cls)
        if self.locks.get(fp, False):
            _err("clause pair is locked as ambiguous; revise the clause text")

        grant["capabilities"] = caps
        grant["resources"] = res
        grant["expiry"] = int(expiry)
        grant["clauses"] = cls
        grant["version"] = int(grant["version"]) + 1
        grant["status"] = ST_PROPOSED
        self._store(grant)
        return grant_id

    @gl.public.write
    def revoke(self, grant_id: str) -> None:
        """Revoke a grant. Its whole subtree stops being effective at once.

        No subtree bookkeeping is needed: `can_invoke` walks to the root on
        every check, so a revoked ancestor denies every descendant immediately.
        """
        grant = self._load(grant_id)
        if grant is None:
            _err("grant not found")
        sender = self._sender()
        if sender not in (grant["grantor"], grant["grantee"]):
            _err("only the grantor or grantee may revoke")
        if grant["status"] == ST_REVOKED:
            _err("grant already revoked")
        grant["status"] = ST_REVOKED
        self._store(grant)

    # ------------------------------------------------------------------
    # writes: bonded semantic review
    # ------------------------------------------------------------------

    @gl.public.write.payable
    def request_review(self, grant_id: str) -> None:
        """Post the review bond and settle a proposed child in one call.

        The verdict is produced by validators from the *stored* parent and
        child text — nothing about the judgment comes from the caller.
        """
        grant = self._load(grant_id)
        if grant is None:
            _err("grant not found")
        if grant["status"] != ST_PROPOSED:
            _err("only a proposed grant can be reviewed")
        if grant["grantor"] != self._sender():
            _err("only the grantor may request review")

        bond = int(gl.message.value)
        if bond < int(self.review_bond):
            _err("review bond too small")

        parent = self._load(grant["parent_id"])
        if parent is None:
            _err("parent grant not found")

        result = self._judge_review(parent, grant)
        verdict = result["verdict"]

        settlement = settle_review(verdict, bond, int(self.fee_bps))
        if settlement["refund"] > 0:
            self._credit(self._sender(), settlement["refund"])
        else:
            # A delegator who tried to widen pays the parent's grantor, minus
            # the protocol fee: the party whose authority was nearly overrun.
            self._credit(parent["grantor"], settlement["beneficiary"])
            self._credit(self.treasury.as_hex, settlement["treasury"])

        grant["status"] = status_after_review(verdict)
        grant["review_bond"] = 0
        grant["review_bond_owner"] = ""
        self._store(grant)

        if verdict == AMBIGUOUS:
            fp = lock_fingerprint(
                grant["parent_id"], parent["version"], parent["clauses"], grant["clauses"]
            )
            self.locks[fp] = True

        self.reviews[grant_id] = json.dumps({
            "grant_id": grant_id,
            "kind": "review",
            "verdict": verdict,
            "expansion_clause_ids": result["expansion_ids"],
            "ambiguity_clause_ids": result["ambiguity_ids"],
            "prohibitions_covered": result["prohibitions_covered"],
            "bond": bond,
            "slashed": settlement["slashed"],
            "settled_at": self._now(),
        }, sort_keys=True)

    @gl.public.write.payable
    def challenge(self, grant_id: str) -> None:
        """Challenge an ACTIVE grant by re-running the review, under bond.

        If the re-review finds expansion the child is revoked and the challenger
        is paid from the grantor's side; if it still reads as narrower, the
        challenger's bond is slashed. An ambiguous or unverifiable re-review
        refunds the challenger and leaves the grant alone — a challenge is not
        a way to freeze someone's authority for free.
        """
        grant = self._load(grant_id)
        if grant is None:
            _err("grant not found")
        if self._effective_status(grant) != ST_ACTIVE:
            _err("only an active grant can be challenged")
        if not grant["parent_id"]:
            _err("a root grant has no parent to be narrower than")

        bond = int(gl.message.value)
        if bond < int(self.challenge_bond):
            _err("challenge bond too small")

        parent = self._load(grant["parent_id"])
        if parent is None:
            _err("parent grant not found")

        result = self._judge_review(parent, grant)
        verdict = result["verdict"]
        settlement = settle_challenge(verdict, bond, int(self.fee_bps))
        challenger = self._sender()

        if settlement["upheld"]:
            grant["status"] = ST_REVOKED
            self._credit(challenger, settlement["refund"])
        elif settlement["refund"] > 0:
            self._credit(challenger, settlement["refund"])
        else:
            # A wrong challenge pays the grant's holder for the disruption.
            self._credit(grant["grantee"], settlement["beneficiary"])
            self._credit(self.treasury.as_hex, settlement["treasury"])

        self._store(grant)
        self.reviews[grant_id] = json.dumps({
            "grant_id": grant_id,
            "kind": "challenge",
            "verdict": verdict,
            "expansion_clause_ids": result["expansion_ids"],
            "ambiguity_clause_ids": result["ambiguity_ids"],
            "prohibitions_covered": result["prohibitions_covered"],
            "challenger": challenger,
            "bond": bond,
            "slashed": settlement["slashed"],
            "upheld": settlement["upheld"],
            "settled_at": self._now(),
        }, sort_keys=True)

    # ------------------------------------------------------------------
    # writes: prove_use
    # ------------------------------------------------------------------

    @gl.public.write.payable
    def prove_use(self, grant_id: str, action: str, evidence_urls: list) -> str:
        """Submit an action plus HTTPS evidence and have validators judge it.

        Each validator fetches the evidence itself; the leader's fetched bytes
        are never trusted as the record. A fetch failure yields INCONCLUSIVE,
        never approval.
        """
        grant = self._load(grant_id)
        if grant is None:
            _err("grant not found")
        if grant["grantee"] != self._sender():
            _err("only the grantee may prove a use")

        ok, reason = chain_effective(grant_id, self._lookup(), self._now())
        if not ok:
            _err("grant is not effective: " + reason)

        act = _guard(lambda: normalize_action(action))
        urls = _guard(lambda: normalize_evidence_urls(evidence_urls))

        bond = int(gl.message.value)
        if bond < int(self.use_bond):
            _err("use bond too small")

        result = self._judge_use(grant, act, urls)
        decision = result["decision"]
        settlement = settle_use(decision, bond, int(self.fee_bps))

        if settlement["refund"] > 0:
            self._credit(self._sender(), settlement["refund"])
        else:
            # An out-of-scope use pays the grantor whose authority was misused.
            self._credit(grant["grantor"], settlement["beneficiary"])
            self._credit(self.treasury.as_hex, settlement["treasury"])

        if decision == OUT_OF_SCOPE:
            # Taint rather than revoke: the grant stops authorizing anything
            # until its grantor decides what to do, and `can_invoke` reads the
            # taint as a denial.
            grant["tainted"] = True
            self._store(grant)

        use_id = self._fresh_id("u")
        self.uses[use_id] = json.dumps({
            "id": use_id,
            "grant_id": grant_id,
            "actor": self._sender(),
            "action": act,
            "evidence_urls": urls,
            "decision": decision,
            "violated_clause_ids": result["violated_ids"],
            "bond": bond,
            "slashed": settlement["slashed"],
            "settled_at": self._now(),
        }, sort_keys=True)
        self._append_index(self.use_index, grant_id, use_id)
        return use_id

    @gl.public.write
    def clear_taint(self, grant_id: str) -> None:
        """Let a grantor lift a taint after handling an out-of-scope use."""
        grant = self._load(grant_id)
        if grant is None:
            _err("grant not found")
        if grant["grantor"] != self._sender():
            _err("only the grantor may clear a taint")
        if not grant["tainted"]:
            _err("grant is not tainted")
        grant["tainted"] = False
        self._store(grant)

    # ------------------------------------------------------------------
    # writes: payouts
    # ------------------------------------------------------------------

    @gl.public.write
    def claim(self) -> int:
        """Withdraw everything owed to the sender.

        Pull-only and zeroed before the transfer, so nothing is ever pushed to
        an address that cannot receive it and no balance is double-spent.
        """
        key = self._sender()
        amount = int(self.claimable.get(key, 0))
        if amount <= 0:
            _err("nothing to claim")
        self.claimable[key] = u256(0)
        gl.evm.send_value(gl.message.sender_address, amount)
        return amount

    # ------------------------------------------------------------------
    # non-deterministic judgments
    # ------------------------------------------------------------------

    def _judge_review(self, parent: dict, child: dict) -> dict:
        """Run the SEMANTIC REVIEW judgment under validator consensus.

        Both sides build the prompt from stored state and canonicalize the
        model's answer through the same pure function, so agreement is decided
        on the verdict class and the flagged clause-id sets — never on prose.
        """
        prompt = build_review_prompt(parent, child)

        def judge() -> str:
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(review_comparable(_safe_json(raw)), sort_keys=True)

        try:
            # strict_eq runs `judge` on the leader and again, independently, on
            # each validator, then requires the results to be identical. The
            # canonicalization inside `judge` is what makes that viable: raw
            # model prose would never match, but a verdict class plus sorted
            # clause-id sets matches exactly when the judgments agree. The
            # platform performs the reconciliation, so no comparison logic of
            # ours sits between the validators and their verdict.
            agreed = gl.eq_principle.strict_eq(judge)
            return _parse_agreed(agreed, _UNVERIFIABLE_RESULT)
        except Exception:
            # No consensus, or the judgment could not be run at all. That is a
            # technical failure, not a finding: UNVERIFIABLE is inactive and
            # retryable and never confers authority.
            return dict(_UNVERIFIABLE_RESULT)

    def _judge_use(self, grant: dict, action: str, urls: list) -> dict:
        """Run the PROVE_USE judgment under validator consensus.

        Each side fetches the evidence independently — the leader's bytes are
        an input to its own opinion only.
        """

        def fetch_all() -> list:
            out = []
            for u in urls:
                try:
                    resp = gl.nondet.web.get(u)
                    out.append(normalize_evidence(u, resp.status, resp.body))
                except Exception:
                    out.append(normalize_evidence(u, 0, b""))
            return out

        def judge() -> str:
            # Runs on the leader and, independently, inside every validator —
            # so each one fetches the evidence itself. The leader's bytes are
            # an input to the leader's own opinion and nothing more.
            evidence = fetch_all()
            raw = gl.nondet.exec_prompt(
                build_use_prompt(grant, action, evidence), response_format="json"
            )
            return json.dumps(use_comparable(_safe_json(raw)), sort_keys=True)

        try:
            agreed = gl.eq_principle.strict_eq(judge)
            return _parse_agreed(agreed, _INCONCLUSIVE_RESULT)
        except Exception:
            return dict(_INCONCLUSIVE_RESULT)

    # ------------------------------------------------------------------
    # views
    # ------------------------------------------------------------------

    @gl.public.view
    def get_config(self) -> str:
        return json.dumps({
            "owner": self.owner.as_hex,
            "treasury": self.treasury.as_hex,
            "review_bond": str(int(self.review_bond)),
            "challenge_bond": str(int(self.challenge_bond)),
            "use_bond": str(int(self.use_bond)),
            "fee_bps": int(self.fee_bps),
            "max_depth": MAX_DEPTH,
            "max_clauses": MAX_CLAUSES,
            "next_id": int(self.next_id),
        }, sort_keys=True)

    @gl.public.view
    def get_grant(self, grant_id: str) -> str:
        grant = self._load(grant_id)
        if grant is None:
            return ""
        grant = dict(grant)
        grant["effective_status"] = self._effective_status(grant)
        ok, reason = chain_effective(grant["id"], self._lookup(), self._now())
        grant["effective"] = ok
        grant["effective_reason"] = reason
        grant["scope_fingerprint"] = scope_fingerprint(grant)
        return json.dumps(grant, sort_keys=True)

    @gl.public.view
    def get_children(self, grant_id: str) -> str:
        return self.children.get(grant_id, "[]")

    @gl.public.view
    def get_review(self, grant_id: str) -> str:
        return self.reviews.get(grant_id, "")

    @gl.public.view
    def get_prove_use(self, use_id: str) -> str:
        return self.uses.get(use_id, "")

    @gl.public.view
    def get_uses(self, grant_id: str) -> str:
        return self.use_index.get(grant_id, "[]")

    @gl.public.view
    def is_effective(self, grant_id: str) -> str:
        ok, reason = chain_effective(grant_id, self._lookup(), self._now())
        return json.dumps({"effective": ok, "reason": reason}, sort_keys=True)

    @gl.public.view
    def can_invoke(
        self, grant_id: str, actor: str, capability: str, resource: str
    ) -> str:
        """The authority question, answered fail-closed.

        Denies on a missing grant, an actor who is not the grantee, a capability
        or resource outside scope, a taint, an expiry, or any inactive ancestor.
        """
        allowed, reason = can_invoke(
            grant_id, actor, capability, resource, self._lookup(), self._now()
        )
        return json.dumps({"allowed": allowed, "reason": reason}, sort_keys=True)

    @gl.public.view
    def get_claimable(self, addr: str) -> str:
        return str(int(self.claimable.get(addr.strip().lower(), 0)))

    @gl.public.view
    def is_locked(self, fingerprint: str) -> bool:
        return bool(self.locks.get(fingerprint, False))


def _safe_json(raw):
    """Parse model output without ever letting a parse failure become authority."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("utf-8", "replace")
        except Exception:
            return {}
    if not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end <= start:
            return {}
        try:
            parsed = json.loads(raw[start:end + 1])
        except Exception:
            return {}
    return parsed if isinstance(parsed, dict) else {}
