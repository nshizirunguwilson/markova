"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
} from "@/components/ui";
import {
  useAcademicYears,
  useTerms,
  useClassLevels,
  useSections,
} from "@/hooks/use-academic";
import {
  useGenerateClassReports,
  useGenerateDocument,
} from "@/hooks/use-reports";
import { FileText, Printer, Download, Users } from "lucide-react";
import { toast } from "sonner";

export default function AdminReportsPage() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [tab, setTab] = useState<"report-cards" | "documents">("report-cards");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId);
  const generateClass = useGenerateClassReports();
  const generateDoc = useGenerateDocument();

  const [docStudentId, setDocStudentId] = useState("");
  const [docType, setDocType] = useState("TRANSFER_LETTER");

  const handleGenerateClassReports = () => {
    if (!sectionId || !termId) return toast.error("Select class and term");
    generateClass.mutate(
      { classSectionId: sectionId, termId },
      {
        onSuccess: (data: any) =>
          toast.success(`Generated ${data.count} report cards`),
        onError: () => toast.error("Failed to generate"),
      }
    );
  };

  const handleGenerateDocument = () => {
    if (!docStudentId || !docType) return toast.error("Fill all fields");
    generateDoc.mutate(
      { studentId: docStudentId, type: docType },
      {
        onSuccess: () => toast.success("Document generated"),
        onError: () => toast.error("Failed to generate"),
      }
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1B4F72]">Reports & Documents</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {(["report-cards", "documents"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t
                ? "border-[#1B4F72] text-[#1B4F72]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "report-cards" ? "Report Cards" : "Documents"}
          </button>
        ))}
      </div>

      {tab === "report-cards" && (
        <Card className="p-6 space-y-4">
          <CardTitle>Generate Class Report Cards</CardTitle>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={yearId}
              onChange={(e) => {
                setYearId(e.target.value);
                setTermId("");
              }}
            >
              <option value="">Academic Year</option>
              {years?.map((y: any) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>

            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              <option value="">Term</option>
              {terms?.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value);
                setSectionId("");
              }}
            >
              <option value="">Class Level</option>
              {levels?.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Section</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleGenerateClassReports}
            disabled={generateClass.isPending}
          >
            {generateClass.isPending ? (
              <Spinner className="w-4 h-4" />
            ) : (
              <Users className="w-4 h-4 mr-2" />
            )}
            Generate Report Cards
          </Button>
        </Card>
      )}

      {tab === "documents" && (
        <Card className="p-6 space-y-4">
          <CardTitle>Generate Document</CardTitle>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Student ID (UUID)"
              className="border rounded-lg px-3 py-2 text-sm"
              value={docStudentId}
              onChange={(e) => setDocStudentId(e.target.value)}
            />

            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="TRANSFER_LETTER">Transfer Letter</option>
              <option value="ENROLLMENT_CONFIRMATION">Enrollment Confirmation</option>
              <option value="DISCIPLINE_REPORT">Discipline Report</option>
              <option value="TRANSCRIPT">Transcript</option>
            </select>

            <Button
              onClick={handleGenerateDocument}
              disabled={generateDoc.isPending}
            >
              <FileText className="w-4 h-4 mr-2" />
              Generate
            </Button>
          </div>

          {generateDoc.data && (
            <div className="mt-4 border rounded-lg p-4">
              <div className="flex justify-end mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(generateDoc.data as string);
                      w.document.close();
                      w.print();
                    }
                  }}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
              </div>
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: generateDoc.data as string }}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
