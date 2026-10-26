'use client';

import { useCallback, useEffect, useState } from 'react';
import { Network, ChevronDown } from 'lucide-react';
import type { CitationNetworkData, CitationNetworkNode, OriginRole, PropagationData } from '@/lib/types';

const WIDTH = 900;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 48;

function nodeHref(node: CitationNetworkNode): string {
  return node.channelId !== null ? `/channel/${node.channelId}` : `https://t.me/${node.username}`;
}

function shorten(value: string, length = 23): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

const ROLE_LABELS: Record<OriginRole, string> = {
  origin: 'Первоисточник',
  distributor: 'Агрегатор / Дистрибьютор',
  balanced: 'Сбалансированный',
  isolated: 'Изолированный',
};

function delayLabel(minutes: number | null): string {
  if (minutes === null) return 'н/д';
  if (minutes >= 1440) return `${(minutes / 1440).toFixed(1)} дн.`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} ч`;
  return `${minutes} мин`;
}

function postHref(username: string | null, tgId: string | null | undefined, messageId: string): string | null {
  if (!/^\d+$/.test(messageId)) return null;
  if (username && /^[a-z0-9_]{4,}$/i.test(username)) return `https://t.me/${username}/${messageId}`;
  return tgId && /^\d+$/.test(tgId) ? `https://t.me/c/${tgId}/${messageId}` : null;
}

function PropagationPanel({ data, focalUsername }: { data: PropagationData; focalUsername: string | null }) {
  return <div className="space-y-4" aria-label="Цепочки распространения">
    <div className="rounded-xl border border-border bg-slate-900/50 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 font-semibold text-accent">{ROLE_LABELS[data.role]}</span>
        <span>Входящие упоминания: <strong className="text-white">{data.incomingCount}</strong></span>
        <span>Исходящие упоминания: <strong className="text-white">{data.outgoingCount}</strong></span>
        <span>Индекс первоисточника: <strong className="text-white">{data.originRatio ?? 'н/д'}</strong></span>
        <span>Средний отклик: <strong className="text-white">{delayLabel(data.averageIncomingDelayMinutes)}</strong></span>
      </div>
      <p className="text-[11px] text-slate-500">По доступным отслеживаемым каналам за 30 дней. Задержка известна только при точной ссылке на исходный пост.</p>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Топ цитируемых публикаций</h3>
        {data.topCitedPosts.length === 0 ? <p className="text-xs text-slate-400">Точные связи с публикациями пока не найдены</p>
          : data.topCitedPosts.map(post => {
            const href = postHref(focalUsername, data.focalTgId, post.messageId);
            return <div key={post.id} className="border-t border-border pt-2 text-xs space-y-1">
              <p className="text-slate-200">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Пост от {new Date(post.publishedAt).toLocaleDateString('ru-RU')}</a>
                : `Пост от ${new Date(post.publishedAt).toLocaleDateString('ru-RU')}`} · {post.citationsCount} цитирований</p>
              {post.textSnippet && <p className="line-clamp-2 text-slate-400">{post.textSnippet}</p>}
              <p className="text-slate-400">Подхватили: {post.citingChannels.map(channel => `${channel.title} (${channel.citationsCount}, ${delayLabel(channel.averageDelayMinutes)})`).join(', ')}</p>
            </div>;
          })}
      </div>
      <div className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Последние цепочки</h3>
        {data.recentChains.length === 0 ? <p className="text-xs text-slate-400">Связей с другими отслеживаемыми каналами пока нет</p>
          : data.recentChains.map((chain, index) => {
            const href = postHref(chain.source.username, chain.source.tgId, chain.citingMessageId);
            return <div key={`${chain.source.id}-${chain.target.id}-${chain.citingMessageId}-${index}`} className="border-t border-border pt-2 text-xs space-y-1">
              <p className="text-slate-200">{chain.source.title} → {chain.target.title}</p>
              <p className="text-slate-400">{chain.type === 'forward' ? 'Пересылка' : 'Упоминание'} · {new Date(chain.publishedAt).toLocaleString('ru-RU')} · отклик {delayLabel(chain.delayMinutes)}</p>
              {href && <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Открыть цитирующий пост</a>}
            </div>;
          })}
      </div>
    </div>
  </div>;
}

function NetworkGraph({ data, channelId }: { data: CitationNetworkData; channelId: number }) {
  const focalId = `channel:${channelId}`;
  const nodeById = new Map(data.nodes.map(node => [node.id, node]));
  const focal = nodeById.get(focalId);
  const incoming = data.edges.filter(edge => edge.target === focalId).slice(0, 8);
  const outgoing = data.edges.filter(edge => edge.source === focalId).slice(0, 8);
  const height = Math.max(260, Math.max(incoming.length, outgoing.length) * 72 + 80);
  const middleY = height / 2;
  const [highlighted, setHighlighted] = useState<string | null>(null);

  if (!focal || (incoming.length === 0 && outgoing.length === 0)) {
    return <p className="rounded-xl border border-border p-6 text-center text-sm text-slate-400">Связей за выбранный период нет.</p>;
  }

  const position = (index: number, count: number) => middleY + (index - (count - 1) / 2) * 72;
  const edgePath = (side: 'left' | 'right', y: number) => side === 'left'
    ? `M 255 ${y} C 300 ${y}, 295 ${middleY}, 340 ${middleY}`
    : `M 560 ${middleY} C 605 ${middleY}, 600 ${y}, 645 ${y}`;
  const renderNode = (node: CitationNetworkNode, x: number, y: number, key: string) => (
    <a key={key} href={nodeHref(node)} target={node.isTracked ? undefined : '_blank'}
      rel={node.isTracked ? undefined : 'noopener noreferrer'}>
      <g onMouseEnter={() => setHighlighted(node.id)} onMouseLeave={() => setHighlighted(null)}>
        <title>{node.title}: входящих {node.inboundCount}, исходящих {node.outboundCount}</title>
        <rect x={x} y={y - NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx="3"
          fill={node.id === focalId ? '#164e63' : '#0f172a'} stroke={node.isMutualWithFocal ? '#fbbf24' : '#475569'} strokeWidth="1.5" />
        <text x={x + 10} y={y - 2} fill="#f8fafc" fontSize="13" fontWeight="600">{shorten(node.title)}</text>
        <text x={x + 10} y={y + 15} fill="#94a3b8" fontSize="10">
          {node.isTracked ? `${node.subscribers === null ? 'Аудитория н/д' : `${node.subscribers.toLocaleString('ru-RU')} подписчиков`}` : 'Не отслеживается'}
        </text>
      </g>
    </a>
  );

  return <div className="overflow-x-auto rounded-xl border border-border bg-slate-950/50" aria-label="Граф цитирований">
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="min-w-[680px] w-full" role="img" aria-label="Входящие связи слева, выбранный канал в центре, исходящие справа">
      <defs><marker id={`network-arrow-${channelId}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#64748b" />
      </marker></defs>
      <text x="35" y="27" fill="#94a3b8" fontSize="12">Кто ссылается</text>
      <text x="645" y="27" fill="#94a3b8" fontSize="12">Кого цитирует канал</text>
      {incoming.map((edge, index) => {
        const y = position(index, incoming.length);
        return <path key={`${edge.source}-${edge.target}`} d={edgePath('left', y)} fill="none"
          stroke={edge.isBidirectional ? '#fbbf24' : '#38bdf8'}
          strokeWidth={Math.min(5, 1.5 + Math.sqrt(edge.count))}
          opacity={highlighted && highlighted !== edge.source && highlighted !== focalId ? 0.25 : 0.9}
          markerEnd={`url(#network-arrow-${channelId})`}>
          <title>{edge.count} связей: {edge.mentionsCount} упоминаний, {edge.forwardsCount} пересылок</title>
        </path>;
      })}
      {outgoing.map((edge, index) => {
        const y = position(index, outgoing.length);
        return <path key={`${edge.source}-${edge.target}`} d={edgePath('right', y)} fill="none"
          stroke={edge.isBidirectional ? '#fbbf24' : '#38bdf8'}
          strokeWidth={Math.min(5, 1.5 + Math.sqrt(edge.count))}
          opacity={highlighted && highlighted !== edge.target && highlighted !== focalId ? 0.25 : 0.9}
          markerEnd={`url(#network-arrow-${channelId})`}>
          <title>{edge.count} связей: {edge.mentionsCount} упоминаний, {edge.forwardsCount} пересылок</title>
        </path>;
      })}
      {incoming.map((edge, index) => {
        const node = nodeById.get(edge.source);
        return node ? renderNode(node, 35, position(index, incoming.length), `left-${node.id}`) : null;
      })}
      {renderNode(focal, 340, middleY, `focal-${focal.id}`)}
      {outgoing.map((edge, index) => {
        const node = nodeById.get(edge.target);
        return node ? renderNode(node, 645, position(index, outgoing.length), `right-${node.id}`) : null;
      })}
    </svg>
    <p className="px-3 pb-3 text-xs text-slate-400">Толщина линии отражает число связей. Жёлтый цвет означает взаимное цитирование. Показаны до 8 связей в каждом направлении.</p>
  </div>;
}

export default function CitationNetworkWidget({ channelId }: { channelId: number }) {
  const [data, setData] = useState<CitationNetworkData | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [tab, setTab] = useState<'graph' | 'hubs'>('graph');
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyHub, setBusyHub] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadNetwork = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/stats/citation-network?channelId=${channelId}&days=${days}`, { signal });
    if (!response.ok) throw new Error('Не удалось загрузить карту связей');
    setData(await response.json() as CitationNetworkData);
  }, [channelId, days]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadNetwork(controller.signal)
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadNetwork]);

  async function addHub(username: string) {
    setBusyHub(username);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/channels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: `@${username}`, isMine: false }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const reason = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error : 'Не удалось добавить канал';
        throw new Error(reason);
      }
      await loadNetwork();
      setMessage(`@${username} добавлен в мониторинг`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка добавления канала');
    } finally {
      setBusyHub(null);
    }
  }

  return <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white"><Network className="h-5 w-5 text-blue-400" />Карта связей и инфополе</h2>
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
        aria-controls={`network-content-${channelId}`}
        className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
        {expanded ? 'Свернуть' : 'Развернуть'}<ChevronDown className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </div>
    <div id={`network-content-${channelId}`} className={expanded ? 'mt-6 space-y-4' : 'hidden'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="Раздел карты связей">
          <button type="button" role="tab" aria-selected={tab === 'graph'} onClick={() => setTab('graph')}
            className={`rounded-xl border px-3 py-2 text-xs ${tab === 'graph' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}>Граф цитирований</button>
          <button type="button" role="tab" aria-selected={tab === 'hubs'} onClick={() => setTab('hubs')}
            className={`rounded-xl border px-3 py-2 text-xs ${tab === 'hubs' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}>Обнаруженные каналы</button>
        </div>
        {tab === 'graph' && <label className="text-xs text-slate-300">Период{' '}
          <select value={days} onChange={event => setDays(Number(event.target.value) as 7 | 30 | 90)}
            className="rounded-xl border border-border bg-slate-900 px-2 py-1.5 text-white">
            <option value={7}>7 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option>
          </select>
        </label>}
      </div>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
      {loading ? <div className="h-56 animate-pulse rounded-xl bg-slate-900/50" aria-label="Загрузка карты связей" /> : tab === 'graph' ?
        data ? <><NetworkGraph data={data} channelId={channelId} />
          {data.propagation && <PropagationPanel data={data.propagation}
            focalUsername={data.nodes.find(node => node.channelId === channelId)?.username ?? null} />}</> : null :
        data?.discoveredHubs.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.discoveredHubs.map(hub =>
          <div key={hub.username} className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-2">
            <a href={`https://t.me/${hub.username}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-accent">@{hub.username}</a>
            <p className="text-xs text-slate-400">Упомянули {hub.citingChannels} канала · {hub.mentionsCount} связей за 30 дней</p>
            <button type="button" disabled={busyHub !== null} onClick={() => void addHub(hub.username)}
              className="rounded-xl border border-border px-3 py-1.5 text-xs text-white hover:bg-slate-800 disabled:opacity-50">
              {busyHub === hub.username ? 'Добавление...' : '+ Добавить в мониторинг'}
            </button>
          </div>)}</div> : <p className="rounded-xl border border-border p-6 text-center text-sm text-slate-400">Новых каналов-хабов пока нет.</p>}
    </div>
  </section>;
}
