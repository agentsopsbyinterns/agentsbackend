import process from 'node:process';
import { buildApp } from './app.js';
async function main() {
  console.log('Server starting...');
  console.log(`NODE_ENV=${process.env.NODE_ENV} PORT=${process.env.PORT || 'unset'}`);
  process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (err: any) => {
    console.error('Uncaught exception:', err);
  });
  const app = await buildApp();
  try {
    const port = Number(process.env.PORT) || 4001;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
