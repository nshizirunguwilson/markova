import { create } from 'zustand';
import api from '@/lib/api';
import { setTokens, clearTokens, getAccessToken } from '@/lib/storage';
import type { UserRole } from '@/constants/config';

// The mobile app is for staff and parents. Students use the web portal.
// (The API can return STUDENT even though the mobile UserRole type omits it.)
const MOBILE_BLOCKED_ROLES: string[] = ['STUDENT'];
const MOBILE_BLOCK_MESSAGE =
  'The mobile app is for staff and parents. Students, please use the web portal.';

function buildBlockedError() {
  // Shaped so the existing screens' `error.response.data.message` path shows it.
  const err: any = new Error(MOBILE_BLOCK_MESSAGE);
  err.response = { data: { message: MOBILE_BLOCK_MESSAGE } };
  return err;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  photoUrl?: string;
  isActive: boolean;
  studentId?: string;
  classSectionId?: string;
  teacherId?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsOtp: boolean;
  pendingEmail: string | null;
  pendingSessionId: string | null;

  login: (email: string, password: string) => Promise<{ needsOtp: boolean }>;
  verifyOtp: (otp: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  loadProfile: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  needsOtp: false,
  pendingEmail: null,
  pendingSessionId: null,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });

    if (data.requiresOtp) {
      // Backend OTP is session-based — keep the sessionId for verify/resend
      set({ needsOtp: true, pendingEmail: email, pendingSessionId: data.sessionId });
      return { needsOtp: true };
    }

    // Direct login (no OTP required — students). Verify the role is permitted
    // on mobile before we keep the session.
    await setTokens(data.accessToken ?? data.access_token, data.refreshToken ?? data.refresh_token);
    set({ needsOtp: false, pendingEmail: null });
    await get().loadProfile();
    if (MOBILE_BLOCKED_ROLES.includes(String(get().user?.role))) {
      await get().logout();
      throw buildBlockedError();
    }
    set({ isAuthenticated: true });
    return { needsOtp: false };
  },

  verifyOtp: async (otp) => {
    const sessionId = get().pendingSessionId;
    const { data } = await api.post('/auth/verify-otp', { sessionId, otp });
    await setTokens(data.accessToken ?? data.access_token, data.refreshToken ?? data.refresh_token);
    set({ needsOtp: false, pendingEmail: null, pendingSessionId: null });
    await get().loadProfile();
    if (MOBILE_BLOCKED_ROLES.includes(String(get().user?.role))) {
      await get().logout();
      throw buildBlockedError();
    }
    set({ isAuthenticated: true });
  },

  resendOtp: async () => {
    const sessionId = get().pendingSessionId;
    const { data } = await api.post('/auth/resend-otp', { sessionId });
    // Backend reuses the same session; keep whatever it returns just in case
    if (data?.sessionId) set({ pendingSessionId: data.sessionId });
  },

  loadProfile: async () => {
    try {
      const { data } = await api.get('/auth/profile');
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout API errors
    }
    await clearTokens();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      needsOtp: false,
      pendingEmail: null,
      pendingSessionId: null,
    });
  },

  checkAuth: async () => {
    const token = await getAccessToken();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return false;
    }
    try {
      await get().loadProfile();
      if (MOBILE_BLOCKED_ROLES.includes(String(get().user?.role))) {
        await get().logout();
        return false;
      }
      return true;
    } catch {
      set({ isLoading: false, isAuthenticated: false });
      return false;
    }
  },
}));
