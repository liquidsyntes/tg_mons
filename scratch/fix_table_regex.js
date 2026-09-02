const fs = require('fs');
let content = fs.readFileSync('src/components/ChannelsTable.tsx', 'utf-8');

const replacement = `                            {isMineRow && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-semibold">
                                Мой
                              </span>
                            )}
                            {!channel.isActive && (channel.consecutiveErrors || 0) > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-semibold" title={\`Отключен из-за \${channel.consecutiveErrors} ошибок подряд\`}>
                                авто-off
                              </span>
                            )}`;

// Because it's hard to match exact Cyrillic and whitespace with string replace, let's use Regex.
content = content.replace(/\{isMineRow\s*&&\s*\([\s\S]*?Мой\s*<\/span>\s*\)\}/g, replacement);

fs.writeFileSync('src/components/ChannelsTable.tsx', content);
console.log('done');
