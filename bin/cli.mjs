#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { auditExport, renderMarkdown } from '../lib/audit.mjs';

function usage() {
  return `Usage: n8n-reliability-audit <workflow.json> [options]

Options:
  --json              Print the machine-readable report
  --output <path>     Write the report to a file instead of stdout
  --help              Show this help

The workflow stays on this machine. Reports contain finding metadata and a
SHA-256 fingerprint, but never reproduce parameter values or credentials.`;
}

function parseArgs(argv) {
  const args = [...argv];
  const options = { json: false, output: null, input: null };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help') return { ...options, help: true };
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--output') {
      options.output = args.shift();
      if (!options.output) throw new Error('--output requires a path');
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    if (options.input) throw new Error('Provide exactly one workflow export');
    options.input = arg;
  }

  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.input) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  let source;
  let parsed;
  try {
    source = await readFile(options.input, 'utf8');
    parsed = JSON.parse(source);
  } catch (error) {
    console.error(`Could not read ${options.input}: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const report = auditExport(parsed, {
    sourceName: basename(options.input),
    sourceText: source
  });
  const output = options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderMarkdown(report);

  if (options.output) {
    await writeFile(options.output, output, 'utf8');
    console.error(`Wrote ${options.output}`);
  } else {
    process.stdout.write(output);
  }

  if (report.summary.critical > 0) process.exitCode = 1;
}

await main();
