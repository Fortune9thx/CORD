"""CORD pure-logic core.

Deliberately free of any `genlayer` import so every rule here is testable with
plain CPython and can be bundled verbatim into the deployable contract.

Everything in this module is deterministic: same inputs, same outputs, no clock,
no network, no randomness. All non-determinism lives in Cord.py.
"""

import hashlib
import json
import re
import unicodedata

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------

MAX_DEPTH = 8
MAX_CLAUSES = 8
MAX_CLAUSE_CHARS = 600
MAX_CAPABILITIES = 32
MAX_RESOURCES = 32
MAX_TOKEN_CHARS = 128
MAX_EVIDENCE_URLS = 5
MAX_URL_CHARS = 512
MAX_ACTION_CHARS = 2000
BPS_DENOM = 10_000

# ---------------------------------------------------------------------------
# Verdict enums
# ---------------------------------------------------------------------------

NARROWER_OR_EQUAL = "NARROWER_OR_EQUAL"
EXPANDS_AUTHORITY = "EXPANDS_AUTHORITY"
AMBIGUOUS = "AMBIGUOUS"
UNVERIFIABLE = "UNVERIFIABLE"

REVIEW_VERDICTS = (
    NARROWER_OR_EQUAL,
    EXPANDS_AUTHORITY,
    AMBIGUOUS,
    UNVERIFIABLE,
)

WITHIN_SCOPE = "WITHIN_SCOPE"
OUT_OF_SCOPE = "OUT_OF_SCOPE"
INCONCLUSIVE = "INCONCLUSIVE"

USE_DECISIONS = (WITHIN_SCOPE, OUT_OF_SCOPE, INCONCLUSIVE)

# Grant statuses
ST_PROPOSED = "PROPOSED"
ST_ACTIVE = "ACTIVE"
ST_DENIED = "DENIED"
ST_AMBIGUOUS = "AMBIGUOUS"
ST_RETRYABLE = "RETRYABLE"
ST_REVOKED = "REVOKED"
ST_EXPIRED = "EXPIRED"

# Statuses from which a grant can never again become effective.
TERMINAL_STATUSES = (ST_DENIED, ST_REVOKED, ST_EXPIRED)


class CordError(Exception):
    """Stable, lowercase, machine-comparable rejection reason."""


def fail(reason):
    raise CordError(reason)


# ---------------------------------------------------------------------------
# Canonicalization
# ---------------------------------------------------------------------------


def canon_verdict(raw):
    """Map arbitrary model output onto a review verdict.

    Fails closed: anything unrecognized becomes UNVERIFIABLE, which is inactive
    and retryable and is never treated as authority.
    """
    if not isinstance(raw, str):
        return UNVERIFIABLE
    v = raw.strip().upper().replace("-", "_").replace(" ", "_")
    while "__" in v:
        v = v.replace("__", "_")
    if v in REVIEW_VERDICTS:
        return v
    # Tolerate a couple of obvious synonyms, but never invent NARROWER.
    if v in ("NARROWER", "EQUAL", "NARROWER_OR_EQUAL_TO_PARENT", "SUBSET"):
        return NARROWER_OR_EQUAL
    if v in ("EXPANDS", "EXPANDED_AUTHORITY", "BROADER", "WIDENS"):
        return EXPANDS_AUTHORITY
    if v in ("UNCLEAR", "AMBIGUITY", "UNDETERMINED"):
        return AMBIGUOUS
    return UNVERIFIABLE


def canon_use_decision(raw):
    """Map arbitrary model output onto a prove_use decision.

    Fails closed: unrecognized output is INCONCLUSIVE, never WITHIN_SCOPE.
    """
    if not isinstance(raw, str):
        return INCONCLUSIVE
    v = raw.strip().upper().replace("-", "_").replace(" ", "_")
    while "__" in v:
        v = v.replace("__", "_")
    if v in USE_DECISIONS:
        return v
    if v in ("WITHIN", "IN_SCOPE", "INSIDE_SCOPE"):
        return WITHIN_SCOPE
    if v in ("OUT", "OUTSIDE_SCOPE", "BEYOND_SCOPE", "VIOLATION"):
        return OUT_OF_SCOPE
    return INCONCLUSIVE


def normalize_token(raw):
    """Normalize a capability or resource token.

    Case-folded, NFKC-normalized, whitespace-collapsed. Tokens are compared as
    opaque strings plus an explicit `*` wildcard and `a.b.*` prefix form.
    """
    if not isinstance(raw, str):
        fail("token must be a string")
    t = unicodedata.normalize("NFKC", raw).strip().lower()
    t = re.sub(r"\s+", " ", t)
    if not t:
        fail("empty token")
    if len(t) > MAX_TOKEN_CHARS:
        fail("token too long")
    return t


def normalize_clause_text(raw):
    """Normalize clause text for digesting.

    Aggressive enough that cosmetic edits (whitespace, quotes, case, trailing
    punctuation) do not unlock a LOCKED ambiguous clause pair, but preserving
    every word so that a material rewording does.
    """
    if not isinstance(raw, str):
        fail("clause text must be a string")
    t = unicodedata.normalize("NFKC", raw)
    # Fold typographic quotes and dashes onto ASCII so a smart-quote swap is
    # not treated as a material revision.
    for a, b in (
        ("\u2018", "'"), ("\u2019", "'"), ("\u201c", '"'), ("\u201d", '"'),
        ("\u2013", "-"), ("\u2014", "-"), ("\u00a0", " "),
    ):
        t = t.replace(a, b)
    t = t.lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------------------
# Structured subset checks
# ---------------------------------------------------------------------------


def token_covers(parent_token, child_token):
    """Does a single parent token authorize a single child token?

    `*` covers everything. `a.b.*` covers `a.b` and anything beneath it.
    Otherwise tokens must be equal. No other widening is implied.
    """
    if parent_token == "*":
        return True
    if parent_token == child_token:
        return True
    if parent_token.endswith(".*"):
        prefix = parent_token[:-2]
        return child_token == prefix or child_token.startswith(prefix + ".")
    return False


def set_covers(parent_tokens, child_tokens):
    """Every child token must be covered by at least one parent token."""
    return [c for c in child_tokens if not any(token_covers(p, c) for p in parent_tokens)]


def normalize_token_set(raw_list, label, limit):
    if not isinstance(raw_list, (list, tuple)):
        fail(label + " must be a list")
    if len(raw_list) == 0:
        fail(label + " must not be empty")
    if len(raw_list) > limit:
        fail(label + " list too long")
    out = []
    for item in raw_list:
        t = normalize_token(item)
        if t not in out:
            out.append(t)
    out.sort()
    return out


def normalize_clauses(raw_list):
    """Normalize a clause list into [{id, text}] with stable ordering."""
    if raw_list is None:
        return []
    if not isinstance(raw_list, (list, tuple)):
        fail("clauses must be a list")
    if len(raw_list) > MAX_CLAUSES:
        fail("too many clauses")
    out = []
    seen = set()
    for idx, item in enumerate(raw_list):
        if isinstance(item, str):
            cid, text = f"c{idx}", item
        elif isinstance(item, dict):
            cid = item.get("id") or f"c{idx}"
            text = item.get("text", "")
        else:
            fail("clause must be a string or object")
        if not isinstance(cid, str) or not cid.strip():
            fail("clause id must be a non-empty string")
        cid = cid.strip().lower()
        if not re.fullmatch(r"[a-z0-9_.:-]{1,32}", cid):
            fail("clause id has invalid characters")
        if cid in seen:
            fail("duplicate clause id")
        seen.add(cid)
        if not isinstance(text, str) or not text.strip():
            fail("clause text must be a non-empty string")
        if len(text) > MAX_CLAUSE_CHARS:
            fail("clause text too long")
        out.append({"id": cid, "text": text.strip()})
    out.sort(key=lambda c: c["id"])
    return out


def check_structural_subset(parent, child):
    """Deterministic gate that runs *before* any LLM is consulted.

    Returns a list of stable lowercase violation strings. Empty means the
    structured scope is a subset and the proposal may proceed to semantic
    review. A non-empty list means objective widening, which is rejected
    without spending any non-determinism.
    """
    v = []

    missing_caps = set_covers(parent["capabilities"], child["capabilities"])
    for c in missing_caps:
        v.append("capability not covered by parent: " + c)

    missing_res = set_covers(parent["resources"], child["resources"])
    for r in missing_res:
        v.append("resource not covered by parent: " + r)

    if child["depth"] != parent["depth"] + 1:
        v.append("depth must be exactly parent depth plus one")
    if child["depth"] > MAX_DEPTH:
        v.append("max delegation depth exceeded")

    if child["expiry"] > parent["expiry"]:
        v.append("expiry exceeds parent expiry")
    if child["expiry"] <= 0:
        v.append("expiry must be positive")

    if len(child["clauses"]) > MAX_CLAUSES:
        v.append("too many clauses")

    return v


# ---------------------------------------------------------------------------
# Fingerprints and locks
# ---------------------------------------------------------------------------


def _digest(payload):
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def clause_pair_digest(parent_clauses, child_clauses):
    """Digest of the normalized clause text on both sides of a review.

    Only the *text* matters: re-proposing the identical wording under a new
    grant id produces the same digest and therefore hits the same lock.
    """
    return _digest({
        "parent": sorted(normalize_clause_text(c["text"]) for c in parent_clauses),
        "child": sorted(normalize_clause_text(c["text"]) for c in child_clauses),
    })


def lock_fingerprint(parent_id, parent_version, parent_clauses, child_clauses):
    """Identity of a clause-pair that AMBIGUOUS locks.

    Bound to the parent id *and* its version, so a delegator who materially
    revises the parent (bumping its version) or the child text gets a fresh
    fingerprint and may retry. Cosmetic edits normalize to the same digest and
    stay locked.
    """
    return _digest({
        "parent_id": parent_id,
        "parent_version": parent_version,
        "clauses": clause_pair_digest(parent_clauses, child_clauses),
    })


def scope_fingerprint(grant):
    """Stable identity of a grant's full enforceable scope."""
    return _digest({
        "capabilities": grant["capabilities"],
        "resources": grant["resources"],
        "expiry": grant["expiry"],
        "clauses": sorted(normalize_clause_text(c["text"]) for c in grant["clauses"]),
    })


# ---------------------------------------------------------------------------
# Equivalence
# ---------------------------------------------------------------------------


def review_comparable(raw):
    """Project a raw review result onto the fields validators must agree on.

    Must match: overall verdict class, the set of clause ids flagged as
    expanding, the set flagged as ambiguous, and whether every parent
    prohibition was addressed. Reasoning prose and raw model text are excluded
    on purpose — validators are allowed to explain themselves differently.
    """
    if not isinstance(raw, dict):
        return {
            "verdict": UNVERIFIABLE,
            "expansion_ids": [],
            "ambiguity_ids": [],
            "prohibitions_covered": False,
        }
    verdict = canon_verdict(raw.get("verdict"))
    expansion = _id_set(raw.get("expansion_clause_ids"))
    ambiguity = _id_set(raw.get("ambiguity_clause_ids"))

    # Keep the verdict and its evidence consistent, so a model cannot say
    # NARROWER while naming expanding clauses (or vice versa).
    if verdict == EXPANDS_AUTHORITY and not expansion:
        verdict = AMBIGUOUS
    if verdict == NARROWER_OR_EQUAL and expansion:
        verdict = EXPANDS_AUTHORITY
    if verdict == NARROWER_OR_EQUAL and ambiguity:
        verdict = AMBIGUOUS

    return {
        "verdict": verdict,
        "expansion_ids": expansion,
        "ambiguity_ids": ambiguity,
        "prohibitions_covered": bool(raw.get("prohibitions_covered", False)),
    }


def _id_set(raw):
    if not isinstance(raw, (list, tuple)):
        return []
    out = []
    for item in raw:
        if isinstance(item, str):
            s = item.strip().lower()
            if s and s not in out:
                out.append(s)
    out.sort()
    return out


def reviews_equivalent(leader, validator):
    return review_comparable(leader) == review_comparable(validator)


def use_comparable(raw):
    """Project a raw prove_use result onto the agreed fields.

    Only the decision and the set of clause ids said to be violated are
    compared; the narrative is free.
    """
    if not isinstance(raw, dict):
        return {"decision": INCONCLUSIVE, "violated_ids": []}
    decision = canon_use_decision(raw.get("decision"))
    violated = _id_set(raw.get("violated_clause_ids"))
    if decision == OUT_OF_SCOPE and not violated:
        # An out-of-scope call that names nothing it violated is not
        # actionable; treat it as inconclusive so no bond is slashed on it.
        decision = INCONCLUSIVE
        violated = []
    if decision != OUT_OF_SCOPE:
        violated = []
    return {"decision": decision, "violated_ids": violated}


def uses_equivalent(leader, validator):
    return use_comparable(leader) == use_comparable(validator)


# ---------------------------------------------------------------------------
# Evidence URL allowlist
# ---------------------------------------------------------------------------

_HOST_RE = re.compile(r"^[a-z0-9.-]+$")
# A host that is entirely numeric (decimal, hex or octal) is an IP in disguise.
_NUMERIC_HOST_RE = re.compile(r"^(0[xX][0-9a-fA-F]+|[0-9]+)$")
# Any bare dotted-quad, public or not: evidence must name a domain.
_DOTTED_IP_RE = re.compile(r"^[0-9]{1,3}(\.[0-9]{1,3}){3}$")
_PRIVATE_HOST_RE = re.compile(
    r"^("
    r"localhost|"
    r"127\.\d+\.\d+\.\d+|"
    r"10\.\d+\.\d+\.\d+|"
    r"192\.168\.\d+\.\d+|"
    r"172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|"
    r"169\.254\.\d+\.\d+|"
    r"0\.0\.0\.0"
    r")$"
)


def normalize_evidence_url(raw):
    """Accept only plain public HTTPS URLs.

    Rejects non-HTTPS schemes, credentials in the authority, non-default ports,
    and loopback/private/link-local hosts, so evidence fetching cannot be aimed
    at validator-internal services.
    """
    if not isinstance(raw, str):
        fail("evidence url must be a string")
    u = raw.strip()
    if len(u) > MAX_URL_CHARS:
        fail("evidence url too long")
    if not u.lower().startswith("https://"):
        fail("evidence url must use https")
    rest = u[len("https://"):]
    if not rest:
        fail("evidence url has no host")
    authority = rest.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    if "@" in authority:
        fail("evidence url must not contain credentials")
    host = authority
    if ":" in authority:
        host, _, port = authority.partition(":")
        if port not in ("", "443"):
            fail("evidence url must use the default https port")
    host = host.lower()
    if not host or not _HOST_RE.fullmatch(host):
        fail("evidence url host is invalid")
    if _PRIVATE_HOST_RE.fullmatch(host):
        fail("evidence url host is not public")
    # A bare number is a packed IPv4 address: 2130706433 resolves to 127.0.0.1,
    # and 0x7f000001 / 017700000001 are the same address in other bases. Reject
    # them by shape rather than relying on the dotted-domain check below to
    # catch them incidentally.
    if _NUMERIC_HOST_RE.fullmatch(host):
        fail("evidence url host is not a public domain")
    if "." not in host:
        fail("evidence url host is not a public domain")
    if _DOTTED_IP_RE.fullmatch(host):
        fail("evidence url host is not a public domain")
    return u


def normalize_evidence_urls(raw_list):
    if not isinstance(raw_list, (list, tuple)):
        fail("evidence urls must be a list")
    if len(raw_list) == 0:
        fail("at least one evidence url is required")
    if len(raw_list) > MAX_EVIDENCE_URLS:
        fail("too many evidence urls")
    out = []
    for item in raw_list:
        u = normalize_evidence_url(item)
        if u not in out:
            out.append(u)
    return out


# ---------------------------------------------------------------------------
# Bond math
# ---------------------------------------------------------------------------


def split_slash(amount, fee_bps):
    """Split a slashed bond into (beneficiary, treasury).

    Integer-exact: the two parts always re-add to `amount`, so no wei is ever
    created or stranded by rounding.
    """
    if amount < 0:
        fail("amount must not be negative")
    if fee_bps < 0 or fee_bps > BPS_DENOM:
        fail("fee bps out of range")
    treasury = (amount * fee_bps) // BPS_DENOM
    return amount - treasury, treasury


def settle_review(verdict, bond, fee_bps):
    """Who gets the review bond after a settled review.

    EXPANDS_AUTHORITY slashes it (delegator tried to widen). NARROWER_OR_EQUAL
    returns it. AMBIGUOUS returns it — an unclear clause is not fraud.
    UNVERIFIABLE returns it — a technical failure is never charged for.
    """
    if verdict == EXPANDS_AUTHORITY:
        to_treasury_pool, treasury = split_slash(bond, fee_bps)
        return {"refund": 0, "slashed": bond, "beneficiary": to_treasury_pool, "treasury": treasury}
    return {"refund": bond, "slashed": 0, "beneficiary": 0, "treasury": 0}


def settle_challenge(verdict, bond, fee_bps):
    """Who gets the challenge bond after a re-review of an ACTIVE grant.

    A challenger who proves expansion is refunded and paid the beneficiary
    share; a challenger who was wrong is slashed. Ambiguous and unverifiable
    re-reviews refund without payout.
    """
    if verdict == EXPANDS_AUTHORITY:
        return {"refund": bond, "slashed": 0, "upheld": True}
    if verdict in (AMBIGUOUS, UNVERIFIABLE):
        return {"refund": bond, "slashed": 0, "upheld": False}
    beneficiary, treasury = split_slash(bond, fee_bps)
    return {
        "refund": 0,
        "slashed": bond,
        "upheld": False,
        "beneficiary": beneficiary,
        "treasury": treasury,
    }


def settle_use(decision, bond, fee_bps):
    """Who gets the use bond after prove_use.

    OUT_OF_SCOPE slashes. WITHIN_SCOPE and INCONCLUSIVE both return it —
    an agent is never charged for a validator's failure to reach evidence.
    """
    if decision == OUT_OF_SCOPE:
        beneficiary, treasury = split_slash(bond, fee_bps)
        return {"refund": 0, "slashed": bond, "beneficiary": beneficiary, "treasury": treasury}
    return {"refund": bond, "slashed": 0, "beneficiary": 0, "treasury": 0}


# ---------------------------------------------------------------------------
# Effectiveness / fail-closed authority
# ---------------------------------------------------------------------------


def status_after_review(verdict):
    """Map a settled review verdict onto the child's new status."""
    if verdict == NARROWER_OR_EQUAL:
        return ST_ACTIVE
    if verdict == EXPANDS_AUTHORITY:
        return ST_DENIED
    if verdict == AMBIGUOUS:
        return ST_AMBIGUOUS
    return ST_RETRYABLE


def grant_effective(grant, now):
    """Is this single grant effective, ignoring its ancestors?

    Fails closed: only an explicitly ACTIVE, unexpired, untainted grant passes.
    """
    if grant is None:
        return False, "grant not found"
    if grant["status"] != ST_ACTIVE:
        return False, "grant status is " + grant["status"].lower()
    if grant.get("tainted"):
        return False, "grant is tainted by an out-of-scope use"
    if grant["expiry"] <= now:
        return False, "grant expired"
    return True, ""


def chain_effective(grant_id, lookup, now, max_depth=MAX_DEPTH):
    """Walk to the root, requiring every ancestor to be effective.

    Revoking a parent therefore instantly de-authorizes its whole subtree with
    no bookkeeping. Returns (ok, reason). Fails closed on a missing ancestor or
    a cycle.
    """
    seen = set()
    cur = grant_id
    hops = 0
    while True:
        if hops > max_depth + 1:
            return False, "delegation chain too deep"
        if cur in seen:
            return False, "delegation cycle detected"
        seen.add(cur)
        g = lookup(cur)
        ok, reason = grant_effective(g, now)
        if not ok:
            if cur != grant_id:
                return False, "ancestor " + cur + ": " + reason
            return False, reason
        parent = g.get("parent_id") or ""
        if not parent:
            return True, ""
        cur = parent
        hops += 1


def can_invoke(grant_id, actor, capability, resource, lookup, now):
    """Fail-closed authority check.

    Every one of these must hold: the grant exists, the actor is its grantee,
    the capability and resource are inside its own scope, and every grant from
    here to the root is effective. Anything else, including any internal
    inconsistency, is a denial with a stable reason.
    """
    g = lookup(grant_id)
    if g is None:
        return False, "grant not found"

    if not isinstance(actor, str) or not actor.strip():
        return False, "actor required"
    if g["grantee"].lower() != actor.strip().lower():
        return False, "actor is not the grantee"

    try:
        cap = normalize_token(capability)
        res = normalize_token(resource)
    except CordError as e:
        return False, str(e)

    if not any(token_covers(p, cap) for p in g["capabilities"]):
        return False, "capability outside grant scope"
    if not any(token_covers(p, res) for p in g["resources"]):
        return False, "resource outside grant scope"

    ok, reason = chain_effective(grant_id, lookup, now)
    if not ok:
        return False, reason

    return True, ""
