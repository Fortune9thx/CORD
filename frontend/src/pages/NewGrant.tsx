/** Create a root grant. A root is active immediately — it has no parent to narrow. */

import { useState } from "react";

import { ClauseEditor, ExpiryInput, FormCard, TokenInput, TxButton, parseTokens, toUnix } from "../components/Forms";
import type { Clause } from "../components/Forms";
import { Section } from "../components/ui";

export default function NewGrant() {
  const [grantee, setGrantee] = useState("");
  const [caps, setCaps] = useState("payments.*, reports.read");
  const [res, setRes] = useState("acct.ops");
  const [expiry, setExpiry] = useState("");
  const [clauses, setClauses] = useState<Clause[]>([
    { id: "c1", text: "" },
  ]);

  const ready = Boolean(grantee.trim() && parseTokens(caps).length && parseTokens(res).length && expiry);

  return (
    <Section className="py-8">
      <FormCard
        title="Create a root grant"
        lead="A root grant is the top of a delegation chain. It becomes active immediately: there is no parent for it to be narrower than, so there is nothing for validators to settle."
      >
        <div>
          <p className="label">Grantee address</p>
          <input
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            placeholder="0x…"
            className="field font-mono text-[13px]"
          />
          <p className="mt-2 text-[12px] text-mute">
            The agent that will hold this authority. Only this address can invoke it or delegate
            further.
          </p>
        </div>

        <TokenInput
          label="Capabilities"
          value={caps}
          onChange={setCaps}
          placeholder="payments.*, reports.read"
          hint="Comma separated. `*` covers everything; `a.b.*` covers a.b and everything beneath it."
        />

        <TokenInput
          label="Resources"
          value={res}
          onChange={setRes}
          placeholder="acct.ops"
          hint="What the capabilities may be exercised against."
        />

        <ExpiryInput value={expiry} onChange={setExpiry} />

        <ClauseEditor clauses={clauses} onChange={setClauses} />

        <TxButton
          disabled={!ready}
          method="create_root"
          args={() => [
            grantee.trim(),
            parseTokens(caps),
            parseTokens(res),
            toUnix(expiry),
            clauses.filter((c) => c.text.trim()),
          ]}
        >
          + Create root grant
        </TxButton>
      </FormCard>
    </Section>
  );
}
