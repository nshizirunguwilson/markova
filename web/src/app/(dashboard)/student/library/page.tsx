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
import { useBooks, useMyLoans } from "@/hooks/use-library";
import { BookOpen, Library, Search } from "lucide-react";

export default function StudentLibraryPage() {
  const [tab, setTab] = useState<"loans" | "catalog">("loans");
  const [search, setSearch] = useState("");
  const { data: myLoans, isLoading: loadingLoans } = useMyLoans();
  const { data: books, isLoading: loadingBooks } = useBooks(search ? { search } : undefined);

  const activeLoans = myLoans?.filter((l: any) => l.status === "ACTIVE") || [];
  const history = myLoans?.filter((l: any) => l.status !== "ACTIVE") || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Library</h1>
        <p className="text-sm text-muted">Your loans and book catalog</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("loans")}
          className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "loans" ? "border-primary text-primary" : "border-transparent text-muted"
          }`}
        >
          <BookOpen className="h-4 w-4" /> My Loans ({activeLoans.length})
        </button>
        <button
          onClick={() => setTab("catalog")}
          className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "catalog" ? "border-primary text-primary" : "border-transparent text-muted"
          }`}
        >
          <Library className="h-4 w-4" /> Catalog
        </button>
      </div>

      {tab === "loans" && (
        <>
          {loadingLoans ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <>
              {/* Active Loans */}
              <Card>
                <CardTitle>Active Loans ({activeLoans.length})</CardTitle>
                {activeLoans.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {activeLoans.map((loan: any) => {
                      const daysUntilDue = Math.ceil((new Date(loan.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      const isOverdue = daysUntilDue < 0;
                      return (
                        <div key={loan.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                          <div>
                            <p className="font-medium text-foreground">{loan.book.title}</p>
                            <p className="text-xs text-muted">{loan.book.author}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted">Due: {new Date(loan.dueDate).toLocaleDateString()}</p>
                            {isOverdue ? (
                              <Badge variant="danger">{Math.abs(daysUntilDue)} days overdue</Badge>
                            ) : (
                              <Badge variant={daysUntilDue <= 2 ? "warning" : "success"}>
                                {daysUntilDue} days left
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-center text-muted py-4">No active loans.</p>
                )}
              </Card>

              {/* History */}
              {history.length > 0 && (
                <Card>
                  <CardTitle>Borrowing History</CardTitle>
                  <div className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Book</TableHead>
                          <TableHead>Borrowed</TableHead>
                          <TableHead>Returned</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((loan: any) => (
                          <TableRow key={loan.id}>
                            <TableCell className="font-medium">{loan.book.title}</TableCell>
                            <TableCell className="text-sm">{new Date(loan.checkedOutAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-sm">
                              {loan.returnedAt ? new Date(loan.returnedAt).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={loan.status === "RETURNED" ? "success" : "danger"}>
                                {loan.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {tab === "catalog" && (
        <>
          <Card>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search books..."
                className="w-full rounded-lg border border-border bg-surface pl-10 pr-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </Card>

          {loadingBooks ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : books?.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book: any) => (
                <Card key={book.id}>
                  <p className="font-medium text-foreground">{book.title}</p>
                  <p className="text-sm text-muted">{book.author}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {book.category && <Badge>{book.category}</Badge>}
                    <Badge variant={book.availableCount > 0 ? "success" : "danger"}>
                      {book.availableCount > 0 ? `${book.availableCount} available` : "Unavailable"}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card><p className="text-center text-muted py-8">No books found.</p></Card>
          )}
        </>
      )}
    </div>
  );
}
