"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";

export function useSocketConnection() {
  const { isAuthenticated, user } = useAuthStore();
  const { connect, disconnect } = useChatStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isAuthenticated && user) {
      const token = localStorage.getItem("access_token");
      if (token) {
        connect(token, queryClient);
      }
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
