import { create } from "zustand";

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "PARENT" | "LIBRARIAN";
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  forcePasswordChange: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
