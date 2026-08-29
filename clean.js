const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.eventMention.deleteMany();
  await prisma.event.deleteMany();
  console.log('DB Cleaned');
}
main().finally(() => prisma.$disconnect());
