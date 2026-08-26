$files = @(
  @{ Path="src/app/compare/page.tsx"; Replacements=@{ '\.err7d' = '.vr7d' } },
  @{ Path="src/components/channel/ChannelDetailClient.tsx"; Replacements=@{ '\.errHistory' = '.vrHistory'; '<ErrChart errHistory=' = '<ErrChart vrHistory=' } },
  @{ Path="src/components/ChannelsTable.tsx"; Replacements=@{ '\.err7d' = '.vr7d'; '\.err24h' = '.vr24h' } },
  @{ Path="src/components/MyChannelCard.tsx"; Replacements=@{ '\.err7d' = '.vr7d'; '\.err24h' = '.vr24h' } },
  @{ Path="src/components/WatchlistWidget.tsx"; Replacements=@{ '\.err7d' = '.vr7d' } },
  @{ Path="src/lib/dashboard.ts"; Replacements=@{ '\.err7d' = '.vr7d' } },
  @{ Path="src/components/channel/WrappedCard.tsx"; Replacements=@{ 'erPercent' = 'vrPercent'; 'ER по просмотрам' = 'View Rate'; 'Средняя вовлеченность' = 'Просмотры к подписчикам' } }
)

foreach ($item in $files) {
    $content = [System.IO.File]::ReadAllText($item.Path, [System.Text.Encoding]::UTF8)
    foreach ($key in $item.Replacements.Keys) {
        $content = [System.Text.RegularExpressions.Regex]::Replace($content, $key, $item.Replacements[$key])
    }
    [System.IO.File]::WriteAllText($item.Path, $content, [System.Text.Encoding]::UTF8)
}
