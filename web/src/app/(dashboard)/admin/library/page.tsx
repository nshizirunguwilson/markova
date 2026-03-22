"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  ExportDropdown,
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
  useBulkImportBooks,
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
  Upload,
} from "lucide-react";
import { exportData } from "@/lib/export";
import { toast } from "sonner";

type Tab = "books" | "loans" | "overdue" | "analytics";

const bookSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().min(1, "Author is required"),
  isbn: z.string().optional(),
  category: z.string().optional(),
  quantity: z.number().min(1, "At least 1 copy"),
  shelfLocation: z.string().optional(),
});

type BookFormValues = z.infer<typeof bookSchema>;

const checkoutSchema = z.object({
  bookIdentifier: z.string().min(1, "Select a book"),
  studentIdentifier: z.string().min(1, "Select a student"),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

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
  const bulkImport = useBulkImportBooks();

  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const bookForm = useForm<BookFormValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: { title: "", author: "", isbn: "", category: "", quantity: 1, shelfLocation: "" },
  });

  const checkoutFormHook = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { bookIdentifier: "", studentIdentifier: "" },
  });

  const { data: studentData } = useUsers({ role: "STUDENT", limit: 100 });
  const students = studentData?.data || [];

  const resetBookForm = () => {
    bookForm.reset({ title: "", author: "", isbn: "", category: "", quantity: 1, shelfLocation: "" });
    setEditingBookId(null);
    setShowBookModal(false);
  };

  const handleEditBook = (book: any) => {
    bookForm.reset({
      title: book.title, author: book.author || "", isbn: book.isbn || "",
      category: book.category || "", quantity: book.quantity || 1, shelfLocation: book.shelfLocation || "",
    });
    setEditingBookId(book.id);
    setShowBookModal(true);
  };

  const onBookSubmit = (data: BookFormValues) => {
    if (editingBookId) {
      updateBook.mutate({ id: editingBookId, ...data }, { onSuccess: resetBookForm });
    } else {
      createBook.mutate(data, { onSuccess: resetBookForm });
    }
  };

  const handleSaveBook = bookForm.handleSubmit(onBookSubmit);

  const handleDeleteBook = () => {
    if (deleteTarget) {
      deleteBook.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  const onCheckoutSubmit = (data: CheckoutFormValues) => {
    checkout.mutate(data, {
      onSuccess: () => { setShowCheckoutModal(false); checkoutFormHook.reset({ bookIdentifier: "", studentIdentifier: "" }); },
    });
  };

  const handleCheckout = checkoutFormHook.handleSubmit(onCheckoutSubmit);

  const handleReturn = (bookId: string) => {
    returnBook.mutate({ bookIdentifier: bookId });
  };

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    if (tab === "books") {
      exportData(format, {
        filename: "library-books",
        title: "Library Books",
        columns: [
          { header: "Title", key: "title" },
          { header: "Author", key: "author" },
          { header: "ISBN", key: "isbn" },
          { header: "Category", key: "category" },
          { header: "Copies", key: "quantity" },
          { header: "Available", key: "availableCount" },
        ],
        data: books || [],
      });
    } else if (tab === "loans") {
      exportData(format, {
        filename: "active-loans",
        title: "Active Loans",
        columns: [
          { header: "Book", key: "book.title" },
          { header: "Borrower", key: "_borrower" },
          { header: "Checkout Date", key: "_checkoutDate" },
          { header: "Due Date", key: "_dueDate" },
        ],
        data: (activeLoans || []).map((l: any) => ({
          ...l,
          _borrower: `${l.borrower?.firstName || ""} ${l.borrower?.lastName || ""}`.trim(),
          _checkoutDate: new Date(l.checkoutDate).toLocaleDateString(),
          _dueDate: new Date(l.dueDate).toLocaleDateString(),
        })),
      });
    } else if (tab === "overdue") {
      exportData(format, {
        filename: "overdue-loans",
        title: "Overdue Loans",
        columns: [
          { header: "Book", key: "book.title" },
          { header: "Borrower", key: "_borrower" },
          { header: "Due Date", key: "_dueDate" },
          { header: "Days Overdue", key: "_daysOverdue" },
        ],
        data: (overdueLoans || []).map((l: any) => ({
          ...l,
          _borrower: `${l.borrower?.firstName || ""} ${l.borrower?.lastName || ""}`.trim(),
          _dueDate: new Date(l.dueDate).toLocaleDateString(),
          _daysOverdue: Math.ceil((Date.now() - new Date(l.dueDate).getTime()) / (1000 * 60 * 60 * 24)),
        })),
      });
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "books", label: "Books" },
    { key: "loans", label: "Active Loans" },
    { key: "overdue", label: "Overdue" },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Library</h1>
          <p className="mt-1 text-sm text-muted">Manage books, loans, and returns</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab !== "analytics" && (
            <ExportDropdown onExport={handleExport} />
          )}
          <Button variant="outline" onClick={() => setShowCheckoutModal(true)}>
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Checkout
          </Button>
          <Button variant="outline" onClick={() => setShowBulkImport(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => { resetBookForm(); setShowBookModal(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Book
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 mb-5">
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

          {!loadingBooks && books && (
            <p className="mb-3 text-sm text-muted">
              Showing {Array.isArray(books) ? books.length : (books?.meta?.total ?? books?.data?.length ?? 0)} books
            </p>
          )}

          {loadingBooks ? (
            <PageSpinner />
          ) : (
            <div className="overflow-x-auto">
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
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: b.id, title: b.title })}>
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </>
      )}

      {/* Active Loans Tab */}
      {tab === "loans" && (
        loadingLoans ? <PageSpinner /> : (
          <div className="overflow-x-auto">
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
                  <TableCell colSpan={5} className="py-12 text-center text-muted">
                    <ArrowRightLeft className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    <p className="font-medium">No active loans</p>
                    <p className="mt-1 text-xs">All books have been returned</p>
                  </TableCell>
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
          </div>
        )
      )}

      {/* Overdue Tab */}
      {tab === "overdue" && (
        loadingOverdue ? <PageSpinner /> : (
          <div className="overflow-x-auto">
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
          </div>
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
                <div className="overflow-x-auto">
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
                </div>
              </Card>
            )}
          </div>
        )
      )}

      {/* Add/Edit Book Modal */}
      <Modal isOpen={showBookModal} onClose={resetBookForm} title={editingBookId ? "Edit Book" : "Add Book"} size="lg">
        <form onSubmit={handleSaveBook} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Title <span className="text-red-500">*</span></label>
              <input
                className={`w-full rounded-lg border ${bookForm.formState.errors.title ? "border-red-500" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...bookForm.register("title")}
              />
              {bookForm.formState.errors.title && (
                <p className="mt-1 text-xs text-red-500">{bookForm.formState.errors.title.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Author <span className="text-red-500">*</span></label>
              <input
                className={`w-full rounded-lg border ${bookForm.formState.errors.author ? "border-red-500" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...bookForm.register("author")}
              />
              {bookForm.formState.errors.author && (
                <p className="mt-1 text-xs text-red-500">{bookForm.formState.errors.author.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">ISBN</label>
              <input
                className={`w-full rounded-lg border ${bookForm.formState.errors.isbn ? "border-red-500" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...bookForm.register("isbn")}
              />
              {bookForm.formState.errors.isbn && (
                <p className="mt-1 text-xs text-red-500">{bookForm.formState.errors.isbn.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <input
                className={`w-full rounded-lg border ${bookForm.formState.errors.category ? "border-red-500" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...bookForm.register("category")}
                placeholder="e.g. Fiction, Science, History"
              />
              {bookForm.formState.errors.category && (
                <p className="mt-1 text-xs text-red-500">{bookForm.formState.errors.category.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Total Copies</label>
              <input
                type="number"
                className={`w-full rounded-lg border ${bookForm.formState.errors.quantity ? "border-red-500" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...bookForm.register("quantity", { valueAsNumber: true })}
              />
              {bookForm.formState.errors.quantity && (
                <p className="mt-1 text-xs text-red-500">{bookForm.formState.errors.quantity.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Shelf Location</label>
              <input
                className={`w-full rounded-lg border ${bookForm.formState.errors.shelfLocation ? "border-red-500" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...bookForm.register("shelfLocation")}
                placeholder="e.g. A-3-12"
              />
              {bookForm.formState.errors.shelfLocation && (
                <p className="mt-1 text-xs text-red-500">{bookForm.formState.errors.shelfLocation.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={resetBookForm}>Cancel</Button>
            <Button type="submit" isLoading={createBook.isPending || updateBook.isPending}>
              {editingBookId ? "Update" : "Add Book"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Checkout Modal */}
      <Modal isOpen={showCheckoutModal} onClose={() => { setShowCheckoutModal(false); checkoutFormHook.reset(); }} title="Checkout Book">
        <form onSubmit={handleCheckout} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Book</label>
            <select
              className={`w-full rounded-lg border ${checkoutFormHook.formState.errors.bookIdentifier ? "border-red-500" : "border-border"} px-3 py-2 text-sm`}
              {...checkoutFormHook.register("bookIdentifier")}
            >
              <option value="">Select book</option>
              {books?.filter((b: any) => b.availableCount > 0).map((b: any) => (
                <option key={b.id} value={b.id}>{b.title} ({b.availableCount} available)</option>
              ))}
            </select>
            {checkoutFormHook.formState.errors.bookIdentifier && (
              <p className="mt-1 text-xs text-red-500">{checkoutFormHook.formState.errors.bookIdentifier.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Borrower (Student)</label>
            <select
              className={`w-full rounded-lg border ${checkoutFormHook.formState.errors.studentIdentifier ? "border-red-500" : "border-border"} px-3 py-2 text-sm`}
              {...checkoutFormHook.register("studentIdentifier")}
            >
              <option value="">Select student</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.student?.studentIdNumber || s.id}>{s.firstName} {s.lastName} {s.student?.studentIdNumber ? `(${s.student.studentIdNumber})` : ""}</option>
              ))}
            </select>
            {checkoutFormHook.formState.errors.studentIdentifier && (
              <p className="mt-1 text-xs text-red-500">{checkoutFormHook.formState.errors.studentIdentifier.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setShowCheckoutModal(false); checkoutFormHook.reset(); }}>Cancel</Button>
            <Button type="submit" isLoading={checkout.isPending}>Checkout</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Book" size="sm">
        <p className="mb-4 text-sm text-muted">Are you sure you want to delete <strong>{deleteTarget?.title}</strong>?</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteBook} isLoading={deleteBook.isPending}>Delete</Button>
        </div>
      </Modal>

      {/* Bulk Import Modal */}
      <BulkImportBooksModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        bulkImport={bulkImport}
      />
    </div>
  );
}

/* ---------- Bulk Import Books Modal with Preview ---------- */

interface ParsedBook {
  title: string;
  author: string;
  isbn: string;
  quantity: number;
}

function BulkImportBooksModal({
  isOpen,
  onClose,
  bulkImport,
}: {
  isOpen: boolean;
  onClose: () => void;
  bulkImport: ReturnType<typeof useBulkImportBooks>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedBooks, setParsedBooks] = useState<ParsedBook[]>([]);
  const [step, setStep] = useState<"upload" | "preview">("upload");

  const reset = () => {
    setParsedBooks([]);
    setStep("upload");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast.error("CSV must have a header row and at least one data row");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const titleIdx = headers.indexOf("title");
      const authorIdx = headers.indexOf("author");
      const isbnIdx = headers.indexOf("isbn");
      const qtyIdx = headers.findIndex((h) => h === "quantity" || h === "qty" || h === "copies");

      if (titleIdx === -1 || authorIdx === -1) {
        toast.error("CSV must have at least 'title' and 'author' columns");
        return;
      }

      const books: ParsedBook[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
        const title = cols[titleIdx] || "";
        const author = cols[authorIdx] || "";
        if (!title || !author) continue;
        books.push({
          title,
          author,
          isbn: isbnIdx >= 0 ? cols[isbnIdx] || "" : "",
          quantity: qtyIdx >= 0 ? parseInt(cols[qtyIdx], 10) || 1 : 1,
        });
      }

      if (books.length === 0) {
        toast.error("No valid book rows found in CSV");
        return;
      }

      setParsedBooks(books);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    bulkImport.mutate(
      { books: parsedBooks },
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Import Books" size="lg">
      {step === "upload" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Upload a CSV file with columns: <strong>title</strong>, <strong>author</strong>, isbn, quantity
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
          />
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-foreground">
            {parsedBooks.length} book{parsedBooks.length !== 1 ? "s" : ""} will be imported
          </p>
          <div className="max-h-60 overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>ISBN</TableHead>
                  <TableHead>Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedBooks.slice(0, 5).map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{b.title}</TableCell>
                    <TableCell>{b.author}</TableCell>
                    <TableCell><span className="font-mono text-sm">{b.isbn || "—"}</span></TableCell>
                    <TableCell>{b.quantity}</TableCell>
                  </TableRow>
                ))}
                {parsedBooks.length > 5 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted">
                      ...and {parsedBooks.length - 5} more
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={handleConfirmImport} isLoading={bulkImport.isPending}>
              Confirm Import
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
