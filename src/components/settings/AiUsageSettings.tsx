'use client';
import { useEffect, useState } from 'react';
interface Limits {aiHourlyLimit:number;aiConcurrentLimit:number;aiProviderConcurrency:number;aiDailyBudget?:string|null;aiMonthlyBudget?:string|null;aiBudgetMode?:'WARN'|'BLOCK';aiBudgetWarning?:number;aiBudgetTelegram?:boolean}
interface Usage {budget?:{periods:Array<{period:string;start:string;end:string;budget:string|null;knownCostUsd:string;unknownCostCalls:number;reached:boolean}>;notices:Array<{id:string;period:string;periodStart:string;threshold:number;delivery:string}>};operations:Array<{id:string;actor:string;kind:string;status:string;createdAt:string;calls:Array<{model:string;stage:string;status:string;cost:string|null;durationMs:number|null;inputTokens:number|null;outputTokens:number|null}>}>;total:number;settings:Limits;summary:{knownCostUsd:string|null;unknownCostCalls:number;calls:number}}
const statuses: Record<string,string>={RUNNING:'Выполняется',SUCCEEDED:'Успешно',FAILED:'Ошибка',UNKNOWN:'Исход неизвестен'};
export function AiUsageSettings() {
  const [data,setData]=useState<Usage|null>(null),[error,setError]=useState(''),[page,setPage]=useState(0),[days,setDays]=useState(7),[actor,setActor]=useState(''),[kind,setKind]=useState('');
  const [limits,setLimits]=useState<Limits>({aiHourlyLimit:0,aiConcurrentLimit:0,aiProviderConcurrency:4});
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/admin/ai-usage?${new URLSearchParams({page:String(page),days:String(days),actor,kind})}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Не удалось загрузить журнал');return r.json() as Promise<Usage>;}).then(d=>{setData(d);setLimits(d.settings);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Ошибка загрузки');});
    return ()=>controller.abort();
  },[page,days,actor,kind,reload]);
  async function save() {
    try {const r=await fetch('/api/admin/ai-usage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(limits)});if(!r.ok)throw new Error('Не удалось сохранить лимиты');setReload(v=>v+1);}catch(e){setError(e instanceof Error?e.message:'Ошибка');}
  }
  return <section className="rounded border border-border p-4 space-y-3">
    <h2 className="text-lg font-semibold">Использование AI</h2>
    {error&&<p role="alert">{error}</p>}
    <label>Период <select className="bg-slate-900 border border-border rounded px-3 py-2 ml-2" value={days} onChange={e=>{setDays(Number(e.target.value));setPage(0);}}>{[1,7,30,90].map(d=><option key={d} value={d}>{d} дней</option>)}</select></label>
    <label>Инициатор <input className="bg-slate-900 border border-border rounded px-3 py-2 ml-2" value={actor} placeholder="user:1 / system:bearer" onChange={e=>{setActor(e.target.value);setPage(0);}} /></label>
    <label>Операция <input className="bg-slate-900 border border-border rounded px-3 py-2 ml-2" value={kind} placeholder="summary / events-scan" onChange={e=>{setKind(e.target.value);setPage(0);}} /></label>
    <p>Подтверждённые расходы: {data?.summary.knownCostUsd ?? 'нет данных'} USD. Без стоимости: {data?.summary.unknownCostCalls ?? 0} запросов.</p>
    {Object.entries({aiHourlyLimit:'Операций за час на инициатора (0: без лимита)',aiConcurrentLimit:'Параллельных операций на инициатора (0: без лимита)',aiProviderConcurrency:'Параллельных запросов провайдеру'}).map(([key,label])=><label className="block" key={key}>{label}<input className="bg-slate-900 border border-border rounded px-3 py-2 ml-2" type="number" min={key==='aiProviderConcurrency'?1:0} value={limits[key as 'aiHourlyLimit'|'aiConcurrentLimit'|'aiProviderConcurrency']} onChange={e=>setLimits({...limits,[key]:Number(e.target.value)})}/></label>)}
    <p>Общий бюджет приложения: календарные день и месяц UTC. Пустая сумма отключает бюджет. Текущие вызовы продолжаются; неизвестная стоимость и выполняющиеся запросы могут привести к перерасходу. Оценочный CLI и внешние вызовы не входят.</p>
    {(['aiDailyBudget','aiMonthlyBudget'] as const).map(key=><label className="block" key={key}>{key==='aiDailyBudget'?'Дневной':'Месячный'} бюджет USD <input className="bg-slate-900 border border-border rounded px-3 py-2" inputMode="decimal" value={limits[key]??''} onChange={e=>setLimits({...limits,[key]:e.target.value||null})}/></label>)}
    <label className="block">Режим <select value={limits.aiBudgetMode??'WARN'} onChange={e=>setLimits({...limits,aiBudgetMode:e.target.value==='BLOCK'?'BLOCK':'WARN'})}><option value="WARN">Только предупреждать</option><option value="BLOCK">Блокировать новые операции</option></select></label>
    <label className="block">Порог предупреждения (%) <input type="number" min={1} max={99} value={limits.aiBudgetWarning??80} onChange={e=>setLimits({...limits,aiBudgetWarning:Number(e.target.value)})}/></label>
    <label className="block"><input type="checkbox" checked={limits.aiBudgetTelegram??false} onChange={e=>setLimits({...limits,aiBudgetTelegram:e.target.checked})}/> Уведомлять в настроенный операционный Telegram-чат</label>
    {data?.budget?.periods.map(p=><p key={p.period}>{p.period==='day'?'День':'Месяц'} UTC: {p.start} / {p.end}. Расходы {p.knownCostUsd} / {p.budget??'отключено'} USD. Без стоимости: {p.unknownCostCalls}. {p.reached?'Бюджет достигнут':''}</p>)}
    {data?.budget?.notices.map(n=><p role="status" key={n.id}>Порог {n.threshold}% ({n.period}, {n.periodStart}, UTC). Telegram: {({PENDING:'ожидает доставки',SENT:'доставлено',FAILED:'отказ доставки',UNKNOWN:'исход доставки неизвестен'} as Record<string,string>)[n.delivery]??n.delivery}</p>)}
    <button className="rounded border border-border px-3 py-2 disabled:opacity-50" type="button" onClick={()=>void save()}>Сохранить лимиты</button>
    {!data?<p>Загрузка...</p>:data.operations.length===0?<p>Операций за период нет</p>:data.operations.map(o=><details key={o.id} className="rounded border border-border p-2"><summary>{o.createdAt} · {o.actor} · {o.kind} · {statuses[o.status] ?? o.status}</summary>{o.calls.map((c,i)=><p key={i}>{c.model} · {c.stage} · {statuses[c.status] ?? c.status} · {c.cost??'стоимость неизвестна'} {c.cost!==null?'USD':''} · {c.durationMs??'?'} мс · Токены: {c.inputTokens??'?'} / {c.outputTokens??'?'}</p>)}</details>)}
    <button className="rounded border border-border px-3 py-2 disabled:opacity-50" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Назад</button><button className="rounded border border-border px-3 py-2 disabled:opacity-50" disabled={!data||(page+1)*25>=data.total} onClick={()=>setPage(p=>p+1)}>Далее</button>
  </section>;
}
