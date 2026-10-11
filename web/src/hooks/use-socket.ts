"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { isFormerStudent } from "@/lib/navigation";

export function useSocketConnection() {
  const { isAuthenticated, user } = useAuthStore();
  const { connect, disconnect } = useChatStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    // A student who has left has no part in the school's chat any more.
    if (isAuthenticated && user && !isFormerStudent(user)) {
      const token = localStorage.getItem("access_token");
      if (token) {
        connect(token, queryClient, user.id);
      }
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
