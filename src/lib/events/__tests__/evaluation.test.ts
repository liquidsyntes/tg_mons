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

it('limits cascade requests to negatives and verifies the parent run', async () => {
  const { rejectedExamples, evaluateCascade } = await import('../evaluation');
  const first=fixture();
  const rejected=rejectedExamples(dataset,first);
  expect(rejected.every(e=>!e.expected.selected)).toBe(true);
  const second=fixture(); second.model='google/gemini-decision-1'; second.parentRunHash=hash(first);
  expect(()=>evaluateCascade(dataset,first,second)).toThrow('non-rejected');
  second.batches=second.batches.map(b=>({...b,ids:rejected.map(e=>e.id)}));
  expect(evaluateCascade(dataset,first,second).selection.recall).toBe(1);
  second.parentRunHash='wrong';
  expect(()=>evaluateCascade(dataset,first,second)).toThrow('parent hash');
  first.batches=[];
  expect(()=>rejectedExamples(dataset,first)).toThrow('complete valid');
});

it('reports a missing second-stage result as unknown rather than rejection', async () => {
  const { evaluateCascade } = await import('../evaluation');
  const first=fixture();
  first.batches=[{ids:dataset.examples.map(e=>e.id),response:{answers:Object.fromEntries(dataset.examples.flatMap(e=>SIGNALS.map(s=>[`${s.id}_${e.id}`,{type:'noul',noul:0}])) )}}];
  const second=fixture();second.parentRunHash=hash(first);second.batches=[];
  const result=evaluateCascade(dataset,first,second);
  expect(result.selection.errors).toBeGreaterThan(0);
  expect(result.selection.recall).toBeNull();
});

it('validates v2 families, exact duplicates and language metadata', async () => {
  const { default: corpusV2 } = await import('../eval-data/dataset-v2.json');
  const input = structuredClone(corpusV2);
  expect(parseDataset(input).examples).toHaveLength(200);
  input.examples[1].split = 'control';
  expect(()=>parseDataset(input)).toThrow('family leaks');
  input.examples[1].split = input.examples[0].split;
  input.examples[1].text = input.examples[0].text;
  expect(()=>parseDataset(input)).toThrow('Duplicate example text');
});

it('prepares deterministic plans without credentials or network and preserves package membership', async () => {
  const { readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(),'tgmon-plan-'));
  const network = vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
  try {
    const path = join(dir,'dataset.json');
    await writeFile(path,JSON.stringify(dataset));
    const plan = async (name:string,order:string) => {
      const out=join(dir,name);
      await runEvaluationCli(['plan','--dataset',path,'--out',out,'--model','~typesafe/jev-latest','--limit','80','--order',order]);
      return JSON.parse(await readFile(out,'utf8')) as {requestHash:string;payloads:Array<{state:{posts:Array<{id:number}>}}>};
    };
    const original=await plan('original','original'), reversed=await plan('reversed','within-batch');
    expect(reversed.payloads.map(p=>p.state.posts.map(e=>e.id))).toEqual(original.payloads.map(p=>p.state.posts.map(e=>e.id).reverse()));
    expect((await plan('again','within-batch')).requestHash).toBe(reversed.requestHash);
    const regrouped=await plan('regrouped','regroup');
    expect(regrouped.requestHash).not.toBe(original.requestHash);
    expect(regrouped.payloads.flatMap(p=>p.state.posts.map(e=>e.id)).sort((a,b)=>a-b)).toEqual(dataset.examples.map(e=>e.id).sort((a,b)=>a-b));
    expect(network).not.toHaveBeenCalled();
  } finally {network.mockRestore();await rm(dir,{recursive:true,force:true});}
});

it('does not hide missing classifier answers behind the digest prefilter', async () => {
  const { rejectedExamples }=await import('../evaluation');
  const input=structuredClone(dataset);
  input.examples=[{...input.examples[0],text:'Афиша недели:\n23 ноября концерт в клубе.\n24 ноября лекция в музее.\n25 ноября спектакль в театре.'}];
  const run=fixture();run.datasetHash=hash(input);run.batches=[];
  expect(evaluate(input,run).modelSelection.errors).toBe(1);
  expect(()=>rejectedExamples(input,run)).toThrow('complete valid');
});

it('keeps undefined metrics null and separates known cost from unpriced batches', () => {
  const input={version:'empty',examples:[]};
  const run=fixture();run.datasetHash=hash(input);run.batches=[];delete run.extraction;
  const result=evaluate(input,run);
  expect(result.selection).toEqual({tp:0,fp:0,fn:0,tn:0,errors:0,precision:null,recall:null,coverage:null});
  expect(result.costUsd).toBeNull();
  expect(result.latency.totalMs).toBeNull();
});
