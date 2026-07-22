# n8n workflow reliability audit

- Score: **0/100**
- Workflows: 1
- Nodes: 5
- Findings: 1 critical, 4 high, 6 medium, 4 low, 0 informational
- Source: `risky-workflow.json`
- SHA-256: `a126050f0468b681fa54b6ae6820bf2fd3291273ff43356deaef10f7cc82f330`
- Generated: 2026-07-22T22:38:59.919Z

Privacy: No workflow parameter values or credential contents are included.

## Findings

| Severity | Rule | Workflow | Node | Evidence | Recommended next action |
|---|---|---|---|---|---|
| CRITICAL | EMBEDDED_SECRET_MATERIAL | Inbound lead processing | — | 1 parameter path(s) appear to contain embedded secret material. Values were not copied into this report. | Move secrets into n8n credentials or environment references, rotate exposed values, and re-export a sanitized workflow. |
| HIGH | PINNED_DATA_IN_EXPORT | Inbound lead processing | — | 1 node(s) carry pinned data that overrides live execution. | Remove pinned test data before deploying. A pinned node returns fixed captured output instead of running, so the workflow can silently serve stale data in production. |
| HIGH | NO_ERROR_WORKFLOW | Inbound lead processing | — | No workflow-level error workflow is configured. | Route failures to a central handler that records workflow, execution, node, timestamp, and error context. |
| HIGH | UNCONNECTED_NODE | Inbound lead processing | Edit Fields | Enabled node is not connected to the workflow graph. | Connect it intentionally or disable/remove it so production behavior matches the visible design. |
| MEDIUM | WEBHOOK_ACK_COUPLED | Inbound lead processing | Webhook | Webhook response mode is lastNode rather than immediate acknowledgement. | For retry-prone senders, acknowledge quickly, persist the event, and process slow work asynchronously. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | Webhook | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |
| MEDIUM | FAILURE_CONTINUES | Inbound lead processing | HTTP Request | The workflow continues after this node fails. | Route the failure branch to an explicit exception queue or prove partial output is safe. |
| MEDIUM | NO_RETRY_POLICY | Inbound lead processing | HTTP Request | External integration has no explicit retry policy. | Add bounded retries with backoff for transient failures, plus an idempotency check before writes. |
| MEDIUM | HTTP_NO_TIMEOUT | Inbound lead processing | HTTP Request | HTTP request has no explicit timeout. | Set an explicit request timeout so a slow or hung upstream cannot stall the execution and back up the queue. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | HTTP Request | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |
| MEDIUM | NO_RETRY_POLICY | Inbound lead processing | Google Sheets | External integration has no explicit retry policy. | Add bounded retries with backoff for transient failures, plus an idempotency check before writes. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | Google Sheets | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |
| HIGH | AI_NODE_NO_RETRY | Inbound lead processing | Draft reply with AI agent | AI/LLM node has no retry policy for transient provider failures. | Enable bounded retry with backoff. LLM providers return rate-limit (429) and overload (503/529) errors routinely; without retry these transient failures surface as full workflow failures. |
| MEDIUM | AI_AGENT_NO_ITERATION_CAP | Inbound lead processing | Draft reply with AI agent | AI agent node has no explicit maximum-iteration cap. | Set an explicit max-iterations limit so a tool-using agent cannot loop indefinitely, run up token cost, or hang the execution. |
| LOW | GENERIC_NODE_NAME | Inbound lead processing | Edit Fields | Node name describes the tool, not the business action. | Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”. |

## What this score does—and does not—mean

The score is a deterministic static-analysis signal: critical −25, high −15, medium −7, low −3, informational −0, floored at zero. It is not proof that a workflow is production-safe. Runtime tests should still cover retries, duplicate delivery, partial failure, credential boundaries, and recovery.
