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
  usePublishReportCards,
} from "@/hooks/use-marks";
import {
  ClipboardList,
  Calculator,
  Download,
  Eye,
  EyeOff,
  FileText,
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

  const { data: allSections } = useSections(selectedLevel || undefined);
  // `/academic/sections` with no level answers with every class in the school,
  // and this page used to fall back to the first of them. Opening Marks
  // therefore showed a real class the admin had never chosen — marks for
  // someone else's roll, under a "Select level..." placeholder. Nothing is
  // loaded now until a level and a section are both picked.
  const sections = selectedLevel ? allSections : undefined;
  const selectedSection = selectedLevel ? selectedSectionChoice : "";
  const { data: results, isLoading } = useTermResults(selectedSection, selectedTerm);
  const calculateResults = useCalculateTermResults();
  const publishResults = usePublishTermResults();
  const publishReportCards = usePublishReportCards();

  const handleExportCSV = () => {
    if (!results?.length) return;
    const headers = ["Rank", "Name", "Average", "Grade", "Published"];
    const rows = results.map((r: any) => [
      r.rank || "",
      `${r.student?.user?.firstName ?? ""} ${r.student?.user?.lastName ?? ""}`.trim(),
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
  const partiallyPublished =
    !isPublished && results?.length > 0 && results.some((r: any) => r.isPublished);

  /**
   * Issuing the report cards is a separate decision from releasing the marks,
   * so it carries its own state. A school routinely lets marks out as soon as
   * they are checked and issues the document later, after deliberation.
   */
  const cardsIssued =
    results?.length > 0 && results.every((r: any) => r.reportCardPublished);
  const cardsPartlyIssued =
    !cardsIssued &&
    results?.length > 0 &&
    results.some((r: any) => r.reportCardPublished);

  // The most recent calculation across the class. Recalculating unchanged
  // marks produces identical numbers, so this is the only thing that tells
  // an admin the button did anything.
  const lastCalculated = results?.length
    ? results
        .map((r: any) => r.calculatedAt)
        .filter(Boolean)
        .sort()
        .at(-1)
    : null;

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
            title="Re-reads every mark this class has for this term and works out each subject total, the average, the letter grade, the aggregate and the class position. Run it after marks are entered or corrected. It does not make anything visible to students."
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
            <label htmlFor="f-class-level" className="mb-1 block text-sm font-medium text-foreground">Class Level</label>
            <select id="f-class-level"
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
            <label htmlFor="f-section" className="mb-1 block text-sm font-medium text-foreground">Section</label>
            <select id="f-section"
              value={selectedSection}
              disabled={!selectedLevel}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
             aria-label="Section">
              <option value="">{selectedLevel ? "Select section..." : "Pick a level first"}</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-term" className="mb-1 block text-sm font-medium text-foreground">Term</label>
            <select id="f-term"
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
          {/* Two separate decisions, so two separate controls. Releasing the
              marks lets a family see the figures; issuing the report card
              hands them the document, which a school does later, after
              deliberation and once the comments are written. */}
          <Card>
            <p className="text-xs text-muted">Marks</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {isPublished ? "Published" : partiallyPublished ? "Partly published" : "Draft"}
            </p>
            <div className="mt-2">
              <Button
                aria-label={isPublished ? "Unpublish marks" : "Publish marks"}
                size="sm"
                variant={isPublished ? "danger" : "primary"}
                onClick={() => {
                  setConfirmMessage(
                    isPublished
                      ? "Take these marks back? Students and parents will stop seeing their subject breakdown, average and position — and any report cards you have issued for this class are withdrawn with them."
                      : "Release these marks? Every student in the class and their parents will be able to see their subject breakdown, average and position.",
                  );
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
          <Card>
            <p className="text-xs text-muted">Report cards</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {cardsIssued ? "Issued" : cardsPartlyIssued ? "Partly issued" : "Not issued"}
            </p>
            <div className="mt-2">
              <Button
                aria-label={cardsIssued ? "Withdraw report cards" : "Issue report cards"}
                size="sm"
                variant={cardsIssued ? "danger" : "primary"}
                disabled={!cardsIssued && !isPublished}
                title={
                  !cardsIssued && !isPublished
                    ? "Publish the marks first — a report card carries them"
                    : undefined
                }
                onClick={() => {
                  setConfirmMessage(
                    cardsIssued
                      ? "Withdraw these report cards? Students and parents will no longer be able to open the document. Their marks stay published."
                      : "Issue these report cards? Every student in the class and their parents will be able to open and print the full document.",
                  );
                  setConfirmAction(() => () => publishReportCards.mutate({
                    classSectionId: selectedSection,
                    termId: selectedTerm,
                    isPublished: !cardsIssued,
                  }));
                }}
                isLoading={publishReportCards.isPending}
              >
                {cardsIssued ? (
                  <><EyeOff className="mr-1 h-3 w-3" /> Withdraw</>
                ) : (
                  <><FileText className="mr-1 h-3 w-3" /> Issue</>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* What the two buttons above actually do. The page showed results the
          moment a class was picked, so Calculate looked like it did nothing:
          the figures were already worked out. Saying when, and saying plainly
          that calculating is not publishing, is what was missing. */}
      {results && results.length > 0 && (
        <Card padding="sm">
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">
              <strong className="text-foreground">Calculate Results</strong> works
              out totals, grades and positions from the marks teachers have
              entered. It changes nothing a family can see.{" "}
              <strong className="text-foreground">Publish</strong> releases the
              marks; <strong className="text-foreground">Issue</strong> hands
              over the report card.
            </p>
            <p className="shrink-0 text-xs text-muted">
              {lastCalculated
                ? `Last worked out ${new Date(lastCalculated).toLocaleString()}`
                : "Not worked out yet"}
            </p>
          </div>
        </Card>
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
                        {/* A result the API answered without its student still
                            has to draw: a white screen here reads as marks
                            that have gone missing. */}
                        {`${r.student?.user?.firstName ?? ""} ${
                          r.student?.user?.lastName ?? ""
                        }`.trim() || "—"}
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
          <div className="mx-auto max-w-xl text-center text-xs text-muted">
            <p className="mb-2 font-medium text-foreground">How a term’s results reach a family</p>
            <p>
              Teachers enter marks. <strong>Calculate Results</strong> turns
              those into subject totals, averages, grades and class positions —
              visible to staff only. <strong>Publish</strong> releases the marks
              to students and parents. <strong>Issue</strong> then hands over the
              report card itself, which most schools do later, after
              deliberation.
            </p>
          </div>
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
