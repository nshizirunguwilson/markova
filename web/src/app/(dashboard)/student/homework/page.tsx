"use client";

import { Card, CardTitle, Badge, Spinner, Button } from "@/components/ui";
import { useStudentHomework, useSubmitHomework } from "@/hooks/use-homework";
import { useAuthStore } from "@/stores/auth-store";
import { FileText, Upload, Check, Clock, AlertCircle } from "lucide-react";

export default function StudentHomeworkPage() {
  const { user } = useAuthStore();
  const studentId = user?.studentId;
  const classSectionId = user?.classSectionId;
  const { data: homeworks, isLoading } = useStudentHomework(studentId, classSectionId);
  const submitHomework = useSubmitHomework();

  const handleSubmit = (homeworkId: string) => {
    submitHomework.mutate({ homeworkId });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Homework</h1>
        <p className="text-sm text-muted">View assignments and submit work</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : homeworks?.length > 0 ? (
        <div className="space-y-4">
          {homeworks.map((hw: any) => {
            const isPastDue = new Date(hw.dueDate) < new Date();
            const submission = hw.submission;
            const isSubmitted = !!submission;
            const isGraded = submission?.marks !== null && submission?.marks !== undefined;

            return (
              <Card key={hw.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <h3 className="font-medium text-foreground">{hw.title}</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted">{hw.subject?.name}</p>
                    {hw.description && <p className="mt-1 text-sm text-foreground">{hw.description}</p>}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                      <span>Due: {new Date(hw.dueDate).toLocaleDateString()}</span>
                      {hw.maxMarks && <span>Max: {hw.maxMarks}</span>}
                      <span>By: {hw.teacher?.user?.firstName} {hw.teacher?.user?.lastName}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {isGraded ? (
                      <>
                        <Badge variant="success">
                          <Check className="mr-1 h-3 w-3" /> Graded
                        </Badge>
                        <span className="text-lg font-bold text-primary">
                          {submission.marks}/{hw.maxMarks}
                        </span>
                      </>
                    ) : isSubmitted ? (
                      <Badge variant="success">
                        <Check className="mr-1 h-3 w-3" /> Submitted
                        {submission.isLate && " (Late)"}
                      </Badge>
                    ) : isPastDue ? (
                      <Badge variant="danger">
                        <AlertCircle className="mr-1 h-3 w-3" /> Overdue
                      </Badge>
                    ) : (
                      <Button size="sm" onClick={() => handleSubmit(hw.id)} isLoading={submitHomework.isPending}>
                        <Upload className="mr-1 h-3 w-3" /> Submit
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><p className="text-center text-muted py-8">No homework assigned.</p></Card>
      )}
    </div>
  );
}
