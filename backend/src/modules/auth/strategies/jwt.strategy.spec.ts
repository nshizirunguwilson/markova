import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE } from '../token-types';

describe('JwtStrategy.validate()', () => {
  const activeUser = {
    id: 'user-1',
    email: 'aline.uwase@markova.edu',
    phone: null,
    role: 'TEACHER',
    firstName: 'Aline',
    lastName: 'Uwase',
    photoUrl: null,
    isActive: true,
    forcePasswordChange: false,
    teacher: { id: 'teacher-1' },
    student: null,
  };

  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn().mockResolvedValue(activeUser) } };
    const config = {
      get: jest.fn().mockReturnValue('a-test-access-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(config, prisma as never);
  });

  it('accepts an access token', async () => {
    await expect(
      strategy.validate({
        sub: 'user-1',
        role: 'TEACHER',
        typ: ACCESS_TOKEN_TYPE,
      }),
    ).resolves.toMatchObject({ id: 'user-1', teacherId: 'teacher-1' });
  });

  // The swap this claim exists to stop.
  it('refuses a refresh token presented as an access token', async () => {
    await expect(
      strategy.validate({
        sub: 'user-1',
        role: 'TEACHER',
        typ: REFRESH_TOKEN_TYPE,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  // Anything already in someone's pocket when this shipped.
  it('still accepts a token minted before the claim existed', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', role: 'TEACHER' }),
    ).resolves.toMatchObject({ id: 'user-1' });
  });

  it('rejects a deactivated user even with a valid token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });
    await expect(
      strategy.validate({
        sub: 'user-1',
        role: 'TEACHER',
        typ: ACCESS_TOKEN_TYPE,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
