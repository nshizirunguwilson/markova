"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Card, CardTitle } from "@/components/ui";
import Link from "next/link";
import {
  ClipboardList,
  Calendar,
  Award,
  FileText,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export default function ParentDashboard() {
  const user = useAuthStore((s) => s.user);

  const quickLinks = [
    { label: "View Marks", href: "/parent/marks", icon: ClipboardList },
    { label: "Attendance", href: "/parent/attendance", icon: Calendar },
    { label: "Discipline", href: "/parent/discipline", icon: Award },
    { label: "Reports", href: "/parent/reports", icon: FileText },
  ];

  return (
    <div>
      <div className="mb-8">
        <PageHeader
          title={<>Welcome back, {user?.firstName}</>}
          description="Parent Dashboard"
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardTitle>Quick Actions</CardTitle>
          <p className="mt-1 text-sm text-muted">
            Access your children&apos;s information
          </p>
          <div className="mt-4 space-y-2">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/10"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="h-5 w-5 text-primary" />
                  {link.label}
                </div>
                <ArrowRight className="h-4 w-4 text-muted" />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>My Children</CardTitle>
          <p className="mt-1 text-sm text-muted">
            Use the links on the left to view marks, attendance, discipline records,
            and report cards for your children.
          </p>
        </Card>
      </div>
    </div>
  );
}
