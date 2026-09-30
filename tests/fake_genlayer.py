"""A minimal in-process stand-in for the GenVM runtime.

Enough of `genlayer` to import Cord.py and drive its state machine under
CPython: storage maps, value transfer, the public decorators, and a
non-determinism layer whose model answers and web fetches the test supplies.

This is a test harness, not an emulator. It deliberately reproduces the two
runtime behaviours the contract's safety depends on — `run_nondet_default`
raising when the validator disagrees with the leader, and `web.get` being
called independently by each side — so consensus failure and evidence
re-fetching are exercised rather than assumed.
"""

import sys
import types


class UserError(Exception):
    pass


# --- storage primitives ----------------------------------------------------


class TreeMap(dict):
    """Ordered-by-insertion mapping; the contract only needs get/set/contains."""


def u256(v):
    v = int(v)
    if v < 0:
        raise UserError("u256 underflow")
    return v


class Address:
    def __init__(self, hexstr):
        if not isinstance(hexstr, str) or not hexstr:
            raise UserError("bad address")
        self._hex = hexstr.lower()

    @property
    def as_hex(self):
        return self._hex

    def __eq__(self, other):
        return isinstance(other, Address) and other._hex == self._hex

    def __hash__(self):
        return hash(self._hex)

    def __repr__(self):
        return f"Address({self._hex})"


# --- ambient chain state ---------------------------------------------------


class _Message:
    sender_address = Address("0x" + "11" * 20)
    value = 0


class _Block:
    timestamp = 1_700_000_000


class _Chain:
    """Records value sent out, so tests can assert on payouts."""

    def __init__(self):
        self.sent = []

    def send_value(self, to, amount):
        self.sent.append((to.as_hex, int(amount)))


# --- non-determinism -------------------------------------------------------


class NondetControl:
    """Scripted model answers and web responses.

    `leader_answers` and `validator_answers` are consumed in order. When
    `validator_answers` is empty the validator mirrors the leader, which is the
    agreeing case.
    """

    def __init__(self):
        self.leader_answers = []
        self.validator_answers = []
        self.web = {}
        self.prompts = []
        self.fetched = []
        self.force_exception = False

    def reset(self):
        self.__init__()

    def _next(self, queue, fallback):
        if queue:
            return queue.pop(0)
        return fallback


class _Web:
    def __init__(self, control):
        self._c = control

    def get(self, url):
        self._c.fetched.append(url)
        entry = self._c.web.get(url)
        if entry is None:
            raise RuntimeError("fetch failed: " + url)
        status, body = entry
        return types.SimpleNamespace(
            status=status,
            body=body if isinstance(body, bytes) else str(body).encode("utf-8"),
        )


def _make_modules():
    control = NondetControl()
    chain = _Chain()

    gl = types.ModuleType("genlayer")

    # contract.Contract
    contract_mod = types.ModuleType("genlayer.contract")

    class Contract:
        """Allocates annotated storage fields, as GenVM does for a deployed IC."""

        def __new__(cls, *args, **kwargs):
            obj = super().__new__(cls)
            for klass in reversed(cls.__mro__):
                for name, ann in getattr(klass, "__annotations__", {}).items():
                    origin = getattr(ann, "__origin__", ann)
                    if origin is TreeMap or ann is TreeMap:
                        setattr(obj, name, TreeMap())
                    elif ann is u256:
                        setattr(obj, name, 0)
            return obj

    contract_mod.Contract = Contract

    # public decorators — identity wrappers that record their kind
    def _mark(kind):
        def deco(fn):
            fn.__cord_kind__ = kind
            return fn
        return deco

    class _Write:
        def __call__(self, fn):
            return _mark("write")(fn)

        @property
        def payable(self):
            return _mark("write.payable")

    public = types.SimpleNamespace(write=_Write(), view=_mark("view"))

    # vm
    vm_mod = types.ModuleType("genlayer.vm")
    vm_mod.UserError = UserError

    def run_nondet_default(leader_fn, validator_fn):
        if control.force_exception:
            raise RuntimeError("nondet unavailable")
        result = leader_fn()
        if not validator_fn(result):
            raise RuntimeError("validator disagreed with leader")
        return result

    vm_mod.run_nondet_default = run_nondet_default

    # eq_principle — the platform's own equivalence primitives.
    eq_mod = types.ModuleType("genlayer.eq_principle")

    def strict_eq(fn):
        """Run `fn` on the leader and again, independently, on the validator.

        Reproduces the two behaviours the contract's safety rests on: the
        validator executes the same function itself (so evidence is re-fetched
        rather than taken from the leader), and a mismatch raises instead of
        silently resolving to the leader's answer.
        """
        if control.force_exception:
            raise RuntimeError("nondet unavailable")
        leader_result = fn()
        validator_result = fn()
        if leader_result != validator_result:
            raise RuntimeError("validators did not reach consensus")
        return leader_result

    eq_mod.strict_eq = strict_eq

    # nondet
    nondet_mod = types.ModuleType("genlayer.nondet")
    nondet_mod.web = _Web(control)

    def exec_prompt(prompt, response_format=None):
        control.prompts.append(prompt)
        # Distinguish leader from validator by call parity within a judgment:
        # the harness simply serves the leader queue first, then the validator
        # queue, which is the order run_nondet_default invokes them in.
        if not control._leader_served:
            control._leader_served = True
            return control._next(control.leader_answers, "{}")
        control._leader_served = False
        if control.validator_answers:
            return control.validator_answers.pop(0)
        return control.last_leader_answer

    control._leader_served = False
    control.last_leader_answer = "{}"

    def _exec_prompt(prompt, response_format=None):
        control.prompts.append(prompt)
        if not control._leader_served:
            control._leader_served = True
            ans = control._next(control.leader_answers, "{}")
            control.last_leader_answer = ans
            return ans
        control._leader_served = False
        if control.validator_answers:
            return control.validator_answers.pop(0)
        return control.last_leader_answer

    nondet_mod.exec_prompt = _exec_prompt

    # evm
    evm_mod = types.ModuleType("genlayer.evm")
    evm_mod.send_value = chain.send_value

    # types
    types_mod = types.ModuleType("genlayer.types")
    types_mod.TreeMap = TreeMap
    types_mod.Address = Address
    types_mod.u256 = u256
    types_mod.u8 = int
    types_mod.u32 = int
    types_mod.bigint = int
    types_mod.__all__ = ["TreeMap", "Address", "u256", "u8", "u32", "bigint"]

    gl.contract = contract_mod
    gl.public = public
    gl.vm = vm_mod
    gl.eq_principle = eq_mod
    gl.nondet = nondet_mod
    gl.evm = evm_mod
    gl.types = types_mod
    gl.message = _Message
    gl.block = _Block

    return gl, types_mod, contract_mod, vm_mod, nondet_mod, evm_mod, eq_mod, control, chain


def install():
    """Register the fake modules in sys.modules and return the test controls."""
    (gl, types_mod, contract_mod, vm_mod, nondet_mod,
     evm_mod, eq_mod, control, chain) = _make_modules()
    sys.modules["genlayer"] = gl
    sys.modules["genlayer.types"] = types_mod
    sys.modules["genlayer.contract"] = contract_mod
    sys.modules["genlayer.vm"] = vm_mod
    sys.modules["genlayer.nondet"] = nondet_mod
    sys.modules["genlayer.evm"] = evm_mod
    sys.modules["genlayer.eq_principle"] = eq_mod
    return gl, control, chain
