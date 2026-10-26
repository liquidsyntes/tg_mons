import { describe, expect, it } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { extractPostMentions } from '../post-mentions';

describe('extractPostMentions', () => {
  it('keeps the original message ID for a forwarded channel post', () => {
    const forward = new Api.MessageFwdHeader({
      fromId: new Api.PeerChannel({ channelId: bigInt(7) }),
      channelPost: 42,
      date: 1,
    });
    expect(extractPostMentions({ fwdFrom: forward }, null, 'source')).toEqual([
      { type: 'forward', targetTgId: 7n, targetMessageId: 42n },
    ]);
  });

  it('recognizes direct post links and avoids self mentions', () => {
    expect(extractPostMentions({ fwdFrom: undefined },
      'Читайте @target https://t.me/target/123 и t.me/source/456', 'source')).toEqual([
      { type: 'mention', targetUsername: 'target', targetMessageId: 123n },
    ]);
  });

  it('keeps channel mentions without a valid post ID', () => {
    expect(extractPostMentions({ fwdFrom: undefined },
      'См. t.me/target/999999999999999999999999999', 'source')).toEqual([
      { type: 'mention', targetUsername: 'target' },
    ]);
  });
});
