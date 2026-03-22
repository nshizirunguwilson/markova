import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEYS } from '@/constants/config';

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEYS.refreshToken);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEYS.accessToken, accessToken);
  await SecureStore.setItemAsync(TOKEN_KEYS.refreshToken, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEYS.accessToken);
  await SecureStore.deleteItemAsync(TOKEN_KEYS.refreshToken);
}
