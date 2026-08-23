import { create } from "zustand";
import type { Role } from "@/types";

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  // The one definition lives in @/types, so a new role never has to be
  // added in two places again.
  role: Role;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  forcePasswordChange: boolean;
  // Flattened from student/teacher relations (set by getProfile)
  studentId?: string;
  classSectionId?: string;
  teacherId?: string;
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
