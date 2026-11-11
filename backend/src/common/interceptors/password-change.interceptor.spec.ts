import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuthController } from '../../modules/auth/auth.controller';
import { BEFORE_PASSWORD_CHANGE_KEY } from '../decorators/before-password-change.decorator';
import {
  PASSWORD_CHANGE_REQUIRED,
  PasswordChangeInterceptor,
} from './password-change.interceptor';

describe('PasswordChangeInterceptor', () => {
  const interceptor = new PasswordChangeInterceptor(new Reflector());
  const next = { handle: () => of('handled') };

  const context = (user: object | undefined, handler: object = () => {}) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => class {},
    }) as any;

  /* The finding: with a temporary password, profile, notifications, clinic
     visits and the user list all answered 200. */
  it('refuses every other route while the password is temporary', () => {
    let error: any;
    try {
      interceptor.intercept(context({ forcePasswordChange: true }), next);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse().reason).toBe(PASSWORD_CHANGE_REQUIRED);
  });

  it('lets somebody with their own password through', () => {
    expect(() =>
      interceptor.intercept(context({ forcePasswordChange: false }), next),
    ).not.toThrow();
  });

  it('leaves public routes alone', () => {
    expect(() => interceptor.intercept(context(undefined), next)).not.toThrow();
  });

  it('opens a route marked for the change', () => {
    const handler = () => {};
    Reflect.defineMetadata(BEFORE_PASSWORD_CHANGE_KEY, true, handler);
    expect(() =>
      interceptor.intercept(
        context({ forcePasswordChange: true }, handler),
        next,
      ),
    ).not.toThrow();
  });

  /* Exactly what the change step on the sign in page calls, and no more. */
  it('opens only reading the profile, changing the password and signing out', () => {
    const proto = AuthController.prototype as unknown as Record<string, object>;
    const open = Object.getOwnPropertyNames(proto).filter((name) =>
      Reflect.getMetadata(BEFORE_PASSWORD_CHANGE_KEY, proto[name]),
    );
    expect(open.sort()).toEqual(['changePassword', 'getProfile', 'logout']);
  });
});
