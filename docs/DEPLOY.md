# Deploying CORD from PowerShell

Studio Dev (chain **61997**) for the contract, Vercel for the app.

Nothing here writes an address anywhere until `eth_getCode` confirms code is
actually live at it. That order is the point — an address recorded before that
check is a claim, not a fact.

---

## 0. Prerequisites

```powershell
node --version      # 20 or newer
python --version    # 3.11 or newer
git --version
```

Clone and verify the build before touching the network:

```powershell
git clone https://github.com/Fortune9thx/CORD.git
cd CORD
git checkout claude/vigilant-babbage-8197tv

pip install pytest "ruff==0.16.9"
python contracts\build_bundle.py
python -m pytest tests\ -q          # expect: 146 passed
python -m ruff check contracts tests
```

If the bundle or tests fail here, stop. Deploying a build you have not verified
wastes a funded key.

---

## 1. Install the GenLayer CLI

```powershell
npm install -g genlayer@0.39.2
genlayer --version
```

> The CLI's built-in network list offers `studionet`, which is chain **61999**
> (`https://studio.genlayer.com/api`) — *not* Studio Dev. Do not
> `genlayer network set studionet` and assume you are on 61997. Every command
> below passes `--rpc` explicitly instead.

---

## 2. Provide a funded key

You need a real **64-hex** private key funded with GEN on Studio Dev. The
placeholder shipped in some environments is 32 characters and will be rejected
at import.

```powershell
# Set for this session only — do not commit it, do not paste it into a file.
$env:GENLAYER_PRIVATE_KEY = "0x<64 hex characters>"

# Sanity check the shape without printing the key:
$k = $env:GENLAYER_PRIVATE_KEY -replace '^0x',''
"length=$($k.Length) allHex=$($k -match '^[0-9a-fA-F]+$')"
# expect: length=64 allHex=True
```

Import it into the CLI keystore:

```powershell
genlayer account import --name default --private-key $env:GENLAYER_PRIVATE_KEY
```

If this reports `Invalid private key format`, the key is not 64 hex characters —
fix that before going further.

---

## 3. Deploy

The constructor takes, in order:

| # | Argument | Type | Suggested value |
|---|---|---|---|
| 1 | `treasury` | address | your address, or `""` to default to the deployer |
| 2 | `review_bond` | int (wei) | `10000000000000000` (0.01 GEN) |
| 3 | `challenge_bond` | int (wei) | `20000000000000000` (0.02 GEN) |
| 4 | `use_bond` | int (wei) | `0` (opt-in) |
| 5 | `fee_bps` | int | `1000` (10% of a slash to the treasury) |

```powershell
$RPC = "https://studio-dev.genlayer.com/api"

genlayer deploy `
  --contract contracts\build\Cord.bundled.py `
  --rpc $RPC `
  --args "0x<your-treasury-address>" 10000000000000000 20000000000000000 0 1000
```

Omit the treasury by passing `""` to have it default to the deploying account.

Record the address the CLI prints as `$ADDR` — but do not put it in any config
file yet.

```powershell
$ADDR = "0x<address the CLI printed>"
```

---

## 4. Confirm the deploy before believing it

This is the gate. Until it passes, treat the contract as not deployed.

```powershell
$body = @{ jsonrpc="2.0"; id=1; method="eth_getCode"; params=@($ADDR,"latest") } |
        ConvertTo-Json -Compress

$code = (Invoke-RestMethod -Uri $RPC -Method Post -ContentType "application/json" -Body $body).result

if ($code -and $code -ne "0x" -and $code -ne "0x0") {
    "LIVE — $($code.Length) chars of code at $ADDR"
} else {
    "NOT LIVE — no code at $ADDR. Do not record this address."
}
```

Also confirm you are on the right chain:

```powershell
$cid = @{ jsonrpc="2.0"; id=1; method="eth_chainId"; params=@() } | ConvertTo-Json -Compress
$hex = (Invoke-RestMethod -Uri $RPC -Method Post -ContentType "application/json" -Body $cid).result
"chainId = $([Convert]::ToInt64($hex,16))"   # expect: 61997
```

Smoke-test a view to prove the contract answers:

```powershell
genlayer call $ADDR get_config --rpc $RPC
```

You should get the bonds, `fee_bps`, `max_depth: 8` and `next_id: 1` back.

---

## 5. Record the address (only now)

```powershell
@{
  network  = "studio-dev"
  chainId  = 61997
  rpc      = $RPC
  address  = $ADDR
  deployed = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content deployments.json
```

Update `docs/STATUS.md` to replace the "not deployed" section with the address
and the `eth_getCode` result that confirmed it.

---

## 6. Deploy the frontend to Vercel

```powershell
npm install -g vercel
cd frontend
npm install
npm run build          # verify locally first
vercel login
vercel link
```

Set the environment variables. `VITE_CONTRACT_ADDRESS` is the only one that
should be new information at this point:

```powershell
"https://studio-dev.genlayer.com/api"        | vercel env add VITE_GENLAYER_RPC_URL production
"61997"                                      | vercel env add VITE_GENLAYER_CHAIN_ID production
"https://explorer-studio-dev.genlayer.com"   | vercel env add VITE_EXPLORER production
$ADDR                                        | vercel env add VITE_CONTRACT_ADDRESS production

vercel --prod
```

`vercel.json` already sets the SPA rewrite, so deep links like
`/app/grants/g1` resolve instead of 404ing.

---

## 7. Verify the deployed app

Open the production URL and check the banner, which is the app's honest
self-report:

| Banner | Meaning |
|---|---|
| **Live** + address | `eth_getCode` confirmed code. This is the one you want. |
| Not deployed | `VITE_CONTRACT_ADDRESS` is unset — the env var did not reach the build |
| No code at the configured address | Studio Dev state was reset; redeploy and update the address |
| RPC reported chain N | Wrong RPC configured |
| RPC unreachable | Network or endpoint problem |

Then walk one delegation end to end:

1. `/app/grants/new` — create a root grant.
2. `/app/grants/:id` → **Delegate** — propose a narrower child. Try widening a
   capability first; it should be rejected immediately, with no validator run.
3. On the child → **Request review** — posts the bond and settles the verdict.
4. `/app/checks` — run `can_invoke` for the child's grantee. Then revoke the
   root and run it again: it must flip to denied, citing the ancestor.

Step 4 is the one worth doing deliberately — it is the fail-closed behaviour the
whole design rests on.

---

## Troubleshooting

**`Invalid private key format`** — the key is not 64 hex characters. Check with
the length probe in step 2.

**Deploy reverts in the constructor** — check `fee_bps` is 0–10000 and no bond is
negative. The treasury argument accepts either a hex string or a decoded
address, so encoding is not the cause.

**Deploy succeeds but `eth_getCode` is empty** — the transaction was not
finalized. Check `genlayer receipt <txId> --rpc $RPC`, and `genlayer finalize`
if it is idle.

**App shows "no code" after working earlier** — Studio Dev resets wipe
deployed state. Redeploy and update `VITE_CONTRACT_ADDRESS`. This is expected on
a development network, not a bug.

**Writes are greyed out in the app** — the client disables them until
`eth_getCode` confirms the contract. Fix the banner state first; the button is a
symptom, not the problem.
