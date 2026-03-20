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
} from "@/components/ui";
import {
  useAcademicYears,
  useClassLevels,
  useSections,
  usePromoteStudents,
  useSchoolConfig,
} from "@/hooks/use-academic";
import { ArrowUpCircle, ArrowRight, CheckCircle2, XCircle } from "lucide-react";

export default function AdminPromotionPage() {
  const { data: years } = useAcademicYears();
  const { data: levels } = useClassLevels();
  const { data: config } = useSchoolConfig();
  const promoteStudents = usePromoteStudents();

  const [academicYearId, setAcademicYearId] = useState("");
  const [fromLevelId, setFromLevelId] = useState("");
  const [toLevelId, setToLevelId] = useState("");
  const [fromSectionId, setFromSectionId] = useState("");
  const [toSectionId, setToSectionId] = useState("");
  const [passThreshold, setPassThreshold] = useState("");
  const [results, setResults] = useState<{ promoted: any[]; retained: any[] } | null>(null);

  const { data: fromSections } = useSections(fromLevelId || undefined);
  const { data: toSections } = useSections(toLevelId || undefined);

  // Get default pass threshold from school config
  const defaultThreshold = config?.find((c: any) => c.key === "passThreshold")?.value;

  const handlePromote = () => {
    if (!fromSectionId || !toSectionId || !academicYearId) return;

    const threshold = passThreshold ? Number(passThreshold) : defaultThreshold ? Number(defaultThreshold) : undefined;

    promoteStudents.mutate(
      {
        fromClassSectionId: fromSectionId,
        toClassSectionId: toSectionId,
        academicYearId,
        ...(threshold !== undefined && { passThreshold: threshold }),
      },
      {
        onSuccess: (data) => {
          setResults(data);
        },
      }
    );
  };

  const handleReset = () => {
    setFromLevelId("");
    setToLevelId("");
    setFromSectionId("");
    setToSectionId("");
    setPassThreshold("");
    setResults(null);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Student Promotion</h1>
        <p className="mt-1 text-sm text-muted">
          Promote students from one class section to another based on academic performance
        </p>
      </div>

      <Card className="mb-6">
        <CardTitle>Promotion Settings</CardTitle>
        <div className="mt-4 space-y-4">
          {/* Academic Year */}
          <div>
            <label className="mb-1 block text-sm font-medium">Academic Year</label>
            <select
              className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
            >
              <option value="">Select academic year</option>
              {years?.map((y: any) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.isCurrent ? "(Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* From / To Class Selection */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* From Class */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">From Class</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Class Level</label>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={fromLevelId}
                    onChange={(e) => { setFromLevelId(e.target.value); setFromSectionId(""); }}
                  >
                    <option value="">Select level</option>
                    {levels?.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Section</label>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={fromSectionId}
                    onChange={(e) => setFromSectionId(e.target.value)}
                    disabled={!fromLevelId}
                  >
                    <option value="">Select section</option>
                    {fromSections?.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* To Class */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">To Class</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Class Level</label>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={toLevelId}
                    onChange={(e) => { setToLevelId(e.target.value); setToSectionId(""); }}
                  >
                    <option value="">Select level</option>
                    {levels?.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Section</label>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={toSectionId}
                    onChange={(e) => setToSectionId(e.target.value)}
                    disabled={!toLevelId}
                  >
                    <option value="">Select section</option>
                    {toSections?.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Pass Threshold */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Pass Threshold (%)
              {defaultThreshold && (
                <span className="ml-2 text-xs text-muted font-normal">
                  Default from config: {defaultThreshold}%
                </span>
              )}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
              placeholder={defaultThreshold ? `${defaultThreshold}` : "50"}
              value={passThreshold}
              onChange={(e) => setPassThreshold(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Students scoring at or above this threshold will be promoted. Leave blank to use the school default.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handlePromote}
              isLoading={promoteStudents.isPending}
              disabled={!fromSectionId || !toSectionId || !academicYearId}
            >
              <ArrowUpCircle className="mr-2 h-4 w-4" />
              Promote Students
            </Button>
            {results && (
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Results */}
      {promoteStudents.isPending && <PageSpinner />}

      {results && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card padding="sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">
                  {results.promoted.length + results.retained.length}
                </p>
                <p className="text-sm text-muted">Total Students</p>
              </div>
            </Card>
            <Card padding="sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{results.promoted.length}</p>
                <p className="text-sm text-muted">Promoted</p>
              </div>
            </Card>
            <Card padding="sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-danger">{results.retained.length}</p>
                <p className="text-sm text-muted">Retained</p>
              </div>
            </Card>
          </div>

          {/* Promoted List */}
          {results.promoted.length > 0 && (
            <Card>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  Promoted Students ({results.promoted.length})
                </div>
              </CardTitle>
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.promoted.map((s: any, i: number) => (
                      <TableRow key={s.id || i}>
                        <TableCell className="text-muted">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {s.firstName || s.user?.firstName || ""} {s.lastName || s.user?.lastName || ""}
                        </TableCell>
                        <TableCell>{s.average != null ? `${s.average}%` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="success">Promoted</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Retained List */}
          {results.retained.length > 0 && (
            <Card>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-danger" />
                  Retained Students ({results.retained.length})
                </div>
              </CardTitle>
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.retained.map((s: any, i: number) => (
                      <TableRow key={s.id || i}>
                        <TableCell className="text-muted">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {s.firstName || s.user?.firstName || ""} {s.lastName || s.user?.lastName || ""}
                        </TableCell>
                        <TableCell>{s.average != null ? `${s.average}%` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="danger">Retained</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
