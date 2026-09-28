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

## Handling of keys

No private key is committed to this repository, and none is read by any code in
it. Deployment takes its key from the environment. `.env` is gitignored;
`.env.example` carries placeholders only.
