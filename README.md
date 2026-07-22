# n8n Reliability Audit

A local, deterministic first pass over exported n8n workflow JSON. It finds common reliability and handoff risks without uploading the workflow or copying parameter values into the report.

This is intentionally a static-analysis tool, not an “AI says it looks fine” badge. The report shows its evidence, a SHA-256 fingerprint of the reviewed export, and a transparent score calculation.

## What it checks

- secret-like values embedded in exported parameters (values are never printed)
- active or trigger-based workflows without a central error workflow
- enabled nodes disconnected from the execution graph
- external integrations without an explicit retry policy
- AI/LLM/agent nodes with no retry policy for transient provider errors (rate limits, model overload)
- AI agent nodes with no explicit maximum-iteration cap
- HTTP requests with no explicit timeout
- pinned test data left in the export that overrides live execution
- `continueOnFail` and equivalent failure paths
- webhooks whose acknowledgement is coupled to downstream work
- schedules with an implicit timezone
- generic node names that make handoff and incident response harder
- disabled nodes that deserve a deployment check

## Run it

Node.js 22 or newer is the only requirement. There are no runtime dependencies.

```bash
git clone https://github.com/vibeclauder/n8n-reliability-audit.git
cd n8n-reliability-audit
node ./bin/cli.mjs /path/to/sanitized-workflow.json
```

Write a Markdown report:

```bash
node ./bin/cli.mjs workflow.json --output audit.md
```

Produce machine-readable JSON:

```bash
node ./bin/cli.mjs workflow.json --json
```

Gate a build on workflow health with `--fail-on <severity>` (`low`, `medium`,
`high`, or `critical`). The command exits `1` when any finding is at or above
the threshold, so it can fail a CI pipeline:

```bash
node ./bin/cli.mjs workflow.json --fail-on high
```

Without `--fail-on` the tool exits `1` only on a `critical` finding, preserving
the original behavior. See [`ci/`](ci/) for a ready-to-use GitHub Actions
workflow that re-audits your exports on every change and on a schedule — the
mechanism behind an ongoing reliability-monitoring engagement.

Run the test suite and regenerate the example report:

```bash
npm test
npm run audit:sample
```

## Privacy boundary

Use a sanitized n8n export. The CLI runs locally and makes no network requests. Its Markdown and JSON reports contain workflow names, node names, finding metadata, counts, and a source fingerprint. They do not contain workflow parameter values or credential contents.

If the auditor finds something that resembles an embedded secret, rotate it. Sanitization is a defense-in-depth step, not a promise that a secret was never exposed elsewhere.

## Fixed-price human review

The CLI is free. If you want a checked, prioritized review instead of a raw static report:

- **$49 async reliability review:** one sanitized workflow export plus up to three sanitized failed executions; returned as a prioritized written review within one business day.
- **$250 bounded remediation:** repair and test one agreed reliability slice, with an updated sanitized export and handoff notes. Scope is confirmed before work starts.
- **Ongoing monitoring:** wire the [`ci/`](ci/) gate into your repository so every workflow change is re-audited automatically and regressions fail the build before they ship. Suited to teams running business-critical automations who want reliability to stay fixed, not decay after a one-time review.

See [`examples/remediation-case-study.md`](examples/remediation-case-study.md) for a worked before/after: a small AI-assisted inbound-lead workflow taken from 0/100 (15 findings) to 100/100 (0 findings), with each finding paired to the exact edit that resolved it — and an honest note on what the remediation deliberately left for the next slice. Every number in it is reproducible from the fixtures in this repo.

No production credentials are needed for the review. Email **william28918@outlook.com** with the workflow’s purpose, the failure you care about most, and whether you want the review or remediation option. Payment details are exchanged privately only after scope is agreed.

## Limits

Static analysis cannot prove runtime correctness. A production review should still test duplicate delivery, transient API failures, partial writes, credential isolation, rate limits, replay behavior, and recovery from a stopped execution. The rule set is deliberately opinionated and may report a pattern that is safe in your specific architecture; the finding is a prompt for evidence, not an automatic verdict.

## License

MIT
