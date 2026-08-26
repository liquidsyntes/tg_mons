$ep_content = [System.IO.File]::ReadAllText("src/lib/ep.ts")

$ep_true_err = "export function calculateTrueERR(views: number[], reactions: number[], comments: number[], forwards: number[]): number {
  if (views.length === 0) return 0;
  const totalEngagement = reactions.map((r, i) => r + comments[i] + forwards[i]);
  const avgEngagement = totalEngagement.reduce((sum, val) => sum + val, 0) / totalEngagement.length;
  const avgViews = views.reduce((sum, val) => sum + val, 0) / views.length;
  return avgViews > 0 ? (avgEngagement / avgViews) * 100 : 0;
}
function calculateRawMetrics"

$ep_content = $ep_content.Replace("function calculateRawMetrics", $ep_true_err)
$ep_content = $ep_content.Replace("const totalEngagement = channel.postReactions.map((r, i) => r + channel.postComments[i] + channel.postForwards[i]);
  const avgEngagement = mean(totalEngagement);
  const avgViews = mean(channel.postViews);
  const ERR = avgViews > 0 ? (avgEngagement / avgViews) * 100 : 0;", "const ERR = calculateTrueERR(channel.postViews, channel.postReactions, channel.postComments, channel.postForwards);")

[System.IO.File]::WriteAllText("src/lib/ep.ts", $ep_content, [System.Text.Encoding]::UTF8)

$m_content = [System.IO.File]::ReadAllText("src/lib/metrics.ts")
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, '\.err7d', '.vr7d')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'err7d,', "vr7d,
    trueErr7d,")
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'const err7d = ', 'const vr7d = ')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'channel\.err7d', 'channel.vr7d')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'const err24h = ', 'const vr24h = ')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'err24h,', 'vr24h,')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'channel\.err24h', 'channel.vr24h')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'errHistory', 'vrHistory')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'avgErr', 'avgVr')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'maxErr', 'maxVr')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'getErrHistory', 'getVrHistory')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'err,', 'vr,')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'const err = ', 'const vr = ')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'channelPosts: { publishedAt: Date; views: number \| null; text: string \| null }\[\]', 'channelPosts: { publishedAt: Date; views: number | null; text: string | null; reactions?: number | null; comments?: number | null; forwards?: number | null }[]')
$m_content = [System.Text.RegularExpressions.Regex]::Replace($m_content, 'select: \{ publishedAt: true, views: true, text: true \}', 'select: { publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true }')

$m_content = $m_content.Replace("calculateContentScore(
    vr7d,
    trueErr7d,", "calculateContentScore(
    trueErr7d,")
$m_content = $m_content.Replace("calculateContentScore(
    channel.vr7d,", "calculateContentScore(
    channel.trueErr7d,")

$m_old_loop = "        if (pt < t24h) {
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

  // Если за окно 24-48ч не было постов, фоллбэк на среднее за 7 дней"

$m_new_loop = "        if (pt < t24h) {
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

  // Если за окно 24-48ч не было постов, фоллбэк на среднее за 7 дней"
$m_content = $m_content.Replace($m_old_loop, $m_new_loop)

[System.IO.File]::WriteAllText("src/lib/metrics.ts", $m_content, [System.Text.Encoding]::UTF8)
