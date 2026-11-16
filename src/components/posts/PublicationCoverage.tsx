'use client';
import {useEffect,useState} from 'react';
import type {PublicationSummary} from '@/lib/metrics/publication-summary';
export function PublicationCoverage({revision}:{revision:unknown}) {
  const [days,setDays]=useState(30),[data,setData]=useState<PublicationSummary|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');
    void fetch(`/api/posts/saved?coverageDays=${days}&summaryOnly=true`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Не удалось загрузить полноту замеров');return r.json() as Promise<{summary:PublicationSummary}>;}).then(r=>setData(r.summary)).catch((e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Ошибка загрузки');});
    return()=>controller.abort();
  },[days,revision]);
  return <section aria-label="Полнота замеров" className="rounded-xl border border-border bg-surface p-4 space-y-2 text-sm">
    <label>Эффективность публикаций за <select value={days} onChange={e=>setDays(Number(e.target.value))} className="bg-slate-900 border border-border rounded p-1">{[7,30,90].map(d=><option key={d} value={d}>{d} дней</option>)}</select></label>
    {error?<p role="alert">{error}</p>:!data?<p>Загрузка...</p>:<>
      <p className="text-xs text-slate-400">По фактической дате публикации: {new Date(data.coverage.periodStart).toLocaleString('ru-RU', {timeZone:data.timeZone})} - {new Date(data.coverage.periodEnd).toLocaleString('ru-RU', {timeZone:data.timeZone})}. Часовой пояс: {data.timeZone}. Уникальных связанных публикаций: {data.coverage.publications}, удалённых: {data.coverage.deletedPublications}.</p>
      {data.coverage.windows.map(w=><p key={w.hours}>{w.hours} ч: ожидаются {w.pending}; собраны {w.measured}; пропущены {w.missed}; удалены без замера {w.deleted}. Полнота: {w.completenessPercent===null?'нет данных':`${w.completenessPercent}%`} ({w.denominator} завершённых окон).</p>)}
      <p>Вне периода (дата неизвестна): недоступных публикаций {data.unavailable}; карточек с потерянной связью {data.removedLinks}.</p>
      {data.groups.length === 0 ? <p>За период нет доступных связанных публикаций.</p> : <div className="overflow-x-auto"><table className="w-full text-left"><caption className="text-left">Сравнение с индивидуальной исторической медианой</caption><thead><tr>{['Формат', 'Окно', 'Замеры', 'Сравнимые', 'Выше / равно / ниже', 'Без базы'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{data.groups.flatMap(g=>g.windows.map(w=><tr key={`${g.isAd}-${g.contentType}-${w.hours}`}><td className="p-2">{g.contentType} ({g.isAd?'реклама':'обычные'}), {g.publications} публ.</td><td className="p-2">{w.hours} ч</td><td className="p-2">{w.measured}</td><td className="p-2">{w.comparable}</td><td className="p-2">{w.above} / {w.equal} / {w.below}{w.comparable>0 && <span className="block text-xs">{[w.above,w.equal,w.below].map(n=>`${Math.round(n/w.comparable*100)}%`).join(' / ')}</span>}</td><td className="p-2">{w.withoutBaseline}</td></tr>))}</tbody></table></div>}
      <details><summary>Как считается сравнение</summary><p>Для каждой публикации и окна берётся медиана минимум 5 валидных замеров других предшествующих постов того же канала, формата и рекламного признака за 30 дней. Выше и ниже означают строгое сравнение просмотров, на уровне означает равенство. Доли рассчитаны от числа сравнимых публикаций в строке. Нули учитываются, отсутствие данных не равно нулю. Средний процент прироста не вычисляется. По этой сводке нельзя установить причину результата или рекомендовать лучший формат: достаточность для такого вывода не подтверждена.</p></details>
      <p className="text-xs text-slate-400">Полнота учитывает собранные и пропущенные замеры только после закрытия окна. Ожидающие и удалённые без замера исключены. Причина пропуска без записанных доказательств неизвестна.</p>
    </>}
  </section>;
}
