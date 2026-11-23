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
import type { ValidationError } from 'class-validator';
import { createCorsOptions } from './cors.config.js';
import { createHttpSecurityConfig } from './common/http-security.config.js';
import { createApiRateLimiter } from './common/api-rate-limiter.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { ApiErrorDto } from './common/api-error.dto.js';
import { requestLogging } from './common/logging/request-logging.js';
import { portfolioModels } from './portfolio/portfolio-openapi.js';
import { PortfolioApiErrorDto } from './portfolio/dto/admin-response.dto.js';

function validationFields(errors: ValidationError[], parent = ''): { field: string; code: string }[] {
  return errors.flatMap(error => {
    if (!/^(?:[A-Za-z][A-Za-z0-9]*|[0-9]+)$/.test(error.property)) return [];
    const field = parent ? parent + '.' + error.property : error.property;
    return [
      ...(error.constraints && !('whitelistValidation' in error.constraints)
        ? [{ field, code: 'INVALID_FIELD' }] : []),
      ...validationFields(error.children ?? [], field),
    ];
  });
}

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
  app.use(requestLogging());
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
      exceptionFactory: (errors: ValidationError[] = []) =>
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          errors: validationFields(errors).slice(0, 50),
        }),
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Photo Cloud API')
    .setDescription('Photo Cloud REST API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [ApiErrorDto, ...portfolioModels],
  });
  for (const [route, path] of Object.entries(document.paths)) {
    for (const method of ['get', 'head', 'post', 'patch', 'put', 'delete', 'options'] as const) {
      const operation = path?.[method];
      if (!operation) continue;
      for (const status of [400, 413, 415, 429, 500, 503]) {
        operation.responses[status] ??= { description: 'API request error' };
      }
      for (const [status, result] of Object.entries(operation.responses)) {
        if (!result || '$ref' in result) continue;
        result.headers = {
          ...result.headers,
          'X-Request-Id': {
            description: 'Server-generated request correlation ID',
            schema: { type: 'string', format: 'uuid' },
          },
        };
        if (Number(status) < 400) continue;
        const errorDto = ['400', '409'].includes(status) && route.startsWith('/api/v1/portfolio/')
          ? PortfolioApiErrorDto : ApiErrorDto;
        result.content = { 'application/json': { schema: { $ref: getSchemaPath(errorDto) } } };
        if (status === '429')
          result.headers = {
            ...result.headers,
            'Retry-After': { description: 'Seconds until retry', schema: { type: 'integer' } },
          };
      }
    }
  }
  SwaggerModule.setup('api/docs', app, document);
}
