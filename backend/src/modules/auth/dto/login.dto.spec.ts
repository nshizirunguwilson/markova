import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto, LoginDto, ResetPasswordDto } from './login.dto';

/**
 * bcrypt reads at most 72 bytes. Without an explicit cap the extra characters
 * were silently ignored, so a password and a completely different one sharing a
 * 72 byte prefix hashed identically. These pin the cap in place.
 */
const failures = (dto: object, field: string) =>
  validateSync(dto as never).filter((e) => e.property === field);

describe('password length limits', () => {
  const strong = 'Aa1!aaaa';

  it('accepts a password at exactly the bcrypt limit', () => {
    const dto = plainToInstance(LoginDto, {
      email: 'aline.uwase@markova.edu',
      password: 'a'.repeat(72),
    });
    expect(failures(dto, 'password')).toHaveLength(0);
  });

  it('rejects a login password past the bcrypt limit', () => {
    const dto = plainToInstance(LoginDto, {
      email: 'aline.uwase@markova.edu',
      password: 'a'.repeat(73),
    });
    expect(failures(dto, 'password')).not.toHaveLength(0);
  });

  it('rejects an over-long current password on change', () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'a'.repeat(73),
      newPassword: strong,
    });
    expect(failures(dto, 'currentPassword')).not.toHaveLength(0);
  });

  it('rejects an over-long new password on change', () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: strong,
      newPassword: `${strong}${'a'.repeat(73)}`,
    });
    expect(failures(dto, 'newPassword')).not.toHaveLength(0);
  });

  it('rejects an over-long new password on reset', () => {
    const dto = plainToInstance(ResetPasswordDto, {
      token: 'reset-token',
      newPassword: `${strong}${'a'.repeat(73)}`,
    });
    expect(failures(dto, 'newPassword')).not.toHaveLength(0);
  });

  it('still accepts an ordinary strong password', () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'Password123!',
      newPassword: 'Umunyeshuri2026!',
    });
    expect(validateSync(dto as never)).toHaveLength(0);
  });
});
