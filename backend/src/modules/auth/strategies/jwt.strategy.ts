import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { ACCESS_TOKEN_TYPE } from '../token-types';
import { withPlatform } from '../../../prisma/request-context';

export interface JwtPayload {
  sub: string; // user id: one person in one school
  /** The login the school record belongs to. Absent on older tokens. */
  acc?: string;
  role: string;
  email?: string;
  /** 'access' or 'refresh'. Absent on tokens minted before the claim existed. */
  typ?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error(
        'JWT_SECRET environment variable is not set. Application cannot start without it.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    // A refresh token must not open a request. It is signed with a different
    // key, so this only bites if the two secrets are ever made equal, which the
    // boot time environment check now refuses. Tokens issued before the claim
    // existed carry no `typ` and are accepted until they expire.
    if (payload.typ && payload.typ !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid access token');
    }

    /*
      Above the wall between schools, because this is how the request learns
      which school it belongs to: nothing can be scoped until the person is
      found. It reads one person by the id the signed token names, and the
      school it returns is the one every query after it is held to.
    */
    const user = await withPlatform(() =>
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          schoolId: true,
          email: true,
          phone: true,
          role: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          isActive: true,
          accountId: true,
          account: {
            select: { forcePasswordChange: true, platformRole: true },
          },
          school: { select: { status: true } },
          teacher: { select: { id: true } },
          student: { select: { id: true, status: true } },
        },
      }),
    );

    /*
      Refused when the record was closed, when its school has been suspended,
      or when the token names a login the record no longer belongs to. A
      suspended school disappears for everybody in it at once, not when their
      tokens happen to expire.
    */
    if (
      !user ||
      !user.isActive ||
      user.school.status !== 'ACTIVE' ||
      (payload.acc && payload.acc !== user.accountId)
    ) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const { account, school: _school, ...rest } = user;
    return {
      ...rest,
      forcePasswordChange: account.forcePasswordChange,
      platformRole: account.platformRole,
      teacherId: user.teacher?.id || null,
      studentId: user.student?.id || null,
      /* Read by FormerStudentInterceptor: a student who has left sees only
         their own past. */
      studentStatus: user.student?.status ?? null,
    };
  }
}
