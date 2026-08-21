import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { ACCESS_TOKEN_TYPE } from '../token-types';

export interface JwtPayload {
  sub: string; // user id
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

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        isActive: true,
        forcePasswordChange: true,
        teacher: { select: { id: true } },
        student: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      ...user,
      teacherId: user.teacher?.id || null,
      studentId: user.student?.id || null,
    };
  }
}
