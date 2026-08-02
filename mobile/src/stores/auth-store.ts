import { create } from 'zustand';
import api from '@/lib/api';
import { setTokens, clearTokens, getAccessToken } from '@/lib/storage';
import type { UserRole } from '@/constants/config';

// The mobile app is for staff and parents. Students use the web dashboard,
// which has ten screens built for them that this app deliberately does not.
// The API can still return STUDENT, so the block happens here rather than
// being assumed away.
//
// A blocked sign in is not an error. The credentials were correct and the
// person did nothing wrong, so instead of throwing a red toast the store
// records who it was and the router shows them a screen that explains it.
const MOBILE_BLOCKED_ROLES: string[] = ['STUDENT'];

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
  /** Set when a correct sign in belongs to a role the phone does not serve. */
  blockedRole: string | null;
  blockedName: string | null;

  /** Takes an email or a phone number. Works out which and sends the right field. */
  login: (identifier: string, password: string) => Promise<{ needsOtp: boolean; blocked?: boolean }>;
  verifyOtp: (otp: string) => Promise<{ blocked?: boolean }>;
  clearBlock: () => Promise<void>;
  resendOtp: () => Promise<void>;
  loadProfile: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  captureBlockedRole: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  needsOtp: false,
  pendingEmail: null,
  pendingSessionId: null,
  blockedRole: null,
  blockedName: null,

  login: async (identifier, password) => {
    // The API takes email and phone as separate optional fields and runs a
    // whitelisting validation pipe, so sending one combined "identifier" is a
    // 400. Splitting it here rather than at the screen means every caller
    // gets phone sign in, which parents use far more than email.
    const credential = identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier };
    const { data } = await api.post('/auth/login', { ...credential, password });

    if (data.requiresOtp) {
      // Backend OTP is session-based — keep the sessionId for verify/resend
      set({ needsOtp: true, pendingEmail: identifier, pendingSessionId: data.sessionId });
      return { needsOtp: true };
    }

    // Direct login (no OTP required — students). Verify the role is permitted
    // on mobile before we keep the session.
    await setTokens(data.accessToken ?? data.access_token, data.refreshToken ?? data.refresh_token);
    set({ needsOtp: false, pendingEmail: null });
    await get().loadProfile();
    if (await get().captureBlockedRole()) return { needsOtp: false, blocked: true };
    set({ isAuthenticated: true });
    return { needsOtp: false };
  },

  verifyOtp: async (otp) => {
    const sessionId = get().pendingSessionId;
    const { data } = await api.post('/auth/verify-otp', { sessionId, otp });
    await setTokens(data.accessToken ?? data.access_token, data.refreshToken ?? data.refresh_token);
    set({ needsOtp: false, pendingEmail: null, pendingSessionId: null });
    await get().loadProfile();
    if (await get().captureBlockedRole()) return { blocked: true };
    set({ isAuthenticated: true });
    return {};
  },

  /**
   * Remembers who was turned away before the tokens are thrown out, so the
   * screen that follows can greet them by name rather than by error code.
   */
  captureBlockedRole: async () => {
    const user = get().user;
    if (!user || !MOBILE_BLOCKED_ROLES.includes(String(user.role))) return false;
    const role = String(user.role);
    const name = user.firstName ?? null;
    await get().logout();
    set({ blockedRole: role, blockedName: name });
    return true;
  },

  clearBlock: async () => {
    set({ blockedRole: null, blockedName: null });
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
      if (await get().captureBlockedRole()) return false;
      return true;
    } catch {
      set({ isLoading: false, isAuthenticated: false });
      return false;
    }
  },
}));
