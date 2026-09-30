# Status — honest report

_Last verified from the build workspace on 2026-09-28._

## Build and tests

| | |
|---|---|
| Bundle | `contracts/build/Cord.bundled.py`, ~58 KB, builds deterministically |
| `Depends` directive | present as byte one, no BOM, asserted by test |
| Contract classes | exactly one (`Cord`), asserted by test |
| Reconciliation | `gl.eq_principle.strict_eq`; direct `run_nondet` absent, asserted by test |
| Tests | **146 passed** (82 pure logic, 56 contract state machine, 8 bundle gates) |

## Network

Studio Dev RPC was reached from this workspace and answered correctly:

```
$ curl -X POST https://studio-dev.genlayer.com/api \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
{"jsonrpc":"2.0","result":"0xf22d","id":1}
```

`0xf22d` = 61997. The endpoint is live and is the chain this project targets.

## Deployment: not deployed

**No contract address is claimed, and `deployments.json` has not been written.**

The GenLayer CLI (`genlayer@0.39.2`) installed and ran. Its bundled network list
offers `studionet` (chain 61999, `https://studio.genlayer.com/api`), not Studio
Dev, so a deploy would have needed `--rpc https://studio-dev.genlayer.com/api`
passed explicitly. That was not the blocker.

The blocker is credentials. The workspace exposes a `GENLAYER_PRIVATE_KEY`
environment variable, but its value is a 32-character placeholder, not a 64-hex
key:

```
$ genlayer account import --name default --private-key "$GENLAYER_PRIVATE_KEY"
× Invalid private key format. Expected 64 hex characters (with or without 0x prefix).
```

Inspected without printing it: length 32, `0x`-prefixed, 30 non-hex characters
following. It is a placeholder, not a funded key. No account could be imported,
so no transaction could be signed and nothing was deployed.

This was **not** a size problem and **not** a schema-RPC problem — neither was
reached. No minimal `Hello` contract was attempted either, since the failure is
at key import, before any payload is built, and would fail identically.

### What is needed to deploy

1. A real 64-hex funded Studio Dev key in `GENLAYER_PRIVATE_KEY`.
2. `genlayer account import --name default --private-key "$GENLAYER_PRIVATE_KEY"`
3. `python3 contracts/build_bundle.py`
4. `genlayer deploy --contract contracts/build/Cord.bundled.py --rpc https://studio-dev.genlayer.com/api --args <treasury> <review_bond> <challenge_bond> <use_bond> <fee_bps>`
5. Confirm `eth_getCode` at the returned address is non-empty.
6. Only then write `deployments.json` and set `VITE_CONTRACT_ADDRESS`.

Step 5 is the gate: an address is recorded only after code is confirmed on chain.

## Frontend

The app builds and runs against the configured RPC. With `VITE_CONTRACT_ADDRESS`
unset it shows a "not deployed" banner and empty states inside cards. It renders
**no synthetic grants** in any state — there is no fixture data in the bundle, so
an empty chain reads as empty.

Banner states, in the order they are evaluated:

| State | Shown when |
|---|---|
| `undeployed` | `VITE_CONTRACT_ADDRESS` is unset |
| `rpc down` | the RPC did not answer `eth_chainId` |
| `wrong chain` | the RPC answered with a chain other than 61997 |
| `no code` | `eth_getCode` returned empty — Studio Dev state was reset |
| `live` | code confirmed at the address |

## Studio Dev state resets

Studio Dev is a development network and its state may be reset without notice.
A deployment that was live can become `no code` at the same address. The frontend
treats that as its own banner state rather than as an error, and never falls back
to cached or invented data.
