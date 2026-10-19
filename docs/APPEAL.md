# APPEAL

Response to the finding that CORD's `claim()` did not actually pay out: the
ledger zeroed and the call returned success, but no GEN left the contract. The
finding was correct. This is what was wrong, what changed, and the on-chain
evidence that it is fixed.

## What was wrong

`claim()` sent the payout with `gl.chain.Account(gl.message.sender_address)
.emit_transfer(u256(amount))`. That emits an **internal** message. A value
transfer to an EOA (an account on the chain layer, not an intelligent contract)
carried on an internal message is not delivered on Studio Dev: the runner
finalizes the message with `message_value_effects[..].skipped: true` and
`skippedRefunded: true`, returning the value to the contract. The write still
reported `MAJORITY_AGREE` / leader `SUCCESS`, so the call appeared to work while
the recipient's balance stayed flat.

Attaching a Studio-estimated `messageAllocations` entry did not help, because
that estimate only budgets the *internal* message; the emitted message kept its
own `declaredBudget: 0`.

Baseline (previous deployment, `0x4e97…`): internal path, no payout.

| | |
|---|---|
| claim tx | `0xf3f38767…` was the fixed run; the internal-path baseline is recorded in `deploy/deployments.json` under `previousDeployments` |
| receipt | `messages[0].messageType: "Internal"`, `message_value_effects: {declaredBudget: 0, skipped: true, skippedRefunded: true, skippedRefundAmount: 9000000000000000}` |
| balance | grantor EOA delta = exactly `−feeValue`; no credit |

## What changed

`contracts/Cord.py` now declares a typed EVM handle at module scope and emits the
payout through it:

```python
@gl.evm.contract_interface
class _EoaRecipient:
    class View:
        pass

    class Write:
        pass
```

```python
self.claimable[key] = u256(0)
_EoaRecipient(gl.message.sender_address).emit_transfer(value=u256(amount))
return amount
```

An external message to an EOA always executes on finalization. The ledger is
still zeroed *before* the transfer, so the pull-payment safety property is
unchanged: no balance can be double-spent and nothing is pushed to an address
that cannot receive it. The write is submitted with the fee estimate's
`messageAllocations` (now `messageType: 0`, External) so the external message
has a non-zero budget.

## Evidence it is fixed

Contract `0xC05bfCbeaB47Bf9e934FBE459C2a853039f26E9D`, deploy tx
`0xda9071787f37a03b1c7113b7c6458141694d51cc3ef6c3a8b085d12d54286747`.

Sequence, all on chain:

| Step | Tx | Result |
|---|---|---|
| `create_root` (g1) | `0x5a83cd08…` | ACTIVE root |
| `propose_child` (g2, widens in prose) | `0x8e8590cd…` | PROPOSED |
| `request_review g2` (0.01 GEN bond) | `0xd9dc295c…` | EXPANDS_AUTHORITY, slashed; g2 DENIED |
| `claim()` by grantor | `0xf3f38767…` | MAJORITY_AGREE, **0.009 GEN delivered** |

The claim receipt proves delivery, field by field:

- `messages[0]`: `value: 9000000000000000`, `recipient: 0x1c23…`, `messageType:
  "External"`, `messageFeeMode: "external"`, `feeParamsDecoded: {gasLimit:
  500000, maxGasPrice: 300000000}`.
- `message_value_effects[0x251a5c81…]: {phase: "finalized", value:
  9000000000000000, include: true}`, with **no `skipped` and no
  `skippedRefunded`** — the exact fields that were `true` on the internal path.
- `message_effect_delivered: {0x251a5c81…: true}`.
- `external_message_events[0]: {recipient: 0x1c23…, reservation:
  125000000000000, executionRecorded: true}`.

And the balance moved. The grantor's EOA balance went
`1962009940749976244 → 1970883636249975421`, a net **+8,873,695,499,999,177 wei**
after the claim transaction's own fee — the full 0.009 GEN credit. The contract
balance fell to `1000000000000000` (the treasury's 0.001 GEN share). The
internal-ledger credit is now also external, real money.

## What is still not claimed

The two steward downgrades (fail-closed `NARROWER_OR_EQUAL` +
`prohibitions_covered: false` → `AMBIGUOUS`; and the evidence-gate downgrade of a
substantive PROVE_USE verdict over unreadable evidence → `INCONCLUSIVE`) remain
proven by the test suite, not by a live trigger: a model cannot be made to return
exactly those contradictory shapes on demand. Their plumbing is visible live
(`prohibitions_covered` reads back, `evidence_ok` is computed true and false).

Reproduce everything with `docs/STATUS.md` → "Verify this repo".
