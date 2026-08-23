import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';


export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reportId = Number(id);
    if (isNaN(reportId)) return new NextResponse('Invalid ID', { status: 400 });

    const report = await prisma.aiReport.findUnique({
      where: { id: reportId },
      include: { channel: true }
    });

    if (!report) return new NextResponse('Report not found', { status: 404 });

    let parsedData = null;
    try {
      parsedData = JSON.parse(report.content);
    } catch (e) {
      const errorHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка парсинга</title></head><body><h1>Ошибка формата</h1><p>Не удалось разобрать данные этого отчета.</p></body></html>`;
      const hdrs = new Headers();
      hdrs.set('Content-Type', 'text/html; charset=utf-8');
      hdrs.set('Content-Disposition', 'attachment; filename="error.html"');
      return new NextResponse(errorHtml, { status: 500, headers: hdrs });
    }

    let myChannel = null;
    if (report.type === 'compare') {
      myChannel = await prisma.channel.findFirst({ where: { isMine: true } });
    }

    const channelTitle = report.channel?.title || 'Глобальный отчет (Тренды)';



    let contentHtml = '';
    
    // Генерируем HTML чистыми строками, чтобы избежать конфликтов Client/Server компонентов (lucide-react) в Next.js
    if (report.type === 'summary') {
      contentHtml = `
        <div class="bg-[#07111f] rounded-3xl p-6 border border-[#1b3552] text-[#edf4fb] space-y-8">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${(parsedData.stats || []).map((s: any) => `
              <div class="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-5">
                <div class="text-3xl font-extrabold">${s.value}</div>
                <div class="text-[#91a6bc] text-sm mt-1">${s.label}</div>
              </div>
            `).join('')}
          </div>
          
          <h2 class="text-xl font-bold mt-8 mb-4">1. Основные темы</h2>
          <div class="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6">
            ${(parsedData.themes?.bars || []).map((b: any) => `<div class="mb-2"><strong>${b.label}</strong>: ${b.percent}%</div>`).join('')}
            ${parsedData.themes?.quote ? `<div class="mt-4 p-4 border-l-2 border-[#5c9ee8] bg-[#183b62]/20 italic">«${parsedData.themes.quote}»</div>` : ''}
          </div>

          <h2 class="text-xl font-bold mt-8 mb-4">2. Тональность и подача</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${(parsedData.tone || []).map((t: any) => `
              <div class="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-5">
                <div class="text-[#79abd6] text-xs uppercase font-bold mb-1">${t.kicker}</div>
                <div class="font-bold mb-2">${t.title}</div>
                <div class="text-sm text-[#91a6bc]">${t.text}</div>
              </div>
            `).join('')}
          </div>

          <h2 class="text-xl font-bold mt-8 mb-4">3. Вывод</h2>
          <div class="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6">
            <p class="text-lg">${parsedData.conclusion?.main || ''}</p>
            <p class="text-sm text-accent mt-2">Приоритет: ${parsedData.conclusion?.priority || ''}</p>
          </div>
        </div>
      `;
    } else if (report.type === 'action_plan') {
      contentHtml = `
        <div class="bg-[#07111f] rounded-3xl p-6 border border-[#231b52] text-[#edf4fb]">
          <h2 class="text-2xl font-bold mb-2">${parsedData.title}</h2>
          <div class="text-cyan-400 mb-6">Сроки: ${parsedData.estimatedTime}</div>
          <div class="space-y-6">
            ${(parsedData.steps || []).map((s: any) => `
              <div class="bg-[#100d2f] border border-[#231b52] rounded-2xl p-6 flex gap-4">
                <div class="w-12 h-12 rounded-xl bg-cyan-900/30 text-cyan-400 flex items-center justify-center font-bold text-xl shrink-0">${s.stepNumber}</div>
                <div>
                  <h3 class="font-bold text-lg mb-2">${s.title}</h3>
                  <p class="text-sm text-[#a39fcc] mb-4">${s.description}</p>
                  <div class="bg-cyan-900/20 p-4 rounded-xl text-sm"><strong class="text-cyan-500 block mb-1">Ожидаемый результат:</strong> ${s.expectedResult}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (report.type === 'trend') {
      contentHtml = `
        <div class="bg-[#07111f] rounded-3xl p-6 border border-[#231b52] text-[#edf4fb]">
          <div class="bg-purple-900/20 p-5 rounded-2xl mb-6 border border-purple-500/20">${parsedData.summary}</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${(parsedData.trends || []).map((t: any) => `
              <div class="bg-[#100d2f] border border-[#231b52] rounded-2xl p-5">
                <h3 class="font-bold text-lg mb-2 text-purple-400">${t.topic}</h3>
                <p class="text-sm mb-4 text-[#a39fcc]">${t.description}</p>
                ${t.quote ? `<div class="italic text-xs bg-slate-800 p-3 rounded mb-4">«${t.quote}»</div>` : ''}
                <div class="text-[10px] uppercase text-slate-400">Каналы: ${t.channels?.join(', ')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (report.type === 'evolution') {
      contentHtml = `
        <div class="bg-[#07111f] rounded-3xl p-6 border border-[#231b52] text-[#edf4fb]">
          <div class="flex gap-6 mb-8">
            <div class="text-5xl font-black text-emerald-400">${parsedData.progressScore}/10</div>
            <div class="text-lg">${parsedData.summary}</div>
          </div>
          
          <h2 class="text-xl font-bold mb-4">Метрики</h2>
          <div class="grid grid-cols-2 gap-4 mb-8">
            ${(parsedData.metricsComparison || []).map((m: any) => `
              <div class="bg-[#100d2f] p-4 rounded-xl border border-[#231b52]">
                <div class="text-[#a39fcc] text-sm">${m.metric}</div>
                <div class="font-bold text-lg mt-1">${m.oldValue} &rarr; ${m.newValue}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (report.type === 'audience') {
      contentHtml = `
        <div class="bg-[#07111f] rounded-3xl p-6 border border-[#1b5241] text-[#edf4fb]">
          <h2 class="text-2xl font-bold mb-4 text-emerald-400">Анализ Целевой Аудитории</h2>
          <p class="text-lg mb-8 text-emerald-100">${parsedData.summary}</p>
          
          <h3 class="text-xl font-bold mb-3 text-emerald-300">Демография</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-[#0a1f16] p-4 rounded-xl border border-[#1b5241]">
              <div class="text-[10px] uppercase text-emerald-500 mb-1">Возраст</div>
              <div class="font-medium text-emerald-100">${parsedData.demographics?.age || '-'}</div>
            </div>
            <div class="bg-[#0a1f16] p-4 rounded-xl border border-[#1b5241]">
              <div class="text-[10px] uppercase text-emerald-500 mb-1">Пол</div>
              <div class="font-medium text-emerald-100">${parsedData.demographics?.gender || '-'}</div>
            </div>
            <div class="bg-[#0a1f16] p-4 rounded-xl border border-[#1b5241]">
              <div class="text-[10px] uppercase text-emerald-500 mb-1">Доход</div>
              <div class="font-medium text-emerald-100">${parsedData.demographics?.income || '-'}</div>
            </div>
            <div class="bg-[#0a1f16] p-4 rounded-xl border border-[#1b5241]">
              <div class="text-[10px] uppercase text-emerald-500 mb-1">География</div>
              <div class="font-medium text-emerald-100">${parsedData.demographics?.geo || '-'}</div>
            </div>
          </div>
          
          <h3 class="text-xl font-bold mb-3 text-sky-300">Поведенческие факторы</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div class="bg-[#0a192f] p-4 rounded-xl border border-[#1b3552]">
              <div class="text-[10px] uppercase text-sky-500 mb-1">Потребление контента</div>
              <div class="text-sm text-sky-100">${parsedData.behavior?.contentConsumption || '-'}</div>
            </div>
            <div class="bg-[#0a192f] p-4 rounded-xl border border-[#1b3552]">
              <div class="text-[10px] uppercase text-sky-500 mb-1">Причина подписки</div>
              <div class="text-sm text-sky-100">${parsedData.behavior?.engagementReason || '-'}</div>
            </div>
          </div>

          <h3 class="text-xl font-bold mb-3 text-purple-300">Психографика</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div class="bg-purple-950/20 p-4 rounded-xl border border-purple-900/30">
              <div class="text-[10px] uppercase text-purple-400 mb-2">Интересы</div>
              <ul class="list-disc pl-4 text-sm text-purple-100">
                ${(parsedData.psychographics?.interests || []).map((i: string) => `<li>${i}</li>`).join('')}
              </ul>
            </div>
            <div class="bg-purple-950/20 p-4 rounded-xl border border-purple-900/30">
              <div class="text-[10px] uppercase text-purple-400 mb-2">Ценности</div>
              <ul class="list-disc pl-4 text-sm text-purple-100">
                ${(parsedData.psychographics?.values || []).map((v: string) => `<li>${v}</li>`).join('')}
              </ul>
            </div>
            <div class="bg-rose-950/10 p-4 rounded-xl border border-rose-900/20">
              <div class="text-[10px] uppercase text-rose-400 mb-2">Боли и страхи</div>
              <ul class="list-disc pl-4 text-sm text-rose-100">
                ${(parsedData.psychographics?.fears || []).map((f: string) => `<li>${f}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      `;
    } else if (report.type === 'persona') {
      contentHtml = `
        <div class="bg-[#0f0a10] rounded-3xl p-6 border border-[#521b2b] text-[#fbebf0]">
          <h2 class="text-2xl font-bold mb-4 text-rose-400">Психологический портрет</h2>
          ${parsedData.summary ? `<p class="text-lg mb-8 text-rose-100 italic">"${parsedData.summary}"</p>` : ''}
          
          <h3 class="text-xl font-bold mb-3 text-rose-300">Ядро личности</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Архетип</div>
              <div class="font-medium text-rose-100">${parsedData.corePersonality?.archetype || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">BDSM Роль</div>
              <div class="font-medium text-rose-300">${parsedData.corePersonality?.bdsmRole || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Доминантность</div>
              <div class="font-medium text-rose-100">${parsedData.corePersonality?.dominanceLevel || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Темперамент</div>
              <div class="font-medium text-rose-100">${parsedData.corePersonality?.temperament || '-'}</div>
            </div>
          </div>
          
          ${parsedData.corePersonality?.narcissismLevel ? `
            <div class="bg-[#2a0e14] p-4 rounded-xl border border-[#7a1f33] mb-8 flex gap-4 items-center">
              <div class="w-12 h-12 rounded-full bg-rose-900/50 flex items-center justify-center text-rose-300 font-black text-xl shrink-0">${parsedData.corePersonality.narcissismLevel.score}</div>
              <div>
                <div class="text-xs uppercase text-rose-500 font-bold mb-1">Шкала нарциссизма: ${parsedData.corePersonality.narcissismLevel.status}</div>
                <div class="text-sm text-rose-200">${parsedData.corePersonality.narcissismLevel.reasoning}</div>
              </div>
            </div>
          ` : '<div class="mb-8"></div>'}
          
          <h3 class="text-xl font-bold mb-3 text-emerald-300">Психологические черты</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div class="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30">
              <div class="text-[10px] uppercase text-emerald-400 mb-2">Сильные стороны</div>
              <ul class="list-disc pl-4 text-sm text-emerald-100">
                ${(parsedData.psychologicalTraits?.strengths || []).map((i: string) => `<li>${i}</li>`).join('')}
              </ul>
            </div>
            <div class="bg-rose-950/20 p-4 rounded-xl border border-rose-900/30">
              <div class="text-[10px] uppercase text-rose-400 mb-2">Слабости / Тени</div>
              <ul class="list-disc pl-4 text-sm text-rose-100">
                ${(parsedData.psychologicalTraits?.weaknesses || []).map((v: string) => `<li>${v}</li>`).join('')}
              </ul>
            </div>
            <div class="bg-amber-950/20 p-4 rounded-xl border border-amber-900/30">
              <div class="text-[10px] uppercase text-amber-400 mb-2">Триггеры</div>
              <ul class="list-disc pl-4 text-sm text-amber-100">
                ${(parsedData.psychologicalTraits?.triggers || []).map((f: string) => `<li>${f}</li>`).join('')}
              </ul>
            </div>
          </div>

          ${parsedData.fears ? `
          <h3 class="text-xl font-bold mb-3 text-rose-400">Страхи и компенсации</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-2">Проговариваемые страхи</div>
              <ul class="list-disc pl-4 text-sm text-rose-200">
                ${(parsedData.fears.explicitFears || []).map((f: string) => `<li>${f}</li>`).join('')}
              </ul>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-2">Скрытые страхи</div>
              <ul class="list-disc pl-4 text-sm text-rose-200">
                ${(parsedData.fears.hiddenFears || []).map((f: string) => `<li>${f}</li>`).join('')}
              </ul>
            </div>
            <div class="col-span-1 md:col-span-2 bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Коупинг-механизм</div>
              <div class="text-sm text-rose-100">${parsedData.fears.copingMechanism || '-'}</div>
            </div>
          </div>
          ` : ''}

          ${parsedData.moneyAndSuccessAttitude ? `
          <h3 class="text-xl font-bold mb-3 text-amber-400">Деньги и Успех</h3>
          <div class="bg-[#1a110a] p-4 rounded-xl border border-[#52321b] mb-8 space-y-3">
            <div>
              <div class="text-[10px] uppercase text-amber-500 mb-1">Отношение к деньгам</div>
              <div class="text-sm text-amber-100">${parsedData.moneyAndSuccessAttitude.relationToMoney || '-'}</div>
            </div>
            <div class="pt-2 border-t border-amber-900/30">
              <div class="text-[10px] uppercase text-amber-500 mb-1">Маркеры успеха</div>
              <div class="text-sm text-amber-100">${parsedData.moneyAndSuccessAttitude.relationToSuccess || '-'}</div>
            </div>
            <div class="pt-2 border-t border-amber-900/30">
              <div class="text-[10px] uppercase text-amber-500 mb-1">Уровень флекса: ${parsedData.moneyAndSuccessAttitude.flexingLevel}/10</div>
            </div>
          </div>
          ` : ''}

          <h3 class="text-xl font-bold mb-3 text-rose-300">Стиль общения</h3>
          <div class="space-y-4 mb-8">
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Тон общения</div>
              <div class="text-sm text-rose-100">${parsedData.communicationStyle?.tone || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Манипуляции и поощрения</div>
              <div class="text-sm text-rose-100">${parsedData.communicationStyle?.manipulation || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Личные границы</div>
              <div class="text-sm text-rose-100">${parsedData.communicationStyle?.boundaries || '-'}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="bg-[#07111f] rounded-3xl p-6 border border-[#231b52] text-[#edf4fb]">
          <h2 class="text-xl font-bold mb-4">Сравнение каналов</h2>
          <table class="w-full text-left border-collapse mb-8">
            <thead>
              <tr>
                <th class="p-3 border-b border-[#231b52]">Параметр</th>
                <th class="p-3 border-b border-[#231b52] text-accent">Мой канал</th>
                <th class="p-3 border-b border-[#231b52] text-violet-400">Конкурент</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedData.comparisonTable || []).map((c: any) => `
                <tr>
                  <td class="p-3 border-b border-[#231b52] text-sm">${c.parameter}</td>
                  <td class="p-3 border-b border-[#231b52] text-sm">${c.myChannel}</td>
                  <td class="p-3 border-b border-[#231b52] text-sm">${c.competitor}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="bg-violet-900/20 p-6 rounded-2xl border border-violet-500/20">
            <p class="mb-2">${parsedData.conclusion?.summary || ''}</p>
            <p class="font-bold text-violet-300">Приоритет: ${parsedData.conclusion?.priority || ''}</p>
          </div>
        </div>
      `;
    }

    const titleMap: Record<string, string> = {
      summary: 'Контент-анализ',
      evolution: 'Динамика изменений',
      action_plan: 'Пошаговое руководство',
      compare: 'Сравнение каналов',
      trend: 'Радар Трендов (Рынок)',
      audience: 'Анализ Целевой Аудитории',
      persona: 'Психологический портрет'
    };
    
    const reportTitle = titleMap[report.type] || 'Отчет';
    const dateStr = new Date(report.createdAt).toLocaleString('ru-RU');

    const htmlDocument = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle} - ${channelTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* Базовые стили для красоты, если Tailwind загрузится с задержкой или оффлайн */
    body { background-color: #07111f; color: #edf4fb; font-family: system-ui, -apple-system, sans-serif; padding: 2rem; }
    .max-w-4xl { max-width: 56rem; margin: 0 auto; }
    .header { margin-bottom: 2rem; border-bottom: 1px solid #1b3552; padding-bottom: 1rem; }
    .title { font-size: 1.5rem; font-weight: bold; margin: 0 0 0.5rem 0; }
    .subtitle { color: #91a6bc; font-size: 0.875rem; margin: 0; }
  </style>
</head>
<body>
  <div class="max-w-4xl">
    <div class="header">
      <h1 class="title">${reportTitle}</h1>
      <p class="subtitle">Канал: <strong>${channelTitle}</strong> &bull; Дата генерации: ${dateStr}</p>
    </div>
    
    <!-- Содержимое отчета -->
    ${contentHtml}
    
    <div style="margin-top: 3rem; text-align: center; font-size: 0.75rem; color: #475569;">
      Сгенерировано в TG Monitor
    </div>
  </div>
</body>
</html>
    `;

    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="report_${report.id}_${report.type}.html"`);

    return new NextResponse(htmlDocument, { status: 200, headers });
  } catch (err) {
    console.error('Export HTML Error:', err);
    
    // Возвращаем ошибку в формате HTML, чтобы браузер не сохранял ее как .txt
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Ошибка экспорта</title></head>
      <body>
        <h1>Ошибка генерации отчета</h1>
        <p>К сожалению, этот отчет имеет устаревший или поврежденный формат данных, который не удалось экспортировать.</p>
      </body>
      </html>
    `;
    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Disposition', 'attachment; filename="error.html"');
    
    return new NextResponse(errorHtml, { status: 500, headers });
  }
}
