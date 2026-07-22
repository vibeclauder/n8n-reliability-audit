# Continuous reliability monitoring for n8n workflows

The audit CLI is a point-in-time check. This kit turns it into a **standing
gate**: your exported n8n workflows are re-audited on every change and on a
schedule, and the build fails the moment a workflow regresses past a severity
threshold you choose.

This is the mechanism behind an ongoing monitoring engagement — the same
static analysis, run automatically against every version of your workflows, so
reliability does not silently decay after the one-time fix.

## Why a gate, not just a scan

n8n workflows are edited in a GUI and re-exported. A colleague removes a retry,
turns off an error workflow, or pins test data "just to debug" — and the next
export ships that regression. A gate catches it in review, before it reaches
production. The tool is deterministic and offline, so the gate is stable: the
same export always produces the same score and the same exit code.

## Setup (5 minutes)

1. Copy [`github-actions-n8n-reliability.yml`](./github-actions-n8n-reliability.yml)
   into your repo at `.github/workflows/n8n-reliability.yml`.
2. Export each workflow from n8n as JSON and commit it under `workflows/`
   (one file per workflow). Sanitize first — move any inline secrets into n8n
   credentials or environment references; the audit will flag them as critical
   if you forget.
3. Commit and push. The workflow runs on every change to `workflows/**.json`,
   on pull requests, weekly, and on manual dispatch.

Set the gate strictness with the `FAIL_ON` env var in the YAML
(`low | medium | high | critical`, default `high`). A common adoption path:
start at `critical`, harden the workflows until they are clean, then tighten to
`high` so no new high-severity regression can merge.

## What the exit codes mean

| Exit | Meaning |
|---|---|
| `0` | No finding at or above the threshold. Gate passes. |
| `1` | At least one finding at or above the threshold. Gate fails the build. |
| `2` | Usage error (bad flag, unreadable file). |

Every run also uploads the per-workflow JSON reports as a build artifact
(`n8n-reliability-reports`) — even on a failing run — so you have a dated,
fingerprinted record of workflow health over time.

## Running the same gate locally

Before pushing, developers can reproduce the exact gate the CI uses:

```sh
npx github:vibeclauder/n8n-reliability-audit workflows/inbound-lead.json --fail-on high
echo "exit: $?"   # 0 = clean at/above 'high', 1 = gated finding present
```

## Adapting to other CI systems

The gate is just the CLI's exit code, so any runner works. Minimal GitLab CI:

```yaml
n8n-reliability:
  image: node:20
  script:
    - |
      for wf in workflows/*.json; do
        npx --yes github:vibeclauder/n8n-reliability-audit "$wf" --fail-on high
      done
```

## Privacy

The audit runs inside your own CI runner. Workflow JSON never leaves your
infrastructure, and reports contain finding metadata plus a SHA-256 fingerprint
of the export — never parameter values or credential contents. See
[`../SECURITY.md`](../SECURITY.md).
