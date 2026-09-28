#!/usr/bin/env python3
"""Inline cordlib into Cord.py to produce the single deployable file.

GenVM validates one file, and sibling imports fail validation, so the modules
that exist separately for testing are concatenated here. The Depends line is
re-emitted as byte one of the output with nothing above it.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "build" / "Cord.bundled.py"
DEPENDS = '# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }'

# Order matters: judgment imports from core.
MODULES = ["cordlib/core.py", "cordlib/judgment.py"]

BEGIN = "# --- cordlib (inlined by contracts/build_bundle.py for deployment) ---------"
END = "# --- end cordlib ----------------------------------------------------------"


def strip_module(text):
    """Drop a module's own imports of the other bundled modules.

    Stdlib imports are kept and hoisted; only intra-package imports are removed,
    since after concatenation every name is already in one namespace.
    """
    text = re.sub(
        r"(?m)^from \.{0,2}cordlib[\w.]* import \([^)]*\)\n", "", text
    )
    text = re.sub(r"(?m)^from \.{0,2}cordlib[\w.]* import .*\n", "", text)
    text = re.sub(r"(?m)^from \.[\w.]* import \([^)]*\)\n", "", text)
    text = re.sub(r"(?m)^from \.[\w.]* import .*\n", "", text)
    return text.strip() + "\n"


def collect_stdlib_imports(texts):
    found = []
    for t in texts:
        for line in t.splitlines():
            s = line.strip()
            if s.startswith(("import ", "from ")) and "cordlib" not in s:
                if s.startswith(("from .", "import .")):
                    continue
                if s.startswith(("from genlayer", "import genlayer")):
                    continue
                if s not in found:
                    found.append(s)
    return found


def main():
    contract = (ROOT / "Cord.py").read_text(encoding="utf-8")
    if BEGIN not in contract or END not in contract:
        print("error: cordlib import markers missing from Cord.py", file=sys.stderr)
        return 1

    module_texts = [(ROOT / m).read_text(encoding="utf-8") for m in MODULES]
    stripped = [strip_module(t) for t in module_texts]

    # Hoist every stdlib import the inlined modules need above the contract, so
    # nothing depends on where in the file its module landed.
    header = collect_stdlib_imports(stripped)

    inlined = (
        "# --- begin inlined cordlib (generated; edit contracts/cordlib/*.py) ---\n"
        + "\n".join(header) + "\n\n"
        + "\n\n".join(stripped)
        + "\n# --- end inlined cordlib ---"
    )

    start = contract.index(BEGIN)
    end = contract.index(END) + len(END)
    bundled = contract[:start] + inlined + contract[end:]

    # The runner directive must be the very first bytes of the file.
    lines = bundled.splitlines()
    lines = [ln for ln in lines if not ln.startswith('# { "Depends"')]
    bundled = DEPENDS + "\n" + "\n".join(lines).lstrip("\n") + "\n"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(bundled, encoding="utf-8")

    raw = OUT.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), "BOM in bundled output"
    assert raw.split(b"\n", 1)[0].decode() == DEPENDS, "Depends line is not first"
    compile(bundled, str(OUT), "exec")

    print(f"wrote {OUT} ({len(raw)} bytes, {len(bundled.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
