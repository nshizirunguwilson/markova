"use client";

import { useForm } from "react-hook-form";
import { Card, CardTitle, Input, Button, Badge } from "@/components/ui";
import {
  useAcademicYears,
  useCreateAcademicYear,
  useTerms,
  useCreateTerm,
  useAssessmentTypes,
  useCreateAssessmentType,
} from "@/hooks/use-academic";
import { Plus, Lock, Unlock } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function AcademicTab() {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const { data: assessmentTypes } = useAssessmentTypes();
  const createYear = useCreateAcademicYear();
  const createTerm = useCreateTerm();
  const createAT = useCreateAssessmentType();
  const qc = useQueryClient();

  const yearForm = useForm({ defaultValues: { name: "", startDate: "", endDate: "" } });
  const termForm = useForm({ defaultValues: { name: "", startDate: "", endDate: "" } });
  const atForm = useForm({ defaultValues: { name: "" } });

  const toggleTerm = async (id: string, isClosed: boolean) => {
    try {
      await api.post(`/academic/terms/${id}/${isClosed ? "reopen" : "close"}`);
      qc.invalidateQueries({ queryKey: ["terms"] });
      toast.success(isClosed ? "Term reopened" : "Term closed");
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed");
    }
  };

  return (
    <div className="space-y-5">
      {/* Academic Years */}
      <Card>
        <CardTitle>Academic Years</CardTitle>
        <div className="mt-4 space-y-2 mb-4">
          {years?.map((y: any) => (
            <div key={y.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <span className="font-medium">{y.name}</span>
              <span className="text-sm text-muted">
                {new Date(y.startDate).toLocaleDateString()} — {new Date(y.endDate).toLocaleDateString()}
              </span>
              {y.isCurrent && <Badge variant="success">Current</Badge>}
            </div>
          ))}
        </div>
        <form onSubmit={yearForm.handleSubmit((d) => createYear.mutate({ ...d, isCurrent: true }, { onSuccess: () => yearForm.reset() }))} className="flex items-end gap-3">
          <Input id="yr-name" label="Name" placeholder="2026-2027" {...yearForm.register("name")} />
          <Input id="yr-start" label="Start" type="date" {...yearForm.register("startDate")} />
          <Input id="yr-end" label="End" type="date" {...yearForm.register("endDate")} />
          <Button type="submit" size="sm" isLoading={createYear.isPending}><Plus className="h-4 w-4" /></Button>
        </form>
      </Card>

      {/* Terms */}
      <Card>
        <CardTitle>Terms ({currentYear?.name || "—"})</CardTitle>
        <div className="mt-4 space-y-2 mb-4">
          {terms?.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-muted">
                  {new Date(t.startDate).toLocaleDateString()} — {new Date(t.endDate).toLocaleDateString()}
                </span>
                {t.isCurrent && <Badge variant="success">Current</Badge>}
                {t.isClosed && <Badge variant="danger">Closed</Badge>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => toggleTerm(t.id, t.isClosed)}>
                {t.isClosed ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
        {currentYear && (
          <form onSubmit={termForm.handleSubmit((d) => createTerm.mutate({ ...d, academicYearId: currentYear.id }, { onSuccess: () => termForm.reset() }))} className="flex items-end gap-3">
            <Input id="tm-name" label="Name" placeholder="Term 1" {...termForm.register("name")} />
            <Input id="tm-start" label="Start" type="date" {...termForm.register("startDate")} />
            <Input id="tm-end" label="End" type="date" {...termForm.register("endDate")} />
            <Button type="submit" size="sm" isLoading={createTerm.isPending}><Plus className="h-4 w-4" /></Button>
          </form>
        )}
      </Card>

      {/* Assessment Types */}
      <Card>
        <CardTitle>Assessment Types</CardTitle>
        <div className="mt-4 flex flex-wrap gap-2 mb-4">
          {assessmentTypes?.map((at: any) => <Badge key={at.id}>{at.name}</Badge>)}
        </div>
        <form onSubmit={atForm.handleSubmit((d) => createAT.mutate(d, { onSuccess: () => atForm.reset() }))} className="flex items-end gap-3 max-w-sm">
          <Input id="at-name" label="Name" placeholder="e.g. Quiz" {...atForm.register("name")} />
          <Button type="submit" size="sm" isLoading={createAT.isPending}><Plus className="h-4 w-4" /></Button>
        </form>
      </Card>
    </div>
  );
}
