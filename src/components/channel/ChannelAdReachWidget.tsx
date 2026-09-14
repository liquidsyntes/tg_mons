'use client';

import { useEffect, useState } from 'react';
import { AdReachChart, AdReachDataPoint } from '@/components/AdReachChart';

interface ChannelAdReachWidgetProps {
  channelId: number;
}

export function ChannelAdReachWidget({ channelId }: ChannelAdReachWidgetProps) {
  const [data, setData] = useState<AdReachDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/channels/${channelId}/ad-price`)
      .then(res => res.json())
      .then(json => {
        if (json && json.averageReachCurve) {
          setData(json.averageReachCurve);
        } else {
          setData([]);
        }
      })
      .catch(err => {
        console.error('Failed to load ad reach curve', err);
        setData([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [channelId]);

  if (loading) {
    return (
      <div className="p-4 bg-surface rounded-2xl border border-border flex items-center justify-center h-[250px] animate-pulse">
        <span className="text-slate-500 text-sm">Загрузка данных об охвате...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return null;
  }

  return (
    <AdReachChart data={data} />
  );
}
