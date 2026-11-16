import { buildExtractionPrompt } from './extraction';
import { readFile, writeFile } from 'node:fs/promises';
import { buildDecisionRequest, DECISION_THRESHOLDS, parseDecisionModel } from './decisions';
import { compareReports, evaluate, hash, parseDataset, parseRun, type EvalRun } from './evaluation';

/** Explicit paths only; never reads application settings or writes the application database. */
export async function runEvaluationCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  const options = new Map<string,string>();
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith('--') || !rest[i+1] || options.has(rest[i])) throw new Error('Expected unique --option value pairs');
    options.set(rest[i],rest[i+1]);
  }
  const required = (name: string): string => { const value = options.get(name); if (!value) throw new Error(`Required ${name}`); return value; };
  const dataset = parseDataset(JSON.parse(await readFile(required('--dataset'),'utf8')));
  const output = required('--out');
  const allowed = ['--dataset','--out','--split','--run','--other','--allow-paid','--limit','--model','--extraction'];
  if ([...options.keys()].some(k => !allowed.includes(k))) throw new Error('Unknown option');
  const loadRun = async (path: string) => parseRun(JSON.parse(await readFile(path,'utf8')));
  if (command === 'prepare-extraction') {
    const run = await loadRun(required('--run'));
    const report = evaluate(dataset, run);
    const ids = new Set(report.rows.filter(r => r.actual === true).map(r => r.id));
    const posts = dataset.examples.filter(e => ids.has(e.id)).map(e => ({id:e.id,channel:'Synthetic',date:e.publishedAt,text:e.text,timeZone:e.timeZone}));
    const prompt = buildExtractionPrompt(posts);
    await writeFile(output, JSON.stringify({datasetHash:hash(dataset),decisionRunHash:hash(run),promptHash:hash(prompt),prompt},null,2)+'\n',{flag:'wx'}); return;
  }
  if (command === 'evaluate' || command === 'compare') {
    const split = options.get('--split');
    if (split !== undefined && split !== 'calibration' && split !== 'control') throw new Error('Invalid split');
    const input = await loadRun(required('--run'));
    if (options.has('--extraction')) input.extraction = parseRun({...input, extraction: JSON.parse(await readFile(required('--extraction'),'utf8'))}).extraction;
    const report = evaluate(dataset, input, split);
    const result = command === 'compare' ? compareReports(report, evaluate(dataset,await loadRun(required('--other')),split)) : report;
    await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'}); return;
  }
  if (command !== 'capture') throw new Error('Commands: evaluate, compare, prepare-extraction, capture');
  if (required('--allow-paid') !== 'yes') throw new Error('Paid requests require --allow-paid yes');
  const limit = Number(required('--limit'));
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1..100');
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY required');
  const model = parseDecisionModel(required('--model'));
  const posts = dataset.examples.slice(0,limit);
  const payloads = Array.from({length:Math.ceil(posts.length/10)},(_,i) => buildDecisionRequest(posts.slice(i*10,i*10+10),model));
  const run: EvalRun = {schemaVersion:1,datasetHash:hash(dataset),model,provenance:'live',requestHash:hash(payloads),thresholds:{...DECISION_THRESHOLDS},batches:[]};
  // Reserve output before any charge; never overwrite a prior run.
  await writeFile(output,JSON.stringify(run,null,2)+'\n',{flag:'wx'});
  for (const payload of payloads) {
    const ids = payload.state.posts.map(p=>p.id), start = Date.now();
    try {
      const response = await fetch('https://openrouter.ai/api/alpha/decisions', {method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: unknown = await response.json();
      run.batches.push({ids,response:body,durationMs:Date.now()-start});
    } catch (error) {
      const message = error instanceof Error && /^HTTP \d+$/.test(error.message) ? error.message : 'Transport or response error';
      run.batches.push({ids,error:message,durationMs:Date.now()-start});
    }
    await writeFile(output,JSON.stringify(run,null,2)+'\n');
  }
  await writeFile(output+'.requests.json',JSON.stringify(payloads,null,2)+'\n',{flag:'wx'});
}
