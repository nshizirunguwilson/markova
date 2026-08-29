"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Card,
  CardTitle,
  Input,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
} from "@/components/ui";
import { useSubjects, useCreateSubject } from "@/hooks/use-academic";
import { Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/lib/errors";

export function SubjectsTab() {
  const { data: subjects } = useSubjects();
  const createSubject = useCreateSubject();
  const qc = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: { name: "", category: "", maxMarks: 100 },
  });

  const onAdd = (data: any) => {
    createSubject.mutate(
      { name: data.name, category: data.category || undefined, maxMarks: Number(data.maxMarks) },
      { onSuccess: () => reset() }
    );
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.put(`/academic/subjects/${id}`, { isActive: !isActive });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success(isActive ? "Subject deactivated" : "Subject activated");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed"));
    }
  };

  const deleteSubject = async (id: string) => {
    try {
      await api.delete(`/academic/subjects/${id}`);
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject deleted");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed - may have linked marks"));
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Subjects ({subjects?.length || 0})</CardTitle>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Max Marks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects?.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.category || "-"}</TableCell>
                  <TableCell>{s.maxMarks}</TableCell>
                  <TableCell>
                    <button onClick={() => toggleActive(s.id, s.isActive)}>
                      <Badge variant={s.isActive ? "success" : "danger"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button aria-label="Delete" size="sm" variant="ghost" onClick={() => { setConfirmMessage(`Are you sure you want to delete "${s.name}"?`); setConfirmAction(() => () => deleteSubject(s.id)); }}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardTitle>Add Subject</CardTitle>
        <form onSubmit={handleSubmit(onAdd)} className="mt-4 flex items-end gap-3 max-w-xl">
          <Input
            id="s-name"
            label="Name"
            placeholder="e.g. Physics"
            error={errors.name?.message}
            {...register("name", {
              // Without this an empty submit created a subject called "",
              // which then appears on every mark sheet as a blank column.
              required: "A subject needs a name",
              setValueAs: (v: string) => v.trim(),
            })}
          />
          <Input id="s-cat" label="Category" placeholder="Sciences" {...register("category")} />
          <Input id="s-max" label="Max" type="number" {...register("maxMarks")} />
          <Button type="submit" isLoading={createSubject.isPending}><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </form>
      </Card>

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
