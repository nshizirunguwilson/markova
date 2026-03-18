"use client";

import { useForm } from "react-hook-form";
import { Input, Button, Badge } from "@/components/ui";
import { useSubjects, useCreateSubject, useAssessmentTypes, useCreateAssessmentType } from "@/hooks/use-academic";
import { Plus, BookOpen } from "lucide-react";

export function StepSubjects() {
  const { data: subjects } = useSubjects();
  const createSubject = useCreateSubject();
  const { data: assessmentTypes } = useAssessmentTypes();
  const createAssessmentType = useCreateAssessmentType();

  const subjectForm = useForm({ defaultValues: { name: "", category: "", maxMarks: 100 } });
  const atForm = useForm({ defaultValues: { name: "" } });

  const onAddSubject = (data: any) => {
    createSubject.mutate({ ...data, maxMarks: Number(data.maxMarks) }, { onSuccess: () => subjectForm.reset() });
  };

  const onAddAT = (data: any) => {
    createAssessmentType.mutate(data, { onSuccess: () => atForm.reset() });
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Subjects & Assessment Types</h2>
      <p className="mb-6 text-sm text-muted">Add the subjects taught and how they are assessed</p>

      <div className="grid grid-cols-2 gap-8">
        {/* Subjects */}
        <div>
          <h3 className="mb-3 font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Subjects
          </h3>
          {subjects?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {subjects.map((s: any) => (
                <Badge key={s.id} variant={s.isActive ? "success" : "default"}>
                  {s.name} {s.category && `(${s.category})`}
                </Badge>
              ))}
            </div>
          )}
          <form onSubmit={subjectForm.handleSubmit(onAddSubject)} className="space-y-3">
            <Input id="subj-name" label="Subject Name" placeholder="e.g. Mathematics" {...subjectForm.register("name")} />
            <div className="grid grid-cols-2 gap-3">
              <Input id="category" label="Category" placeholder="e.g. Sciences" {...subjectForm.register("category")} />
              <Input id="maxMarks" label="Max Marks" type="number" {...subjectForm.register("maxMarks")} />
            </div>
            <Button type="submit" size="sm" isLoading={createSubject.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Add Subject
            </Button>
          </form>
        </div>

        {/* Assessment Types */}
        <div>
          <h3 className="mb-3 font-semibold text-foreground">Assessment Types</h3>
          {assessmentTypes?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {assessmentTypes.map((at: any) => (
                <Badge key={at.id}>{at.name}</Badge>
              ))}
            </div>
          )}
          <form onSubmit={atForm.handleSubmit(onAddAT)} className="space-y-3">
            <Input id="at-name" label="Type Name" placeholder="e.g. Midterm Exam" {...atForm.register("name")} />
            <Button type="submit" size="sm" isLoading={createAssessmentType.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Add Type
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
