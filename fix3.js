const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src/app/api/reports/[id]/export/route.ts');
let content = fs.readFileSync(filePath, 'utf-8');
content = content.replace(/\\\$\{/g, '${');
fs.writeFileSync(filePath, content, 'utf-8');
