$files = @(
  @{ Path="src/app/compare/page.tsx"; Replacements=@{ '\.err7d' = '.vr7d' } },
  @{ Path="src/components/channel/ChannelDetailClient.tsx"; Replacements=@{ '\.errHistory' = '.vrHistory'; '<ErrChart errHistory=' = '<ErrChart vrHistory=' } },
  @{ Path="src/components/ChannelsTable.tsx"; Replacements=@{ '\.err7d' = '.vr7d'; '\.err24h' = '.vr24h' } },
  @{ Path="src/components/MyChannelCard.tsx"; Replacements=@{ '\.err7d' = '.vr7d'; '\.err24h' = '.vr24h' } },
  @{ Path="src/components/WatchlistWidget.tsx"; Replacements=@{ '\.err7d' = '.vr7d' } },
  @{ Path="src/lib/dashboard.ts"; Replacements=@{ '\.err7d' = '.vr7d' } },
  @{ Path="src/components/channel/WrappedCard.tsx"; Replacements=@{ 'erPercent' = 'vrPercent'; 'ER по просмотрам' = 'View Rate'; '<div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Средняя вовлеченность</div>' = '<div className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-2 h-12 flex items-start">Просмотры к подписчикам</div>' } },
  @{ Path="src/components/channel/ErrChart.tsx"; Replacements=@{ 'errHistory' = 'vrHistory'; 'err: number' = 'vr: number'; 'd\.err' = 'd.vr'; 'v\.err' = 'v.vr'; 'err =' = 'vr ='; 'dataKey="err"' = 'dataKey="vr"' } },
  @{ Path="src/lib/types.ts"; Replacements=@{ 
        "err24h: number | null;"="vr24h: number | null;";
        "err7d: number | null;"="vr7d: number | null;
  trueErr7d: number | null;";
        "errHistory\?:"="vrHistory?:";
        "err: number;"="vr: number;";
        "avgErr: number;"="avgVr: number;" 
     } 
  },
  @{ Path="src/lib/scoring.ts"; Replacements=@{
        "err: number | null,"="trueErr: number | null,";
        "const e = err || 0;"="const e = trueErr || 0;"
     }
  }
)

foreach ($item in $files) {
    $content = [System.IO.File]::ReadAllText($item.Path)
    foreach ($key in $item.Replacements.Keys) {
        $content = [System.Text.RegularExpressions.Regex]::Replace($content, $key, $item.Replacements[$key])
    }
    [System.IO.File]::WriteAllText($item.Path, $content, [System.Text.Encoding]::UTF8)
}
