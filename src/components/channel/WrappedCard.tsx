import { ChannelMetrics, ChannelDetailStats } from '@/lib/types';

interface WrappedCardProps {
  channel: ChannelMetrics;
  stats: ChannelDetailStats;
}

export function WrappedCard({ channel, stats }: WrappedCardProps) {
  // Aggregate data for the last 30 days
  const posts = stats.recentPosts || [];
  const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
  const bestPost = posts.slice().sort((a, b) => (b.views || 0) - (a.views || 0))[0];

  // Additional data
  const deltaAbs = channel.delta30d?.abs || 0;
  const deltaPercent = channel.delta30d?.percent || 0;
  const isPositive = deltaAbs >= 0;
  
  const epScore = channel.ep !== undefined ? channel.ep : (channel.contentScore || 85);
  const scoreColor = epScore >= 80 ? '#fbbf24' : epScore >= 50 ? '#94a3b8' : '#f87171'; 
  const getGrade = (score: number) => {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    return 'D';
  };
  const grade = getGrade(epScore);

  const avgViews = channel.avgViews30d ?? 0;
  const vrPercent = channel.vr30d !== null ? channel.vr30d.toFixed(1) : '0.0';

  const formatNum = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const monthYear = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  return (
    <div 
      id="wrapped-card-export" 
      className="fixed top-[200vh] left-[200vw] w-[1080px] h-[1920px] bg-[#0b0f19] text-slate-100 flex flex-col overflow-hidden font-sans"
    >
      <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

      {/* 1. Header (visually separated, lighter, with shadow) */}
      <header className="relative z-20 flex justify-between items-center px-16 py-10 bg-[#161f33] border-b border-white/10 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-900/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
          </div>
          <div className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            TgMon Anal.
          </div>
        </div>
        <div className="text-right">
           <div className="inline-block border border-slate-600 bg-[#0b0f19] rounded-full px-6 py-2 text-xl text-slate-400 tracking-wider font-medium shadow-inner">{monthYear}</div>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex flex-col px-16 pt-12 pb-16 h-full">
        <div className="flex-1 flex flex-col">
          {/* Title Area - Compact */}
          <div className="mb-12">
            <h2 className="text-lg font-bold text-slate-500 mb-2 uppercase tracking-[0.2em]">Аналитика канала</h2>
            <h1 className="text-7xl font-bold tracking-tight leading-tight text-white mb-2">
              {channel.title}
            </h1>
            <p className="text-2xl font-medium text-blue-400">@{channel.username}</p>
          </div>

          {/* 3x2 Grid - Cards 360px height */}
          <div className="grid grid-cols-3 gap-5">
            
            {/* 1. Охват */}
            <div className="bg-[#111623] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden h-[360px]">
              <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4 shrink-0 relative z-10">
                 <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </div>
              <div className="flex-1 flex flex-col justify-end pb-8 relative z-10">
                 <div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Суммарный охват</div>
                 <div className="text-6xl font-bold text-white mb-2 leading-none">{formatNum(totalViews)}</div>
                 <div className="text-lg text-slate-500 min-h-[3.5rem] mt-2">Просмотров за период</div>
              </div>
              
              <div className="absolute bottom-0 left-0 w-full h-28 opacity-60">
                 <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none">
                   <defs>
                     <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                       <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                     </linearGradient>
                   </defs>
                   <path d="M0,80 Q30,70 60,85 T120,70 T180,85 T240,60 T300,40 L300,100 L0,100 Z" fill="url(#blueGrad)" />
                   <path d="M0,80 Q30,70 60,85 T120,70 T180,85 T240,60 T300,40" fill="none" stroke="#3b82f6" strokeWidth="3" />
                 </svg>
              </div>
            </div>
            
            {/* 2. Активность */}
            <div className="bg-[#111623] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden h-[360px]">
              <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 shrink-0 relative z-10">
                 <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </div>
              <div className="flex-1 flex flex-col justify-end pb-8 relative z-10">
                 <div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Активность</div>
                 <div className="text-6xl font-bold text-white mb-2 leading-none">{posts.length}</div>
                 <div className="text-lg text-slate-500 min-h-[3.5rem] mt-2">Постов опубликовано</div>
              </div>

              <div className="absolute bottom-0 left-0 w-full h-28 opacity-40 px-6 flex items-end justify-between pb-4 gap-2">
                 {[40, 30, 60, 45, 75, 30, 50, 80, 40].map((h, i) => (
                    <div key={i} className="w-full bg-gradient-to-t from-indigo-500/10 to-indigo-500/60 rounded-t-sm" style={{ height: `${h}%` }}></div>
                 ))}
              </div>
            </div>

            {/* 3. Прирост */}
            <div className="bg-[#111623] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden h-[360px]">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4 shrink-0 relative z-10">
                 <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <div className="flex-1 flex flex-col justify-end pb-8 relative z-10">
                 <div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Прирост аудитории</div>
                 <div className="flex items-end gap-2 mb-2">
                   <div className={`text-6xl font-bold leading-none ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                     {isPositive ? '+' : ''}{formatNum(deltaAbs)}
                   </div>
                   <div className={`text-2xl mb-[2px] font-medium leading-none ${isPositive ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                     {isPositive ? '+' : ''}{deltaPercent.toFixed(1)}%
                   </div>
                 </div>
                 <div className="text-lg text-slate-500 min-h-[3.5rem] mt-2">Подписчиков за 30 дней</div>
              </div>

              <div className="absolute bottom-0 left-0 w-full h-28 opacity-60">
                 <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none">
                   <defs>
                     <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
                       <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                     </linearGradient>
                   </defs>
                   <path d="M0,80 Q30,90 60,75 T120,70 T180,60 T240,40 L300,20 L300,100 L0,100 Z" fill="url(#emeraldGrad)" />
                   <path d="M0,80 Q30,90 60,75 T120,70 T180,60 T240,40 L300,20" fill="none" stroke="#34d399" strokeWidth="3" />
                 </svg>
              </div>
            </div>

            {/* 4. Качество */}
            <div className="bg-[#111623] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden h-[360px]">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 mb-4 shrink-0 relative z-10">
                 <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
              </div>
              
              <div className="flex-1 flex flex-col justify-end pb-8 relative z-10">
                 <div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Эффективность (EP)</div>
                 <div className="text-6xl font-bold mb-2 leading-none" style={{ color: scoreColor }}>
                   {typeof epScore === 'number' ? epScore.toFixed(1) : epScore} - {grade}
                 </div>
                 <div className="text-lg text-slate-500 min-h-[3.5rem] mt-2">Рейтинг канала в нише</div>
              </div>
            </div>

            {/* 5. ER */}
            <div className="bg-[#111623] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden h-[360px]">
              <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4 shrink-0 relative z-10">
                 <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </div>
              
              <div className="flex-1 flex flex-col justify-end pb-8 relative z-10">
                 <div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Просмотры к подписчикам</div>
                 <div className="text-6xl font-bold text-blue-400 mb-2 leading-none">{vrPercent}%</div>
                 <div className="text-lg text-slate-500 min-h-[3.5rem] mt-2">View Rate</div>
              </div>

              <div className="absolute bottom-0 left-0 w-full h-28 opacity-60">
                 <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none">
                   <defs>
                     <linearGradient id="erGrad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
                       <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
                     </linearGradient>
                   </defs>
                   <path d="M0,80 L50,60 L100,65 L150,45 L200,60 L250,50 L300,40 L300,100 L0,100 Z" fill="url(#erGrad)" />
                   <path d="M0,80 L50,60 L100,65 L150,45 L200,60 L250,50 L300,40" fill="none" stroke="#60a5fa" strokeWidth="3" />
                   <circle cx="50" cy="60" r="4" fill="#60a5fa" />
                   <circle cx="150" cy="45" r="4" fill="#60a5fa" />
                   <circle cx="300" cy="40" r="4" fill="#60a5fa" />
                 </svg>
              </div>
            </div>

            {/* 6. Avg Views */}
            <div className="bg-[#111623] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden h-[360px]">
              <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 mb-4 shrink-0 relative z-10">
                 <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </div>
              
              <div className="flex-1 flex flex-col justify-end pb-8 relative z-10">
                 <div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Средний просмотр</div>
                 <div className="text-6xl font-bold text-purple-400 mb-2 leading-none">{formatNum(avgViews)}</div>
                 <div className="text-lg text-slate-500 min-h-[3.5rem] mt-2">Кол-во просмотров на один пост</div>
              </div>

              <div className="absolute bottom-0 left-0 w-full h-28 opacity-60">
                 <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none">
                   <defs>
                     <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor="#c084fc" stopOpacity="0.3" />
                       <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                     </linearGradient>
                   </defs>
                   <path d="M0,60 Q30,80 60,65 T120,40 T180,60 T240,30 L300,10 L300,100 L0,100 Z" fill="url(#purpleGrad)" />
                   <path d="M0,60 Q30,80 60,65 T120,40 T180,60 T240,30 L300,10" fill="none" stroke="#c084fc" strokeWidth="3" />
                 </svg>
              </div>
            </div>
          </div>

          {/* Best Post Wide Card - Compacted & Left-aligned Pill */}
          {bestPost && (
            <div className="bg-gradient-to-br from-[#1c1a17] to-[#0f1118] border border-white/5 rounded-[2rem] p-10 shadow-2xl mt-8 flex-1 relative overflow-hidden flex flex-col justify-start">
              <div className="absolute right-0 bottom-0 opacity-5 w-48 h-48 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 100 100">
                  <pattern id="dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                    <circle fill="white" cx="2" cy="2" r="2"></circle>
                  </pattern>
                  <rect x="0" y="0" width="100" height="100" fill="url(#dots)"></rect>
                </svg>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-[#362711] text-amber-500 rounded-full flex items-center justify-center text-xl shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                </div>
                <div className="text-xl text-amber-500 font-bold uppercase tracking-widest">Самый популярный пост</div>
              </div>
              
              <div className="flex gap-4 relative z-10 px-4 mb-6">
                <div className="text-6xl text-slate-700 leading-none mt-1">“</div>
                <div className="text-[1.75rem] leading-[1.6] text-slate-300 italic flex-1 pr-6 line-clamp-3">
                  {bestPost.text?.substring(0, 150)}...
                </div>
                <div className="text-6xl text-slate-700 leading-none absolute right-4 bottom-0 rotate-180">“</div>
              </div>
              
              {/* Pill aligned to bottom left */}
              <div className="absolute bottom-10 left-10 z-10">
                <div className="inline-flex items-center gap-3 bg-[#0a0f19] px-6 py-2.5 rounded-full border border-white/5 shadow-lg">
                  <span className="text-lg text-slate-400">Собрал</span>
                  <span className="text-2xl font-bold text-amber-500">
                    {formatNum(bestPost.views || 0)}
                  </span>
                  <span className="text-lg text-slate-400">просмотров</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-xl text-slate-600 font-medium">
          <div>Сгенерировано платформой TgMon</div>
          <div>{monthYear}</div>
        </footer>
      </div>
    </div>
  );
}
