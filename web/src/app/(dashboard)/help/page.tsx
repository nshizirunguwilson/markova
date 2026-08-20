"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Input,
  Spinner,
  Badge,
  Modal,
} from "@/components/ui";
import { useFaqs, useMyTickets, useCreateTicket } from "@/hooks/use-help";
import { Search, HelpCircle, Plus, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"faqs" | "tickets">("faqs");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);

  const { data: faqs, isLoading: faqsLoading } = useFaqs(search || undefined);
  const { data: tickets, isLoading: ticketsLoading } = useMyTickets();
  const createTicket = useCreateTicket();

  const [ticketForm, setTicketForm] = useState({ title: "", description: "", category: "" });

  const handleSubmitTicket = () => {
    if (!ticketForm.title || !ticketForm.description) return toast.error("Fill title and description");
    createTicket.mutate(
      { ...ticketForm, category: ticketForm.category || undefined },
      {
        onSuccess: () => {
          toast.success("Ticket submitted");
          setShowNewTicket(false);
          setTicketForm({ title: "", description: "", category: "" });
        },
        onError: () => toast.error("Failed to submit ticket"),
      }
    );
  };

  const statusColor = (s: string) => {
    if (s === "OPEN") return "bg-accent text-primary";
    if (s === "IN_PROGRESS") return "bg-warning-wash text-warning";
    if (s === "RESOLVED") return "bg-success-wash text-success";
    return "bg-surface-muted text-foreground-muted";
  };

  // Group FAQs by category
  const categories = faqs?.reduce((acc: Record<string, any[]>, faq: any) => {
    const cat = faq.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(faq);
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader
          title="Help Center"
        />
        <Button onClick={() => setShowNewTicket(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Submit Ticket
        </Button>
      </div>

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
            {t === "faqs" ? "FAQ" : "My Tickets"}
          </button>
        ))}
      </div>

      {tab === "faqs" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Search FAQ..."
              className="w-full border rounded-lg pl-10 pr-4 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
             aria-label="Search FAQ..."/>
          </div>

          {faqsLoading && <div className="text-center py-8"><Spinner /></div>}

          {Object.entries(categories).map(([category, articles]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-muted uppercase mb-2">{category}</h3>
              <div className="space-y-2">
                {(articles as any[]).map((faq: any) => (
                  <Card key={faq.id} className="p-0 overflow-hidden">
                    <button
                      className="w-full flex justify-between items-center p-4 text-left hover:bg-surface-muted"
                      onClick={() => setExpanded(expanded === faq.id ? null : faq.id)}
                    >
                      <span className="font-medium">{faq.title}</span>
                      {expanded === faq.id ? (
                        <ChevronUp className="w-4 h-4 text-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted" />
                      )}
                    </button>
                    {expanded === faq.id && (
                      <div className="px-4 pb-4 text-sm text-foreground-muted border-t">
                        <p className="mt-3 whitespace-pre-wrap">{faq.content}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {!faqsLoading && Object.keys(categories).length === 0 && (
            <Card className="p-8 text-center text-muted">
              <HelpCircle className="w-12 h-12 mx-auto mb-2 text-border-strong" />
              No FAQ articles found
            </Card>
          )}
        </div>
      )}

      {tab === "tickets" && (
        <div className="space-y-4">
          {ticketsLoading && <div className="text-center py-8"><Spinner /></div>}

          {tickets?.map((ticket: any) => (
            <Card key={ticket.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium">{ticket.title}</h3>
                  <p className="text-sm text-muted mt-1">{ticket.description}</p>
                  <p className="text-xs text-muted mt-2">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge className={statusColor(ticket.status)}>{ticket.status}</Badge>
              </div>
            </Card>
          ))}

          {!ticketsLoading && (!tickets || tickets.length === 0) && (
            <Card className="p-8 text-center text-muted">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 text-border-strong" />
              No support tickets
            </Card>
          )}
        </div>
      )}

      {/* New Ticket Modal */}
      <Modal isOpen={showNewTicket} onClose={() => setShowNewTicket(false)} title="Submit Support Ticket">
        <div className="space-y-4">
          <Input label="Title" value={ticketForm.title} onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })} />
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 min-h-[100px]"
              value={ticketForm.description}
              onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={ticketForm.category}
              onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
             aria-label="Category">
              <option value="">General</option>
              <option value="Technical">Technical</option>
              <option value="Account">Account</option>
              <option value="Feature Request">Feature Request</option>
              <option value="Bug Report">Bug Report</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewTicket(false)}>Cancel</Button>
            <Button onClick={handleSubmitTicket} disabled={createTicket.isPending}>
              {createTicket.isPending ? <Spinner className="w-4 h-4" /> : "Submit"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
