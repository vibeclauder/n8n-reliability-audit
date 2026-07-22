# n8n workflow reliability audit

- Score: **5/100**
- Workflows: 1
- Nodes: 4
- Findings: 1 critical, 2 high, 4 medium, 4 low, 0 informational
- Source: `risky-workflow.json`
- SHA-256: `dce28946b9062a8f766acdccbfc4b9a6711374804a1278ba53fd1b4f69d65481`
- Generated: 2026-07-22T22:22:42.743Z

Privacy: No workflow parameter values or credential contents are included.

## Findings

| Severity | Rule | Workflow | Node | Evidence | Recommended next action |
|---|---|---|---|---|---|
| CRITICAL | EMBEDDED_SECRET_MATERIAL | Inbound lead processing | — | 1 parameter path(s) appear to contain embedded secret material. Values were not copied into this report. | Move secrets into n8n credentials or environment references, rotate exposed values, and re-export a sanitized workflow. |
| HIGH | NO_ERROR_WORKFLOW | Inbound lead processing | — | No workflow-level error workflow is configured. | Route failures to a central handler that records workflow, execution, node, timestamp, and error context. |
| HIGH | UNCONNECTED_NODE | Inbound lead processing | Edit Fields | Enabled node is not connected to the workflow graph. | Connect it intentionally or disable/remove it so production behavior matches the visible design. |
| MEDIUM | WEBHOOK_ACK_COUPLED | Inbound lead processing | Webhook | Webhook response mode is lastNode rather than immediate acknowledgement. | For retry-prone senders, acknowledge quickly, persist the event, and process slow work asynchronously. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | Webhook | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |
| MEDIUM | FAILURE_CONTINUES | Inbound lead processing | HTTP Request | The workflow continues after this node fails. | Route the failure branch to an explicit exception queue or prove partial output is safe. |
| MEDIUM | NO_RETRY_POLICY | Inbound lead processing | HTTP Request | External integration has no explicit retry policy. | Add bounded retries with backoff for transient failures, plus an idempotency check before writes. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | HTTP Request | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |
| MEDIUM | NO_RETRY_POLICY | Inbound lead processing | Google Sheets | External integration has no explicit retry policy. | Add bounded retries with backoff for transient failures, plus an idempotency check before writes. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | Google Sheets | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | Edit Fields | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |

## What this score does—and does not—mean

The score is a deterministic static-analysis signal: critical −25, high −15, medium −7, low −3, informational −0, floored at zero. It is not proof that a workflow is production-safe. Runtime tests should still cover retries, duplicate delivery, partial failure, credential boundaries, and recovery.
