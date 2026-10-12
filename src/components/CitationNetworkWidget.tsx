'use client';

import { useEffect, useState } from 'react';
import { Network, ArrowUpRight, ArrowDownLeft, RefreshCcw, ChevronDown } from 'lucide-react';
import Link from 'next/link';

interface NetworkData {
  outbound: { target: string; type: string; count: number }[];
  inbound: { source: string; channelId: number; type: string; count: number }[];
}

export default function CitationNetworkWidget({ channelId }: { channelId: number }) {
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/channels/${channelId}/network`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setError(true);
        setLoading(false);
      });
  }, [channelId]);

  return (
    <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-bold text-white">Сетка каналов (Media Network)</h3>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          aria-controls={`network-content-${channelId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
        >
          {expanded ? 'Свернуть' : 'Развернуть'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div id={`network-content-${channelId}`} className={expanded ? 'mt-6' : 'hidden'}>
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <RefreshCcw className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : error ? (
          <p className="text-sm text-slate-400">Не удалось загрузить сетку каналов</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-4 text-sm text-slate-400">
                <ArrowUpRight className="w-4 h-4 text-orange-400" /> Кого репостит и упоминает
              </h3>
              {data?.outbound.length === 0 ? (
                <div className="text-sm text-slate-500">Нет упоминаний</div>
              ) : (
                <ul className="space-y-3">
                  {data?.outbound.map((item, idx) => (
                    <li key={idx} className="flex justify-between items-center text-sm border-b border-border/50 pb-2 last:border-0">
                      <span className="font-medium text-slate-200">
                        {item.target.startsWith('@') || item.target.match(/^[a-zA-Z]/)
                          ? <a href={`https://t.me/${item.target}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">@{item.target}</a>
                          : item.target}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2 py-1 bg-slate-800 rounded-md text-slate-400 capitalize">{item.type}</span>
                        <span className="font-bold text-white">{item.count}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-4 text-sm text-slate-400">
                <ArrowDownLeft className="w-4 h-4 text-emerald-400" /> Кто репостит его (из базы)
              </h3>
              {data?.inbound.length === 0 ? (
                <div className="text-sm text-slate-500">Пока никто не репостил</div>
              ) : (
                <ul className="space-y-3">
                  {data?.inbound.map((item, idx) => (
                    <li key={idx} className="flex justify-between items-center text-sm border-b border-border/50 pb-2 last:border-0">
                      <span className="font-medium">
                        <Link href={`/channel/${item.channelId}`} className="text-blue-400 hover:underline">
                          {item.source}
                        </Link>
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2 py-1 bg-slate-800 rounded-md text-slate-400 capitalize">{item.type}</span>
                        <span className="font-bold text-white">{item.count}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
