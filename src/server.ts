<<<<<<< HEAD
import { buildApp } from './app.js';
=======
import { buildApp } from './app';
>>>>>>> origin/main

async function main() {
  const app = await buildApp();
  try {
    const port = Number(process.env.PORT) || 4000;
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
