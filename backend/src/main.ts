import './sentry';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Express 5 / path-to-regexp v8 requires named wildcards (e.g. `*path`)
  // instead of the legacy `(.*)` form; this keeps /uploads served outside the
  // global `api` prefix without the LegacyRouteConverter boot warning.
  // Rate limiting keys on `req.ip`, and Express derives that from this setting.
  // Left unset behind a reverse proxy, every request appears to come from the
  // proxy, so the whole school shares one bucket: the ten-per-minute login limit
  // becomes ten logins per minute for everybody, which fails to slow an attacker
  // and locks out real users at the same time.
  //
  // Set TRUST_PROXY to the number of proxies in front of this app (Render,
  // Railway, Fly and a single nginx are all `1`; nginx behind Cloudflare is
  // `2`). Named subnets such as `loopback` also work. It stays off by default
  // because trusting a hop that is not there lets a client forge
  // X-Forwarded-For and sidestep rate limiting entirely.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  app.setGlobalPrefix('api', { exclude: ['uploads/{*path}'] });
  app.useStaticAssets(
    join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    {
      prefix: '/uploads/',
    },
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());

  // Defaults cover the local dev surfaces: the Next.js dashboard on :3001 and
  // Expo web on :8081. The API itself (:3000) is not an origin that calls us.
  const corsOrigins = (
    process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:8081'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger documents every route, its parameters and its roles. That is a map
  // of the whole attack surface, so it is off in production unless somebody
  // deliberately turns it on with SWAGGER_ENABLED=true.
  const isProduction = process.env.NODE_ENV === 'production';
  const swaggerEnabled = process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === 'true'
    : !isProduction;

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Markova API')
      .setDescription('School Management System API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Lets Nest run onModuleDestroy across the app on SIGTERM, so Prisma closes
  // its pool and BullMQ stops pulling jobs it is about to abandon. Without it a
  // redeploy drops connections and half-processed jobs on the floor.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
