import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── HEALTH ─────────────────────────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('should return ok status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });

  // ─── LOGIN ──────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('should return requiresOtp and sessionId for admin user with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@markova.academy', password: 'Password123!' })
        .expect(201);

      expect(res.body.requiresOtp).toBe(true);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.message).toContain('OTP');
      // In non-production mode, devOtp is returned for testing
      expect(res.body.devOtp).toBeDefined();
      expect(res.body.devOtp).toMatch(/^\d{6}$/);
    });

    it('should return tokens directly for student user (no OTP)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'student1@markova.academy', password: 'Password123!' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('STUDENT');
    });

    it('should return 401 for wrong password', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@markova.academy', password: 'WrongPassword1!' })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid credentials');
        });
    });

    it('should return 401 for non-existent user', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent@markova.academy', password: 'Password123!' })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid credentials');
        });
    });

    it('should return 400 when email and phone are both missing', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: 'Password123!' })
        .expect(400);
    });

    it('should return 400 when password is missing', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@markova.academy' })
        .expect(400);
    });

    it('should accept phone-based login for admin user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ phone: '+256700000001', password: 'Password123!' })
        .expect(201);

      expect(res.body.requiresOtp).toBe(true);
      expect(res.body.sessionId).toBeDefined();
    });
  });

  // ─── OTP VERIFICATION ──────────────────────────────────────────────────────

  describe('POST /api/auth/verify-otp', () => {
    it('should complete login flow: login -> get OTP -> verify -> receive tokens', async () => {
      // Step 1: Login to get sessionId and devOtp
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@markova.academy', password: 'Password123!' })
        .expect(201);

      const { sessionId, devOtp } = loginRes.body;
      expect(sessionId).toBeDefined();
      expect(devOtp).toBeDefined();

      // Step 2: Verify OTP
      const otpRes = await request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ sessionId, otp: devOtp })
        .expect(201);

      expect(otpRes.body.accessToken).toBeDefined();
      expect(otpRes.body.refreshToken).toBeDefined();
      expect(otpRes.body.user).toBeDefined();
      expect(otpRes.body.user.email).toBe('admin@markova.academy');
      expect(otpRes.body.user.role).toBe('ADMIN');
    });

    it('should return 401 for invalid OTP', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@markova.academy', password: 'Password123!' })
        .expect(201);

      const { sessionId } = loginRes.body;

      return request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ sessionId, otp: '000000' })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid OTP');
        });
    });

    it('should return 401 for invalid sessionId', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ sessionId: 'non-existent-session-id', otp: '123456' })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid or expired OTP session');
        });
    });

    it('should not allow OTP reuse (session consumed after verification)', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@markova.academy', password: 'Password123!' })
        .expect(201);

      const { sessionId, devOtp } = loginRes.body;

      // First verification succeeds
      await request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ sessionId, otp: devOtp })
        .expect(201);

      // Second verification with same session should fail
      return request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ sessionId, otp: devOtp })
        .expect(401);
    });
  });

  // ─── TEACHER LOGIN (OTP flow) ──────────────────────────────────────────────

  describe('Teacher OTP login flow', () => {
    it('should require OTP for teacher and complete the flow', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'sarah.nakamya@markova.academy', password: 'Password123!' })
        .expect(201);

      expect(loginRes.body.requiresOtp).toBe(true);

      const otpRes = await request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ sessionId: loginRes.body.sessionId, otp: loginRes.body.devOtp })
        .expect(201);

      expect(otpRes.body.accessToken).toBeDefined();
      expect(otpRes.body.user.role).toBe('TEACHER');
    });
  });

  // ─── PROFILE ────────────────────────────────────────────────────────────────

  describe('GET /api/auth/profile', () => {
    let accessToken: string;

    beforeAll(async () => {
      // Login as student (direct token, no OTP)
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'student1@markova.academy', password: 'Password123!' });

      accessToken = res.body.accessToken;
    });

    it('should return user profile with valid JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe('student1@markova.academy');
      expect(res.body.role).toBe('STUDENT');
      expect(res.body.firstName).toBeDefined();
      expect(res.body.lastName).toBeDefined();
    });

    it('should return 401 without token', async () => {
      return request(app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      return request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('should return admin profile with OTP-authenticated token', async () => {
      // Full admin login flow
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@markova.academy', password: 'Password123!' });

      const otpRes = await request(app.getHttpServer())
        .post('/api/auth/verify-otp')
        .send({ sessionId: loginRes.body.sessionId, otp: loginRes.body.devOtp });

      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${otpRes.body.accessToken}`)
        .expect(200);

      expect(res.body.email).toBe('admin@markova.academy');
      expect(res.body.role).toBe('ADMIN');
    });
  });

  // ─── REFRESH TOKEN ──────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('should issue new tokens with a valid refresh token', async () => {
      // Login as student to get tokens
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'student1@markova.academy', password: 'Password123!' });

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // New tokens should be different
      expect(res.body.accessToken).not.toBe(loginRes.body.accessToken);
    });

    it('should return 401 with invalid refresh token', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);
    });
  });

  // ─── LOGOUT ─────────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'student1@markova.academy', password: 'Password123!' });

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(201);

      expect(res.body.message).toBe('Logged out successfully');
    });

    it('should return 401 when logging out without token', async () => {
      return request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(401);
    });
  });

  // ─── PASSWORD RESET REQUEST ─────────────────────────────────────────────────

  describe('POST /api/auth/request-reset', () => {
    it('should return success message for existing user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/request-reset')
        .send({ email: 'admin@markova.academy' })
        .expect(201);

      expect(res.body.message).toContain('reset link has been sent');
      // In dev mode, devToken is returned
      expect(res.body.devToken).toBeDefined();
    });

    it('should return same success message for non-existent user (prevent enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/request-reset')
        .send({ email: 'nobody@markova.academy' })
        .expect(201);

      expect(res.body.message).toContain('reset link has been sent');
    });
  });

  // ─── RATE LIMITING ──────────────────────────────────────────────────────────

  describe('Rate limiting on auth endpoints', () => {
    it('should throttle login after too many requests', async () => {
      const requests: Promise<any>[] = [];

      // The login endpoint is throttled at 5 requests per 60s.
      // Send 6 rapid requests to trigger the throttle.
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email: 'nonexistent@test.com', password: 'Password123!' }),
        );
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map((r) => r.status);

      // At least one should be 429 (Too Many Requests)
      expect(statusCodes).toContain(429);
    });
  });
});
