'use client';
import {useEffect,useState} from 'react';
import type {PerformanceCoverage} from '@/lib/metrics/publication-performance';
export function PublicationCoverage({revision}:{revision:unknown}) {
  const [days,setDays]=useState(30),[data,setData]=useState<PerformanceCoverage|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');
    void fetch(`/api/posts/saved?coverageDays=${days}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Не удалось загрузить полноту замеров');return r.json() as Promise<{coverage:PerformanceCoverage}>;}).then(r=>setData(r.coverage)).catch((e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Ошибка загрузки');});
    return()=>controller.abort();
  },[days,revision]);
  return <section aria-label="Полнота замеров" className="rounded-xl border border-border bg-surface p-4 space-y-2 text-sm">
    <label>Полнота замеров за <select value={days} onChange={e=>setDays(Number(e.target.value))} className="bg-slate-900 border border-border rounded p-1">{[7,30,90].map(d=><option key={d} value={d}>{d} дней</option>)}</select></label>
    {error?<p role="alert">{error}</p>:!data?<p>Загрузка...</p>:<>
      <p className="text-xs text-slate-400">По фактической дате публикации: {new Date(data.periodStart).toLocaleString('ru-RU')} - {new Date(data.periodEnd).toLocaleString('ru-RU')}. Уникальных связанных публикаций: {data.publications}, удалённых: {data.deletedPublications}.</p>
      {data.windows.map(w=><p key={w.hours}>{w.hours} ч: ожидаются {w.pending}; собраны {w.measured}; пропущены {w.missed}; удалены без замера {w.deleted}. Полнота: {w.completenessPercent===null?'нет данных':`${w.completenessPercent}%`} ({w.denominator} завершённых окон).</p>)}
      <p className="text-xs text-slate-400">Полнота учитывает собранные и пропущенные замеры только после закрытия окна. Ожидающие и удалённые без замера исключены. Причина пропуска без записанных доказательств неизвестна.</p>
    </>}
  </section>;
}
