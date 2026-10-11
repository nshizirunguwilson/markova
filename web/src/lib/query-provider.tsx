"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { errorMessage } from "./errors";
import { keptPrivate } from "./kept-private";

/**
 * A failed read used to be silent.
 *
 * Most pages render `data ?? []`, so a request that failed looked exactly like
 * a school with no records: an empty table and no explanation. A teacher would
 * reasonably conclude the marks were gone. Reporting it once, here, covers
 * every query in the app rather than asking 57 pages to remember.
 *
 * Only the first failure in a burst is announced. A dashboard fires several
 * queries at once and a dropped connection fails all of them; six identical
 * toasts say nothing the first one did not.
 */
const REPEAT_WINDOW_MS = 4000;

export function createQueryClient() {
  let lastMessage = "";
  let lastAt = 0;

  const announce = (error: unknown, fallback: string) => {
    const message = errorMessage(error, fallback);
    const now = Date.now();
    if (message === lastMessage && now - lastAt < REPEAT_WINDOW_MS) return;
    lastMessage = message;
    lastAt = now;
    toast.error(message);
  };

  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // A query that has data already is refetching in the background. The
        // screen still shows something usable, so shouting about it would be
        // noise; the stale data is the better outcome.
        if (query.state.data !== undefined) return;
        // 401 is the session expiring. The axios interceptor already handles
        // that path, including the redirect, so it must not be doubled here.
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        if (status === 401) return;
        /* Something an adult child keeps from their parents is not a fault:
           the page says so calmly, and a red alert would say the opposite. */
        if (keptPrivate(error)) return;
        announce(error, "Could not load this. Please try again.");
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        // Hooks that report their own failures keep doing so; this is only for
        // the ones that never did.
        if (mutation.options.onError) return;
        announce(error, "That did not save. Please try again.");
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
