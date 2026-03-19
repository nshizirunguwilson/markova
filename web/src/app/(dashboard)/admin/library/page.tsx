"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PageSpinner,
  Modal,
} from "@/components/ui";
import {
  useBooks,
  useCreateBook,
  useUpdateBook,
  useDeleteBook,
  useCheckout,
  useReturn,
  useActiveLoans,
  useOverdueLoans,
  useLibraryAnalytics,
} from "@/hooks/use-library";
import { useUsers } from "@/hooks/use-users";
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  Search,
  ArrowRightLeft,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

type Tab = "books" | "loans" | "overdue" | "analytics";

export default function AdminLibraryPage() {
  const [tab, setTab] = useState<Tab>("books");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: books, isLoading: loadingBooks } = useBooks(
    searchQuery ? { search: searchQuery } : undefined
  );
  const { data: activeLoans, isLoading: loadingLoans } = useActiveLoans();
  const { data: overdueLoans, isLoading: loadingOverdue } = useOverdueLoans();
  const { data: analytics, isLoading: loadingAnalytics } = useLibraryAnalytics();

  const createBook = useCreateBook();
  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();
  const checkout = useCheckout();
  const returnBook = useReturn();

  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const [bookForm, setBookForm] = useState({
    title: "", author: "", isbn: "", category: "", quantity: 1, shelfLocation: "",
  });
  const [checkoutForm, setCheckoutForm] = useState({ bookIdentifier: "", studentIdentifier: "" });
  const { data: studentData } = useUsers({ role: "STUDENT", limit: 100 });
  const students = studentData?.data || [];

  const resetBookForm = () => {
    setBookForm({ title: "", author: "", isbn: "", category: "", quantity: 1, shelfLocation: "" });
    setEditingBookId(null);
    setShowBookModal(false);
  };

  const handleEditBook = (book: any) => {
    setBookForm({
      title: book.title, author: book.author || "", isbn: book.isbn || "",
      category: book.category || "", quantity: book.quantity || 1, shelfLocation: book.shelfLocation || "",
    });
    setEditingBookId(book.id);
    setShowBookModal(true);
  };

  const handleSaveBook = () => {
    if (!bookForm.title || !bookForm.author) return toast.error("Title and author are required");
    if (editingBookId) {
      updateBook.mutate({ id: editingBookId, ...bookForm }, { onSuccess: resetBookForm });
    } else {
      createBook.mutate(bookForm, { onSuccess: resetBookForm });
    }
  };

  const handleDeleteBook = () => {
    if (deleteTarget) {
      deleteBook.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  const handleCheckout = () => {
    if (!checkoutForm.bookIdentifier || !checkoutForm.studentIdentifier) return toast.error("All fields required");
    checkout.mutate(checkoutForm, {
      onSuccess: () => { setShowCheckoutModal(false); setCheckoutForm({ bookIdentifier: "", studentIdentifier: "" }); },
    });
  };

  const handleReturn = (bookId: string) => {
    returnBook.mutate({ bookIdentifier: bookId });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "books", label: "Books" },
    { key: "loans", label: "Active Loans" },
    { key: "overdue", label: "Overdue" },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Library</h1>
          <p className="mt-1 text-sm text-muted">Manage books, loans, and returns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCheckoutModal(true)}>
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Checkout
          </Button>
          <Button onClick={() => { resetBookForm(); setShowBookModal(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Book
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t.key
                ? "border-[#1B4F72] text-[#1B4F72]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.key === "overdue" && overdueLoans?.length > 0 && (
              <Badge variant="danger" className="ml-2">{overdueLoans.length}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* Books Tab */}
      {tab === "books" && (
        <>
          <Card padding="sm" className="mb-5">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search books by title, author, or ISBN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>
          </Card>

          {loadingBooks ? (
            <PageSpinner />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>ISBN</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Copies</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!books || books.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted">
                      <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      No books found
                    </TableCell>
                  </TableRow>
                ) : (
                  books.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.title}</TableCell>
                      <TableCell>{b.author}</TableCell>
                      <TableCell><span className="font-mono text-sm">{b.isbn || "—"}</span></TableCell>
                      <TableCell>{b.category || "—"}</TableCell>
                      <TableCell>{b.quantity}</TableCell>
                      <TableCell>
                        <Badge variant={b.availableCount > 0 ? "success" : "danger"}>
                          {b.availableCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditBook(b)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(b.id)}>
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Active Loans Tab */}
      {tab === "loans" && (
        loadingLoans ? <PageSpinner /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Checkout Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!activeLoans || activeLoans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted">No active loans</TableCell>
                </TableRow>
              ) : (
                activeLoans.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.book?.title}</TableCell>
                    <TableCell>{l.borrower?.firstName} {l.borrower?.lastName}</TableCell>
                    <TableCell>{new Date(l.checkoutDate).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(l.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReturn(l.book?.id || l.bookId)}
                        isLoading={returnBook.isPending}
                      >
                        Return
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )
      )}

      {/* Overdue Tab */}
      {tab === "overdue" && (
        loadingOverdue ? <PageSpinner /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Days Overdue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!overdueLoans || overdueLoans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted">
                    <AlertTriangle className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No overdue loans
                  </TableCell>
                </TableRow>
              ) : (
                overdueLoans.map((l: any) => {
                  const daysOverdue = Math.ceil((Date.now() - new Date(l.dueDate).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.book?.title}</TableCell>
                      <TableCell>{l.borrower?.firstName} {l.borrower?.lastName}</TableCell>
                      <TableCell>{new Date(l.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="danger">{daysOverdue} days</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleReturn(l.book?.id || l.bookId)} isLoading={returnBook.isPending}>
                          Return
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )
      )}

      {/* Analytics Tab */}
      {tab === "analytics" && (
        loadingAnalytics ? <PageSpinner /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-6">
              <p className="text-sm text-muted">Total Books</p>
              <p className="text-3xl font-bold text-[#1B4F72]">{analytics?.totalBooks ?? 0}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-muted">Active Loans</p>
              <p className="text-3xl font-bold text-[#2E86C1]">{analytics?.activeLoans ?? 0}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-muted">Overdue</p>
              <p className="text-3xl font-bold text-red-600">{analytics?.overdueLoans ?? 0}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-muted">Total Checkouts</p>
              <p className="text-3xl font-bold text-[#1B4F72]">{analytics?.totalCheckouts ?? 0}</p>
            </Card>
            {analytics?.popularBooks && analytics.popularBooks.length > 0 && (
              <Card className="p-6 col-span-full">
                <CardTitle className="mb-4">Most Popular Books</CardTitle>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Checkouts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.popularBooks.map((b: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{b.title}</TableCell>
                        <TableCell>{b.author}</TableCell>
                        <TableCell><Badge variant="info">{b.checkoutCount}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )
      )}

      {/* Add/Edit Book Modal */}
      <Modal isOpen={showBookModal} onClose={resetBookForm} title={editingBookId ? "Edit Book" : "Add Book"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Title</label>
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={bookForm.title}
                onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Author</label>
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={bookForm.author}
                onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">ISBN</label>
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={bookForm.isbn}
                onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={bookForm.category}
                onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })}
                placeholder="e.g. Fiction, Science, History"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Total Copies</label>
              <input
                type="number"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={bookForm.quantity}
                onChange={(e) => setBookForm({ ...bookForm, quantity: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Shelf Location</label>
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={bookForm.shelfLocation}
                onChange={(e) => setBookForm({ ...bookForm, shelfLocation: e.target.value })}
                placeholder="e.g. A-3-12"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetBookForm}>Cancel</Button>
            <Button onClick={handleSaveBook} isLoading={createBook.isPending || updateBook.isPending}>
              {editingBookId ? "Update" : "Add Book"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Checkout Modal */}
      <Modal isOpen={showCheckoutModal} onClose={() => setShowCheckoutModal(false)} title="Checkout Book">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Book</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={checkoutForm.bookIdentifier}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, bookIdentifier: e.target.value })}
            >
              <option value="">Select book</option>
              {books?.filter((b: any) => b.availableCount > 0).map((b: any) => (
                <option key={b.id} value={b.id}>{b.title} ({b.availableCount} available)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Borrower (Student)</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={checkoutForm.studentIdentifier}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, studentIdentifier: e.target.value })}
            >
              <option value="">Select student</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.student?.studentIdNumber || s.id}>{s.firstName} {s.lastName} {s.student?.studentIdNumber ? `(${s.student.studentIdNumber})` : ""}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCheckoutModal(false)}>Cancel</Button>
            <Button onClick={handleCheckout} isLoading={checkout.isPending}>Checkout</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Book" size="sm">
        <p className="mb-4 text-sm text-muted">Are you sure you want to delete this book?</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteBook} isLoading={deleteBook.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
