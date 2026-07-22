import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { auditExport, renderMarkdown, evaluateGate, gateExitCode } from '../lib/audit.mjs';

async function fixture(name) {
  const text = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
}

test('flags reliability and secret risks without leaking the secret', async () => {
  const { text, value } = await fixture('risky-workflow.json');
  const report = auditExport(value, { sourceName: 'risky-workflow.json', sourceText: text });
  const codes = new Set(report.findings.map(item => item.code));

  assert.equal(report.summary.critical, 1);
  assert.ok(codes.has('EMBEDDED_SECRET_MATERIAL'));
  assert.ok(codes.has('NO_ERROR_WORKFLOW'));
  assert.ok(codes.has('UNCONNECTED_NODE'));
  assert.ok(codes.has('FAILURE_CONTINUES'));
  assert.ok(codes.has('NO_RETRY_POLICY'));
  assert.ok(codes.has('WEBHOOK_ACK_COUPLED'));
  assert.ok(codes.has('AI_NODE_NO_RETRY'));
  assert.ok(codes.has('AI_AGENT_NO_ITERATION_CAP'));
  assert.ok(codes.has('HTTP_NO_TIMEOUT'));
  assert.ok(codes.has('PINNED_DATA_IN_EXPORT'));
  assert.ok(report.score < 50);

  const markdown = renderMarkdown(report);
  assert.doesNotMatch(markdown, /sk-example-value/);
  assert.match(markdown, /Values were not copied/);
});

test('accepts credential references without treating their metadata as secret material', async () => {
  const { text, value } = await fixture('hardened-workflow.json');
  const report = auditExport(value, { sourceText: text });

  assert.equal(report.summary.critical, 0);
  assert.equal(report.summary.high, 0);
  assert.equal(report.summary.medium, 0);
  assert.equal(report.score, 100);
});

test('supports an export wrapper with multiple workflows', async () => {
  const risky = (await fixture('risky-workflow.json')).value;
  const hardened = (await fixture('hardened-workflow.json')).value;
  const report = auditExport({ workflows: [risky, hardened] });

  assert.equal(report.workflowCount, 2);
  assert.equal(report.nodeCount, 9);
  assert.ok(report.findings.some(item => item.workflow === 'Inbound lead processing'));
});

test('a compliant AI agent and hardened HTTP node raise no AI or timeout findings', async () => {
  const { text, value } = await fixture('hardened-workflow.json');
  const report = auditExport(value, { sourceText: text });
  const aiCodes = new Set([
    'AI_NODE_NO_RETRY',
    'AI_AGENT_NO_ITERATION_CAP',
    'HTTP_NO_TIMEOUT',
    'PINNED_DATA_IN_EXPORT'
  ]);
  const raised = report.findings.filter(item => aiCodes.has(item.code));
  assert.deepEqual(raised, []);
});

test('AI retry rule ignores namespace and skips nodes that already retry', () => {
  const withRetry = auditExport({
    name: 'ai',
    active: true,
    settings: { errorWorkflow: 'x' },
    nodes: [{
      id: '1',
      name: 'Summarize transcript',
      type: '@n8n/n8n-nodes-langchain.chainLlm',
      retryOnFail: true,
      parameters: {}
    }]
  });
  assert.ok(!withRetry.findings.some(item => item.code === 'AI_NODE_NO_RETRY'));

  const withoutRetry = auditExport({
    name: 'ai',
    active: true,
    settings: { errorWorkflow: 'x' },
    nodes: [{
      id: '1',
      name: 'Summarize transcript',
      type: 'n8n-nodes-base.openAi',
      parameters: {}
    }]
  });
  assert.ok(withoutRetry.findings.some(item => item.code === 'AI_NODE_NO_RETRY'));
});

test('empty pinData object is not treated as pinned production data', () => {
  const report = auditExport({
    name: 'clean',
    active: true,
    settings: { errorWorkflow: 'x' },
    pinData: {},
    nodes: [{ id: '1', name: 'Persist verified record', type: 'n8n-nodes-base.set', parameters: {} }]
  });
  assert.ok(!report.findings.some(item => item.code === 'PINNED_DATA_IN_EXPORT'));
});

test('reports invalid JSON-shaped input as a critical finding', () => {
  const report = auditExport({ hello: 'world' });

  assert.equal(report.summary.critical, 1);
  assert.equal(report.findings[0].code, 'INVALID_EXPORT');
});

// A report whose worst finding is `high` (no critical): an active workflow
// with no error workflow, and nothing else risky.
function highOnlyReport() {
  return auditExport({
    name: 'high-only',
    active: true,
    nodes: [{ id: '1', name: 'Persist verified record', type: 'n8n-nodes-base.set', parameters: {} }]
  });
}

// A report whose worst finding is `medium`: a scheduled workflow with an error
// workflow set (no high) but an implicit timezone.
function mediumOnlyReport() {
  return auditExport({
    name: 'medium-only',
    active: true,
    settings: { errorWorkflow: 'handler' },
    nodes: [{ id: '1', name: 'Run nightly report', type: 'n8n-nodes-base.scheduleTrigger', parameters: {} }]
  });
}

test('default gate fails only on a critical finding', async () => {
  const { text, value } = await fixture('risky-workflow.json');
  const critical = auditExport(value, { sourceText: text });
  assert.equal(critical.summary.critical > 0, true);
  assert.equal(gateExitCode(critical), 1);

  const high = highOnlyReport();
  assert.equal(high.summary.critical, 0);
  assert.equal(high.summary.high, 1);
  // Worst finding is `high`, so the default (critical) threshold passes.
  assert.equal(gateExitCode(high), 0);
});

test('--fail-on high fails on a high finding but not on a medium-only report', () => {
  const high = highOnlyReport();
  assert.equal(gateExitCode(high, { failOn: 'high' }), 1);

  const medium = mediumOnlyReport();
  assert.equal(medium.summary.high, 0);
  assert.equal(medium.summary.medium >= 1, true);
  assert.equal(gateExitCode(medium, { failOn: 'high' }), 0);
  assert.equal(gateExitCode(medium, { failOn: 'medium' }), 1);
});

test('evaluateGate reports which severities were gated and the count', () => {
  const { failed, threshold, gatedCount, gatedSeverities } = evaluateGate(highOnlyReport(), { failOn: 'medium' });
  assert.equal(failed, true);
  assert.equal(threshold, 'medium');
  assert.equal(gatedCount, 1);
  assert.deepEqual(gatedSeverities, ['medium', 'high', 'critical']);
});

test('a clean workflow passes the gate at every threshold', async () => {
  const { text, value } = await fixture('hardened-workflow.json');
  const clean = auditExport(value, { sourceText: text });
  for (const threshold of ['low', 'medium', 'high', 'critical']) {
    assert.equal(gateExitCode(clean, { failOn: threshold }), 0);
  }
});

test('an unknown --fail-on severity throws instead of silently passing', () => {
  assert.throws(() => evaluateGate(highOnlyReport(), { failOn: 'warning' }), /Unknown --fail-on severity/);
  // `info` is intentionally not a valid gate threshold.
  assert.throws(() => evaluateGate(highOnlyReport(), { failOn: 'info' }), /Unknown --fail-on severity/);
});
