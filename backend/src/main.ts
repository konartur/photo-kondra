import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';
import { createApplicationLogger } from './common/logging/logging.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(createApplicationLogger());
  setupApp(app);

  const port = process.env.PORT ?? 3000;
  const host = process.env.API_HOST;
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
}
await bootstrap();
