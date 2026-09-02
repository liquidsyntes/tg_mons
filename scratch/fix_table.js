const fs = require('fs');
let content = fs.readFileSync('src/components/ChannelsTable.tsx', 'utf-8');

const target = `                            {isMineRow && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-semibold">
                                Мой
                              </span>
                            )}`;

const replacement = target + `
                            {!channel.isActive && channel.consecutiveErrors > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-semibold" title={\`Отключен из-за \${channel.consecutiveErrors} ошибок подряд\`}>
                                авто-off
                              </span>
                            )}`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/ChannelsTable.tsx', content);
console.log('done');
