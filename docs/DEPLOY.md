# Deploying CORD

Studio Dev, chain **61997**, RPC `https://studio-dev.genlayer.com/api`.

The current deployment is recorded in [`deploy/deployments.json`](../deploy/deployments.json),
including the sha256 of the exact bundle that was deployed.

---

## 1. Build and check locally

```powershell
pip install pytest "ruff==0.16.9"
python contracts\build_bundle.py
python -m pytest tests\ -q
python -m ruff check contracts tests
$env:PYTHONIOENCODING = "utf-8"
genvm-lint contracts\build\Cord.bundled.py
```

`contracts/build/Cord.bundled.py` is generated. Edit `contracts/Cord.py` or
`contracts/cordlib/*.py` and rebuild; CI fails on a stale bundle.

`PYTHONIOENCODING` is needed on Windows or `genvm-lint` fails writing its own
check mark.

---

## 2. Probe the network before spending anything

`gen_getContractSchemaForCode` executes the contract's module body on a real
validator and returns its ABI. It costs nothing and it is the only local-free
check that exercises the actual runner.

```powershell
python - <<'PY'
from genlayer_py import create_client
from genlayer_py.chains import studio_devnet
c = create_client(chain=studio_devnet)
print(c.get_contract_schema_for_code(open("contracts/build/Cord.bundled.py","rb").read())["methods"].keys())
PY
```

**Run this before every deploy.** A contract that fails here will fail on chain
after you have paid for it, and the traceback this returns is far easier to read
than one dug out of the explorer.

---

## 3. Fees

A deploy or write sent without a **complete** fee distribution is rejected
client-side with `FeeValueMustBeNonZero(N)` and never reaches the chain. A
partial distribution fails the same way, so `--fee-value` on its own is not
enough. **Writes need this too, not just deploys.**

The distribution below was copied from a real successful deploy on this
network. If it ever stops working, pull a fresh one rather than guessing:

```powershell
# find a recent successful deploy and copy its distribution verbatim
curl "https://explorer-studio-dev.genlayer.com/api/transactions?limit=60"
# then: <that tx>.data.fee_accounting.top_ups[0].feesDistribution
```

Do not use `genlayer estimate-fees` for this. Its `feeValue` has been observed
around a thousand times larger than what real successful deploys actually pay,
and its distribution has a different shape.

```
--fees '{"distribution":{"rotations":[3],"appealRounds":0,"totalMessageFees":0,
  "executionConsumed":0,"receiptFeeMaxGasPrice":"300000000",
  "storageFeeMaxGasPrice":"300000000","maxPriceGenPerTimeUnit":"2",
  "executionBudgetPerRound":"25000000000000000",
  "leaderTimeunitsAllocation":"100","validatorTimeunitsAllocation":"200"}}'
--fee-value 100000000000010352
```

---

## 4. Deploy

Constructor, in order:

| # | Argument | Type | Value used |
|---|---|---|---|
| 1 | `treasury` | address | deployer address |
| 2 | `review_bond` | int (wei) | `10000000000000000` (0.01 GEN) |
| 3 | `challenge_bond` | int (wei) | `20000000000000000` (0.02 GEN) |
| 4 | `use_bond` | int (wei) | `0` (opt-in) |
| 5 | `fee_bps` | int | `1000` (10% of a slash) |

```powershell
genlayer deploy `
  --contract contracts\build\Cord.bundled.py `
  --rpc https://studio-dev.genlayer.com/api `
  --args 0xYOURADDRESS 10000000000000000 20000000000000000 0 1000 `
  --fees $FEES --fee-value 100000000000010352
```

### Quoting the address argument

Pass the address **bare**: `--args 0xabc…`. The CLI detects a 40-hex value and
encodes it as an address; CORD normalises address-typed and string arguments to
the same thing.

Do **not** wrap it in JSON quotes from a POSIX shell. `--args '"0xabc…"'` sends
the double-quote characters as part of the value, and the contract reverts
trying to base64-decode `"0xabc…`. The PowerShell form above is correct as
written.

---

## 5. Confirm the deploy before believing it

**`eth_getCode` is the wrong probe.** It returns `0x` for a GenLayer contract
that is demonstrably live — verified against a known-live address on this
chain. Anything gated on it reports every healthy deployment as dead.

Use `gen_getContractSchema`:

```powershell
$body = @{ jsonrpc="2.0"; id=1; method="gen_getContractSchema"; params=@($ADDR) } |
  ConvertTo-Json
Invoke-RestMethod -Method Post -Uri $RPC -ContentType "application/json" -Body $body
```

A schema with a non-empty `methods` map is the gate. Until it passes, treat the
contract as not deployed and do not write the address anywhere.

`ACCEPTED` on its own is also not proof. A transaction can be fully committed by
consensus while its execution was a hard error. Check the leader receipt's
`execution_result` is `SUCCESS`:

```powershell
curl "https://explorer-studio-dev.genlayer.com/api/transactions/$TX"
# .consensus_data.leader_receipt[0].execution_result
```

If it is `ERROR`, the revert reason is base64 in that receipt's `result` field.

---

## 6. Smoke-test on chain

```powershell
genlayer write $ADDR create_root --rpc $RPC `
  --args 0xYOURADDRESS '["read","write"]' '["db:orders"]' $EXPIRY '["May only read recent orders."]' `
  --fees $FEES --fee-value 100000000000010352

genlayer call $ADDR can_invoke --rpc $RPC --args g1 0xYOURADDRESS read db:orders
# {"allowed": true, "reason": ""}

genlayer write $ADDR revoke --rpc $RPC --args g1 --fees $FEES --fee-value 100000000000010352
genlayer call $ADDR can_invoke --rpc $RPC --args g1 0xYOURADDRESS read db:orders
# {"allowed": false, "reason": "grant status is revoked"}
```

That last flip is the property the whole design rests on. Confirm it against a
real chain, not only against the test suite.

Expect an occasional `UNDETERMINED` under real volume. CORD re-derives each
judgment independently inside every validator, which makes disagreement more
likely than in a contract that only compares formatting. The UI treats it as its
own state rather than as a denial.

---

## 7. Frontend

```powershell
cd frontend
npm install
npm run build
```

Environment (see `.env.example`):

| Variable | Value |
|---|---|
| `VITE_CONTRACT_ADDRESS` | the address confirmed in §5 |
| `VITE_GENLAYER_RPC_URL` | `https://studio-dev.genlayer.com/api` |
| `VITE_GENLAYER_CHAIN_ID` | `61997` |
| `VITE_EXPLORER` | `https://explorer-studio-dev.genlayer.com` |

`vercel.json` carries the SPA rewrite and the security headers.

The first paint on a page that reads the chain takes several seconds, because
`gen_getContractSchema` executes the contract to answer. The banner shows that
it is still checking rather than guessing.

---

## 8. Network notes

Do not run `genlayer network set studionet`. That is chain **61999**, not Studio
Dev's **61997**. Every command here passes `--rpc` explicitly for that reason.
Check `genlayer network info` before deploying; the CLI's active network has
been observed differing from the project's.

Studio Dev state may reset. An address that was live can stop resolving. The app
treats that as its own banner state rather than as an error.
