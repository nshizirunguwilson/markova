import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const API_URL = extra.apiUrl ?? 'http://localhost:3000/api';
export const WS_URL = extra.wsUrl ?? 'http://localhost:3000';

export const TOKEN_KEYS = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
} as const;

/**
 * The roles that may sign in on a phone.
 *
 * Boarding staff belong here more than anyone: a matron holding a child's
 * money in the dormitory or walking one to the sick bay is never at a desk.
 * Students are still excluded, see MOBILE_BLOCKED_ROLES.
 */
export const ROLES = [
  'ADMIN',
  'TEACHER',
  'PARENT',
  'LIBRARIAN',
  'PATRON',
  'MATRON',
  'NURSE',
] as const;
export type UserRole = (typeof ROLES)[number];
