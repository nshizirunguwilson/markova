"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import {
  useSchoolConfig,
  useAcademicYears,
  useTerms,
  useClassLevels,
  useSubjects,
  useAssessmentTypes,
  useAssignments,
} from "@/hooks/use-academic";
import { useUsers } from "@/hooks/use-users";

interface Props {
  onComplete: () => void;
}

export function StepReview({ onComplete }: Props) {
  const { data: config } = useSchoolConfig();
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const { data: levels } = useClassLevels();
  const { data: subjects } = useSubjects();
  const { data: assessmentTypes } = useAssessmentTypes();
  const { data: teachersData } = useUsers({ role: "TEACHER", limit: 100 });
  const { data: studentsData } = useUsers({ role: "STUDENT", limit: 1 });
  const { data: assignments } = useAssignments(
    currentYear ? { academicYearId: currentYear.id } : undefined
  );

  const map = config?.map || {};
  const teachers = teachersData?.data || [];
  const totalStudents = studentsData?.meta?.total || 0;

  const checks = [
    { label: "School Name", ok: !!map.school_name, value: map.school_name },
    { label: "Academic Year", ok: !!currentYear, value: currentYear?.name },
    { label: "Terms", ok: (terms?.length || 0) > 0, value: `${terms?.length || 0} terms` },
    {
      label: "Class Levels",
      ok: (levels?.length || 0) > 0,
      value: `${levels?.length || 0} levels, ${levels?.reduce((acc: number, l: any) => acc + (l.sections?.length || 0), 0) || 0} sections`,
    },
    { label: "Subjects", ok: (subjects?.length || 0) > 0, value: `${subjects?.length || 0} subjects` },
    { label: "Assessment Types", ok: (assessmentTypes?.length || 0) > 0, value: `${assessmentTypes?.length || 0} types` },
    { label: "Teachers", ok: teachers.length > 0, value: `${teachers.length} teachers` },
    { label: "Students", ok: totalStudents > 0, value: `${totalStudents} students` },
    { label: "Teacher Assignments", ok: (assignments?.length || 0) > 0, value: `${assignments?.length || 0} assignments` },
  ];

  const allOk = checks.every((c) => c.ok);

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Review Setup</h2>
      <p className="mb-6 text-sm text-muted">Make sure everything is configured before finishing</p>

      <div className="space-y-3 max-w-lg mb-8">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-3">
            {check.ok ? (
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-warning shrink-0" />
            )}
            <span className="font-medium text-sm">{check.label}</span>
            <span className="text-sm text-muted">{check.value || "Not set"}</span>
          </div>
        ))}
      </div>

      {!allOk && (
        <p className="mb-4 text-sm text-warning">
          Some items are not configured. You can still complete setup and configure them later.
        </p>
      )}

      <Button size="lg" onClick={onComplete}>
        {allOk ? "Complete Setup" : "Complete Setup Anyway"}
      </Button>
    </div>
  );
}
