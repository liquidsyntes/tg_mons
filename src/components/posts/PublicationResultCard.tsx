'use client';
import {useEffect,useState} from 'react';
import type {PublicationResult} from '@/lib/publication-results';
interface Candidate {id:number;publishedAt:string;text:string|null}
export function PublicationResultCard({result,disabled,onLink}:{result?:PublicationResult;disabled:boolean;onLink:(id:number|null)=>Promise<void>}) {
  const [open,setOpen]=useState(false),[posts,setPosts]=useState<Candidate[]>([]),[page,setPage]=useState(0),[query,setQuery]=useState(''),[more,setMore]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false),[noChannel,setNoChannel]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setLoading(true);setError('');
    void fetch(`/api/posts/publication-candidates?${new URLSearchParams({page:String(page),q:query})}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Не удалось загрузить публикации');return r.json() as Promise<{posts:Candidate[];hasMore:boolean;noMyChannel:boolean}>;}).then(d=>{setPosts(d.posts);setMore(d.hasMore);setNoChannel(d.noMyChannel);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Ошибка');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[open,page,query]);
  async function link(id:number|null){try{await onLink(id);setOpen(false);setError('');}catch(e){setError(e instanceof Error?e.message:'Не удалось изменить связь');}}
  const labels={pending:'Ожидается замер',missed:'Окно замера пропущено',deleted:'Публикация удалена',measured:'Измерено'};
  return <div className="rounded border border-border p-2 space-y-2 text-xs">
    <p className="font-semibold">Фактическая публикация</p>
    {result?.state==='linked'?<>
      <p>{result.channelTitle} · {result.publishedAt ? new Date(result.publishedAt).toLocaleString('ru-RU'):''}</p>
      {result.username&&<a href={`https://t.me/${result.username}/${result.messageId}`} target="_blank" rel="noreferrer">Открыть пост</a>}
      {result.deletedAt&&<p>Пост удалён в Telegram. Сохранённые замеры доступны.</p>}
      {result.points?.map(point=><details key={point.hours}><summary>{point.hours} ч: {point.views===null?labels[point.state]:`${point.views} просмотров`}</summary>
        <p>Возраст замера: {point.actualAgeHours?.toFixed(2)??'нет данных'} ч.</p>
        <p>База: {point.sampleSize} публикаций того же формата и рекламного признака за предшествующие 30 дней.</p>
        <p>{point.median===null?'Недостаточно данных для сравнения (нужно 5)':`Медиана: ${point.median}; разница: ${point.delta??'нет данных'}; ${point.deltaPercent===null?'процент не определён':point.deltaPercent.toFixed(1)+'%'}`}</p>
      </details>)}
    </>:<p>{!result?'Данные связи ещё не загружены':result.state==='unavailable'?'Связанная публикация недоступна':result?.state==='removed'?'Связанная публикация удалена из базы':'Публикация не привязана'}</p>}
    <button type="button" disabled={disabled} onClick={()=>setOpen(v=>!v)} className="rounded border border-border px-2 py-1">{result?.state==='linked'?'Сменить публикацию':'Связать с публикацией'}</button>
    {result&&result.state!=='unlinked'&&<button type="button" disabled={disabled} onClick={()=>void link(null)} className="rounded border border-border px-2 py-1">Отвязать</button>}
    {error&&<p role="alert">{error}</p>}
    {open&&<div className="space-y-2"><label>Поиск публикации<input className="w-full rounded bg-slate-900 border border-border p-2" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
      {loading?<p>Загрузка...</p>:noChannel?<p>Сначала отметьте «Мой канал».</p>:posts.length===0?<p>Публикаций нет</p>:posts.map(p=><button type="button" key={p.id} disabled={disabled} onClick={()=>void link(p.id)} className="block text-left rounded border border-border p-2 w-full">{new Date(p.publishedAt).toLocaleString('ru-RU')} · {p.text??'Публикация без текста'}</button>)}
      <button type="button" disabled={loading||page===0} onClick={()=>setPage(p=>p-1)}>Назад</button><button type="button" disabled={loading||!more} onClick={()=>setPage(p=>p+1)}>Далее</button>
    </div>}
  </div>;
}
