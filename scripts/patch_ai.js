const fs = require('fs');

let content = fs.readFileSync('src/components/channel/AIReportsSection.tsx', 'utf8');

// 1. Add imports
content = content.replace(
  "import { Sparkles, Layers, Users, Download, Bot, Brain } from 'lucide-react';",
  "import { Sparkles, Layers, Users, Download, Bot, Brain, Loader2 } from 'lucide-react';\nimport { AILoadingStatus } from '@/components/AILoadingStatus';"
);

// 2. Add Success States
content = content.replace(
  "const [aiError, setAiError] = useState<string | null>(null);",
  "const [aiError, setAiError] = useState<string | null>(null);\n  const [aiSuccess, setAiSuccess] = useState(false);"
);
content = content.replace(
  "const [aiSuperError, setAiSuperError] = useState<string | null>(null);",
  "const [aiSuperError, setAiSuperError] = useState<string | null>(null);\n  const [aiSuperSuccess, setAiSuperSuccess] = useState(false);"
);
content = content.replace(
  "const [aiCompareError, setAiCompareError] = useState<string | null>(null);",
  "const [aiCompareError, setAiCompareError] = useState<string | null>(null);\n  const [aiCompareSuccess, setAiCompareSuccess] = useState(false);"
);
content = content.replace(
  "const [aiAudienceError, setAiAudienceError] = useState<string | null>(null);",
  "const [aiAudienceError, setAiAudienceError] = useState<string | null>(null);\n  const [aiAudienceSuccess, setAiAudienceSuccess] = useState(false);"
);
content = content.replace(
  "const [aiPersonaError, setAiPersonaError] = useState<string | null>(null);",
  "const [aiPersonaError, setAiPersonaError] = useState<string | null>(null);\n  const [aiPersonaSuccess, setAiPersonaSuccess] = useState(false);"
);

// 3. Set success in fetches
content = content.replace(
  "try { setAiSummary(JSON.parse(json.summary)); }",
  "try { setAiSummary(JSON.parse(json.summary)); setAiSuccess(true); }"
);
content = content.replace(
  "try { setAiSuperSummary(JSON.parse(json.summary)); }",
  "try { setAiSuperSummary(JSON.parse(json.summary)); setAiSuperSuccess(true); }"
);
content = content.replace(
  "try { setAiCompareSummary(JSON.parse(json.summary)); }",
  "try { setAiCompareSummary(JSON.parse(json.summary)); setAiCompareSuccess(true); }"
);
content = content.replace(
  "try { setAiAudience(JSON.parse(json.audience)); }",
  "try { setAiAudience(JSON.parse(json.audience)); setAiAudienceSuccess(true); }"
);
content = content.replace(
  "try { setAiPersona(JSON.parse(json.persona)); }",
  "try { setAiPersona(JSON.parse(json.persona)); setAiPersonaSuccess(true); }"
);

// 4. Update Buttons to have Loader2
function replaceButton(loadingVar, text, buttonColorClass, textColorClass) {
    const regex = new RegExp(`({${loadingVar} \\? ')[^']*(.*?)`,'g');
    // Actually, we just need to replace the content inside the button.
    // The current buttons look like:
    // {aiLoading ? 'Анализирую...' : 'Сгенерировать саммари'}
    // Let's replace the whole {aiLoading ? ... : ...}
}

// Easier to just use simple replace for the text inside buttons
content = content.replace("{aiLoading ? 'Анализирую...' : 'Сгенерировать саммари'}", "{aiLoading ? <><Loader2 className=\"w-4 h-4 animate-spin\"/> Формирую...</> : 'Сгенерировать саммари'}");
content = content.replace("{aiSuperLoading ? 'Анализирую...' : 'Супер Отчет'}", "{aiSuperLoading ? <><Loader2 className=\"w-4 h-4 animate-spin\"/> Формирую...</> : 'Супер Отчет'}");
content = content.replace("{aiCompareLoading ? 'Сравниваю...' : 'Сравнить каналы'}", "{aiCompareLoading ? <><Loader2 className=\"w-4 h-4 animate-spin\"/> Сравниваю...</> : 'Сравнить каналы'}");
content = content.replace("{aiAudienceLoading ? 'Анализирую...' : 'Сгенерировать отчет'}", "{aiAudienceLoading ? <><Loader2 className=\"w-4 h-4 animate-spin\"/> Анализирую...</> : 'Сгенерировать отчет'}");
content = content.replace("{aiPersonaLoading ? 'Анализирую...' : 'Сгенерировать портрет'}", "{aiPersonaLoading ? <><Loader2 className=\"w-4 h-4 animate-spin\"/> Анализирую...</> : 'Сгенерировать портрет'}");

// 5. Inject <AILoadingStatus> after the button's div wrapper in each section
// Summary
content = content.replace(
  /<\/button>\s*<\/div>\s*\{aiError/g,
  `</button>\n        </div>\n        <AILoadingStatus isRunning={aiLoading} success={aiSuccess} onSuccessClear={() => setAiSuccess(false)} messages={['Сбор публикаций канала...', 'Анализ тональности и контекста...', 'Нейросеть формирует саммари...', 'Почти готово...']} />\n        {aiError`
);

// We need to be more precise for others because we replaced all `</button></div>{aiError` above?
// Ah wait, the regex `/<\/button>\s*<\/div>\s*\{aiError/g` matched ONLY the first one because others use aiSuperError, aiCompareError, etc.!
content = content.replace(
  /<\/button>\s*<\/div>\s*\{aiSuperError/g,
  `</button>\n        </div>\n        <AILoadingStatus isRunning={aiSuperLoading} success={aiSuperSuccess} onSuccessClear={() => setAiSuperSuccess(false)} messages={['Сбор архива постов (до 150 шт)...', 'Анализ долгосрочных трендов...', 'Нейросеть формирует глубокий отчет...', 'Структурируем выводы...', 'Почти готово...']} />\n        {aiSuperError`
);

content = content.replace(
  /<\/button>\s*<\/div>\s*\{aiCompareError/g,
  `</button>\n          </div>\n          <AILoadingStatus isRunning={aiCompareLoading} success={aiCompareSuccess} onSuccessClear={() => setAiCompareSuccess(false)} messages={['Сбор данных обоих каналов...', 'Сравнение стилистики и метрик...', 'Нейросеть выявляет ключевые отличия...', 'Формируем таблицу...', 'Почти готово...']} />\n          {aiCompareError`
);

content = content.replace(
  /<\/button>\s*<\/div>\s*\{aiAudienceError/g,
  `</button>\n        </div>\n        <AILoadingStatus isRunning={aiAudienceLoading} success={aiAudienceSuccess} onSuccessClear={() => setAiAudienceSuccess(false)} messages={['Анализируем язык и стиль постов...', 'Вычисляем демографические маркеры...', 'Нейросеть составляет портрет читателя...', 'Почти готово...']} />\n        {aiAudienceError`
);

content = content.replace(
  /<\/button>\s*<\/div>\s*\{aiPersonaError/g,
  `</button>\n        </div>\n        <AILoadingStatus isRunning={aiPersonaLoading} success={aiPersonaSuccess} onSuccessClear={() => setAiPersonaSuccess(false)} messages={['Анализируем психологические паттерны...', 'Определяем архетипы и BDSM-профиль...', 'Нейросеть составляет глубокий портрет...', 'Почти готово...']} />\n        {aiPersonaError`
);

fs.writeFileSync('src/components/channel/AIReportsSection.tsx', content);
console.log('Done!');
