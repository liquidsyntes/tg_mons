const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.event.findMany().then(e => console.log(JSON.stringify(e))).finally(() => prisma.$disconnect());
