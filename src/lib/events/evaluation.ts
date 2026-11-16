import { createHash } from 'node:crypto';
import { isClearlyEventDigest } from './digest';
import { keywordCandidate, readDecisionAnswers, type DecisionModel } from './decisions';
import { isSameEvent } from './matching';

export interface EvalEvent { title: string; date: string; timeStr: string | null; organizer: string | null; prices: string[]; sourcePostIds: number[] }
export interface EvalExample {
  id: number; category: string; split: 'calibration' | 'control'; text: string;
  publishedAt: string; timeZone: string; expected: { selected: boolean; event: EvalEvent | null; duplicateGroup: string | null };
}
export interface EvalDataset { version: string; examples: EvalExample[] }
export interface DecisionBatch { ids: number[]; response?: unknown; error?: string; durationMs?: number; usage?: unknown }
export interface EvalRun {
  parentRunHash?: string;
  schemaVersion: 1; datasetHash: string; model: DecisionModel; provenance: 'live' | 'synthetic';
  requestHash: string; thresholds: Record<string, number>; batches: DecisionBatch[];
  extraction?: { provenance: 'live' | 'synthetic'; events: EvalEvent[] };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function validDate(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
export function parseDataset(raw: unknown): EvalDataset {
  requireValue(record(raw) && typeof raw.version === 'string' && Array.isArray(raw.examples), 'Invalid dataset');
  const ids = new Set<number>();
  const groups = new Map<string, string>();
  for (const item of raw.examples) {
    requireValue(record(item) && Number.isSafeInteger(item.id) && typeof item.text === 'string' && typeof item.category === 'string' && validDate(item.publishedAt) && typeof item.timeZone === 'string' && (item.split === 'calibration' || item.split === 'control'), 'Invalid example');
    requireValue(typeof item.id === 'number' && !ids.has(item.id), 'Duplicate example ID'); ids.add(item.id);
    new Intl.DateTimeFormat('en', {timeZone: item.timeZone});
    requireValue(record(item.expected) && typeof item.expected.selected === 'boolean', 'Invalid expectation');
    requireValue(item.expected.event === null || validEvent(item.expected.event), 'Invalid expected event');
    requireValue(item.expected.selected === (item.expected.event !== null), 'Expected selection/event mismatch');
    if (record(item.expected.event)) requireValue((item.expected.event.sourcePostIds as number[]).includes(item.id), 'Expected event must reference its example');
    const group = item.expected.duplicateGroup;
    requireValue(group === null || typeof group === 'string', 'Invalid duplicate group');
    if (typeof group === 'string') {
      requireValue(!groups.has(group) || groups.get(group) === item.split, 'Duplicate group leaks across splits'); groups.set(group, item.split);
    }
  }
  return raw as unknown as EvalDataset;
}
export function validEvent(raw: unknown): raw is EvalEvent {
  return record(raw) && typeof raw.title === 'string' && raw.title.trim().length > 0 && typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && validDate(raw.date) && new Date(raw.date).toISOString().slice(0, 10) === raw.date && (raw.timeStr === null || typeof raw.timeStr === 'string') && (raw.organizer === null || typeof raw.organizer === 'string') && Array.isArray(raw.prices) && raw.prices.every(p => typeof p === 'string') && Array.isArray(raw.sourcePostIds) && raw.sourcePostIds.length > 0 && raw.sourcePostIds.every(id => Number.isSafeInteger(id));
}
export function parseRun(raw: unknown): EvalRun {
  requireValue(record(raw) && raw.schemaVersion === 1 && typeof raw.datasetHash === 'string' && typeof raw.requestHash === 'string' && (raw.model === '~typesafe/jev-latest' || raw.model === 'google/gemini-decision-1') && (raw.provenance === 'live' || raw.provenance === 'synthetic') && Array.isArray(raw.batches) && record(raw.thresholds), 'Invalid run');
  for (const b of raw.batches) requireValue(record(b) && Array.isArray(b.ids) && b.ids.every(id => Number.isSafeInteger(id)) && (b.error === undefined || typeof b.error === 'string'), 'Invalid batch');
  if (raw.extraction !== undefined) requireValue(record(raw.extraction) && (raw.extraction.provenance === 'live' || raw.extraction.provenance === 'synthetic') && Array.isArray(raw.extraction.events) && raw.extraction.events.every(validEvent), 'Invalid extraction');
  return raw as unknown as EvalRun;
}
function metrics(rows: Array<{expected: boolean; actual: boolean | null}>) {
  const tp = rows.filter(r => r.expected && r.actual === true).length;
  const fp = rows.filter(r => !r.expected && r.actual === true).length;
  const fn = rows.filter(r => r.expected && r.actual === false).length;
  const tn = rows.filter(r => !r.expected && r.actual === false).length;
  const errors = rows.filter(r => r.actual === null).length;
  return {tp, fp, fn, tn, errors, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, coverage: rows.length ? (rows.length - errors) / rows.length : null};
}
export function evaluate(dataset: EvalDataset, run: EvalRun, split?: EvalExample['split']) {
  requireValue(run.datasetHash === hash(dataset), 'Dataset hash mismatch');
  const answers = new Map<number, boolean | null>();
  const allIds = new Set(dataset.examples.map(e => e.id));
  const errors: string[] = [];
  for (const batch of run.batches) {
    requireValue(batch.ids.every(id => allIds.has(id) && !answers.has(id)) && new Set(batch.ids).size === batch.ids.length, 'Unknown or repeated batch ID');
    batch.ids.forEach(id => answers.set(id, null));
    try {
      if (batch.error) throw new Error(batch.error);
      const selected = readDecisionAnswers(batch.response, batch.ids.map(id => ({id, text: ''})), run.thresholds);
      batch.ids.forEach(id => answers.set(id, selected.has(id)));
    } catch { errors.push(`Invalid or failed batch: ${batch.ids.join(',')}`); }
  }
  const examples = dataset.examples.filter(e => !split || e.split === split);
  const rows = examples.map(e => ({id: e.id, category: e.category, expected: e.expected.selected, actual: isClearlyEventDigest(e.text) ? false : answers.get(e.id) ?? null, fallback: !isClearlyEventDigest(e.text) && keywordCandidate(e.text)}));
  const extraction = run.extraction;
  const extracted = extraction?.events ?? [];
  const selectedIds = new Set(rows.filter(r => r.actual === true).map(r => r.id));
  const accepted = extracted.filter(e => e.sourcePostIds.some(id => selectedIds.has(id)));
  const fieldErrors: Array<{id: number; fields: string[]}> = [];
  if (extraction) for (const example of examples.filter(e => e.expected.event)) {
    const actual = accepted.find(e => e.sourcePostIds.includes(example.id));
    const expected = example.expected.event!;
    const fields = actual ? (['title','date','timeStr','organizer','prices'] as const).filter(k => JSON.stringify(actual[k]) !== JSON.stringify(expected[k])) : ['missing_event'];
    if (fields.length) fieldErrors.push({id: example.id, fields});
  }
  let falseMerges = 0, missedDuplicates = 0;
  if (extraction) for (let i = 0; i < examples.length; i++) for (let j = i + 1; j < examples.length; j++) {
    const a = examples[i], b = examples[j];
    if (!a.expected.selected || !b.expected.selected) continue;
    const ea = accepted.find(e => e.sourcePostIds.includes(a.id)), eb = accepted.find(e => e.sourcePostIds.includes(b.id));
    const same = Boolean(ea && eb && (ea === eb || isSameEvent({...ea, date: new Date(ea.date)}, {...eb, date: new Date(eb.date)})));
    const expectedSame = a.expected.duplicateGroup !== null && a.expected.duplicateGroup === b.expected.duplicateGroup;
    if (same && !expectedSame) falseMerges++;
    if (!same && expectedSame) missedDuplicates++;
  }
  const costs = run.batches.map(b => {
    const usage = record(b.response) && record(b.response.usage) ? b.response.usage : null;
    return usage && typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : null;
  });
  const durations = run.batches.flatMap(b => typeof b.durationMs === 'number' ? [b.durationMs] : []).sort((a,b) => a-b);
  return {
    datasetHash: run.datasetHash, model: run.model, provenance: run.provenance, split: split ?? 'all',
    selection: metrics(rows), fallback: metrics(rows.map(r => ({expected: r.expected, actual: r.fallback}))),
    categories: Object.fromEntries([...new Set(rows.map(r => r.category))].sort().map(c => [c, metrics(rows.filter(r => r.category === c))])),
    extraction: extraction ? {provenance: extraction.provenance, fieldErrors, falseMerges, missedDuplicates, unknownSourceIds: [...new Set(extracted.flatMap(e => e.sourcePostIds).filter(id => !allIds.has(id)))], endToEnd: metrics(rows.map(r => ({expected:r.expected, actual:r.actual === null ? null : accepted.some(e => e.sourcePostIds.includes(r.id))})))} : null,
    costUsd: costs.length > 0 && costs.every((c): c is number => c !== null) ? costs.reduce((a,b) => a+b,0) : null,
    latency: {batchCount: durations.length, medianMs: durations.length ? durations[Math.floor(durations.length / 2)] : null},
    errors, rows,
  };
}
export function compareReports(a: ReturnType<typeof evaluate>, b: ReturnType<typeof evaluate>) {
  requireValue(a.datasetHash === b.datasetHash && a.split === b.split, 'Cannot compare different datasets or splits');
  return {before:a.model, after:b.model, regressions:b.rows.filter(r => a.rows.find(p => p.id === r.id)?.actual === r.expected && r.actual !== r.expected).map(r => r.id), improvements:b.rows.filter(r => a.rows.find(p => p.id === r.id)?.actual !== r.expected && r.actual === r.expected).map(r => r.id), extraction: {before:a.extraction, after:b.extraction, regressionIds: b.extraction?.fieldErrors.filter(e => !a.extraction?.fieldErrors.some(p => p.id === e.id && JSON.stringify(p.fields) === JSON.stringify(e.fields))).map(e=>e.id) ?? []}};
}

/** Retry only explicit negative decisions, never missing or failed classifier responses. */
export function rejectedExamples(dataset: EvalDataset, first: EvalRun): EvalExample[] {
  const report = evaluate(dataset, first);
  requireValue(report.selection.errors === 0, 'First stage must have complete valid decisions');
  const ids = new Set(report.rows.filter(r => r.actual === false).map(r => r.id));
  return dataset.examples.filter(e => ids.has(e.id));
}

export function evaluateCascade(dataset: EvalDataset, first: EvalRun, second: EvalRun) {
  requireValue(second.parentRunHash === hash(first), 'Cascade parent hash mismatch');
  const rejected = new Set(rejectedExamples(dataset, first).map(e => e.id));
  requireValue(second.batches.every(b => b.ids.every(id => rejected.has(id))), 'Second stage contains non-rejected IDs');
  const a = evaluate(dataset, first), b = evaluate(dataset, second);
  const byId = new Map(b.rows.map(r => [r.id,r]));
  const rows = a.rows.map(r => ({...r, actual: r.actual === true ? true : byId.get(r.id)?.actual ?? null}));
  return {
    firstModel:first.model, secondModel:second.model, datasetHash:hash(dataset),
    firstRunHash:hash(first), secondRunHash:hash(second),
    firstStageReused:true, secondStageExamples:second.batches.reduce((n,b)=>n+b.ids.length,0),
    selection:metrics(rows),
    control:metrics(rows.filter(r => dataset.examples.find(e=>e.id===r.id)?.split==='control')),
    recovered:rows.filter(r=>r.expected && r.actual===true && a.rows.find(p=>p.id===r.id)?.actual===false).map(r=>r.id),
    missed:rows.filter(r=>r.expected && r.actual!==true).map(r=>r.id),
    additionalCostUsd:b.costUsd,
    totalCostUsd:a.costUsd!==null && b.costUsd!==null ? a.costUsd+b.costUsd : null,
    rows,
  };
}
