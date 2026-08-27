import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let error = 'Internal Server Error';
    let errors: string[] | undefined;

    /**
     * A unique-constraint clash is the user's mistake, not the server's.
     *
     * Prisma raises P2002 when two rows collide on a unique column — a second
     * account on one email, two students given one card number. Services are
     * expected to check first and refuse with a message naming the holder,
     * but any route that forgets used to return a raw 500 reading "An
     * unexpected error occurred", which tells an admin nothing and looks like
     * an outage. This is the backstop: the right status, and the field that
     * actually collided.
     */
    const prisma = exception as { code?: string; meta?: { target?: unknown } };
    if (!(exception instanceof HttpException) && prisma?.code === 'P2002') {
      const target = prisma.meta?.target;
      const fields = Array.isArray(target)
        ? target.map(String)
        : typeof target === 'string'
          ? [target]
          : [];
      status = HttpStatus.CONFLICT;
      error = 'Conflict';
      message = fields.length
        ? `That ${fields.join(' and ')} is already taken`
        : 'That value is already taken';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        error = (resp.error as string) || error;
        if (Array.isArray(resp.message)) {
          errors = resp.message;
          message = 'Validation failed';
        }
      }
    }

    // Client errors (bad input, missing files, unauthorized) are expected
    // traffic: one warn line, no stack. Full stacks are for real 5xx faults.
    const summary = `${request.method} ${request.url} ${status} - ${exception instanceof Error ? exception.message : 'Unknown error'}`;
    if (status >= 500) {
      this.logger.error(
        summary,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(summary);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
    });
  }
}
