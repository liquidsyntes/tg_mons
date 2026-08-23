import { describe, it, expect } from 'vitest';
import { parseChannelIdentifier } from '@/worker/collector';

describe('parseChannelIdentifier', () => {
  it('parses @username', () => {
    const result = parseChannelIdentifier('@mychannel');
    expect(result.type).toBe('username');
    expect(result.value).toBe('mychannel');
  });

  it('parses plain username (without @)', () => {
    const result = parseChannelIdentifier('mychannel');
    expect(result.type).toBe('username');
    expect(result.value).toBe('mychannel');
  });

  it('parses t.me/username URL', () => {
    const result = parseChannelIdentifier('https://t.me/mychannel');
    expect(result.type).toBe('username');
    expect(result.value).toBe('mychannel');
  });

  it('parses t.me/username without protocol', () => {
    const result = parseChannelIdentifier('t.me/mychannel');
    expect(result.type).toBe('username');
    expect(result.value).toBe('mychannel');
  });

  it('parses invite link t.me/+hash', () => {
    const result = parseChannelIdentifier('https://t.me/+abc123XYZ');
    expect(result.type).toBe('invite');
    expect(result.value).toBe('abc123XYZ');
  });

  it('parses invite link t.me/joinchat/hash', () => {
    const result = parseChannelIdentifier('https://t.me/joinchat/abc123XYZ');
    expect(result.type).toBe('invite');
    expect(result.value).toBe('abc123XYZ');
  });

  it('parses negative numeric ID (Telegram channel ID)', () => {
    const result = parseChannelIdentifier('-1001234567890');
    expect(result.type).toBe('id');
    expect(result.value).toBe('-1001234567890');
  });

  it('handles whitespace by trimming', () => {
    const result = parseChannelIdentifier('  @mychannel  ');
    expect(result.type).toBe('username');
    expect(result.value).toBe('mychannel');
  });
});
