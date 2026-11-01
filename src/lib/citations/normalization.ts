export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function parseFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'bigint') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const clean = val.replace(/[\s,_]/g, '');
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseCount(val: unknown): number {
  if (val === undefined || val === null) return 1;
  return parseFiniteNumber(val) ?? 0;
}

function parseSubscribers(val: unknown): number {
  const n = parseFiniteNumber(val);
  return n !== null && n > 1 ? n : 0;
}

function extractNestedSubscribers(nested: unknown): number {
  if (!isRecord(nested)) return 0;
  const candidate =
    nested.currentMembers ??
    nested.current_members ??
    nested.membersCount ??
    nested.members_count ??
    nested.subscribers;
  return parseSubscribers(candidate);
}

export function extractSubscribers(m: unknown): number {
  if (typeof m === 'number' || typeof m === 'bigint' || typeof m === 'string') {
    return parseSubscribers(m);
  }
  if (!isRecord(m)) return 0;

  const direct =
    m.citing_subscribers ??
    m.citingSubscribers ??
    m.subscribers ??
    m.membersCount ??
    m.members_count ??
    m.currentMembers ??
    m.current_members;

  const parsedDirect = parseSubscribers(direct);
  if (parsedDirect > 0) return parsedDirect;

  const nestedCandidates = [
    m.sourceChannel,
    m.source_channel,
    m.citingChannel,
    m.citing_channel,
    m.channel,
  ];
  for (const nested of nestedCandidates) {
    const subs = extractNestedSubscribers(nested);
    if (subs > 0) return subs;
  }

  return 0;
}

export function hasDirectMentionFields(obj: Record<string, unknown>): boolean {
  return (
    obj.citing_subscribers !== undefined ||
    obj.citingSubscribers !== undefined ||
    obj.subscribers !== undefined ||
    obj.membersCount !== undefined ||
    obj.members_count !== undefined ||
    obj.currentMembers !== undefined ||
    obj.current_members !== undefined ||
    obj.sourceChannel !== undefined ||
    obj.citingChannel !== undefined ||
    obj.channel !== undefined ||
    obj.count !== undefined
  );
}

export function extractMentionSourceId(m: Record<string, unknown>): number | undefined {
  if (typeof m.sourceChannelId === 'number') return m.sourceChannelId;
  if (typeof m.source_channel_id === 'number') return m.source_channel_id;
  if (isRecord(m.sourceChannel) && typeof m.sourceChannel.id === 'number') return m.sourceChannel.id;
  if (isRecord(m.source_channel) && typeof m.source_channel.id === 'number') return m.source_channel.id;
  if (typeof m.channelId === 'number') return m.channelId;
  return undefined;
}
