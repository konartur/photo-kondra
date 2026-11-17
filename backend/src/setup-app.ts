import {
  BadRequestException,
  INestApplication,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, getSchemaPath, SwaggerModule } from '@nestjs/swagger';
import type { Express, NextFunction, Request, Response } from 'express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { createCorsOptions } from './cors.config.js';
import { createHttpSecurityConfig } from './common/http-security.config.js';
import { createApiRateLimiter } from './common/api-rate-limiter.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { ApiErrorDto } from './common/api-error.dto.js';

// Shared by the HTTP bootstrap and E2E tests so tests exercise the deployed policy.
export function setupApp(
  app: INestApplication,
  production = process.env.NODE_ENV === 'production',
  corsOptions = createCorsOptions(
    process.env.CORS_ALLOWED_ORIGINS ?? process.env.APP_URL,
    process.env.API_URL,
  ),
  security = createHttpSecurityConfig(),
) {
  const expressApp: Express = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', security.trustedProxies.length ? security.trustedProxies : false);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use(
    helmet({
      // Local development uses HTTP; production must be served over HTTPS.
      strictTransportSecurity: production ? undefined : false,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: production ? [] : null },
      },
    }),
  );
  app.enableCors(corsOptions);
  app.use('/api/v1', createApiRateLimiter(security));
  app.use((request: Request, _response: Response, next: NextFunction) => {
    const size = Number(request.headers['content-length'] ?? 0);
    if (size > security.bodyLimit) {
      next(new PayloadTooLargeException('Request body is too large'));
      return;
    }
    const hasBody = size > 0 || request.headers['transfer-encoding'] !== undefined;
    if (hasBody && !request.is(['application/json', 'application/x-www-form-urlencoded'])) {
      next(new UnsupportedMediaTypeException('Only JSON or URL-encoded metadata is accepted'));
      return;
    }
    next();
  });
  app.use(json({ limit: security.bodyLimit, inflate: false }));
  app.use(
    urlencoded({
      limit: security.bodyLimit,
      extended: false,
      parameterLimit: 1000,
      inflate: false,
    }),
  );
  app.use((error: unknown, _request: Request, _response: Response, next: NextFunction) => {
    // Express/Nest may otherwise convert SyntaxError.message (containing submitted JSON) verbatim.
    next(
      error instanceof SyntaxError
        ? new BadRequestException({
            code: 'INVALID_JSON',
            message: 'Malformed JSON body',
          })
        : error,
    );
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
      exceptionFactory: () =>
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
        }),
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Photo Cloud API')
    .setDescription('Photo Cloud REST API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, { extraModels: [ApiErrorDto] });
  for (const path of Object.values(document.paths)) {
    for (const method of ['get', 'head', 'post', 'patch', 'put', 'delete', 'options'] as const) {
      const operation = path?.[method];
      if (!operation) continue;
      for (const status of [400, 413, 415, 429, 500, 503]) {
        operation.responses[status] ??= { description: 'API request error' };
      }
      for (const [status, result] of Object.entries(operation.responses)) {
        if (Number(status) < 400 || !result || '$ref' in result) continue;
        result.content = { 'application/json': { schema: { $ref: getSchemaPath(ApiErrorDto) } } };
        if (status === '429')
          result.headers = {
            'Retry-After': { description: 'Seconds until retry', schema: { type: 'integer' } },
          };
      }
    }
  }
  SwaggerModule.setup('api/docs', app, document);
}
