import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { auditExport, renderMarkdown } from '../lib/audit.mjs';

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
  assert.equal(report.nodeCount, 7);
  assert.ok(report.findings.some(item => item.workflow === 'Inbound lead processing'));
});

test('reports invalid JSON-shaped input as a critical finding', () => {
  const report = auditExport({ hello: 'world' });

  assert.equal(report.summary.critical, 1);
  assert.equal(report.findings[0].code, 'INVALID_EXPORT');
});
