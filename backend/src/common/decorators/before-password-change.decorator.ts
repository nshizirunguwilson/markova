import { SetMetadata } from '@nestjs/common';

export const BEFORE_PASSWORD_CHANGE_KEY = 'openBeforePasswordChange';

/**
 * A route somebody on a temporary password may use before changing it.
 *
 * Only what the change itself needs: reading who they are, changing the
 * password, and signing out. Everything else answers that the password has
 * to be changed first. See PasswordChangeInterceptor.
 */
export const OpenBeforePasswordChange = () =>
  SetMetadata(BEFORE_PASSWORD_CHANGE_KEY, true);
