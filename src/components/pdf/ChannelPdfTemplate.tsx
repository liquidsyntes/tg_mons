'use client';

import React from 'react';
import type { ChannelDetailStats } from '@/lib/types';
import { getChannelPdfPeriodMetrics, getTopRecentPosts } from '@/lib/channel-pdf-report';
import { formatDelta, formatNumber, formatPercent } from '@/lib/utils';

export interface ChannelPdfTemplateProps {
  stats: ChannelDetailStats;
  period: '24h' | '7d' | '30d' | string;
}

const ink = '#0f172a';
const muted = '#64748b';
const blue = '#2563eb';
const border = '#e2e8f0';

const pageStyle: React.CSSProperties = {
  width: 794, height: 1123, boxSizing: 'border-box', padding: '42px 46px 32px',
  background: '#ffffff', color: ink, fontFamily: 'Arial, Helvetica, sans-serif',
  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
};

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11 };
const thStyle: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', color: '#ffffff', background: ink, fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: '9px 10px', borderBottom: `1px solid ${border}`, verticalAlign: 'top' };

function dateText(value: string | null | undefined): string {
  if (!value) return 'н/д';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'н/д' : date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function numberText(value: number | null | undefined): string {
  return formatNumber(value);
}

function percentText(value: number | null | undefined, signed = false): string {
  return formatPercent(value, signed, 2);
}

function decimalText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'н/д';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
    <h2 style={{ fontSize: 17, margin: 0, fontWeight: 800 }}>{children}</h2>
    {note && <span style={{ fontSize: 10, color: muted }}>{note}</span>}
  </div>;
}

function PdfPage({ number, title, periodLabel, channelLabel, children }: {
  number: number; title: string; periodLabel: string; channelLabel: string; children: React.ReactNode;
}) {
  return <div id={`pdf-page-${number}`} data-pdf-page style={pageStyle}>
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: `1px solid ${border}` }}>
        <strong style={{ fontSize: 13, letterSpacing: '0.08em' }}>TG MONITOR</strong>
        <span style={{ fontSize: 10, color: muted }}>ОТЧЁТ ПО КАНАЛУ · {periodLabel.toUpperCase()}</span>
      </header>
      <div style={{ padding: '22px 0 20px' }}>
        <div style={{ color: blue, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 6 }}>
          {String(number).padStart(2, '0')} / 05
        </div>
        <h1 style={{ fontSize: 28, lineHeight: 1.16, margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 11, color: muted, marginTop: 7 }}>{channelLabel}</div>
      </div>
      <main>{children}</main>
    </div>
    <footer style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${border}`, paddingTop: 12, fontSize: 10, color: muted }}>
      <span>TG Monitor · Сформировано {dateText(new Date().toISOString())}</span>
      <strong style={{ color: ink }}>{String(number).padStart(2, '0')} / 05</strong>
    </footer>
  </div>;
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div style={{ border: `1px solid ${border}`, background: '#f8fafc', borderRadius: 3, padding: '15px 16px', minHeight: 76 }}>
    <div style={{ color: muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ color: ink, fontSize: 23, fontWeight: 800, marginTop: 7 }}>{value}</div>
    {detail && <div style={{ color: muted, fontSize: 10, marginTop: 5 }}>{detail}</div>}
  </div>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ borderLeft: `3px solid ${blue}`, background: '#f8fafc', borderRadius: 3, padding: '12px 15px', color: '#475569', fontSize: 11, lineHeight: 1.5 }}>
    {children}
  </div>;
}

function AudienceChart({ history }: { history: ChannelDetailStats['membersHistory'] }) {
  const valid = history.filter(point => Number.isFinite(point.membersCount) && !Number.isNaN(new Date(point.collectedAt).getTime()));
  if (valid.length < 2) return <Note>Недостаточно снимков аудитории для графика. Нужны как минимум два замера.</Note>;
  const step = Math.max(1, Math.ceil(valid.length / 80));
  const points = valid.filter((_, index) => index % step === 0);
  if (points[points.length - 1] !== valid[valid.length - 1]) points.push(valid[valid.length - 1]);
  const values = points.map(point => point.membersCount);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const coords = points.map((point, index) => ({
    x: 44 + index * 600 / (points.length - 1),
    y: 175 - (point.membersCount - minimum) * 125 / range,
  }));
  const path = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  return <div style={{ border: `1px solid ${border}`, borderRadius: 3, padding: 12 }}>
    <svg viewBox="0 0 690 215" width="100%" height="215" role="img" aria-label="Динамика аудитории по сохранённым снимкам">
      {[0, 1, 2].map(index => <g key={index}>
        <line x1="44" y1={50 + index * 62.5} x2="645" y2={50 + index * 62.5} stroke={border} strokeDasharray="3 3" />
        <text x="38" y={53 + index * 62.5} textAnchor="end" fontSize="10" fill={muted}>{formatNumber(Math.round(maximum - index * (maximum - minimum) / 2))}</text>
      </g>)}
      <path d={path} fill="none" stroke={blue} strokeWidth="3" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="4" fill={blue} />
      <text x="44" y="205" fontSize="10" fill={muted}>{dateText(points[0].collectedAt).slice(0, 10)}</text>
      <text x="645" y="205" textAnchor="end" fontSize="10" fill={muted}>{dateText(points[points.length - 1].collectedAt).slice(0, 10)}</text>
    </svg>
  </div>;
}

function PostsChart({ distribution }: { distribution: ChannelDetailStats['postsDistribution'] }) {
  const points = distribution.slice(-30);
  if (points.length === 0) return <Note>Нет сохранённых публикаций за выбранный период.</Note>;
  const maximum = Math.max(...points.map(point => point.postsCount), 1);
  const barWidth = 600 / points.length;
  return <div style={{ border: `1px solid ${border}`, borderRadius: 3, padding: 12 }}>
    <svg viewBox="0 0 690 145" width="100%" height="145" role="img" aria-label="Количество публикаций по времени">
      <line x1="44" y1="115" x2="645" y2="115" stroke={border} />
      {points.map((point, index) => {
        const height = 92 * point.postsCount / maximum;
        return <rect key={`${point.date}-${index}`} x={44 + index * barWidth + 2} y={115 - height}
          width={Math.max(barWidth - 4, 2)} height={height} fill={blue} rx="2" />;
      })}
      <text x="44" y="138" fontSize="10" fill={muted}>{points[0].date}</text>
      <text x="645" y="138" textAnchor="end" fontSize="10" fill={muted}>{points[points.length - 1].date}</text>
    </svg>
  </div>;
}

export function ChannelPdfTemplate({ stats, period }: ChannelPdfTemplateProps) {
  const channel = stats.channel;
  const selected = getChannelPdfPeriodMetrics(stats, period);
  const channelLabel = `${channel.title}${channel.username ? ` · @${channel.username}` : ''}`;
  const delta = formatDelta(selected.delta.abs, selected.delta.percent);
  const benchmark = stats.nicheBenchmark;
  const formats = (stats.contentTypePerformance ?? []).filter(item => item.postsCount > 0);
  const recentPosts = (stats.recentPosts ?? []).slice(0, 10);
  const topPosts = getTopRecentPosts(stats, 3);
  const statusLabel = channel.status === 'success' ? 'Данные получены' : channel.status === 'stale' ? 'Данные устарели' : 'Ошибка сбора';
  const periodNote = selected.delta.coverageDays !== null && selected.delta.coverageDays !== undefined
    && selected.delta.coverageDays < selected.days
    ? `История роста покрывает ${decimalText(selected.delta.coverageDays)} из ${selected.days} дней.` : null;

  return <div style={{ background: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: 24 }}>
    <PdfPage number={1} title="Обзор канала" periodLabel={selected.label} channelLabel={channelLabel}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        <Kpi label="Подписчики" value={numberText(channel.currentMembers)} detail={`Изменение: ${delta.text}${delta.percentText ? ` (${delta.percentText})` : ''}`} />
        <Kpi label="Публикации" value={numberText(selected.postsCount)} detail={`За ${selected.label}`} />
        <Kpi label="Средние просмотры" value={numberText(selected.avgViews)} detail={`За ${selected.label}`} />
        <Kpi label="VR" value={percentText(selected.vr)} detail={`За ${selected.label}`} />
        <Kpi label={selected.er.label} value={percentText(selected.er.value)} />
        <Kpi label={channel.type === 'group' ? 'CR за 7 дней' : selected.err.label}
          value={percentText(channel.type === 'group' ? channel.cr7d : selected.err.value)} />
      </div>
      <SectionTitle>Паспорт и состояние</SectionTitle>
      <table style={{ ...tableStyle, marginBottom: 20 }}><tbody>
        {[
          ['Тип', channel.type === 'group' ? 'Группа' : 'Канал'],
          ['Telegram', channel.username ? `@${channel.username}` : 'Без публичного username'],
          ['ID в TgMon', String(channel.id)],
          ['Ниша', channel.niche || 'Не указана'],
          ['Последний сбор', dateText(channel.lastCollectedAt)],
          ['Состояние', statusLabel],
          ['Последняя публикация', dateText(channel.lastPostAt)],
        ].map(([label, value]) => <tr key={label}><td style={{ ...tdStyle, color: muted, width: '35%' }}>{label}</td><td style={tdStyle}>{value}</td></tr>)}
      </tbody></table>
      <Note>{periodNote || 'Показатели отражают доступные данные за выбранный период.'} Значение «н/д» означает, что метрика не рассчитана по сохранённым данным. {selected.period === '30d' && 'ER и ERR за 30 дней в API отсутствуют, поэтому показаны показатели за 7 дней с явной подписью.'}</Note>
    </PdfPage>

    <PdfPage number={2} title="Аудитория и публикации" periodLabel={selected.label} channelLabel={channelLabel}>
      <SectionTitle note={`${stats.membersHistory.length} снимков`}>Динамика подписчиков</SectionTitle>
      <AudienceChart history={stats.membersHistory} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '17px 0 25px' }}>
        {([['24 часа', channel.delta24h], ['7 дней', channel.delta7d], ['30 дней', channel.delta30d]] as const).map(([label, value]) => {
          const formatted = formatDelta(value.abs, value.percent);
          return <Kpi key={label} label={`Рост за ${label}`} value={formatted.text} detail={formatted.percentText || 'Процент недоступен'} />;
        })}
      </div>
      <SectionTitle note={`${selected.postsCount} публикаций за период`}>Публикационная активность</SectionTitle>
      <PostsChart distribution={stats.postsDistribution} />
      <div style={{ marginTop: 20 }}>
        <SectionTitle>Последние интервалы</SectionTitle>
        <table style={tableStyle}><thead><tr><th style={thStyle}>Дата или час</th><th style={{ ...thStyle, textAlign: 'right' }}>Постов</th><th style={{ ...thStyle, textAlign: 'right' }}>Средние просмотры</th></tr></thead>
          <tbody>{stats.postsDistribution.slice(-6).reverse().map(item => <tr key={item.date}>
            <td style={tdStyle}>{item.date}</td><td style={{ ...tdStyle, textAlign: 'right' }}>{numberText(item.postsCount)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{numberText(item.viewsAvg)}</td>
          </tr>)}</tbody></table>
        {stats.postsDistribution.length === 0 && <Note>За выбранный период нет данных о распределении публикаций.</Note>}
      </div>
    </PdfPage>

    <PdfPage number={3} title="Охват и форматы" periodLabel={selected.label} channelLabel={channelLabel}>
      <SectionTitle>Вовлечённость и охват</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label={selected.er.label} value={percentText(selected.er.value)} />
        <Kpi label={channel.type === 'group' ? 'CR за 7 дней' : selected.err.label}
          value={percentText(channel.type === 'group' ? channel.cr7d : selected.err.value)} />
        <Kpi label="Средние просмотры" value={numberText(selected.avgViews)} />
      </div>
      <SectionTitle note={`За ${selected.label}`}>Форматы публикаций</SectionTitle>
      {formats.length > 0 ? <table style={{ ...tableStyle, marginBottom: 22 }}><thead><tr>
        {['Формат', 'Постов', 'Доля', 'Ср. просмотры', 'Ср. ERR', 'Ср. пересылки'].map(label => <th key={label} style={thStyle}>{label}</th>)}
      </tr></thead><tbody>{formats.map(item => <tr key={item.type}>
        <td style={tdStyle}>{item.label}</td><td style={tdStyle}>{numberText(item.postsCount)}</td>
        <td style={tdStyle}>{percentText(item.sharePercent)}</td><td style={tdStyle}>{numberText(item.avgViews)}</td>
        <td style={tdStyle}>{percentText(item.avgErr)}</td><td style={tdStyle}>{decimalText(item.avgForwards)}</td>
      </tr>)}</tbody></table> : <div style={{ marginBottom: 20 }}><Note>Нет публикаций для сравнения форматов.</Note></div>}
      {(stats.contentFormatLeaders?.byErr || stats.contentFormatLeaders?.byViews) && <div style={{ marginBottom: 20 }}><Note>
        {stats.contentFormatLeaders.byErr && `Лидер по ERR: ${formats.find(item => item.type === stats.contentFormatLeaders?.byErr)?.label || 'н/д'}. `}
        {stats.contentFormatLeaders.byViews && `Лидер по средним просмотрам: ${formats.find(item => item.type === stats.contentFormatLeaders?.byViews)?.label || 'н/д'}. `}
        Лидеры определены среди форматов с двумя и более постами.
      </Note></div>}
      <SectionTitle>Популярные реакции</SectionTitle>
      {stats.popularReactions?.top.length ? <>
        <p style={{ fontSize: 10, color: muted, margin: '0 0 10px' }}>За 30 дней, по {numberText(stats.popularReactions.coveredPosts)} постам с разбивкой</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
          {stats.popularReactions.top.slice(0, 8).map(item => <div key={item.emoji} style={{ border: `1px solid ${border}`, borderRadius: 3, padding: '9px 12px', fontSize: 12 }}>
            {item.emoji} <strong>{numberText(item.count)}</strong> <span style={{ color: muted }}>({percentText(item.sharePercent)})</span>
          </div>)}
        </div>
      </> : <div style={{ marginBottom: 20 }}><Note>Разбивка реакций пока недоступна.</Note></div>}
      <SectionTitle>Динамика просмотров и VR</SectionTitle>
      {stats.vrHistory?.length ? <table style={tableStyle}><thead><tr>
        <th style={thStyle}>Дата</th><th style={{ ...thStyle, textAlign: 'right' }}>Ср. просмотры</th><th style={{ ...thStyle, textAlign: 'right' }}>VR</th>
      </tr></thead><tbody>{stats.vrHistory.slice(-7).reverse().map(item => <tr key={item.date}>
        <td style={tdStyle}>{item.date}</td><td style={{ ...tdStyle, textAlign: 'right' }}>{numberText(item.avgViews)}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{percentText(item.vr)}</td>
      </tr>)}</tbody></table> : <Note>История просмотров пока недоступна.</Note>}
    </PdfPage>

    <PdfPage number={4} title="Публикации" periodLabel={selected.label} channelLabel={channelLabel}>
      <SectionTitle note="Среди последних 15 постов периода">Наибольшие просмотры</SectionTitle>
      {topPosts.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {topPosts.map(post => <Kpi key={post.id} label={dateText(post.publishedAt).slice(0, 10)} value={numberText(post.views)} detail={`Пост ${post.messageId}`} />)}
      </div> : <div style={{ marginBottom: 20 }}><Note>Нет данных о просмотрах последних публикаций.</Note></div>}
      <SectionTitle note="До 10 последних постов периода">Последние публикации</SectionTitle>
      {recentPosts.length ? <table style={tableStyle}><thead><tr>
        <th style={thStyle}>Дата и пост</th><th style={{ ...thStyle, textAlign: 'right' }}>Просмотры</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>Реакции</th><th style={{ ...thStyle, textAlign: 'right' }}>Комментарии</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>Пересылки</th>
      </tr></thead><tbody>{recentPosts.map(post => <tr key={post.id}>
        <td style={{ ...tdStyle, maxWidth: 280 }}>
          <strong>{dateText(post.publishedAt).slice(0, 16)} · № {post.messageId}</strong>
          <div style={{ color: muted, fontSize: 10, marginTop: 3, lineHeight: 1.3 }}>
            {post.text ? `${post.text.replace(/\s+/g, ' ').slice(0, 80)}${post.text.length > 80 ? '…' : ''}` : 'Текст недоступен'}
            {post.isViral ? ' · Необычная активность' : ''}
          </div>
        </td>
        {[post.views, post.reactions, post.comments, post.forwards].map((value, index) => <td key={index} style={{ ...tdStyle, textAlign: 'right' }}>{numberText(value)}</td>)}
      </tr>)}</tbody></table> : <Note>Нет публикаций за выбранный период.</Note>}
      <div style={{ marginTop: 14 }}><Note>Таблица показывает только последние сохранённые публикации выбранного периода. Верхние карточки ранжируют их по просмотрам, а не все посты канала.</Note></div>
    </PdfPage>

    <PdfPage number={5} title="Сравнение и диагностика" periodLabel={selected.label} channelLabel={channelLabel}>
      <SectionTitle>Оценки канала</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <Kpi label="Content Score" value={numberText(channel.contentScore)} detail={channel.contentGrade ? `Класс ${channel.contentGrade}` : undefined} />
        <Kpi label="Индекс цитирования" value={decimalText(channel.citationIndex)} />
        <Kpi label="Оценка риска" value={numberText(channel.fraudScore)} detail="Эвристическая оценка, не доказательство" />
      </div>
      <SectionTitle>Рекламная нагрузка</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <Kpi label="Доля рекламы 7д" value={percentText(channel.adShare7d?.percent)} />
        <Kpi label="Доля рекламы 30д" value={percentText(channel.adShare30d?.percent)} />
        <Kpi label="Последний факт просмотров" value={numberText(channel.lastPostViews)} />
      </div>
      <SectionTitle note={benchmark ? `Ниша: ${benchmark.niche}` : undefined}>Позиция в нише</SectionTitle>
      {benchmark?.status === 'ready' ? <table style={{ ...tableStyle, marginBottom: 20 }}><thead><tr>
        <th style={thStyle}>Показатель</th><th style={thStyle}>Канал</th><th style={thStyle}>Медиана ниши</th><th style={thStyle}>Ранг</th>
      </tr></thead><tbody>{([
        ['er7d', 'ER 7д', '%'], ['err7d', 'ERR 7д', '%'], ['vr7d', 'VR 7д', '%'],
        ['posts7d', 'Постов 7д', ''], ['adShare30d', 'Реклама 30д', '%'], ['delta7dPct', 'Рост 7д', '%'],
      ] as const).map(([key, label, suffix]) => {
        const metric = benchmark.metrics[key];
        const value = (number: number | null) => `${decimalText(number)}${number === null ? '' : suffix}`;
        return <tr key={key}><td style={tdStyle}>{label}</td><td style={tdStyle}>{value(metric.value)}</td>
          <td style={tdStyle}>{value(metric.median)}</td><td style={tdStyle}>{value(metric.rank)}{metric.rank === null ? '' : '%'}</td></tr>;
      })}</tbody></table> : <div style={{ marginBottom: 20 }}><Note>{benchmark?.status === 'insufficient_cohort'
        ? `Для сравнения нужны минимум 3 активных канала той же ниши и типа. Сейчас: ${benchmark.cohortSize}.`
        : 'Нишевое сравнение недоступно.'}</Note></div>}
      <SectionTitle>Сравнение с «Моим каналом»</SectionTitle>
      {stats.myChannel && channel.comparison ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label="Доля аудитории" value={percentText(channel.comparison.audienceSharePercent)} />
        <Kpi label="Разница роста 7д" value={percentText(channel.comparison.growthRateDiff7d, true)} />
        <Kpi label="Разница постов 7д" value={numberText(channel.comparison.activityDiff7d)} />
      </div> : <div style={{ marginBottom: 20 }}><Note>«Мой канал» не назначен или сравнение недоступно.</Note></div>}
      <SectionTitle>Риски и паузы</SectionTitle>
      <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.45 }}>
        {(channel.fraudSignals ?? []).length ? channel.fraudSignals?.slice(0, 3).map((signal, index) => <div key={`${signal.signalType}-${index}`} style={{ padding: '7px 0', borderBottom: `1px solid ${border}` }}>
          <strong>{signal.signalType}:</strong> {signal.reason.slice(0, 180)}
        </div>) : <p style={{ margin: '0 0 8px' }}>Сигналы риска в доступных данных не обнаружены.</p>}
        {(stats.silencePeriods ?? []).length > 0 && <p style={{ margin: '10px 0 0' }}>
          Паузы публикаций за 90 дней: {stats.silencePeriods?.slice(0, 3).map(item => `${item.startDate} - ${item.endDate} (${item.durationDays} дн.)`).join('; ')}.
        </p>}
      </div>
      <div style={{ marginTop: 20 }}><Note>Показатели отражают сохранённые данные TgMon на дату формирования. Нишевые ранги и сигналы риска носят аналитический характер. Отсутствие сигнала не подтверждает отсутствие проблемы. Нулевая доля рекламы при отсутствии публикаций не подтверждает отсутствие рекламы.</Note></div>
    </PdfPage>
  </div>;
}
