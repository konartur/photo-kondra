import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';
import { createApplicationLogger } from './common/logging/logging.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(createApplicationLogger());
  setupApp(app);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
