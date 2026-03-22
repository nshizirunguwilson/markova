import { create } from 'zustand';
import api from '@/lib/api';
import { setTokens, clearTokens, getAccessToken } from '@/lib/storage';
import type { UserRole } from '@/constants/config';

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

  login: (email: string, password: string) => Promise<{ needsOtp: boolean }>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
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

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });

    if (data.requiresOtp) {
      set({ needsOtp: true, pendingEmail: email });
      return { needsOtp: true };
    }

    // Direct login (no OTP required)
    await setTokens(data.accessToken ?? data.access_token, data.refreshToken ?? data.refresh_token);
    set({ isAuthenticated: true, needsOtp: false, pendingEmail: null });
    await get().loadProfile();
    return { needsOtp: false };
  },

  verifyOtp: async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    await setTokens(data.accessToken ?? data.access_token, data.refreshToken ?? data.refresh_token);
    set({ isAuthenticated: true, needsOtp: false, pendingEmail: null });
    await get().loadProfile();
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
      return true;
    } catch {
      set({ isLoading: false, isAuthenticated: false });
      return false;
    }
  },
}));
