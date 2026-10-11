import { create } from "zustand";
import type { Role } from "@/types";
import type { SchoolRef } from "@/lib/schools";
import type { StudentStatus } from "@/lib/standing";

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
  /* The person's own signature, uploaded from their own profile. Distinct
     from the school's, which lives in the branding settings: a report card
     carries a class teacher's mark and a head teacher's, and one file shared
     between them would put the same hand under both names. */
  signatureUrl?: string | null;
  forcePasswordChange: boolean;
  /* The school this record belongs to: the one open now. */
  school?: SchoolRef;
  /* How the person signs in, shared with all their schools. From the
     profile only; distinct from `email` and `phone`, which are this
     school's contact details for them. */
  login?: { email: string | null; phone: string | null };
  // Flattened from student/teacher relations (set by getProfile)
  studentId?: string;
  classSectionId?: string;
  /* A student who has left sees only their report cards: see
     lib/standing.ts. */
  studentStatus?: StudentStatus;
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
