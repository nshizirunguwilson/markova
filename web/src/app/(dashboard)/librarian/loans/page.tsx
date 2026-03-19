"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
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

export default function LibrarianLoansPage() {
  const [tab, setTab] = useState<"active" | "overdue">("active");
  const { data: activeLoans, isLoading: loadingActive } = useActiveLoans();
  const { data: overdueLoans, isLoading: loadingOverdue } = useOverdueLoans();

  const loans = tab === "active" ? activeLoans : overdueLoans;
  const loading = tab === "active" ? loadingActive : loadingOverdue;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Loans</h1>
        <p className="text-sm text-muted">Track active and overdue book loans</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("active")}
          className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "active" ? "border-primary text-primary" : "border-transparent text-muted"
          }`}
        >
          <BookOpen className="h-4 w-4" /> Active ({activeLoans?.length || 0})
        </button>
        <button
          onClick={() => setTab("overdue")}
          className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "overdue" ? "border-primary text-primary" : "border-transparent text-muted"
          }`}
        >
          <AlertTriangle className="h-4 w-4" /> Overdue ({overdueLoans?.length || 0})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
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
                const isOverdue = new Date(loan.dueDate) < new Date();
                const daysUntilDue = Math.ceil((new Date(loan.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <TableRow key={loan.id}>
                    <TableCell>
                      <p className="font-medium">{loan.book.title}</p>
                      <p className="text-xs text-muted">{loan.book.author}</p>
                    </TableCell>
                    <TableCell>{loan.borrower.firstName} {loan.borrower.lastName}</TableCell>
                    <TableCell className="text-sm">{new Date(loan.checkedOutAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm">{new Date(loan.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {isOverdue ? (
                        <Badge variant="danger">{Math.abs(daysUntilDue)} days overdue</Badge>
                      ) : daysUntilDue <= 2 ? (
                        <Badge variant="warning">Due in {daysUntilDue} day{daysUntilDue !== 1 ? "s" : ""}</Badge>
                      ) : (
                        <Badge variant="success">{daysUntilDue} days left</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card><p className="text-center text-muted py-8">No {tab} loans.</p></Card>
      )}
    </div>
  );
}
