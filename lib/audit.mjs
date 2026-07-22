import { createHash } from 'node:crypto';

const SEVERITY_WEIGHT = {
  critical: 25,
  high: 15,
  medium: 7,
  low: 3,
  info: 0
};

const TRIGGER_TYPES = [
  'webhook',
  'trigger',
  'schedule',
  'cron',
  'poll'
];

const INTEGRATION_TYPES = [
  'httpRequest',
  'googleSheets',
  'airtable',
  'postgres',
  'mysql',
  'microsoftSql',
  'slack',
  'telegram',
  'gmail',
  'microsoftOutlook',
  'hubspot',
  'salesforce',
  'quickbooks'
];

const SECRET_KEY = /(?:^|[_-])(api[-_]?key|access[-_]?token|auth(?:orization)?|bearer|client[-_]?secret|password|private[-_]?key|secret)(?:$|[_-])/i;
const PLACEHOLDER = /^(?:\{\{|\$env\.|<[^>]+>|replace[-_ ]?me|example|test|dummy|xxx|your[-_ ])/i;

function normalizeExports(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.workflows)) return value.workflows;
  return [value];
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeTrigger(node) {
  const type = String(node.type || '').toLowerCase();
  return TRIGGER_TYPES.some(token => type.includes(token));
}

function looksLikeIntegration(node) {
  const type = String(node.type || '').toLowerCase();
  return INTEGRATION_TYPES.some(token => type.includes(token.toLowerCase()));
}

function finding(severity, code, workflow, node, message, recommendation) {
  return {
    severity,
    code,
    workflow,
    node: node || null,
    message,
    recommendation
  };
}

function scanForEmbeddedSecrets(value, path = []) {
  const results = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      results.push(...scanForEmbeddedSecrets(entry, [...path, String(index)]));
    });
    return results;
  }
  if (!isObject(value)) return results;

  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (
      SECRET_KEY.test(`_${key}_`) &&
      typeof child === 'string' &&
      child.trim().length >= 8 &&
      !PLACEHOLDER.test(child.trim()) &&
      !child.includes('{{$')
    ) {
      results.push(nextPath.join('.'));
      continue;
    }
    results.push(...scanForEmbeddedSecrets(child, nextPath));
  }
  return results;
}

function connectedNodeNames(workflow) {
  const connected = new Set();
  const connections = isObject(workflow.connections) ? workflow.connections : {};
  for (const [source, outputs] of Object.entries(connections)) {
    connected.add(source);
    if (!isObject(outputs)) continue;
    for (const outputGroups of Object.values(outputs)) {
      if (!Array.isArray(outputGroups)) continue;
      for (const group of outputGroups) {
        if (!Array.isArray(group)) continue;
        for (const connection of group) {
          if (connection?.node) connected.add(connection.node);
        }
      }
    }
  }
  return connected;
}

function defaultLikeName(node) {
  const name = String(node.name || '').trim();
  const typeTail = String(node.type || '').split('.').at(-1) || '';
  const normalizedType = typeTail.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return /^(http request|code|function|set|edit fields|if|switch|merge|webhook|schedule trigger)( \d+)?$/i.test(name) ||
    name.toLowerCase() === normalizedType;
}

function auditWorkflow(workflow, index) {
  const name = String(workflow?.name || `workflow-${index + 1}`);
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const findings = [];

  if (!isObject(workflow) || nodes.length === 0) {
    findings.push(finding(
      'critical',
      'INVALID_EXPORT',
      name,
      null,
      'The export has no recognizable n8n nodes.',
      'Export the workflow JSON from n8n and audit that file directly.'
    ));
    return { name, nodeCount: nodes.length, findings };
  }

  const secretPaths = scanForEmbeddedSecrets(workflow);
  if (secretPaths.length > 0) {
    findings.push(finding(
      'critical',
      'EMBEDDED_SECRET_MATERIAL',
      name,
      null,
      `${secretPaths.length} parameter path(s) appear to contain embedded secret material. Values were not copied into this report.`,
      'Move secrets into n8n credentials or environment references, rotate exposed values, and re-export a sanitized workflow.'
    ));
  }

  const activeAutomation = workflow.active === true || nodes.some(looksLikeTrigger);
  if (activeAutomation && !workflow.settings?.errorWorkflow) {
    findings.push(finding(
      'high',
      'NO_ERROR_WORKFLOW',
      name,
      null,
      'No workflow-level error workflow is configured.',
      'Route failures to a central handler that records workflow, execution, node, timestamp, and error context.'
    ));
  }

  const connected = connectedNodeNames(workflow);
  if (nodes.length > 1) {
    for (const node of nodes) {
      if (!connected.has(node.name) && !node.disabled) {
        findings.push(finding(
          'high',
          'UNCONNECTED_NODE',
          name,
          node.name,
          'Enabled node is not connected to the workflow graph.',
          'Connect it intentionally or disable/remove it so production behavior matches the visible design.'
        ));
      }
    }
  }

  const schedules = nodes.filter(node => String(node.type || '').toLowerCase().includes('schedule'));
  if (schedules.length > 0 && !workflow.settings?.timezone) {
    findings.push(finding(
      'medium',
      'SCHEDULE_TIMEZONE_IMPLICIT',
      name,
      null,
      'Scheduled execution relies on an implicit instance timezone.',
      'Set an explicit workflow timezone and document daylight-saving expectations.'
    ));
  }

  for (const node of nodes) {
    if (node.disabled === true) {
      findings.push(finding(
        'info',
        'DISABLED_NODE',
        name,
        node.name,
        'Node is disabled and will not execute.',
        'Confirm this is intentional before deployment.'
      ));
    }

    if (node.continueOnFail === true || String(node.onError || '').startsWith('continue')) {
      findings.push(finding(
        'medium',
        'FAILURE_CONTINUES',
        name,
        node.name,
        'The workflow continues after this node fails.',
        'Route the failure branch to an explicit exception queue or prove partial output is safe.'
      ));
    }

    if (looksLikeIntegration(node) && node.disabled !== true && node.retryOnFail !== true) {
      findings.push(finding(
        'medium',
        'NO_RETRY_POLICY',
        name,
        node.name,
        'External integration has no explicit retry policy.',
        'Add bounded retries with backoff for transient failures, plus an idempotency check before writes.'
      ));
    }

    if (String(node.type || '').toLowerCase().includes('webhook')) {
      const mode = node.parameters?.responseMode;
      if (mode && mode !== 'onReceived') {
        findings.push(finding(
          'medium',
          'WEBHOOK_ACK_COUPLED',
          name,
          node.name,
          `Webhook response mode is ${String(mode)} rather than immediate acknowledgement.`,
          'For retry-prone senders, acknowledge quickly, persist the event, and process slow work asynchronously.'
        ));
      }
    }

    if (defaultLikeName(node)) {
      findings.push(finding(
        'low',
        'GENERIC_NODE_NAME',
        name,
        node.name,
        'Node name describes the tool, not the business action.',
        'Rename it with a verb and outcome, such as “Persist transcript event” or “Reject duplicate lead”.'
      ));
    }
  }

  return { name, nodeCount: nodes.length, findings };
}

export function auditExport(value, options = {}) {
  const workflows = normalizeExports(value);
  const audited = workflows.map(auditWorkflow);
  const findings = audited.flatMap(entry => entry.findings);
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of findings) summary[item.severity] += 1;

  const deduction = findings.reduce(
    (sum, item) => sum + SEVERITY_WEIGHT[item.severity],
    0
  );
  const score = Math.max(0, 100 - deduction);
  const sourceText = options.sourceText || JSON.stringify(value);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      name: options.sourceName || 'workflow-export.json',
      sha256: createHash('sha256').update(sourceText).digest('hex')
    },
    privacy: 'No workflow parameter values or credential contents are included.',
    score,
    summary,
    workflowCount: audited.length,
    nodeCount: audited.reduce((sum, entry) => sum + entry.nodeCount, 0),
    findings
  };
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderMarkdown(report) {
  const rows = report.findings.length > 0
    ? report.findings.map(item =>
      `| ${item.severity.toUpperCase()} | ${escapeCell(item.code)} | ${escapeCell(item.workflow)} | ${escapeCell(item.node || '—')} | ${escapeCell(item.message)} | ${escapeCell(item.recommendation)} |`
    ).join('\n')
    : '| — | NO_FINDINGS | — | — | No findings in the implemented rule set. | Perform runtime failure testing before deployment. |';

  return `# n8n workflow reliability audit\n\n` +
    `- Score: **${report.score}/100**\n` +
    `- Workflows: ${report.workflowCount}\n` +
    `- Nodes: ${report.nodeCount}\n` +
    `- Findings: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low, ${report.summary.info} informational\n` +
    `- Source: \`${report.source.name}\`\n` +
    `- SHA-256: \`${report.source.sha256}\`\n` +
    `- Generated: ${report.generatedAt}\n\n` +
    `Privacy: ${report.privacy}\n\n` +
    `## Findings\n\n` +
    `| Severity | Rule | Workflow | Node | Evidence | Recommended next action |\n` +
    `|---|---|---|---|---|---|\n` +
    `${rows}\n\n` +
    `## What this score does—and does not—mean\n\n` +
    `The score is a deterministic static-analysis signal: critical −25, high −15, medium −7, low −3, informational −0, floored at zero. It is not proof that a workflow is production-safe. Runtime tests should still cover retries, duplicate delivery, partial failure, credential boundaries, and recovery.\n`;
}
