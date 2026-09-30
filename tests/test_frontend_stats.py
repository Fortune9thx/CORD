"""The landing page quotes figures about this repo. Check them.

A number on the marketing page is a claim, and CORD's whole posture is that it
does not make claims it has not verified. The test count sat at a stale 141
while the suite had grown to 159, and nothing caught it because no test looked.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATS = ROOT / "frontend" / "src" / "lib" / "stats.ts"
CORE = ROOT / "contracts" / "cordlib" / "core.py"


def _stat(name: str) -> int:
    m = re.search(rf"export const {name} = (\d+);", STATS.read_text(encoding="utf-8"))
    assert m, f"{name} not found in stats.ts"
    return int(m.group(1))


def test_test_count_matches_the_suite(pytestconfig, request):
    """TEST_COUNT must equal the number of tests actually collected.

    Skipped when the run is a filtered subset (-k, or an explicit node id),
    since a partial collection says nothing about the suite's real size.
    """
    total = getattr(pytestconfig, "cord_collected_count", None)
    if total is None:
        import pytest

        pytest.skip("collection count unavailable")
    if pytestconfig.getoption("keyword") or pytestconfig.args != [str(ROOT / "tests")]:
        full = _full_collection_size()
        if full is not None:
            total = full
    assert _stat("TEST_COUNT") == total, (
        f"stats.ts says {_stat('TEST_COUNT')} tests, the suite collects {total}. "
        "Update frontend/src/lib/stats.ts."
    )


def _full_collection_size():
    """Collect the whole suite in a subprocess, for filtered runs."""
    import subprocess
    import sys

    r = subprocess.run(
        [sys.executable, "-m", "pytest", str(ROOT / "tests"), "-q", "--collect-only"],
        capture_output=True,
        text=True,
    )
    m = re.search(r"(\d+) tests? collected", r.stdout)
    return int(m.group(1)) if m else None


def test_max_depth_matches_the_contract():
    src = CORE.read_text(encoding="utf-8")
    m = re.search(r"^MAX_DEPTH = (\d+)", src, re.M)
    assert m, "MAX_DEPTH not found in contracts/cordlib/core.py"
    assert _stat("MAX_DELEGATION_DEPTH") == int(m.group(1))
