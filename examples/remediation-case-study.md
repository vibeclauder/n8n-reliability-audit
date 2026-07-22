# Remediation case study: inbound lead webhook

A worked before/after that shows what a bounded reliability remediation looks like on
a small, realistic n8n workflow. Every number, hash, and finding in this document is
reproducible from this repository with the commands in the last section — nothing here
is illustrative or hand-written.

This is the concrete shape of the **$250 bounded remediation**: one agreed reliability
slice, repaired and re-verified, delivered as a sanitized export plus handoff notes.

---

## The workflow

An "Inbound lead processing" automation: a webhook receives a lead, an HTTP call
classifies it, and the result is written to Google Sheets. It is small, it is `active:
true`, and it looks finished. Static analysis disagrees.

Both the starting export (`test/fixtures/risky-workflow.json`) and the remediated export
(`test/fixtures/hardened-workflow.json`) ship in this repo so the audit can be re-run by
anyone.

## Before → after, at a glance

| | Before | After |
|---|---|---|
| Score | **5 / 100** | **100 / 100** |
| Findings | 1 critical · 2 high · 4 medium · 4 low (11 total) | 0 |
| Nodes | 4 (one silently disconnected) | 3 (all on the execution path) |
| Source SHA-256 | `dce28946…d65481` | `2a00c3cc…e8cccc` |

The score is a deterministic signal, not a grade: critical −25, high −15, medium −7,
low −3, floored at zero. Its only job is to make "we changed something and it got
measurably safer" auditable.

## The eleven findings, and what each one actually fixes

Each row pairs a finding from the *before* audit with the specific edit that resolved it
in the *after* export. The point of a remediation is not to make findings disappear —
it is to make the failure mode disappear. The finding is just the receipt.

### 1 · Critical — `EMBEDDED_SECRET_MATERIAL`

**Before:** the HTTP Request node carried `api_key: "sk-example-value-that-should-be-rotated"`
inline in its parameters. An exported inline secret is a secret in every backup, every
copy/paste, and every version-control history that export ever touches.

**Fix:** the inline key is removed and the node references an n8n credential
(`credentials.httpHeaderAuth`) instead. The secret lives in the credential store, not in
the workflow body. **A remediation is not complete until the exposed value is also
rotated** — moving it out of the export does not un-expose the value that was already in
one.

### 2 · High — `NO_ERROR_WORKFLOW`

**Before:** `settings` was empty. A failure anywhere in an active workflow vanished with
no record of which workflow, node, or execution failed.

**Fix:** `settings.errorWorkflow` points at a central error handler, so every failure
lands somewhere a human can see it with workflow / node / execution / timestamp context.

### 3 · High — `UNCONNECTED_NODE` (`Edit Fields`)

**Before:** an enabled "Edit Fields" Set node existed in the workflow but was wired to
nothing. Enabled-but-disconnected nodes are the classic gap between the diagram someone
reviewed and the behavior that actually runs — reviewers assume it does something; it
does nothing.

**Fix:** the dead node is removed, so the visible design and the executed graph match.
(If it was meant to run, the correct fix is to connect it — the audit does not decide
intent, it flags the mismatch.)

### 4 · Medium — `WEBHOOK_ACK_COUPLED` (`Webhook`)

**Before:** `responseMode: "lastNode"` — the sender's HTTP request stays open until the
classify-and-write pipeline finishes. A slow downstream call means a slow ack; a
retry-prone sender that times out will resend, and the same lead is processed twice.

**Fix:** `responseMode: "onReceived"` acknowledges immediately. The event is accepted
fast, then processed; the sender's retry behavior is decoupled from the pipeline's speed.

### 5 · Medium — `FAILURE_CONTINUES` (`HTTP Request`)

**Before:** `continueOnFail: true` on the classify call. When classification failed, the
workflow marched on and wrote an unclassified (or empty) row to Sheets as if nothing was
wrong — a silent partial write.

**Fix:** `continueOnFail` is removed. Combined with the retry policy below and the error
workflow above, a failed classification now retries and, if it still fails, surfaces
instead of silently corrupting the output.

### 6 & 7 · Medium — `NO_RETRY_POLICY` (`HTTP Request`, `Google Sheets`)

**Before:** neither external integration had a retry policy. The single most common cause
of a "it just randomly drops leads sometimes" report is a transient 429/5xx or network
blip on exactly these calls.

**Fix:** both nodes get `retryOnFail: true`; the HTTP call adds bounded backoff
(`maxTries: 3`, `waitBetweenTries: 1000`). Retries must be paired with an idempotency
check before the write so a retried Sheets append does not create a duplicate row — that
is called out in the handoff notes rather than assumed safe.

### 8–11 · Low — `GENERIC_NODE_NAME` (all four nodes)

**Before:** `Webhook`, `HTTP Request`, `Google Sheets`, `Edit Fields` — names that
describe the tool, not the business action. At 3 a.m. during an incident, "HTTP Request
failed" tells you nothing.

**Fix:** every node is renamed to a verb and an outcome: *Acknowledge lead webhook*,
*Classify sanitized lead*, *Persist classified lead idempotently*. The names now double
as the incident runbook.

## What the remediation deliberately did **not** do

Honesty about scope is part of the deliverable.

- It did **not** implement the central error workflow itself — only the reference to it.
  Standing up `central-error-handler` is named as the next slice.
- It did **not** prove idempotency at the Sheets write. Retries make duplicate delivery
  *more* likely, not less; the export enables retries and flags the idempotency check as
  required follow-up. That is a runtime test, not a static one.
- Static analysis cannot prove runtime correctness. Duplicate delivery, partial writes,
  credential isolation, rate limits, and recovery-from-stopped-execution still need a
  runtime pass.

A remediation that claimed the workflow was now "production-safe" would be the exact kind
of unearned green check this tool exists to replace.

## Reproduce every number in this document

```bash
# Before: expect score 5, 11 findings
node ./bin/cli.mjs test/fixtures/risky-workflow.json

# After: expect score 100, 0 findings
node ./bin/cli.mjs test/fixtures/hardened-workflow.json

# The rule engine's own tests
npm test
```

The SHA-256 in each report is computed over the exact export that was reviewed, so a
report can always be traced back to the file it describes.
