"use client";

import { useState } from "react";
import {
  Card,
  Button,
  Input,
  Spinner,
  Badge,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  useFaqsAdmin,
  useCreateFaq,
  useUpdateFaq,
  useDeleteFaq,
  useTickets,
  useUpdateTicketStatus,
} from "@/hooks/use-help";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";

export default function AdminHelpPage() {
  const [tab, setTab] = useState<"faqs" | "tickets">("faqs");
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data: faqs, isLoading: faqsLoading } = useFaqsAdmin();
  const { data: tickets, isLoading: ticketsLoading } = useTickets(statusFilter || undefined);
  const createFaq = useCreateFaq();
  const updateFaq = useUpdateFaq();
  const deleteFaq = useDeleteFaq();
  const updateStatus = useUpdateTicketStatus();

  const [faqForm, setFaqForm] = useState({
    title: "",
    content: "",
    category: "",
    displayOrder: 0,
    isPublished: true,
  });

  const openNewFaq = () => {
    setEditingFaq(null);
    setFaqForm({ title: "", content: "", category: "", displayOrder: 0, isPublished: true });
    setShowFaqModal(true);
  };

  const openEditFaq = (faq: any) => {
    setEditingFaq(faq);
    setFaqForm({
      title: faq.title,
      content: faq.content,
      category: faq.category || "",
      displayOrder: faq.displayOrder,
      isPublished: faq.isPublished,
    });
    setShowFaqModal(true);
  };

  const handleSaveFaq = () => {
    if (!faqForm.title || !faqForm.content) return toast.error("Title and content required");
    const data = { ...faqForm, category: faqForm.category || undefined };
    if (editingFaq) {
      updateFaq.mutate({ id: editingFaq.id, ...data }, {
        onSuccess: () => { toast.success("FAQ updated"); setShowFaqModal(false); },
        onError: () => toast.error("Failed"),
      });
    } else {
      createFaq.mutate(data, {
        onSuccess: () => { toast.success("FAQ created"); setShowFaqModal(false); },
        onError: () => toast.error("Failed"),
      });
    }
  };

  const handleDeleteFaq = (id: string) => {
    if (!confirm("Delete this question?")) return;
    deleteFaq.mutate(id, {
      onSuccess: () => toast.success("Deleted"),
      onError: () => toast.error("Failed"),
    });
  };

  const handleStatusChange = (id: string, status: string) => {
    updateStatus.mutate({ id, status }, {
      onSuccess: () => toast.success("Status updated"),
      onError: () => toast.error("Failed"),
    });
  };

  const statusColor = (s: string) => {
    if (s === "OPEN") return "bg-accent text-primary";
    if (s === "IN_PROGRESS") return "bg-warning-wash text-warning";
    if (s === "RESOLVED") return "bg-success-wash text-success";
    return "bg-surface-muted text-foreground-muted";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help and questions"
      />

      <div className="flex gap-2 border-b border-border">
        {(["faqs", "tickets"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground-muted"
            }`}
          >
            {t === "faqs" ? "Common questions" : "Help requests"}
          </button>
        ))}
      </div>

      {tab === "faqs" && (
        <>
          <div className="flex justify-end">
            <Button onClick={openNewFaq}>
              <Plus className="w-4 h-4 mr-2" />
              Add a question
            </Button>
          </div>

          {faqsLoading ? (
            <div className="text-center py-8"><Spinner /></div>
          ) : (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faqs?.map((faq: any) => (
                    <TableRow key={faq.id}>
                      <TableCell>{faq.displayOrder}</TableCell>
                      <TableCell className="font-medium">{faq.title}</TableCell>
                      <TableCell>{faq.category || "—"}</TableCell>
                      <TableCell>
                        <Badge className={faq.isPublished ? "bg-success-wash text-success" : "bg-surface-muted text-muted"}>
                          {faq.isPublished ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <button aria-label="Edit" onClick={() => openEditFaq(faq)} className="text-primary-light hover:text-primary">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button aria-label="Delete" onClick={() => handleDeleteFaq(faq.id)} className="text-danger hover:text-danger">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          <Modal isOpen={showFaqModal} onClose={() => setShowFaqModal(false)} title={editingFaq ? "Edit question" : "New question"}>
            <div className="space-y-4">
              <Input label="Title" value={faqForm.title} onChange={(e) => setFaqForm({ ...faqForm, title: e.target.value })} />
              <div>
                <label htmlFor="f-content" className="text-sm font-medium">Content</label>
                <textarea id="f-content"
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1 min-h-[120px]"
                  value={faqForm.content}
                  onChange={(e) => setFaqForm({ ...faqForm, content: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Category" value={faqForm.category} onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })} />
                <Input label="Display Order" type="number" value={faqForm.displayOrder} onChange={(e) => setFaqForm({ ...faqForm, displayOrder: +e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={faqForm.isPublished} onChange={(e) => setFaqForm({ ...faqForm, isPublished: e.target.checked })} />
                Published
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowFaqModal(false)}>Cancel</Button>
                <Button onClick={handleSaveFaq} disabled={createFaq.isPending || updateFaq.isPending}>
                  {(createFaq.isPending || updateFaq.isPending) ? <Spinner className="w-4 h-4" /> : "Save"}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {tab === "tickets" && (
        <>
          <div className="flex gap-4">
            <select className="border rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="All Status">
              <option value="">All Status</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {ticketsLoading ? (
            <div className="text-center py-8"><Spinner /></div>
          ) : (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets?.map((ticket: any) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{ticket.title}</p>
                          <p className="text-xs text-muted truncate max-w-xs">{ticket.description}</p>
                        </div>
                      </TableCell>
                      <TableCell>{ticket.user?.firstName} {ticket.user?.lastName}</TableCell>
                      <TableCell>{ticket.category || "—"}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(ticket.status)}>{ticket.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{new Date(ticket.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={ticket.status}
                          onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                         aria-label="Ticket status">
                          <option value="OPEN">Open</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="RESOLVED">Resolved</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!tickets || tickets.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted py-8">
                        No tickets found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
