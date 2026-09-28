"""Pure-logic tests. No genlayer import is needed to run these."""

import pytest

from cordlib.core import (
    AMBIGUOUS,
    BPS_DENOM,
    EXPANDS_AUTHORITY,
    INCONCLUSIVE,
    MAX_DEPTH,
    NARROWER_OR_EQUAL,
    OUT_OF_SCOPE,
    ST_ACTIVE,
    ST_AMBIGUOUS,
    ST_DENIED,
    ST_RETRYABLE,
    ST_REVOKED,
    UNVERIFIABLE,
    WITHIN_SCOPE,
    CordError,
    can_invoke,
    canon_use_decision,
    canon_verdict,
    chain_effective,
    check_structural_subset,
    lock_fingerprint,
    normalize_clause_text,
    normalize_clauses,
    normalize_evidence_url,
    normalize_evidence_urls,
    normalize_token,
    normalize_token_set,
    review_comparable,
    reviews_equivalent,
    scope_fingerprint,
    set_covers,
    settle_challenge,
    settle_review,
    settle_use,
    split_slash,
    status_after_review,
    token_covers,
    use_comparable,
    uses_equivalent,
)


# --- token coverage --------------------------------------------------------


def test_wildcard_covers_everything():
    assert token_covers("*", "payments.send")


def test_prefix_wildcard_covers_subtree_and_itself():
    assert token_covers("payments.*", "payments.send")
    assert token_covers("payments.*", "payments")
    assert not token_covers("payments.*", "payroll.send")


def test_prefix_wildcard_does_not_cover_sibling_with_shared_prefix():
    # "payments.*" must not leak into "paymentsx" via a naive startswith.
    assert not token_covers("payments.*", "paymentsx")


def test_exact_match_only_otherwise():
    assert token_covers("read", "read")
    assert not token_covers("read", "write")


def test_set_covers_reports_uncovered_children():
    assert set_covers(["a.*"], ["a.b", "c"]) == ["c"]
    assert set_covers(["*"], ["anything"]) == []


# --- normalization ---------------------------------------------------------


def test_token_normalization_is_case_and_space_insensitive():
    assert normalize_token("  Payments.Send  ") == "payments.send"


def test_empty_token_rejected():
    with pytest.raises(CordError):
        normalize_token("   ")


def test_token_set_dedupes_and_sorts():
    assert normalize_token_set(["b", "A", "a"], "caps", 10) == ["a", "b"]


def test_empty_token_set_rejected():
    with pytest.raises(CordError):
        normalize_token_set([], "caps", 10)


def test_clause_ids_must_be_unique():
    with pytest.raises(CordError):
        normalize_clauses([{"id": "c1", "text": "x"}, {"id": "c1", "text": "y"}])


def test_too_many_clauses_rejected():
    with pytest.raises(CordError):
        normalize_clauses([{"id": "c%d" % i, "text": "t"} for i in range(9)])


def test_clause_text_length_capped():
    with pytest.raises(CordError):
        normalize_clauses([{"id": "c1", "text": "x" * 601}])


def test_cosmetic_edits_normalize_to_the_same_text():
    a = normalize_clause_text("No refunds over $500.")
    b = normalize_clause_text("  no   refunds over $500  ")
    c = normalize_clause_text("“No refunds over $500”")
    assert a == b == c


def test_material_rewording_changes_normalized_text():
    assert normalize_clause_text("No refunds over $500") != normalize_clause_text(
        "No refunds over $900"
    )


# --- structural subset -----------------------------------------------------


def _parent(**over):
    p = {
        "capabilities": ["payments.*"],
        "resources": ["acct.ops"],
        "depth": 0,
        "expiry": 2_000_000_000,
        "clauses": [],
    }
    p.update(over)
    return p


def _child(**over):
    c = {
        "capabilities": ["payments.send"],
        "resources": ["acct.ops"],
        "depth": 1,
        "expiry": 1_900_000_000,
        "clauses": [],
    }
    c.update(over)
    return c


def test_clean_subset_has_no_violations():
    assert check_structural_subset(_parent(), _child()) == []


def test_capability_widening_is_caught():
    v = check_structural_subset(_parent(), _child(capabilities=["payroll.run"]))
    assert any("capability not covered" in x for x in v)


def test_resource_widening_is_caught():
    v = check_structural_subset(_parent(), _child(resources=["acct.treasury"]))
    assert any("resource not covered" in x for x in v)


def test_expiry_beyond_parent_is_caught():
    v = check_structural_subset(_parent(), _child(expiry=2_100_000_000))
    assert any("expiry exceeds parent" in x for x in v)


def test_depth_must_be_exactly_one_deeper():
    v = check_structural_subset(_parent(), _child(depth=3))
    assert any("depth must be exactly" in x for x in v)


def test_max_depth_enforced():
    v = check_structural_subset(
        _parent(depth=MAX_DEPTH), _child(depth=MAX_DEPTH + 1)
    )
    assert any("max delegation depth" in x for x in v)


# --- fingerprints and locks ------------------------------------------------


def test_lock_fingerprint_is_stable_under_cosmetic_edits():
    pc = [{"id": "p1", "text": "Spend only on hosting."}]
    a = lock_fingerprint("g1", 1, pc, [{"id": "c1", "text": "Spend only on hosting"}])
    b = lock_fingerprint("g1", 1, pc, [{"id": "c9", "text": "  spend ONLY on hosting.  "}])
    assert a == b, "cosmetic edits (and clause ids) must not unlock a locked pair"


def test_lock_fingerprint_changes_on_material_revision():
    pc = [{"id": "p1", "text": "Spend only on hosting."}]
    a = lock_fingerprint("g1", 1, pc, [{"id": "c1", "text": "Spend only on hosting"}])
    b = lock_fingerprint("g1", 1, pc, [{"id": "c1", "text": "Spend only on hosting and travel"}])
    assert a != b


def test_lock_fingerprint_changes_when_parent_version_bumps():
    pc = [{"id": "p1", "text": "Spend only on hosting."}]
    cc = [{"id": "c1", "text": "Spend only on hosting"}]
    assert lock_fingerprint("g1", 1, pc, cc) != lock_fingerprint("g1", 2, pc, cc)


def test_scope_fingerprint_tracks_scope_changes():
    g = {"capabilities": ["a"], "resources": ["r"], "expiry": 1, "clauses": []}
    h = dict(g, capabilities=["a", "b"])
    assert scope_fingerprint(g) != scope_fingerprint(h)


# --- verdict canonicalization ---------------------------------------------


def test_known_verdicts_pass_through():
    assert canon_verdict("EXPANDS_AUTHORITY") == EXPANDS_AUTHORITY
    assert canon_verdict(" narrower_or_equal ") == NARROWER_OR_EQUAL


def test_unknown_verdict_fails_closed_to_unverifiable():
    assert canon_verdict("definitely fine") == UNVERIFIABLE
    assert canon_verdict(None) == UNVERIFIABLE
    assert canon_verdict(42) == UNVERIFIABLE


def test_unknown_use_decision_fails_closed_to_inconclusive():
    assert canon_use_decision("looks good") == INCONCLUSIVE
    assert canon_use_decision(None) == INCONCLUSIVE
    assert canon_use_decision("WITHIN_SCOPE") == WITHIN_SCOPE


# --- equivalence -----------------------------------------------------------


def test_reasoning_prose_does_not_break_equivalence():
    a = {"verdict": NARROWER_OR_EQUAL, "reasoning": "clearly narrower"}
    b = {"verdict": NARROWER_OR_EQUAL, "reasoning": "the child restates every limit"}
    assert reviews_equivalent(a, b)


def test_different_expansion_sets_break_equivalence():
    a = {"verdict": EXPANDS_AUTHORITY, "expansion_clause_ids": ["c1"]}
    b = {"verdict": EXPANDS_AUTHORITY, "expansion_clause_ids": ["c2"]}
    assert not reviews_equivalent(a, b)


def test_narrower_with_named_expansions_is_coerced_to_expands():
    got = review_comparable({"verdict": NARROWER_OR_EQUAL, "expansion_clause_ids": ["c1"]})
    assert got["verdict"] == EXPANDS_AUTHORITY


def test_narrower_with_named_ambiguities_is_coerced_to_ambiguous():
    got = review_comparable({"verdict": NARROWER_OR_EQUAL, "ambiguity_clause_ids": ["c1"]})
    assert got["verdict"] == AMBIGUOUS


def test_expands_naming_nothing_is_coerced_to_ambiguous():
    got = review_comparable({"verdict": EXPANDS_AUTHORITY, "expansion_clause_ids": []})
    assert got["verdict"] == AMBIGUOUS


def test_out_of_scope_naming_nothing_is_coerced_to_inconclusive():
    got = use_comparable({"decision": OUT_OF_SCOPE, "violated_clause_ids": []})
    assert got["decision"] == INCONCLUSIVE


def test_use_equivalence_ignores_reasoning():
    a = {"decision": WITHIN_SCOPE, "reasoning": "invoice matches"}
    b = {"decision": WITHIN_SCOPE, "reasoning": "the page shows the same amount"}
    assert uses_equivalent(a, b)


def test_use_equivalence_separates_decisions():
    assert not uses_equivalent({"decision": WITHIN_SCOPE}, {"decision": INCONCLUSIVE})


def test_garbage_projects_to_failing_closed():
    assert review_comparable("not a dict")["verdict"] == UNVERIFIABLE
    assert use_comparable(None)["decision"] == INCONCLUSIVE


# --- evidence URL allowlist ------------------------------------------------


def test_https_public_url_accepted():
    assert normalize_evidence_url("https://example.com/invoice/1") == (
        "https://example.com/invoice/1"
    )


@pytest.mark.parametrize(
    "bad",
    [
        "http://example.com",             # not https
        "https://localhost/x",            # loopback
        "https://127.0.0.1/x",            # loopback
        "https://10.1.2.3/x",             # private
        "https://192.168.0.5/x",          # private
        "https://172.16.9.9/x",           # private
        "https://169.254.169.254/latest", # link-local metadata
        "https://user:pw@example.com/x",  # credentials
        "https://example.com:8080/x",     # non-default port
        "https://intranet/x",             # no public domain
        "file:///etc/passwd",             # wrong scheme
    ],
)
def test_hostile_evidence_urls_rejected(bad):
    with pytest.raises(CordError):
        normalize_evidence_url(bad)


def test_evidence_url_list_dedupes():
    got = normalize_evidence_urls(["https://a.com/1", "https://a.com/1", "https://b.com/2"])
    assert got == ["https://a.com/1", "https://b.com/2"]


def test_empty_evidence_list_rejected():
    with pytest.raises(CordError):
        normalize_evidence_urls([])


# --- bond math -------------------------------------------------------------


def test_split_is_exact_and_loses_no_wei():
    for amount in (0, 1, 7, 999, 10**18, 3):
        for bps in (0, 1, 1000, 3333, BPS_DENOM):
            a, b = split_slash(amount, bps)
            assert a + b == amount
            assert a >= 0 and b >= 0


def test_fee_bps_out_of_range_rejected():
    with pytest.raises(CordError):
        split_slash(100, BPS_DENOM + 1)


def test_expanding_review_slashes_the_whole_bond():
    s = settle_review(EXPANDS_AUTHORITY, 1000, 1000)
    assert s["refund"] == 0 and s["slashed"] == 1000
    assert s["beneficiary"] + s["treasury"] == 1000


@pytest.mark.parametrize("verdict", [NARROWER_OR_EQUAL, AMBIGUOUS, UNVERIFIABLE])
def test_non_expanding_reviews_refund_in_full(verdict):
    s = settle_review(verdict, 1000, 1000)
    assert s["refund"] == 1000 and s["slashed"] == 0


def test_successful_challenge_is_refunded_and_upheld():
    s = settle_challenge(EXPANDS_AUTHORITY, 2000, 1000)
    assert s["upheld"] and s["refund"] == 2000 and s["slashed"] == 0


def test_wrong_challenge_is_slashed():
    s = settle_challenge(NARROWER_OR_EQUAL, 2000, 1000)
    assert not s["upheld"] and s["slashed"] == 2000
    assert s["beneficiary"] + s["treasury"] == 2000


@pytest.mark.parametrize("verdict", [AMBIGUOUS, UNVERIFIABLE])
def test_unsettled_challenge_refunds_without_payout(verdict):
    s = settle_challenge(verdict, 2000, 1000)
    assert s["refund"] == 2000 and s["slashed"] == 0 and not s["upheld"]


def test_out_of_scope_use_is_slashed():
    s = settle_use(OUT_OF_SCOPE, 500, 1000)
    assert s["slashed"] == 500 and s["beneficiary"] + s["treasury"] == 500


@pytest.mark.parametrize("decision", [WITHIN_SCOPE, INCONCLUSIVE])
def test_within_and_inconclusive_uses_refund(decision):
    assert settle_use(decision, 500, 1000)["refund"] == 500


def test_inconclusive_never_costs_the_agent():
    # A validator that cannot reach the evidence must not cost the agent money.
    assert settle_use(INCONCLUSIVE, 10**18, 5000)["slashed"] == 0


# --- status mapping --------------------------------------------------------


def test_verdicts_map_onto_statuses():
    assert status_after_review(NARROWER_OR_EQUAL) == ST_ACTIVE
    assert status_after_review(EXPANDS_AUTHORITY) == ST_DENIED
    assert status_after_review(AMBIGUOUS) == ST_AMBIGUOUS
    assert status_after_review(UNVERIFIABLE) == ST_RETRYABLE


# --- chain effectiveness and can_invoke ------------------------------------

NOW = 1_000


def _g(gid, parent="", status=ST_ACTIVE, expiry=NOW + 1000, **over):
    g = {
        "id": gid,
        "parent_id": parent,
        "grantee": "0xagent",
        "grantor": "0xboss",
        "status": status,
        "expiry": expiry,
        "tainted": False,
        "capabilities": ["payments.send"],
        "resources": ["acct.ops"],
        "clauses": [],
        "depth": 0,
    }
    g.update(over)
    return g


def _world(*grants):
    table = {g["id"]: g for g in grants}
    return lambda gid: table.get(gid)


def test_chain_effective_for_healthy_lineage():
    ok, _ = chain_effective("c", _world(_g("root"), _g("c", parent="root")), NOW)
    assert ok


def test_revoked_ancestor_denies_the_whole_subtree():
    world = _world(_g("root", status=ST_REVOKED), _g("c", parent="root"))
    ok, reason = chain_effective("c", world, NOW)
    assert not ok and "ancestor root" in reason


def test_expired_ancestor_denies_descendant():
    world = _world(_g("root", expiry=NOW - 1), _g("c", parent="root"))
    ok, reason = chain_effective("c", world, NOW)
    assert not ok and "expired" in reason


def test_missing_ancestor_fails_closed():
    ok, reason = chain_effective("c", _world(_g("c", parent="ghost")), NOW)
    assert not ok and "not found" in reason


def test_cycle_fails_closed():
    world = _world(_g("a", parent="b"), _g("b", parent="a"))
    ok, reason = chain_effective("a", world, NOW)
    assert not ok and ("cycle" in reason or "too deep" in reason)


def test_tainted_grant_is_not_effective():
    ok, reason = chain_effective("a", _world(_g("a", tainted=True)), NOW)
    assert not ok and "tainted" in reason


@pytest.mark.parametrize("status", [ST_AMBIGUOUS, ST_DENIED, ST_RETRYABLE, ST_REVOKED])
def test_only_active_status_is_effective(status):
    ok, _ = chain_effective("a", _world(_g("a", status=status)), NOW)
    assert not ok


def test_can_invoke_allows_the_grantee_within_scope():
    allowed, reason = can_invoke(
        "a", "0xAGENT", "payments.send", "acct.ops", _world(_g("a")), NOW
    )
    assert allowed, reason


def test_can_invoke_denies_a_different_actor():
    allowed, reason = can_invoke(
        "a", "0xintruder", "payments.send", "acct.ops", _world(_g("a")), NOW
    )
    assert not allowed and reason == "actor is not the grantee"


def test_can_invoke_denies_capability_outside_scope():
    allowed, reason = can_invoke(
        "a", "0xagent", "payroll.run", "acct.ops", _world(_g("a")), NOW
    )
    assert not allowed and "capability outside" in reason


def test_can_invoke_denies_resource_outside_scope():
    allowed, reason = can_invoke(
        "a", "0xagent", "payments.send", "acct.treasury", _world(_g("a")), NOW
    )
    assert not allowed and "resource outside" in reason


def test_can_invoke_denies_missing_grant():
    allowed, reason = can_invoke("nope", "0xagent", "c", "r", _world(), NOW)
    assert not allowed and reason == "grant not found"


def test_can_invoke_denies_empty_actor():
    allowed, _ = can_invoke("a", "  ", "payments.send", "acct.ops", _world(_g("a")), NOW)
    assert not allowed


def test_can_invoke_denies_when_an_ancestor_is_revoked():
    world = _world(_g("root", status=ST_REVOKED), _g("c", parent="root", depth=1))
    allowed, _ = can_invoke("c", "0xagent", "payments.send", "acct.ops", world, NOW)
    assert not allowed
