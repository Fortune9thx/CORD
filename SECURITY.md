# Security policy

## Reporting

Open a private security advisory on the repository, or an issue marked
`security` if advisories are unavailable. Please include the grant ids or
transaction hashes involved and what you expected to happen instead.

Please do not open a public issue for anything that would let a reader widen
authority or drain bonds before it is fixed.

## Scope

In scope: anything that grants authority a parent does not hold, activates a
grant without a settled `NARROWER_OR_EQUAL` verdict, makes `can_invoke` return
`allowed: true` when any link in the chain is ineffective, moves or traps bond
funds incorrectly, or defeats the ambiguity lock.

Also in scope: prompt injection that changes a settled verdict, evidence URLs
that reach a validator's internal network, and any path where a technical
failure is treated as approval.

Out of scope: Studio Dev state resets, GenLayer protocol and validator-set
issues, and the accepted limitations recorded in [docs/audit.md](docs/audit.md).

## Known operational characteristics

These are expected behaviours, not defects. They are listed so an operator can
tell them apart from a real fault.

**Elevated validator timeout rate.** Every judgment runs through
`gl.eq_principle.strict_eq`, which re-executes the whole judgment inside each
validator — re-fetching the evidence and re-running the model independently.
That is what makes the verdict trustworthy, and it costs roughly double the
work per validator compared with a validator that only inspects the leader's
output. Expect a higher share of `TIMEOUT` votes than a lighter contract would
show. Quorum is normally still reached; a round that does not reach it returns
`UNVERIFIABLE` / `INCONCLUSIVE`, which is inactive, refunded and retryable.

**Validator disagreement persists nothing.** If validators reach genuinely
different conclusions, the write executes without a Python exception but commits
no state. The frontend classifies this explicitly and reports that nothing was
written and nothing was charged; do not read a returned transaction hash as
proof a write landed.

**Direct signed transactions only.** `claim()` pays out to
`gl.message.sender_address`, and `grantor` is recorded from the same source. If
a method is invoked through another contract rather than by a signed
transaction, that address is the calling *contract*, and GenVM provides no way
for contract code to tell the two apart. A value transfer to a contract address
can fail silently with no recovery path. **Use CORD only from directly signed
transactions by externally owned accounts.** This is a hard requirement that
cannot be enforced in code.

**Evidence hosts are checked by syntax, not by resolution.** A caller-supplied
evidence URL must be plain public HTTPS: no credentials, no non-default port,
and no host that is a loopback, private or link-local address in any encoding
that `inet_aton` accepts — the dotted quad, the packed decimal, and the
two-part, octal and hex-dotted forms are all rejected, and the host's last
label must look like a real public suffix. What syntax cannot catch is a
perfectly ordinary public hostname whose DNS record points at a private
address. Every validator resolves and fetches independently, so treat the
network those validators run on as the real boundary.

**Grants are public.** Everything stored is on-chain and world-readable. Clause
text must not carry secrets.

## Handling of keys

No private key is committed to this repository, and none is read by any code in
it. Deployment takes its key from the environment. `.env` is gitignored;
`.env.example` carries placeholders only.
