// Entry point: reads PORT and starts the server. All the wiring lives in app.ts.

import { portFromEnv, startServer } from './app';

const running = await startServer({ port: portFromEnv(process.env) });
console.log(`Ship It listening on port ${running.port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void running.close().then(() => process.exit(0));
  });
}
