import axios from "axios";
import { toast } from "sonner";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - attach JWT
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth endpoints whose own 4xx responses are handled by the calling form
// (wrong password, wrong OTP, expired reset link, …). These must NOT trigger
// the session-refresh / redirect logic below - otherwise a failed login looks
// like an "expired session" and the page reloads before the real error shows.
const AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/verify-otp",
  "/auth/refresh",
  "/auth/request-reset",
  "/auth/reset-password",
];

// Response interceptor - handle 401 and refresh
//
// The refresh is single-flight: the backend rotates refresh tokens and treats
// a second use of the same token as a replay attack (it deactivates the whole
// session). When several requests hit 401 at once, they must all share one
// refresh call instead of racing each other into a forced logout.
let refreshPromise: Promise<string> | null = null;

function refreshSession(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = localStorage.getItem("refresh_token");
      const { data } = await axios.post(
        `${api.defaults.baseURL}/auth/refresh`,
        { refreshToken }
      );
      localStorage.setItem("access_token", data.accessToken);
      localStorage.setItem("refresh_token", data.refreshToken);
      return data.accessToken as string;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url: string = originalRequest?.url || "";
    const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => url.includes(p));

    // Let auth forms surface their own errors.
    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem("refresh_token");
      // Not logged in - nothing to refresh. Reject quietly; route guards handle
      // sending the user to /login. Avoids a redirect loop on public pages.
      if (!refreshToken) {
        return Promise.reject(error);
      }

      try {
        const accessToken = await refreshSession();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // A network blip is not an expired session. Keep the tokens so a later
        // attempt can refresh again; only a real rejection from the API ends
        // the session.
        if (axios.isAxiosError(refreshError) && refreshError.response) {
          toast.error("Your session has expired. Please log in again.");
          redirectToLogin();
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

function redirectToLogin() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

export default api;
