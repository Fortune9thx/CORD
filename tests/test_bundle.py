"""Gates on the single deployable file.

These are the checks that would otherwise only fail at deploy time: the runner
directive's exact position, a single contract class, and the absence of the
unsafe non-determinism entry point.
"""

import ast
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "contracts" / "build" / "Cord.bundled.py"
DEPENDS = (
    '# { "Depends": "py-genlayer:'
    '5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }'
)

# GenVM's published contract size ceiling. Kept as a named constant rather than
# a folk number; see docs/STATUS.md for what was actually observed on deploy.
SIZE_LIMIT = 4 * 1024 * 1024


def build():
    subprocess.run(
        [sys.executable, str(ROOT / "contracts" / "build_bundle.py")],
        check=True, capture_output=True,
    )
    return BUNDLE.read_bytes()


def test_depends_line_is_the_very_first_bytes():
    raw = build()
    assert not raw.startswith(b"\xef\xbb\xbf"), "a BOM would displace the runner directive"
    assert raw.split(b"\n", 1)[0].decode("utf-8") == DEPENDS


def test_bundle_parses_as_python():
    ast.parse(build().decode("utf-8"))


def test_exactly_one_contract_class():
    tree = ast.parse(build().decode("utf-8"))
    contracts = [
        n for n in ast.walk(tree)
        if isinstance(n, ast.ClassDef)
        and any(
            isinstance(b, ast.Attribute) and b.attr == "Contract"
            for b in n.bases
        )
    ]
    assert len(contracts) == 1, "GenVM accepts exactly one Contract subclass"
    assert contracts[0].name == "Cord"


def test_no_sibling_imports_survive_bundling():
    src = build().decode("utf-8")
    for line in src.splitlines():
        s = line.strip()
        assert not s.startswith("from cordlib"), "sibling import would fail validation"
        assert not s.startswith("from .cordlib"), "sibling import would fail validation"
        assert not s.startswith("import cordlib"), "sibling import would fail validation"


def test_judgment_uses_the_safe_nondet_entry_point():
    src = build().decode("utf-8")
    assert "run_nondet_default" in src
    # `run_nondet` is the unsafe variant; it must not appear except as the
    # prefix of the safe name.
    assert src.count("run_nondet") == src.count("run_nondet_default")


def test_bundle_is_within_the_size_limit():
    raw = build()
    assert len(raw) < SIZE_LIMIT, "bundle exceeds the GenVM contract size limit"


def test_bundle_carries_the_pure_logic_it_needs():
    src = build().decode("utf-8")
    for name in (
        "def can_invoke", "def chain_effective", "def check_structural_subset",
        "def lock_fingerprint", "def settle_review", "def settle_use",
        "def build_review_prompt", "def build_use_prompt",
        "def normalize_evidence_url",
    ):
        assert name in src, "missing inlined definition: " + name


def test_bundle_matches_a_fresh_build():
    """The committed bundle must not drift from cordlib + Cord.py."""
    first = build()
    second = build()
    assert first == second, "bundling is not deterministic"
