"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  Modal,
  ExportDropdown,
} from "@/components/ui";
import {
  useClassLevels,
  useSections,
  useCreateClassLevel,
  useUpdateClassLevel,
  useDeleteClassLevel,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
} from "@/hooks/use-academic";
import { exportData } from "@/lib/export";
import { Plus, Pencil, Trash2, School, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";

const levelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  order: z.number().min(0, "Order must be 0 or greater"),
});
type LevelForm = z.infer<typeof levelSchema>;

const sectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  classLevelId: z.string().min(1, "Class level is required"),
});
type SectionForm = z.infer<typeof sectionSchema>;

export default function AdminClassesPage() {
  const { data: levels, isLoading } = useClassLevels();
  const createLevel = useCreateClassLevel();
  const updateLevel = useUpdateClassLevel();
  const deleteLevel = useDeleteClassLevel();
  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();

  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "level" | "section"; id: string; name: string } | null>(null);

  const {
    register: registerLevel,
    handleSubmit: handleSubmitLevel,
    reset: resetLevel,
    formState: { errors: levelErrors },
  } = useForm<LevelForm>({
    resolver: zodResolver(levelSchema),
    defaultValues: { name: "", order: 0 },
  });

  const {
    register: registerSection,
    handleSubmit: handleSubmitSection,
    reset: resetSection,
    setValue: setSectionValue,
    formState: { errors: sectionErrors },
  } = useForm<SectionForm>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { name: "", classLevelId: "" },
  });

  const resetLevelForm = () => {
    resetLevel({ name: "", order: 0 });
    setEditingLevelId(null);
    setShowLevelModal(false);
  };

  const resetSectionForm = () => {
    resetSection({ name: "", classLevelId: "" });
    setEditingSectionId(null);
    setShowSectionModal(false);
  };

  const handleEditLevel = (level: any) => {
    resetLevel({ name: level.name, order: level.order || 0 });
    setEditingLevelId(level.id);
    setShowLevelModal(true);
  };

  const onSubmitLevel = (data: LevelForm) => {
    if (editingLevelId) {
      updateLevel.mutate({ id: editingLevelId, ...data }, { onSuccess: resetLevelForm });
    } else {
      createLevel.mutate(data, { onSuccess: resetLevelForm });
    }
  };

  const handleAddSection = (levelId: string) => {
    resetSection({ name: "", classLevelId: levelId });
    setShowSectionModal(true);
  };

  const handleEditSection = (section: any) => {
    resetSection({ name: section.name, classLevelId: section.classLevelId });
    setEditingSectionId(section.id);
    setShowSectionModal(true);
  };

  const onSubmitSection = (data: SectionForm) => {
    if (editingSectionId) {
      updateSection.mutate({ id: editingSectionId, ...data }, { onSuccess: resetSectionForm });
    } else {
      createSection.mutate(data, { onSuccess: resetSectionForm });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "level") {
      deleteLevel.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
    } else {
      deleteSection.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    const rows: Record<string, any>[] = [];
    levels?.forEach((level: any) => {
      const sections = level.sections || [];
      if (sections.length === 0) {
        rows.push({ _level: level.name, _section: "—", _students: "—" });
      } else {
        sections.forEach((s: any) => {
          rows.push({
            _level: level.name,
            _section: s.name,
            _students: s._count?.students ?? s.studentCount ?? "—",
          });
        });
      }
    });
    exportData(format, {
      filename: "classes",
      title: "Classes",
      columns: [
        { header: "Class Level", key: "_level" },
        { header: "Section", key: "_section" },
        { header: "Students", key: "_students" },
      ],
      data: rows,
    });
  };

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Manage class levels and sections"
        actions={
          <>
            <div className="flex gap-2">
          <ExportDropdown onExport={handleExport} disabled={!levels || levels.length === 0} />
          <Button onClick={() => { resetLevelForm(); setShowLevelModal(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Class Level
          </Button>
        </div>
          </>
        }
      />

      {isLoading ? (
        <PageSpinner />
      ) : !levels || levels.length === 0 ? (
        <Card className="p-12 text-center">
          <School className="mx-auto mb-2 h-8 w-8 text-muted opacity-40" />
          <p className="text-muted">No class levels yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {levels.map((level: any) => {
            const isExpanded = expandedLevel === level.id;
            const sections = level.sections || [];
            return (
              <Card key={level.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-muted"
                  onClick={() => setExpandedLevel(isExpanded ? null : level.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted" />
                    )}
                    <div>
                      <p className="font-semibold">{level.name}</p>
                    </div>
                    <Badge variant="default">{sections.length} section{sections.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => handleAddSection(level.id)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEditLevel(level)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: "level", id: level.id, name: level.name })}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                </div>

                {isExpanded && sections.length > 0 && (
                  <div className="border-t">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Section</TableHead>
                          <TableHead>Students</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sections.map((s: any) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>
                              <Badge variant="info">{s._count?.students ?? s.studentCount ?? "—"}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleEditSection(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: "section", id: s.id, name: s.name })}>
                                  <Trash2 className="h-4 w-4 text-danger" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {isExpanded && sections.length === 0 && (
                  <div className="border-t p-4 text-center text-sm text-muted">
                    No sections. <button className="text-primary underline" onClick={() => handleAddSection(level.id)}>Add one</button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Class Level Modal */}
      <Modal isOpen={showLevelModal} onClose={resetLevelForm} title={editingLevelId ? "Edit Class Level" : "Add Class Level"}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              className={`w-full rounded-lg border ${levelErrors.name ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerLevel("name")}
              placeholder="e.g. Senior 1"
            />
            {levelErrors.name && <p className="mt-1 text-xs text-danger">{levelErrors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Order</label>
            <input
              type="number"
              className={`w-full rounded-lg border ${levelErrors.order ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerLevel("order", { valueAsNumber: true })}
              placeholder="Display order (e.g. 1, 2, 3)"
            />
            {levelErrors.order && <p className="mt-1 text-xs text-danger">{levelErrors.order.message}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetLevelForm}>Cancel</Button>
            <Button onClick={handleSubmitLevel(onSubmitLevel)} isLoading={createLevel.isPending || updateLevel.isPending}>
              {editingLevelId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Section Modal */}
      <Modal isOpen={showSectionModal} onClose={resetSectionForm} title={editingSectionId ? "Edit Section" : "Add Section"}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              className={`w-full rounded-lg border ${sectionErrors.name ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerSection("name")}
              placeholder="e.g. A"
            />
            {sectionErrors.name && <p className="mt-1 text-xs text-danger">{sectionErrors.name.message}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetSectionForm}>Cancel</Button>
            <Button onClick={handleSubmitSection(onSubmitSection)} isLoading={createSection.isPending || updateSection.isPending}>
              {editingSectionId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="mb-4 text-sm text-muted">
          Are you sure you want to delete {deleteTarget?.type === "level" ? "class level" : "section"} <strong>{deleteTarget?.name}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteLevel.isPending || deleteSection.isPending}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
