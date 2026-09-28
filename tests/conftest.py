"""Make cordlib importable and install the fake GenVM before Cord.py loads."""

import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "contracts"))
sys.path.insert(0, str(ROOT / "tests"))

import fake_genlayer  # noqa: E402

_GL, _CONTROL, _CHAIN = fake_genlayer.install()

import Cord as cord_module  # noqa: E402


@pytest.fixture
def gl():
    return _GL


@pytest.fixture
def nondet():
    _CONTROL.reset()
    _CONTROL._leader_served = False
    _CONTROL.last_leader_answer = "{}"
    return _CONTROL


@pytest.fixture
def chain():
    _CHAIN.sent.clear()
    return _CHAIN


@pytest.fixture
def cord():
    return cord_module
