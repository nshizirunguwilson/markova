/**
 * Which kind of token a JWT is.
 *
 * Lives in its own file so the Passport strategy can read it without importing
 * AuthService, which would pull the whole service graph into the strategy and
 * make the two modules circular.
 */
export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';
