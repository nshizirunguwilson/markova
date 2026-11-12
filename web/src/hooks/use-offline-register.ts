"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "@/lib/api";
import {
  SharedComputerError,
  deletePendingRegister,
  getPendingRegisters,
  savePendingRegister,
} from "@/lib/offline-db";

/** Whether a failed save never reached the server: the case to keep it for. */
export function neverArrived(error: unknown): boolean {
  const e = error as { isAxiosError?: boolean; response?: unknown };
  return !!e?.isAxiosError && !e.response;
}

/**
 * Registers taken while the connection is down, kept on this device and
 * sent when it comes back. See savePendingRegister.
 */
export function useOfflineRegister(owner?: string) {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const sending = useRef(false);

  const recount = useCallback(
    () =>
      getPendingRegisters(owner)
        .then((all) => setPending(all.length))
        .catch(() => undefined),
    [owner],
  );

  const send = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      const queued = await getPendingRegisters(owner);
      if (queued.length === 0) return;
      let sent = 0;
      // Oldest first, so a register taken twice ends as the later one.
      for (const entry of queued) {
        const { id, savedAt: _savedAt, owner: _owner, ...payload } = entry;
        try {
          await api.post("/attendance/bulk", payload);
          await deletePendingRegister(id);
          sent++;
        } catch {
          // Kept for the next time the connection comes back.
        }
      }
      await recount();
      qc.invalidateQueries({ queryKey: ["class-attendance"] });
      if (sent === queued.length) {
        toast.success(
          sent === 1 ? "The register taken offline has been saved" : `${sent} registers taken offline have been saved`,
        );
      } else {
        toast.warning(`Saved ${sent} of ${queued.length} registers. The rest will be tried again.`);
      }
    } catch {
      // The device's storage could not be read; nothing to send.
    } finally {
      sending.current = false;
    }
  }, [owner, qc, recount]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    recount();
  }, [recount]);

  useEffect(() => {
    if (online) send();
  }, [online, send]);

  /** Keep this register on the device until it can be sent. */
  const keep = useCallback(
    async (payload: object) => {
      try {
        await savePendingRegister(payload, owner);
        await recount();
        toast.info("No connection. The register is kept on this device and will be saved when you are back online.");
        return true;
      } catch (e) {
        toast.error(e instanceof SharedComputerError ? e.message : "Could not keep the register on this device");
        return false;
      }
    },
    [owner, recount],
  );

  return { online, pending, keep, send };
}
