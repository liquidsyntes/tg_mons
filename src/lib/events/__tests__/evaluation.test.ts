import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvaluationCli } from '../eval-cli';
import { describe, it, expect, vi } from 'vitest';
import corpus from '../eval-data/dataset-v1.json';
import { parseDataset, parseRun, evaluate, compareReports, hash, type EvalRun } from '../evaluation';
import { buildDecisionRequest, DECISION_THRESHOLDS, SIGNALS, readDecisionAnswers } from '../decisions';
import { buildExtractionPrompt } from '../extraction';

const dataset = parseDataset(corpus);
function fixture(): EvalRun {
  return {schemaVersion:1, datasetHash:hash(dataset), model:'~typesafe/jev-latest', provenance:'synthetic', requestHash:hash(SIGNALS), thresholds:{...DECISION_THRESHOLDS}, batches: [{ids:dataset.examples.map(e=>e.id), response:{answers:Object.fromEntries(dataset.examples.flatMap(e=>SIGNALS.map(s=>[`${s.id}_${e.id}`,{type:'noul',noul:['digest','recap'].includes(s.id)?0:e.expected.selected?1:0}])) )}}], extraction:{provenance:'synthetic',events:dataset.examples.flatMap(e=>e.expected.event?[e.expected.event]:[])}};
}
describe('event evaluation',()=>{
  it('replays deterministically with no network and distinguishes synthetic results',()=>{
    const network = vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
    const run = parseRun(fixture());
    const first = evaluate(dataset,run);
    expect(evaluate(dataset,run)).toEqual(first);
    expect(first.selection.recall).toBe(1);
    expect(first.extraction?.fieldErrors).toEqual([]);
    expect(first.extraction?.missedDuplicates).toBe(0);
    expect(first.provenance).toBe('synthetic');
    expect(network).not.toHaveBeenCalled(); network.mockRestore();
  });
  it('reports malformed/missing model answers as errors, not negatives',()=>{
    const run=fixture(); run.batches=[{ids:[1],response:{answers:{}}}];
    const report=evaluate(dataset,run);
    expect(report.selection.errors).toBeGreaterThan(0);
    expect(report.errors).toHaveLength(1);
    expect(report.selection.recall).toBeNull();
  });
  it('detects date errors and missed duplicates and compares by stable IDs',()=>{
    const baseline=fixture(), candidate=fixture();
    const event=candidate.extraction!.events.find(e=>e.sourcePostIds[0]===9)!;
    // clone to avoid changing imported fixture expectations
    candidate.extraction!.events=candidate.extraction!.events.map(e=>e===event?{...e,date:'2026-12-21'}:e);
    const report=evaluate(dataset,candidate);
    expect(report.extraction?.fieldErrors).toContainEqual({id:9,fields:['date']});
    expect(report.extraction?.missedDuplicates).toBeGreaterThan(0);
    expect(compareReports(evaluate(dataset,baseline),report).extraction.after?.fieldErrors.length).toBeGreaterThan(0);
  });
  it('rejects incompatible datasets, invalid dates and split leakage',()=>{
    expect(()=>evaluate({...dataset,version:'changed'},fixture())).toThrow('hash');
    const copy=structuredClone(corpus);copy.examples[8].split='control';
    expect(()=>parseDataset(copy)).toThrow('leaks');
    const run=fixture();run.extraction!.events=[{title:'X',date:'2026-02-30',timeStr:null,organizer:null,prices:[],sourcePostIds:[1]}];
    expect(()=>parseRun(run)).toThrow('extraction');
  });
  it('uses identical question contracts for both models and validates thresholds',()=>{
    const jev=buildDecisionRequest(dataset.examples.slice(0,10),'~typesafe/jev-latest');
    const gemini=buildDecisionRequest(dataset.examples.slice(0,10),'google/gemini-decision-1');
    expect(jev.questions).toEqual(gemini.questions);
    expect(jev.state).toEqual(gemini.state);
    expect(()=>readDecisionAnswers({answers:{}},[],{...DECISION_THRESHOLDS,focused:NaN})).toThrow('threshold');
    expect(buildExtractionPrompt([{id:7,channel:'Synthetic',date:'2026-12-31T21:30:00Z',text:'Завтра'}])).toContain('2026-12-31T21:30:00Z');
  });
});

it('refuses paid capture without opt-in and does not contact the provider', async () => {
  const dir = await mkdtemp(join(tmpdir(),'tgmon-eval-'));
  const network = vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
  try {
    await writeFile(join(dir,'dataset.json'), JSON.stringify(dataset));
    await expect(runEvaluationCli(['capture','--dataset',join(dir,'dataset.json'),'--out',join(dir,'run.json'),'--model','google/gemini-decision-1','--limit','10'])).rejects.toThrow('--allow-paid');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); await rm(dir,{recursive:true,force:true}); }
});

it('keeps calendar dates tied to the publication timezone across year boundaries', () => {
  const example = dataset.examples.find(e=>e.category==='year_boundary')!;
  const local = new Intl.DateTimeFormat('en-CA',{timeZone:example.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(example.publishedAt));
  expect(local).toBe('2026-12-31');
  expect(example.expected.event?.date).toBe('2027-01-01');
  const run=fixture();
  run.extraction!.events=run.extraction!.events.map(e=>e.sourcePostIds.includes(example.id)?{...e,date:'2026-12-31'}:e);
  expect(evaluate(dataset,run).extraction?.fieldErrors).toContainEqual({id:example.id,fields:['date']});
});
