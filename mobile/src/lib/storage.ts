import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEYS } from '@/constants/config';

// expo-secure-store does not work on web, so fall back to localStorage
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export async function getAccessToken(): Promise<string | null> {
  return storage.getItem(TOKEN_KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return storage.getItem(TOKEN_KEYS.refreshToken);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await storage.setItem(TOKEN_KEYS.accessToken, accessToken);
  await storage.setItem(TOKEN_KEYS.refreshToken, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await storage.deleteItem(TOKEN_KEYS.accessToken);
  await storage.deleteItem(TOKEN_KEYS.refreshToken);
}
