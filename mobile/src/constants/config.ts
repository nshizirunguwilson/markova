import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const API_URL = extra.apiUrl ?? 'http://localhost:3000/api';
export const WS_URL = extra.wsUrl ?? 'http://localhost:3000';

export const TOKEN_KEYS = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
} as const;

export const ROLES = ['ADMIN', 'TEACHER', 'PARENT', 'LIBRARIAN'] as const;
export type UserRole = (typeof ROLES)[number];
