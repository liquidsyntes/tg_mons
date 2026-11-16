import {it,expect} from 'vitest';
import {parseUsage,canonicalHash} from '../store';
it('does not invent token usage or free cost for absent/invalid usage',()=>{
  expect(parseUsage({}).cost).toBeNull();
  expect(parseUsage({usage:{cost:-1,prompt_tokens:NaN}}).inputTokens).toBeNull();
  expect(parseUsage({usage:{input_tokens:12,output_tokens:0,cost:0}})).toMatchObject({inputTokens:12,outputTokens:0,currency:'USD'});
  expect(parseUsage({usage:{cost:0}}).cost?.toString()).toBe('0');
});
it('canonicalizes object keys but preserves ordered inputs',()=>{
 expect(canonicalHash({a:1,b:2})).toBe(canonicalHash({b:2,a:1}));
 expect(canonicalHash([1,2])).not.toBe(canonicalHash([2,1]));
});
