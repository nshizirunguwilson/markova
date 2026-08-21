"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
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
} from "@/components/ui";
import {
  useAcademicYears,
  useTerms,
  useClassLevels,
  useSections,
} from "@/hooks/use-academic";
import {
  useTermResults,
  useCalculateTermResults,
  usePublishTermResults,
} from "@/hooks/use-marks";
import {
  ClipboardList,
  Calculator,
  Download,
  Eye,
  EyeOff,
} from "lucide-react";
import api from "@/lib/api";
import { toLocalDateString } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

export default function AdminMarksPage() {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const { data: classLevels } = useClassLevels();

  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedSectionChoice, setSelectedSection] = useState("");
  const [selectedTermChoice, setSelectedTerm] = useState("");
  // Derived during render rather than synced in an effect: the user's
  // explicit choice wins, otherwise fall back to the server default.
  const selectedTerm = selectedTermChoice || terms?.find((t: any) => t.isCurrent)?.id || "";

  const { data: sections } = useSections(selectedLevel);
  // Derived during render rather than synced in an effect: the user's
  // explicit choice wins, otherwise fall back to the server default.
  const selectedSection = selectedSectionChoice || sections?.[0]?.id || "";
  const { data: results, isLoading } = useTermResults(selectedSection, selectedTerm);
  const calculateResults = useCalculateTermResults();
  const publishResults = usePublishTermResults();

  const handleExportCSV = () => {
    if (!results?.length) return;
    const headers = ["Rank", "Name", "Average", "Grade", "Published"];
    const rows = results.map((r: any) => [
      r.rank || "",
      `${r.student.user.firstName} ${r.student.user.lastName}`,
      r.average?.toFixed(1) || "",
      r.letterGrade || "",
      r.isPublished ? "Yes" : "No",
    ]);
    const csv = [headers.join(","), ...rows.map((r: any) => r.map((c: any) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `term_results_${toLocalDateString(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isPublished = results?.length > 0 && results.every((r: any) => r.isPublished);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marks Overview"
        description="View and manage class results"
        actions={
          <>
            <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (selectedSection && selectedTerm) {
                calculateResults.mutate({ classSectionId: selectedSection, termId: selectedTerm });
              }
            }}
            isLoading={calculateResults.isPending}
            disabled={!selectedSection || !selectedTerm}
          >
            <Calculator className="mr-1 h-4 w-4" /> Calculate Results
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={!results?.length}
          >
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Class Level</label>
            <select
              value={selectedLevel}
              onChange={(e) => {
                setSelectedLevel(e.target.value);
                setSelectedSection("");
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Class Level">
              <option value="">Select level...</option>
              {classLevels?.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Section">
              <option value="">Select section...</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Term">
              <option value="">Select term...</option>
              {terms?.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isCurrent ? "(Current)" : ""} {t.isClosed ? "Closed" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(selectedLevel || selectedSection || selectedTerm) && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedLevel("");
                setSelectedSection("");
                setSelectedTerm("");
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Summary Stats */}
      {results && results.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card>
            <p className="text-xs text-muted">Students</p>
            <p className="text-2xl font-bold text-foreground">{results.length}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Class Average</p>
            <p className="text-2xl font-bold text-primary">
              {(results.reduce((s: number, r: any) => s + (r.average || 0), 0) / results.length).toFixed(1)}%
            </p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Highest</p>
            <p className="text-2xl font-bold text-success">
              {Math.max(...results.map((r: any) => r.average || 0)).toFixed(1)}%
            </p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Lowest</p>
            <p className="text-2xl font-bold text-danger">
              {Math.min(...results.map((r: any) => r.average || 0)).toFixed(1)}%
            </p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Status</p>
            <div className="mt-1">
              <Button aria-label="Hide"
                size="sm"
                variant={isPublished ? "danger" : "primary"}
                onClick={() => {
                  const msg = isPublished
                    ? 'Are you sure you want to unpublish these results? They will no longer be visible to students and parents.'
                    : 'Are you sure you want to publish these results? All students and parents will be able to view them.';
                  setConfirmMessage(msg);
                  setConfirmAction(() => () => publishResults.mutate({
                    classSectionId: selectedSection,
                    termId: selectedTerm,
                    isPublished: !isPublished,
                  }));
                }}
                isLoading={publishResults.isPending}
              >
                {isPublished ? (
                  <><EyeOff className="mr-1 h-3 w-3" /> Unpublish</>
                ) : (
                  <><Eye className="mr-1 h-3 w-3" /> Publish</>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : results && results.length > 0 ? (
        <Card>
          <CardTitle>
            <ClipboardList className="mr-2 inline h-5 w-5" />
            Term Results ({results.length} students)
          </CardTitle>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Total Marks</TableHead>
                  <TableHead>Average</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        r.rank === 1 ? "bg-warning-wash text-warning" :
                        r.rank === 2 ? "bg-surface-muted text-foreground-muted" :
                        r.rank === 3 ? "bg-warning-wash text-warning" :
                        "bg-muted/10 text-muted"
                      }`}>
                        {r.rank || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {r.student.user.firstName} {r.student.user.lastName}
                      </p>
                    </TableCell>
                    <TableCell>{r.totalMarks?.toFixed(1) || "—"}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${
                        (r.average || 0) >= 80 ? "text-success" :
                        (r.average || 0) >= 60 ? "text-primary" :
                        (r.average || 0) >= 50 ? "text-warning" :
                        "text-danger"
                      }`}>
                        {r.average?.toFixed(1) || "—"}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        r.letterGrade === "A" ? "success" :
                        r.letterGrade === "B" ? "success" :
                        r.letterGrade === "C" ? "warning" :
                        "danger"
                      }>
                        {r.letterGrade || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.isPublished ? (
                        <Badge variant="success">Published</Badge>
                      ) : (
                        <Badge>Draft</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : selectedSection && selectedTerm ? (
        <Card>
          <p className="text-center text-muted py-8">
            No results yet. Click &quot;Calculate Results&quot; after marks have been entered.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-center text-muted py-8">
            Select a class level, section, and term to view results.
          </p>
        </Card>
      )}

      {/* Confirm Action Modal */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirm Action">
        <p className="text-sm text-muted mb-4">{confirmMessage}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { confirmAction?.(); setConfirmAction(null); }}>Confirm</Button>
        </div>
      </Modal>
    </div>
  );
}
