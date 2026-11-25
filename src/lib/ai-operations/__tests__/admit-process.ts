import { reserveOperation } from '../store';
import { prisma } from '@/lib/prisma';
async function main() {
  const enabled = process.env.AI_OPERATIONS_INTEGRATION === '1' || process.env.RUN_DB_INTEGRATION_TESTS === 'true';
  if (!enabled || !new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_ai87_test')) throw new Error('Dedicated test database required');
  const result=await reserveOperation('user:process',null,'summary','process-key','same');
  process.stdout.write(JSON.stringify({created:result.created,id:result.operation.id}));
}
main().catch(()=>{process.exitCode=1;}).finally(()=>prisma.$disconnect());
