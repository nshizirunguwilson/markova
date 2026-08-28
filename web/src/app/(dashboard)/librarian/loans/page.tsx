"use client";

import { useState } from "react";
import {
  Card,
  Badge,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { useActiveLoans, useOverdueLoans } from "@/hooks/use-library";
import { BookOpen, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useToday, daysFromToday } from "@/hooks/use-today";

export default function LibrarianLoansPage() {
  const today = useToday();
  const [tab, setTab] = useState<"active" | "overdue">("active");
  const { data: activeLoans, isLoading: loadingActive } = useActiveLoans();
  const { data: overdueLoans, isLoading: loadingOverdue } = useOverdueLoans();

  const loans = tab === "active" ? activeLoans : overdueLoans;
  const loading = tab === "active" ? loadingActive : loadingOverdue;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Borrowed books"
        description="See which books are out and which are late"
      />

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("active")}
          className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "active"
              ? "border-primary text-primary"
              : "border-transparent text-muted"
          }`}
        >
          <BookOpen className="h-4 w-4" /> Active ({activeLoans?.length || 0})
        </button>
        <button
          onClick={() => setTab("overdue")}
          className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "overdue"
              ? "border-primary text-primary"
              : "border-transparent text-muted"
          }`}
        >
          <AlertTriangle className="h-4 w-4" /> Overdue (
          {overdueLoans?.length || 0})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : loans?.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Checked Out</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((loan: any) => {
                const daysUntilDue = daysFromToday(loan.dueDate, today);
                const isOverdue = daysUntilDue < 0;
                return (
                  <TableRow key={loan.id}>
                    <TableCell>
                      <p className="font-medium">{loan.book?.title ?? "Unknown book"}</p>
                      <p className="text-xs text-muted">{loan.book?.author ?? ""}</p>
                    </TableCell>
                    <TableCell>
                      {loan.borrower?.firstName ?? ""} {loan.borrower?.lastName ?? ""}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(loan.checkedOutAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(loan.dueDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {isOverdue ? (
                        <Badge variant="danger">
                          {Math.abs(daysUntilDue)} days overdue
                        </Badge>
                      ) : daysUntilDue <= 2 ? (
                        <Badge variant="warning">
                          Due in {daysUntilDue} day
                          {daysUntilDue !== 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          {daysUntilDue} days left
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <p className="text-center text-muted py-8">
            {tab === "active" ? "No books are out." : "Nothing is late."}
          </p>
        </Card>
      )}
    </div>
  );
}
