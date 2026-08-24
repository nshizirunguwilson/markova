import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './storage';

/**
 * Where the phone keeps a session.
 *
 * On a device this is the keychain, which survives the app being killed and is
 * encrypted by the OS. On web there is no keychain, so it falls back to
 * localStorage. Both halves matter: a token written to the wrong place is a
 * user who is signed out every time they open the app.
 */

const secure = SecureStore as jest.Mocked<typeof SecureStore> & {
  __store: Map<string, string>;
};

describe('the token store on a phone', () => {
  beforeEach(() => {
    secure.__store.clear();
    jest.clearAllMocks();
  });

  it('keeps a signed-in session in the keychain', async () => {
    await setTokens('access-abc', 'refresh-xyz');

    expect(secure.setItemAsync).toHaveBeenCalledWith(
      'access_token',
      'access-abc',
    );
    expect(secure.setItemAsync).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-xyz',
    );
  });

  it('reads back what it wrote', async () => {
    await setTokens('access-abc', 'refresh-xyz');

    await expect(getAccessToken()).resolves.toBe('access-abc');
    await expect(getRefreshToken()).resolves.toBe('refresh-xyz');
  });

  it('has nothing to hand back before anybody signs in', async () => {
    await expect(getAccessToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  // Signing out has to remove both. Leaving the refresh token behind would let
  // the next person on the phone mint a fresh session.
  it('removes both tokens when the session ends', async () => {
    await setTokens('access-abc', 'refresh-xyz');
    await clearTokens();

    expect(secure.deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(secure.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
    await expect(getAccessToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });
});

describe('the token store on the web', () => {
  const localStore = new Map<string, string>();

  beforeAll(() => {
    (globalThis as any).localStorage = {
      getItem: (k: string) => localStore.get(k) ?? null,
      setItem: (k: string, v: string) => localStore.set(k, v),
      removeItem: (k: string) => localStore.delete(k),
    };
  });

  beforeEach(() => {
    localStore.clear();
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  it('falls back to the browser, where there is no keychain', async () => {
    await setTokens('access-web', 'refresh-web');

    expect(secure.setItemAsync).not.toHaveBeenCalled();
    expect(localStore.get('access_token')).toBe('access-web');
    await expect(getAccessToken()).resolves.toBe('access-web');
    await expect(getRefreshToken()).resolves.toBe('refresh-web');
  });

  it('clears the browser copy too', async () => {
    await setTokens('access-web', 'refresh-web');
    await clearTokens();

    expect(secure.deleteItemAsync).not.toHaveBeenCalled();
    expect(localStore.size).toBe(0);
  });
});
