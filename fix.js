const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src/app/api/reports/[id]/export/route.ts');
let content = fs.readFileSync(filePath, 'utf-8');
const newExport = `} else if (report.type === 'persona') {
      contentHtml = \`
        <div class="bg-[#0f0a10] rounded-3xl p-6 border border-[#521b2b] text-[#fbebf0]">
          <h2 class="text-2xl font-bold mb-4 text-rose-400">Психологический портрет</h2>
          \${parsedData.summary ? \\\`<p class="text-lg mb-8 text-rose-100 italic">"\\\${parsedData.summary}"</p>\\\` : ''}
          
          <h3 class="text-xl font-bold mb-3 text-rose-300">Ядро личности</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Архетип</div>
              <div class="font-medium text-rose-100">\${parsedData.corePersonality?.archetype || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">BDSM Роль</div>
              <div class="font-medium text-rose-300">\${parsedData.corePersonality?.bdsmRole || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Доминантность</div>
              <div class="font-medium text-rose-100">\${parsedData.corePersonality?.dominanceLevel || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Темперамент</div>
              <div class="font-medium text-rose-100">\${parsedData.corePersonality?.temperament || '-'}</div>
            </div>
          </div>
          
          \${parsedData.corePersonality?.narcissismLevel ? \\\`
            <div class="bg-[#2a0e14] p-4 rounded-xl border border-[#7a1f33] mb-8 flex gap-4 items-center">
              <div class="w-12 h-12 rounded-full bg-rose-900/50 flex items-center justify-center text-rose-300 font-black text-xl shrink-0">\\\${parsedData.corePersonality.narcissismLevel.score}</div>
              <div>
                <div class="text-xs uppercase text-rose-500 font-bold mb-1">Шкала нарциссизма: \\\${parsedData.corePersonality.narcissismLevel.status}</div>
                <div class="text-sm text-rose-200">\\\${parsedData.corePersonality.narcissismLevel.reasoning}</div>
              </div>
            </div>
          \\\` : '<div class="mb-8"></div>'}
          
          <h3 class="text-xl font-bold mb-3 text-emerald-300">Психологические черты</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div class="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30">
              <div class="text-[10px] uppercase text-emerald-400 mb-2">Сильные стороны</div>
              <ul class="list-disc pl-4 text-sm text-emerald-100">
                \${(parsedData.psychologicalTraits?.strengths || []).map((i) => \\\`<li>\\\${i}</li>\\\`).join('')}
              </ul>
            </div>
            <div class="bg-rose-950/20 p-4 rounded-xl border border-rose-900/30">
              <div class="text-[10px] uppercase text-rose-400 mb-2">Слабости / Тени</div>
              <ul class="list-disc pl-4 text-sm text-rose-100">
                \${(parsedData.psychologicalTraits?.weaknesses || []).map((v) => \\\`<li>\\\${v}</li>\\\`).join('')}
              </ul>
            </div>
            <div class="bg-amber-950/20 p-4 rounded-xl border border-amber-900/30">
              <div class="text-[10px] uppercase text-amber-400 mb-2">Триггеры</div>
              <ul class="list-disc pl-4 text-sm text-amber-100">
                \${(parsedData.psychologicalTraits?.triggers || []).map((f) => \\\`<li>\\\${f}</li>\\\`).join('')}
              </ul>
            </div>
          </div>

          \${parsedData.fears ? \\\`
          <h3 class="text-xl font-bold mb-3 text-rose-400">Страхи и компенсации</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-2">Проговариваемые страхи</div>
              <ul class="list-disc pl-4 text-sm text-rose-200">
                \\\${(parsedData.fears.explicitFears || []).map((f) => \\\`<li>\\\${f}</li>\\\`).join('')}
              </ul>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-2">Скрытые страхи</div>
              <ul class="list-disc pl-4 text-sm text-rose-200">
                \\\${(parsedData.fears.hiddenFears || []).map((f) => \\\`<li>\\\${f}</li>\\\`).join('')}
              </ul>
            </div>
            <div class="col-span-1 md:col-span-2 bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Коупинг-механизм</div>
              <div class="text-sm text-rose-100">\\\${parsedData.fears.copingMechanism || '-'}</div>
            </div>
          </div>
          \\\` : ''}

          \${parsedData.moneyAndSuccessAttitude ? \\\`
          <h3 class="text-xl font-bold mb-3 text-amber-400">Деньги и Успех</h3>
          <div class="bg-[#1a110a] p-4 rounded-xl border border-[#52321b] mb-8 space-y-3">
            <div>
              <div class="text-[10px] uppercase text-amber-500 mb-1">Отношение к деньгам</div>
              <div class="text-sm text-amber-100">\\\${parsedData.moneyAndSuccessAttitude.relationToMoney || '-'}</div>
            </div>
            <div class="pt-2 border-t border-amber-900/30">
              <div class="text-[10px] uppercase text-amber-500 mb-1">Маркеры успеха</div>
              <div class="text-sm text-amber-100">\\\${parsedData.moneyAndSuccessAttitude.relationToSuccess || '-'}</div>
            </div>
            <div class="pt-2 border-t border-amber-900/30">
              <div class="text-[10px] uppercase text-amber-500 mb-1">Уровень флекса: \\\${parsedData.moneyAndSuccessAttitude.flexingLevel}/10</div>
            </div>
          </div>
          \\\` : ''}

          <h3 class="text-xl font-bold mb-3 text-rose-300">Стиль общения</h3>
          <div class="space-y-4 mb-8">
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Тон общения</div>
              <div class="text-sm text-rose-100">\${parsedData.communicationStyle?.tone || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Манипуляции и поощрения</div>
              <div class="text-sm text-rose-100">\${parsedData.communicationStyle?.manipulation || '-'}</div>
            </div>
            <div class="bg-[#1f0a12] p-4 rounded-xl border border-[#521b2b]">
              <div class="text-[10px] uppercase text-rose-500 mb-1">Личные границы</div>
              <div class="text-sm text-rose-100">\${parsedData.communicationStyle?.boundaries || '-'}</div>
            </div>
          </div>
        </div>
      \`;
    } else {`
content = content.replace(/\} else if \(report\.type === 'persona'\) \{[\s\S]*?\} else \{/, newExport);
fs.writeFileSync(filePath, content, 'utf-8');
