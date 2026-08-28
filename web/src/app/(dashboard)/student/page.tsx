"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Card, CardTitle, PageSpinner } from "@/components/ui";
import { useMyLoans } from "@/hooks/use-library";
import Link from "next/link";
import {
  Award,
  BookOpen,
  ClipboardList,
  Library,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export default function StudentDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: myLoans, isLoading } = useMyLoans();

  if (isLoading) return <PageSpinner />;

  const loansList: any[] = myLoans ?? [];
  const activeLoans = loansList.filter((l: any) => !l.returnedAt);
  const disciplinePoints = (user as any)?.student?.disciplinePoints ?? (user as any)?.disciplinePoints ?? 100;

  const quickLinks = [
    { label: "My Marks", href: "/student/marks", icon: ClipboardList },
    { label: "Homework", href: "/student/homework", icon: BookOpen },
    { label: "Library", href: "/student/library", icon: Library },
    { label: "Attendance", href: "/student/attendance", icon: Calendar },
  ];

  return (
    <div>
      <div className="mb-8">
        <PageHeader
          title={<>Welcome back, {user?.firstName}</>}
          description="Student Dashboard"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Discipline Points
          </CardTitle>
          <p className="mt-3 text-3xl font-bold text-foreground">
            {disciplinePoints}
            <span className="text-lg font-normal text-muted"> / 100</span>
          </p>
          <div className="mt-3 h-2 rounded-full bg-surface-muted">
            <div
              className={`h-2 rounded-full motion-bar ${
                disciplinePoints >= 70
                  ? "bg-success"
                  : disciplinePoints >= 40
                    ? "bg-warning"
                    : "bg-danger"
              }`}
              style={{ width: `${Math.min(disciplinePoints, 100)}%` }}
            />
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            My Loans
          </CardTitle>
          <p className="mt-3 text-3xl font-bold text-foreground">
            {activeLoans.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {activeLoans.length === 1 ? "active loan" : "active loans"}
          </p>
        </Card>

        <Card>
          <CardTitle>Quick Links</CardTitle>
          <div className="mt-3 space-y-2">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/10"
              >
                <div className="flex items-center gap-2">
                  <link.icon className="h-4 w-4 text-primary" />
                  {link.label}
                </div>
                <ArrowRight className="h-4 w-4 text-muted" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
