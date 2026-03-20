"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Card, CardTitle, PageSpinner } from "@/components/ui";
import { TooltipGuide } from "@/components/ui/tooltip-guide";
import { useAdminDashboard } from "@/hooks/use-analytics";
import { useAttendanceDashboard } from "@/hooks/use-attendance";
import { useFeeSummary } from "@/hooks/use-fees";
import { useLibraryAnalytics } from "@/hooks/use-library";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  UserCheck,
  BookOpen,
  Calendar,
  DollarSign,
  Library,
  UserPlus,
  ClipboardList,
  BookMarked,
  PenLine,
  BarChart3,
} from "lucide-react";

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: dashboard, isLoading: loadingDashboard } = useAdminDashboard();
  const { data: attendance, isLoading: loadingAttendance } = useAttendanceDashboard(
    new Date().toISOString().slice(0, 10)
  );
  const { data: fees, isLoading: loadingFees } = useFeeSummary();
  const { data: library, isLoading: loadingLibrary } = useLibraryAnalytics();

  const isLoading = loadingDashboard && loadingAttendance && loadingFees && loadingLibrary;

  if (isLoading) return <PageSpinner />;

  const attendanceRate =
    attendance?.totalStudents > 0
      ? Math.round((attendance.presentCount / attendance.totalStudents) * 100)
      : 0;

  const feeCollectionRate =
    fees?.totalExpected > 0
      ? Math.round((fees.totalCollected / fees.totalExpected) * 100)
      : 0;

  const statCards = [
    {
      label: "Total Students",
      value: dashboard?.totalStudents ?? "—",
      icon: GraduationCap,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Total Teachers",
      value: dashboard?.totalTeachers ?? "—",
      icon: UserCheck,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Total Users",
      value: dashboard?.totalUsers ?? "—",
      icon: Users,
      color: "text-violet-600 bg-violet-50",
    },
    {
      label: "Subjects",
      value: dashboard?.totalSubjects ?? "—",
      icon: BookOpen,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Attendance Today",
      value: attendance ? `${attendanceRate}%` : "—",
      icon: Calendar,
      color: "text-cyan-600 bg-cyan-50",
    },
    {
      label: "Fee Collection",
      value: fees ? `${feeCollectionRate}%` : "—",
      icon: DollarSign,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "Books on Loan",
      value: library?.activeLoans ?? "—",
      icon: Library,
      color: "text-orange-600 bg-orange-50",
    },
  ];

  const quickActions = [
    { label: "Add Student", href: "/admin/users", icon: UserPlus },
    { label: "Record Attendance", href: "/admin/attendance", icon: ClipboardList },
    { label: "Manage Library", href: "/admin/library", icon: BookMarked },
    { label: "Enter Marks", href: "/admin/marks", icon: PenLine },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Here&apos;s an overview of your school
        </p>
      </div>

      <div data-guide="stat-cards" className="grid grid-cols-4 gap-5">
        {statCards.map((card) => (
          <Card key={card.label} padding="md" className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.color}`}
            >
              <card.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted">{card.label}</p>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <Card>
          <CardTitle data-guide="quick-actions">Quick Actions</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/10"
              >
                <action.icon className="h-5 w-5 text-primary" />
                {action.label}
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle data-guide="at-a-glance" className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            At a Glance
          </CardTitle>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Attendance Rate (Today)</span>
              <span className="text-sm font-semibold text-foreground">
                {attendance ? `${attendanceRate}%` : "—"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-cyan-500 transition-all"
                style={{ width: `${attendanceRate}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Fee Collection Rate</span>
              <span className="text-sm font-semibold text-foreground">
                {fees ? `${feeCollectionRate}%` : "—"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: `${feeCollectionRate}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Library: Active Loans</span>
              <span className="text-sm font-semibold text-foreground">
                {library?.activeLoans ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Library: Overdue</span>
              <span className="text-sm font-semibold text-foreground">
                {library?.overdueLoans ?? 0}
              </span>
            </div>
          </div>
        </Card>
      </div>
      <TooltipGuide
        id="admin-dashboard"
        steps={[
          {
            target: "[data-guide='stat-cards']",
            title: "School Overview",
            content: "These cards show real-time stats for your school — students, teachers, attendance, and fees at a glance.",
          },
          {
            target: "[data-guide='quick-actions']",
            title: "Quick Actions",
            content: "Jump to common tasks like adding students, recording attendance, or entering marks.",
          },
          {
            target: "[data-guide='at-a-glance']",
            title: "Performance Snapshot",
            content: "Track attendance rates, fee collection, and library status in real time.",
          },
        ]}
      />
    </div>
  );
}
