"use client";

import { GuestGuard } from "@/components/layout/guest-guard";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GuestGuard>{children}</GuestGuard>;
}
