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

  const config = new DocumentBuilder()
    .setTitle('Markova API')
    .setDescription('School Management System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
