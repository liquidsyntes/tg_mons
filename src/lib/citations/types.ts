type NumericLike = number | string | bigint;

interface NestedChannelSubscriberMetrics {
  id?: number;
  currentMembers?: NumericLike | null;
  current_members?: NumericLike | null;
  membersCount?: NumericLike | null;
  members_count?: NumericLike | null;
  subscribers?: NumericLike | null;
}

/**
 * Represents an individual inbound citation or mention of a Telegram channel.
 *
 * Supports flexible property naming conventions to accommodate diverse database query outputs,
 * raw API payloads, and synthetic test fixtures.
 *
 * @property mentions - Total count of mentions/reposts in this citation record.
 * @property count - Alias for `mentions` count.
 * @property citing_subscribers - Subscriber count of the citing channel (snake_case convention).
 * @property citingSubscribers - Subscriber count of the citing channel (camelCase convention).
 * @property subscribers - Subscriber count of the citing channel (general alias).
 * @property membersCount - Member count of citing channel from snapshot model (camelCase).
 * @property members_count - Member count of citing channel (snake_case alias).
 * @property currentMembers - Current member count of citing channel (camelCase).
 * @property current_members - Current member count of citing channel (snake_case alias).
 * @property sourceChannelId - Database ID of the citing channel (used for self-citation exclusion).
 * @property source_channel_id - Snake_case alias for `sourceChannelId`.
 * @property channelId - Alternative channel ID identifier.
 * @property sourceChannel - Nested source channel object containing member metrics.
 * @property source_channel - Snake_case alias for `sourceChannel`.
 * @property citingChannel - Nested citing channel object containing member metrics.
 * @property citing_channel - Snake_case alias for `citingChannel`.
 * @property channel - Nested channel reference containing member metrics.
 * @property createdAt - Timestamp when the citation occurred (used for 30-day temporal window).
 * @property created_at - Snake_case alias for `createdAt`.
 * @property publishedAt - Publication timestamp alias.
 * @property published_at - Snake_case alias for `publishedAt`.
 * @property date - General date timestamp alias.
 * @property timestamp - Raw epoch or date timestamp alias.
 */
export interface CitationMention {
  mentions?: NumericLike;
  count?: NumericLike;
  citing_subscribers?: NumericLike;
  citingSubscribers?: NumericLike;
  subscribers?: NumericLike;
  membersCount?: NumericLike;
  members_count?: NumericLike;
  currentMembers?: NumericLike;
  current_members?: NumericLike;
  sourceChannelId?: number;
  source_channel_id?: number;
  channelId?: number;
  sourceChannel?: NestedChannelSubscriberMetrics;
  source_channel?: NestedChannelSubscriberMetrics;
  citingChannel?: NestedChannelSubscriberMetrics;
  citing_channel?: NestedChannelSubscriberMetrics;
  channel?: NestedChannelSubscriberMetrics;
  createdAt?: Date | string | number;
  created_at?: Date | string | number;
  publishedAt?: Date | string | number;
  published_at?: Date | string | number;
  date?: Date | string | number;
  timestamp?: Date | string | number;
}

/**
 * Flexible input container for channel citation index calculations.
 *
 * Accommodates channel models, database query payloads, or custom objects containing
 * mention collections under various naming conventions.
 *
 * @property id - Unique channel ID (used to filter out self-citations).
 * @property channelId - Alternative channel ID alias.
 * @property mentions - Array of `CitationMention` records or numeric mention count.
 * @property citations - Array of `CitationMention` records.
 * @property inboundMentions - Array of inbound `CitationMention` records (camelCase).
 * @property inbound_mentions - Array of inbound `CitationMention` records (snake_case).
 * @property inbound - Array of inbound citation records.
 */
export interface CitationChannelInput extends Omit<CitationMention, 'mentions'> {
  id?: number;
  channelId?: number;
  mentions?: CitationMention[] | NumericLike;
  citations?: CitationMention[];
  inboundMentions?: CitationMention[];
  inbound_mentions?: CitationMention[];
  inbound?: CitationMention[];
}

export type CitationInput =
  | CitationChannelInput
  | ReadonlyArray<CitationMention | NumericLike | null | undefined>
  | NumericLike
  | Record<string, unknown>
  | null
  | undefined;
