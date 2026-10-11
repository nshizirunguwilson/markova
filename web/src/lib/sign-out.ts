import type { QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { forgetTokens, isShared, refreshToken } from "@/lib/session";
import { clearPendingMarks } from "@/lib/offline-db";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";

/**
 * Signing out, properly.
 *
 * The server is told, so the session ends there too: a refresh token left
 * in a lab computer's browser is worth nothing afterwards. Then everything
 * this browser held for the person goes: their tokens, every page it had
 * loaded, the chat. Marks saved for offline stay on somebody's own computer,
 * tagged as theirs, until they are sent; none are ever kept on a shared one.
 *
 * `everywhere` ends every session the person has, on every device: for the
 * student who forgot to sign out in the lab.
 */
export async function signOut(
  queryClient?: QueryClient,
  options: { everywhere?: boolean } = {},
) {
  const held = refreshToken();
  const shared = isShared();
  try {
    await api.post(
      "/auth/logout",
      options.everywhere ? { everywhere: true } : { refreshToken: held ?? undefined },
      { timeout: 5000 },
    );
  } catch {
    /* Offline, or already signed out on the server. The browser still
       forgets everything below; the session runs out on its own. */
  }
  useChatStore.getState().disconnect();
  queryClient?.clear();
  if (shared) await clearPendingMarks().catch(() => undefined);
  forgetTokens();
  useAuthStore.getState().logout();
}
