// Synthetic configuration used to exercise Prisma's actual configuration loader.
const config = {
  schema: 'schema.prisma',
  migrations: { path: 'migrations', seed: 'node seed.js' },
};

export default config;
