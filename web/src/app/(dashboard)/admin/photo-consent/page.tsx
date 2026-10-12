"use client";

import { useMemo, useState } from "react";
import { Camera } from "lucide-react";

import { Badge, Button, Card, ExportDropdown, Input, Modal, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { PhotoConsentCard } from "@/components/photo-consent/photo-consent-card";
import {
  ANSWER_WORDS,
  usePhotoConsentRegister,
  type ConsentRow,
} from "@/hooks/use-photo-consent";
import { exportData } from "@/lib/export";

const VIEWS: { key: string; label: string; keep: (r: ConsentRow) => boolean }[] = [
  { key: "publish", label: "May appear in publicity", keep: (r) => r.publicity === "YES" },
  { key: "not-publish", label: "Must not appear in publicity", keep: (r) => r.publicity !== "YES" },
  {
    key: "not-asked",
    label: "Not asked yet",
    keep: (r) => [r.forId, r.inApp, r.publicity].includes("NOT_ASKED"),
  },
  { key: "not-app", label: "No to the app", keep: (r) => r.inApp === "NO" },
  { key: "not-card", label: "No to cards", keep: (r) => r.forId === "NO" },
  { key: "all", label: "Everyone", keep: () => true },
];

const PAGE = 100;

/**
 * What every family agreed to for their child's photo (B6 in
 * docs/STUDENT-LIFE-DESIGN.md). Markova publishes nothing itself: this is the
 * list the school checks before a photo goes on the website or a poster, and
 * the families still to ask.
 */
export default function PhotoConsentPage() {
  const { data, isLoading } = usePhotoConsentRegister();
  const [view, setView] = useState("publish");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<ConsentRow | null>(null);

  const rows = useMemo(() => {
    const keep = VIEWS.find((v) => v.key === view)!.keep;
    const q = search.trim().toLowerCase();
    return (data?.students ?? []).filter(
      (r) =>
        keep(r) &&
        (!q || r.name.toLowerCase().includes(q) || r.studentIdNumber.toLowerCase().includes(q)),
    );
  }, [data, view, search]);

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") =>
    exportData(format, {
      filename: `photo-consent-${view}`,
      title: `Photos: ${VIEWS.find((v) => v.key === view)!.label}`,
      columns: [
        { header: "Name", key: "name" },
        { header: "Student ID", key: "studentIdNumber" },
        { header: "Class", key: "class" },
        { header: "ID card", key: "_forId" },
        { header: "In the app", key: "_inApp" },
        { header: "Publicity", key: "_publicity" },
      ],
      data: rows.map((r) => ({
        ...r,
        _forId: ANSWER_WORDS[r.forId],
        _inApp: ANSWER_WORDS[r.inApp],
        _publicity: ANSWER_WORDS[r.publicity],
      })),
    });

  const counts = data?.counts;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Photos"
        description="What each family agreed to for their child's photo"
        actions={<ExportDropdown onExport={handleExport} disabled={rows.length === 0} />}
      />

      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-bold text-foreground">{counts.mayPublish}</p>
            <p className="text-xs text-muted">May appear in publicity</p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-bold text-foreground">{counts.notAsked}</p>
            <p className="text-xs text-muted">Not asked yet</p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-bold text-foreground">{counts.notInApp}</p>
            <p className="text-xs text-muted">No to the app</p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-bold text-foreground">{counts.notOnCard}</p>
            <p className="text-xs text-muted">No to cards</p>
          </Card>
        </div>
      )}

      <p className="text-sm text-muted">
        Until a family answers, a photo stays on the ID card and in the app, and counts as No
        for publicity. Markova never publishes anything itself.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <label htmlFor="consent-view" className="mb-1 block text-sm font-medium text-foreground">
            Show
          </label>
          <select
            id="consent-view"
            value={view}
            onChange={(e) => {
              setView(e.target.value);
              setShown(PAGE);
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {VIEWS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-72">
          <Input
            label="Find a student"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Name or student ID"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          <Camera className="mx-auto mb-2 h-10 w-10 text-border-strong" aria-hidden="true" />
          Nobody here.
        </Card>
      ) : (
        <Card padding="sm">
          <p className="px-2 pb-2 text-xs text-muted">{rows.length} students</p>
          <ul className="divide-y divide-border" aria-label="Photo answers">
            {rows.slice(0, shown).map((r) => (
              <li key={r.studentId}>
                <button
                  type="button"
                  onClick={() => setOpen(r)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 text-left hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{r.name}</span>
                    <span className="block text-xs text-muted">
                      {r.class} · {r.studentIdNumber}
                      {!r.hasPhoto && " · no photo on file"}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5 text-xs">
                    <Answer label="Card" value={r.forId} />
                    <Answer label="App" value={r.inApp} />
                    <Answer label="Publicity" value={r.publicity} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length > shown && (
            <div className="flex justify-center p-3">
              <Button variant="outline" size="sm" onClick={() => setShown(shown + PAGE)}>
                Show more
              </Button>
            </div>
          )}
        </Card>
      )}

      {open && (
        <Modal isOpen onClose={() => setOpen(null)} title={open.name}>
          <PhotoConsentCard studentId={open.studentId} name={open.name} office />
        </Modal>
      )}
    </div>
  );
}

function Answer({ label, value }: { label: string; value: ConsentRow["forId"] }) {
  return (
    <Badge variant={value === "NO" ? "warning" : value === "YES" ? "success" : "default"}>
      {label}: {ANSWER_WORDS[value]}
    </Badge>
  );
}
