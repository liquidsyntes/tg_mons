'use client';

import { use } from 'react';
import { ChannelDetailClient } from '@/components/channel/ChannelDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ChannelDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const channelId = resolvedParams.id;

  return <ChannelDetailClient channelId={channelId} />;
}
