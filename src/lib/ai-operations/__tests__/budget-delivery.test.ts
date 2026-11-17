import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({settings:vi.fn(),find:vi.fn(),claim:vi.fn(),update:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{systemSetting:{findUnique:mocks.settings},aiBudgetNotice:{findMany:mocks.find,updateMany:mocks.claim,update:mocks.update}}}));
import {deliverBudgetNotices} from '../budget';
beforeEach(()=>{
  vi.restoreAllMocks();vi.clearAllMocks();vi.stubEnv('TELEGRAM_BOT_TOKEN','synthetic');vi.stubEnv('TELEGRAM_CHAT_ID','-123');
  mocks.settings.mockResolvedValue({aiBudgetTelegram:true});mocks.find.mockResolvedValue([{id:'notice',period:'day',threshold:80,cost:'1'}]);mocks.claim.mockResolvedValue({count:1});mocks.update.mockResolvedValue({});
});
it('does not send when disabled or claim belongs to another process',async()=>{
  const send=vi.spyOn(globalThis,'fetch');mocks.settings.mockResolvedValue({aiBudgetTelegram:false});await deliverBudgetNotices();expect(send).not.toHaveBeenCalled();
  mocks.settings.mockResolvedValue({aiBudgetTelegram:true});mocks.claim.mockResolvedValue({count:0});await deliverBudgetNotices();expect(send).not.toHaveBeenCalled();
});
it('records success and retries a confirmed rate-limit rejection',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:200}));await deliverBudgetNotices();expect(mocks.update).toHaveBeenLastCalledWith({where:{id:'notice'},data:{delivery:'SENT'}});
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:429}));await deliverBudgetNotices();expect(mocks.update).toHaveBeenLastCalledWith({where:{id:'notice'},data:{delivery:'PENDING'}});
});
it('retains ambiguous delivery without automatic resend after a transport failure',async()=>{
  vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('synthetic transport failure'));await expect(deliverBudgetNotices()).resolves.toBeUndefined();expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({data:{delivery:'UNKNOWN'}}));expect(mocks.update).not.toHaveBeenCalled();
});
