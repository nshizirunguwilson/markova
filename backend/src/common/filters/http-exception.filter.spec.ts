import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * The shape every error leaves the API in.
 *
 * Two things are worth holding here. A validation failure has to keep the list
 * of what was wrong, because that list is what the web forms show a person.
 * And an unexpected fault must never put its own message in the reply, because
 * that message is where a stack trace or a query would leak out.
 */
describe('HttpExceptionFilter', () => {
  const run = (exception: unknown, url = '/api/users', method = 'POST') => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url, method }),
      }),
    } as any;

    const filter = new HttpExceptionFilter();
    const warn = jest
      .spyOn((filter as any).logger, 'warn')
      .mockImplementation();
    const error = jest
      .spyOn((filter as any).logger, 'error')
      .mockImplementation();

    filter.catch(exception, host);
    return { status, json, body: json.mock.calls[0]?.[0], warn, error };
  };

  it('keeps the status the exception carried', () => {
    const { status, body } = run(
      new HttpException('Nope', HttpStatus.FORBIDDEN),
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(body.statusCode).toBe(403);
  });

  it('passes a plain message through', () => {
    const { body } = run(new HttpException('Nope', HttpStatus.FORBIDDEN));
    expect(body.message).toBe('Nope');
  });

  it('keeps the message and the error name from an object response', () => {
    const { body } = run(new BadRequestException('Amount must be positive'));
    expect(body.message).toBe('Amount must be positive');
    expect(body.error).toBe('Bad Request');
  });

  /**
   * The list is what a form shows against each field. Collapsing it to one
   * string would leave a person guessing which box was wrong.
   */
  it('keeps every validation message, under one heading', () => {
    const { body } = run(
      new BadRequestException({
        message: ['amount must be positive', 'note is too long'],
        error: 'Bad Request',
      }),
    );
    expect(body.message).toBe('Validation failed');
    expect(body.errors).toEqual([
      'amount must be positive',
      'note is too long',
    ]);
  });

  it('leaves the errors field off when there was nothing to list', () => {
    const { body } = run(new BadRequestException('Just the one thing'));
    expect(body).not.toHaveProperty('errors');
  });

  /**
   * An unexpected fault is the one case where the exception's own message
   * must not reach the caller.
   */
  it('answers a plain 500 for anything unrecognised', () => {
    const { status, body } = run(
      new Error('Invalid `prisma.user.findMany()` invocation'),
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(body.message).toBe('An unexpected error occurred');
    expect(body.error).toBe('Internal Server Error');
    expect(JSON.stringify(body)).not.toContain('prisma');
  });

  it('answers a plain 500 for something thrown that is not an error at all', () => {
    const { status, body } = run('everything is fine');
    expect(status).toHaveBeenCalledWith(500);
    expect(body.message).toBe('An unexpected error occurred');
  });

  it('stamps every reply with the time it happened', () => {
    const { body } = run(new BadRequestException('x'));
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });

  /**
   * Bad input is expected traffic. Logging a stack for every rejected form
   * would bury the faults that matter.
   */
  describe('what reaches the log', () => {
    it('warns once, with no stack, for a client error', () => {
      const { warn, error } = run(new BadRequestException('x'), '/api/marks');
      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('POST /api/marks 400 - x');
    });

    it('logs the stack for a real fault', () => {
      const boom = new Error('Connection refused');
      const { error, warn } = run(boom, '/api/marks');
      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        'POST /api/marks 500 - Connection refused',
        boom.stack,
      );
    });

    it('says so even when what was thrown had no message', () => {
      const { error } = run({ weird: true }, '/api/marks');
      expect(error).toHaveBeenCalledWith(
        'POST /api/marks 500 - Unknown error',
        undefined,
      );
    });
  });
});

/**
 * A unique-constraint clash reaching the filter.
 *
 * Services are expected to check first and refuse with a message naming the
 * holder. When one forgets, Prisma's P2002 used to fall through as a raw 500
 * reading "An unexpected error occurred" — which tells an admin nothing and
 * looks like an outage rather than a duplicate they can fix.
 */
describe('a duplicate value that reached the filter', () => {
  const run = (exception: unknown) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'PUT', url: '/api/users/u-1' }),
      }),
    } as never;
    new HttpExceptionFilter().catch(exception, host);
    return { status, body: json.mock.calls[0]?.[0] };
  };

  it('answers 409 rather than 500', () => {
    const { status, body } = run({
      code: 'P2002',
      meta: { target: ['email'] },
    });
    expect(status).toHaveBeenCalledWith(409);
    expect(body.error).toBe('Conflict');
  });

  it('names the field that collided', () => {
    const { body } = run({ code: 'P2002', meta: { target: ['email'] } });
    expect(body.message).toMatch(/email is already taken/);
  });

  it('names every field of a composite clash', () => {
    const { body } = run({
      code: 'P2002',
      meta: { target: ['name', 'trade_id'] },
    });
    expect(body.message).toMatch(/name and trade_id/);
  });

  // Prisma reports the target as a string on some connectors.
  it('copes with a target given as a plain string', () => {
    const { body } = run({ code: 'P2002', meta: { target: 'phone' } });
    expect(body.message).toMatch(/phone is already taken/);
  });

  it('still answers when Prisma names no field at all', () => {
    const { status, body } = run({ code: 'P2002' });
    expect(status).toHaveBeenCalledWith(409);
    expect(body.message).toMatch(/already taken/);
  });

  // Anything that is not P2002 keeps the old behaviour.
  it('leaves an unrelated failure as a 500', () => {
    const { status } = run(new Error('database is on fire'));
    expect(status).toHaveBeenCalledWith(500);
  });

  // An explicit HttpException from a service must still win, so the message
  // naming the holder is not replaced by the generic one.
  it('lets a service’s own conflict message through untouched', () => {
    const { body } = run(
      new ConflictException(
        'Email address a@b.c already belongs to Aline Uwase',
      ),
    );
    expect(body.message).toMatch(/already belongs to Aline Uwase/);
  });
});
