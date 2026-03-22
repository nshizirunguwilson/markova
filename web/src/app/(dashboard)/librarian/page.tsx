"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Card, CardTitle, PageSpinner } from "@/components/ui";
import { useLibraryAnalytics } from "@/hooks/use-library";
import Link from "next/link";
import {
  BookOpen,
  BookMarked,
  AlertTriangle,
  BarChart3,
  ArrowRight,
} from "lucide-react";

export default function LibrarianDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: analytics, isLoading } = useLibraryAnalytics();

  if (isLoading) return <PageSpinner />;

  const statCards = [
    {
      label: "Total Books",
      value: analytics?.totalBooks ?? 0,
      icon: BookOpen,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Active Loans",
      value: analytics?.activeLoans ?? 0,
      icon: BookMarked,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Overdue",
      value: analytics?.overdueLoans ?? 0,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50",
    },
    {
      label: "Total Checkouts",
      value: analytics?.totalCheckouts ?? 0,
      icon: BarChart3,
      color: "text-violet-600 bg-violet-50",
    },
  ];

  const quickLinks = [
    { label: "Books Catalog", href: "/librarian/books", icon: BookOpen },
    { label: "Checkout / Return", href: "/librarian/loans", icon: BookMarked },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">
          Welcome back, {user?.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">Librarian Dashboard</p>
      </div>

      <div className="grid grid-cols-4 gap-5">
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

      <div className="mt-8">
        <Card>
          <CardTitle>Quick Links</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-lg border border-border p-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/10"
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
      </div>
    </div>
  );
}
