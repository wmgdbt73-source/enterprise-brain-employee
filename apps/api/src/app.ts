import Fastify from 'fastify';

export function createApp() {
  const app = Fastify();

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
