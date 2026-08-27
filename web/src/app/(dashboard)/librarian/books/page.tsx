"use client";

import { useState } from "react";
import {
  Card,
  Button,
  Badge,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  Input,
} from "@/components/ui";
import {
  useBooks,
  rowsOf,
  useCreateBook,
  useDeleteBook,
  useCheckout,
  useReturn,
  useLibraryAnalytics,
} from "@/hooks/use-library";
import { Plus, Trash2, Search, BookOpen, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export default function LibrarianBooksPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const { data: booksResponse, isLoading } = useBooks({
    ...(search && { search }),
    ...(category && { category }),
  });
  // The endpoint answers `{ data, meta }`; reading `.length` off the envelope
  // gave undefined, so this page said "No books found" over a full library.
  const books = rowsOf<Record<string, unknown>>(booksResponse);
  const { data: analytics } = useLibraryAnalytics();
  const createBook = useCreateBook();
  const deleteBook = useDeleteBook();
  const checkout = useCheckout();
  const returnBook = useReturn();

  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", isbn: "", category: "", quantity: 1, barcode: "", replacementCost: 0 });
  const [checkoutForm, setCheckoutForm] = useState({ bookIdentifier: "", studentIdentifier: "" });
  const [returnForm, setReturnForm] = useState({ bookIdentifier: "" });

  const handleCreate = () => {
    createBook.mutate(form, {
      onSuccess: () => { setShowAddModal(false); setForm({ title: "", author: "", isbn: "", category: "", quantity: 1, barcode: "", replacementCost: 0 }); },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Book Catalog</h1>
          <p className="text-sm text-muted">Manage library books</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowCheckoutModal(true)}>
            <ArrowDownToLine className="mr-1 h-4 w-4" /> Checkout
          </Button>
          <Button variant="outline" onClick={() => setShowReturnModal(true)}>
            <ArrowUpFromLine className="mr-1 h-4 w-4" /> Return
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Book
          </Button>
        </div>
      </div>

      {/* Analytics */}
      {analytics && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card>
            <p className="text-xs text-muted">Total Books</p>
            <p className="text-2xl font-bold text-foreground">{analytics.totalBooks}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Total Copies</p>
            <p className="text-2xl font-bold text-foreground">{analytics.totalCopies}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Available</p>
            <p className="text-2xl font-bold text-success">{analytics.availableCopies}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Active Loans</p>
            <p className="text-2xl font-bold text-primary">{analytics.activeLoans}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Overdue</p>
            <p className="text-2xl font-bold text-danger">{analytics.overdueLoans}</p>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, author, or ISBN..."
              className="w-full rounded-lg border border-border bg-surface pl-10 pr-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <select aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">All Categories</option>
            {analytics?.categories?.map((c: any) => (
              <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Books Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : books.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>ISBN</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Available</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.map((book: any) => (
                <TableRow key={book.id}>
                  <TableCell className="font-medium">{book.title}</TableCell>
                  <TableCell>{book.author}</TableCell>
                  <TableCell><Badge>{book.category || "—"}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{book.isbn || "—"}</TableCell>
                  <TableCell>{book.quantity}</TableCell>
                  <TableCell>
                    <Badge variant={book.availableCount > 0 ? "success" : "danger"}>
                      {book.availableCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button aria-label="Delete" size="sm" variant="ghost" onClick={() => { setConfirmAction(() => () => deleteBook.mutate(book.id)); }}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="py-12 text-center text-muted">
            <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="font-medium">No books found</p>
            <p className="mt-1 text-xs">Add books to the library to get started</p>
          </div>
        </Card>
      )}

      {/* Confirm Delete Modal */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirm Action">
        <p className="text-sm text-muted mb-4">Are you sure you want to delete this book?</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { confirmAction?.(); setConfirmAction(null); }}>Confirm</Button>
        </div>
      </Modal>

      {/* Add Book Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Book">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="ISBN" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Quantity" type="number" value={String(form.quantity)} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            <Input label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            <Input label="Replacement Cost" type="number" value={String(form.replacementCost)} onChange={(e) => setForm({ ...form, replacementCost: Number(e.target.value) })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createBook.isPending}>Add Book</Button>
          </div>
        </div>
      </Modal>

      {/* Checkout Modal */}
      <Modal isOpen={showCheckoutModal} onClose={() => setShowCheckoutModal(false)} title="Checkout Book">
        <div className="space-y-4">
          <Input label="Book (barcode or ID)" value={checkoutForm.bookIdentifier}
            onChange={(e) => setCheckoutForm({ ...checkoutForm, bookIdentifier: e.target.value })}
            placeholder="Scan barcode or enter book ID" />
          <Input label="Student (ID number)" value={checkoutForm.studentIdentifier}
            onChange={(e) => setCheckoutForm({ ...checkoutForm, studentIdentifier: e.target.value })}
            placeholder="Scan student QR or enter ID number" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCheckoutModal(false)}>Cancel</Button>
            <Button onClick={() => {
              checkout.mutate(checkoutForm, { onSuccess: () => { setShowCheckoutModal(false); setCheckoutForm({ bookIdentifier: "", studentIdentifier: "" }); } });
            }} isLoading={checkout.isPending}>Checkout</Button>
          </div>
        </div>
      </Modal>

      {/* Return Modal */}
      <Modal isOpen={showReturnModal} onClose={() => setShowReturnModal(false)} title="Return Book">
        <div className="space-y-4">
          <Input label="Book (barcode or ID)" value={returnForm.bookIdentifier}
            onChange={(e) => setReturnForm({ bookIdentifier: e.target.value })}
            placeholder="Scan barcode or enter book ID" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowReturnModal(false)}>Cancel</Button>
            <Button onClick={() => {
              returnBook.mutate(returnForm, { onSuccess: () => { setShowReturnModal(false); setReturnForm({ bookIdentifier: "" }); } });
            }} isLoading={returnBook.isPending}>Return</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
