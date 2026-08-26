$m_content = [System.IO.File]::ReadAllText("src/lib/metrics.ts")

$m_old_loop = '        if (pt < t24h) {
          if (p.views !== null) {
            totalViews7d += p.views;
            viewPosts7d++;
            
            // Для метрики "за 24 часа" берем посты, опубликованные от 24 до 48 часов назад
            if (pt >= t48h) {
              totalViews24h += p.views;
              viewPosts24h++;
            }
          }
        }
      }
    }
  }

  // Если за окно 24-48ч не было постов, фоллбэк на среднее за 7 дней'

$m_new_loop = '        if (pt < t24h) {
          if (p.views !== null) {
            totalViews7d += p.views;
            viewPosts7d++;
            
            // Для метрики "за 24 часа" берем посты, опубликованные от 24 до 48 часов назад
            if (pt >= t48h) {
              totalViews24h += p.views;
              viewPosts24h++;
            }
          }
        }
      }
    }
  }

  // Вычисляем истинный ERR для скоринга контента
  const trueViews7d: number[] = [];
  const trueReactions7d: number[] = [];
  const trueComments7d: number[] = [];
  const trueForwards7d: number[] = [];
  
  for (const p of channelPosts) {
    const pt = p.publishedAt.getTime();
    if (pt >= t7d && pt < t24h && p.views !== null) {
      trueViews7d.push(p.views);
      trueReactions7d.push(p.reactions || 0);
      trueComments7d.push(p.comments || 0);
      trueForwards7d.push(p.forwards || 0);
    }
  }

  let trueTotalEngagement = 0;
  for (let i = 0; i < trueViews7d.length; i++) {
    trueTotalEngagement += trueReactions7d[i] + trueComments7d[i] + trueForwards7d[i];
  }
  const trueAvgEngagement = trueViews7d.length > 0 ? trueTotalEngagement / trueViews7d.length : 0;
  const trueAvgViews = trueViews7d.length > 0 ? trueViews7d.reduce((a,b)=>a+b,0) / trueViews7d.length : 0;
  const trueErr7d = trueAvgViews > 0 ? (trueAvgEngagement / trueAvgViews) * 100 : null;

  // Если за окно 24-48ч не было постов, фоллбэк на среднее за 7 дней'
  
$m_content = $m_content.Replace($m_old_loop.Replace("
","
"), $m_new_loop.Replace("
","
"))
$m_content = $m_content.Replace($m_old_loop.Replace("
","
"), $m_new_loop.Replace("
","
"))

[System.IO.File]::WriteAllText("src/lib/metrics.ts", $m_content, [System.Text.Encoding]::UTF8)
