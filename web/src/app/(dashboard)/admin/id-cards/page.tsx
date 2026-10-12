"use client";

import { useState, useEffect } from "react";
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
} from "@/components/ui";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import {
  useIdCardRegistry,
  useIssueIdCard,
  useIssueBulkIdCards,
  useRevokeIdCard,
  useSuspendIdCard,
  useRestoreIdCard,
} from "@/hooks/use-reports";
import { useBrandStore } from "@/stores/brand-store";
import {
  Printer,
  Search,
  Plus,
  IdCard,
  Ban,
  PauseCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

type StatusFilter = "all" | "issued" | "not_issued" | "suspended";

export default function AdminIdCardsPage() {
  const schoolName = useBrandStore((s) => s.schoolName);

  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showPrint, setShowPrint] = useState(false);
  const [page, setPage] = useState(1);

  /**
   * Any change of filter starts again at the first page: staying on page 12
   * of a narrower list shows an empty table.
   *
   * Reset where the filter changes rather than in an effect watching it - an
   * effect that calls setState runs a second render every time, and the query
   * below would fire once for the old page before the reset landed.
   */
  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId || undefined);

  const { data, isLoading } = useIdCardRegistry({
    classSectionId: sectionId || undefined,
    status,
    search: search || undefined,
    page,
    limit: 25,
  });

  const issueCard = useIssueIdCard();
  const issueBulk = useIssueBulkIdCards();
  const revokeCard = useRevokeIdCard();
  const suspendCard = useSuspendIdCard();
  const restoreCard = useRestoreIdCard();

  // Debounced auto-search
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch((current) => {
        const next = searchInput.trim();
        // Only page back when the term actually changed, so a re-render with
        // the same text does not knock the reader off page 3.
        if (next !== current) setPage(1);
        return next;
      });
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);


  const items: any[] = data?.items || [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 25, totalPages: 1 };
  const issuedItems = items.filter((i) => i.hasCard);
  // The family said No to the photo on cards (B6): those print without it.
  const withoutPhoto = issuedItems.filter((i) => i.photoForId === "NO" && i.hasPhoto);

  const handlePrint = () => {
    setShowPrint(true);
    setTimeout(() => window.print(), 150);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            Student ID Cards
          </h1>
          <p className="mt-1 text-sm text-muted">
            See who has a card, issue cards for those who don&apos;t, and print them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sectionId && (
            <Button
              variant="outline"
              onClick={() => issueBulk.mutate({ classSectionId: sectionId })}
              isLoading={issueBulk.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              Issue all without a card
            </Button>
          )}
          {issuedItems.length > 0 && (
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print issued ({issuedItems.length})
            </Button>
          )}
        </div>
      </div>

      {withoutPhoto.length > 0 && (
        <p
          role="status"
          className="rounded-xl border border-warning/30 bg-warning-wash px-4 py-3 text-sm text-foreground print:hidden"
        >
          {withoutPhoto.length === 1
            ? `${withoutPhoto[0].name}'s family said No to the photo on cards, so that card prints without it.`
            : `${withoutPhoto.length} families on this page said No to the photo on cards, so those cards print without it.`}
        </p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 print:hidden">
        <Card padding="sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{data?.total ?? "-"}</p>
            <p className="text-sm text-muted">Students</p>
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-success">{data?.issued ?? "-"}</p>
            <p className="text-sm text-muted">Have a card</p>
          </div>
        </Card>
        <Card padding="sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-danger">{data?.notIssued ?? "-"}</p>
            <p className="text-sm text-muted">No card yet</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card padding="sm" className="print:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by name, student ID, or card ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label htmlFor="f-class-level" className="mb-1 block text-xs font-medium text-muted">Class Level</label>
            <select id="f-class-level" aria-label="Class level"
              className="rounded-lg border border-input px-3 py-2 text-sm"
              value={levelId}
              onChange={(e) => changeFilter(() => { setLevelId(e.target.value); setSectionId(""); })}
            >
              <option value="">All levels</option>
              {levels?.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-section" className="mb-1 block text-xs font-medium text-muted">Section</label>
            <select id="f-section" aria-label="Class section"
              className="rounded-lg border border-input px-3 py-2 text-sm"
              value={sectionId}
              onChange={(e) => changeFilter(() => setSectionId(e.target.value))}
              disabled={!levelId}
            >
              <option value="">All sections</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-card-status" className="mb-1 block text-xs font-medium text-muted">Card status</label>
            <select id="f-card-status" aria-label="Status"
              className="rounded-lg border border-input px-3 py-2 text-sm"
              value={status}
              onChange={(e) => changeFilter(() => setStatus(e.target.value as StatusFilter))}
            >
              <option value="all">All</option>
              <option value="issued">Has a card</option>
              <option value="not_issued">No card</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Registry */}
      <Card className="print:hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted">
            <IdCard className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p>No students match these filters.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Card ID</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">
                    {it.name}
                    {it.photoForId === "NO" && it.hasPhoto && (
                      <Badge variant="warning" className="ml-2">
                        No photo on the card
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">{it.class}</TableCell>
                  <TableCell className="font-mono text-xs">{it.studentIdNumber}</TableCell>
                  <TableCell>
                    {it.hasCard ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{it.cardId}</span>
                        {it.suspended && <Badge variant="warning">Suspended</Badge>}
                      </div>
                    ) : (
                      <Badge variant="danger">No card</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted">
                    {it.cardIssuedAt
                      ? new Date(it.cardIssuedAt).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.hasCard ? (
                      <div className="flex items-center justify-end gap-1">
                        {/*
                          Two different actions, and the difference matters:
                          suspending keeps the card and can be undone, revoking
                          destroys the code and forces a reprint.
                        */}
                        {it.suspended ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restoreCard.mutate({ studentId: it.id })}
                            disabled={restoreCard.isPending}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => suspendCard.mutate({ studentId: it.id })}
                            disabled={suspendCard.isPending}
                          >
                            <PauseCircle className="mr-1 h-3.5 w-3.5" /> Suspend
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (
                              confirm(
                                `Revoke ${it.name}'s card? The printed card stops working for good and a new one has to be issued. To stop it only for now, use Suspend.`,
                              )
                            )
                              revokeCard.mutate({ studentId: it.id });
                          }}
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" /> Revoke
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => issueCard.mutate({ studentId: it.id })}
                        disabled={issueCard.isPending}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Generate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/*
          The roll runs to hundreds of students, so the registry is paged. The
          counts above describe the whole filtered roll, not this page.
        */}
        {!isLoading && meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}-
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button
                aria-label="Previous page"
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center px-3 text-sm text-muted">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                aria-label="Next page"
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Printable cards (only issued) */}
      {showPrint && (
        <div className="hidden print:grid print:grid-cols-2 print:gap-4">
          {issuedItems.map((it) => (
            <div key={it.id} className="rounded-lg border-2 border-primary p-4">
              <div className="text-center space-y-2">
                <p className="text-xs uppercase text-muted">{schoolName}</p>
                <BrandMark className="mx-auto h-12 w-auto max-w-[120px]" />
                <p className="text-lg font-bold">{it.name}</p>
                <p className="text-sm text-foreground-muted">{it.class}</p>
                <p className="inline-block rounded bg-surface-muted px-2 py-1 font-mono text-sm">
                  {it.studentIdNumber}
                </p>
                <p className="text-xs text-muted">Card: {it.cardId}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
