const pending = new Map<string,{key:string; promise:Promise<Response> | null; unknown?: boolean}>();
/** Keep the action key after network uncertainty; a completed action gets a new key next time. */
export async function aiRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const fingerprint=JSON.stringify([url,init.body ?? null]);
  let entry=pending.get(fingerprint);
  if (entry?.unknown) {
    if (!window.confirm('Исход предыдущей операции неизвестен. Новая генерация может привести к повторной оплате. Начать новую?')) throw new Error('Новая генерация отменена');
    pending.delete(fingerprint); entry=undefined; sessionStorage.removeItem(fingerprint);
  }
  entry ??= {key:sessionStorage.getItem(fingerprint) ?? crypto.randomUUID(),promise:null};
  sessionStorage.setItem(fingerprint,entry.key);
  if (entry.promise) return (await entry.promise).clone();
  pending.set(fingerprint,entry);
  entry.promise=(async()=>{
    for (let count=0;count<600;count++) {
      const response=await fetch(url,{...init,headers:{...Object.fromEntries(new Headers(init.headers)), 'Idempotency-Key':entry.key}});
      const canonicalKey=response.headers.get('X-AI-Operation-Key');
      if(canonicalKey){entry.key=canonicalKey;sessionStorage.setItem(fingerprint,entry.key);}
      if (response.status===202) { await new Promise(resolve=>setTimeout(resolve,2000)); continue; }
      const terminal=response.headers.get('X-AI-Operation-State');
      if (response.status===409 || terminal==='UNKNOWN') entry.unknown=true;
      if (terminal==='FAILED' || terminal==='SUCCEEDED' || (response.status!==503 && response.status!==409 && terminal!=='UNKNOWN')) {pending.delete(fingerprint);sessionStorage.removeItem(fingerprint);}
      return response;
    }
    throw new Error('Операция ещё выполняется. Повторное обращение проверит её состояние.');
  })();
  try { return (await entry.promise).clone(); } finally { entry.promise=null; }
}
