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
  Modal,
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
import { Plus, Pencil, Trash2, School, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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
  const [deleteTarget, setDeleteTarget] = useState<{ type: "level" | "section"; id: string } | null>(null);
  const [sectionParentId, setSectionParentId] = useState("");

  const [levelForm, setLevelForm] = useState({ name: "", description: "", sortOrder: 0 });
  const [sectionForm, setSectionForm] = useState({ name: "", capacity: 50, classLevelId: "" });

  const resetLevelForm = () => {
    setLevelForm({ name: "", description: "", sortOrder: 0 });
    setEditingLevelId(null);
    setShowLevelModal(false);
  };

  const resetSectionForm = () => {
    setSectionForm({ name: "", capacity: 50, classLevelId: "" });
    setEditingSectionId(null);
    setShowSectionModal(false);
  };

  const handleEditLevel = (level: any) => {
    setLevelForm({ name: level.name, description: level.description || "", sortOrder: level.sortOrder || 0 });
    setEditingLevelId(level.id);
    setShowLevelModal(true);
  };

  const handleSaveLevel = () => {
    if (!levelForm.name) return toast.error("Name is required");
    if (editingLevelId) {
      updateLevel.mutate({ id: editingLevelId, ...levelForm }, { onSuccess: resetLevelForm });
    } else {
      createLevel.mutate(levelForm, { onSuccess: resetLevelForm });
    }
  };

  const handleAddSection = (levelId: string) => {
    setSectionParentId(levelId);
    setSectionForm({ name: "", capacity: 50, classLevelId: levelId });
    setShowSectionModal(true);
  };

  const handleEditSection = (section: any) => {
    setSectionForm({ name: section.name, capacity: section.capacity || 50, classLevelId: section.classLevelId });
    setEditingSectionId(section.id);
    setShowSectionModal(true);
  };

  const handleSaveSection = () => {
    if (!sectionForm.name) return toast.error("Name is required");
    if (editingSectionId) {
      updateSection.mutate({ id: editingSectionId, ...sectionForm }, { onSuccess: resetSectionForm });
    } else {
      createSection.mutate(sectionForm, { onSuccess: resetSectionForm });
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Classes</h1>
          <p className="mt-1 text-sm text-muted">Manage class levels and sections</p>
        </div>
        <Button onClick={() => { resetLevelForm(); setShowLevelModal(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Class Level
        </Button>
      </div>

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
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
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
                      {level.description && (
                        <p className="text-xs text-muted">{level.description}</p>
                      )}
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
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: "level", id: level.id })}>
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
                          <TableHead>Capacity</TableHead>
                          <TableHead>Students</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sections.map((s: any) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.capacity || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="info">{s._count?.students ?? s.studentCount ?? "—"}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleEditSection(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: "section", id: s.id })}>
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
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              value={levelForm.name}
              onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })}
              placeholder="e.g. Senior 1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <input
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              value={levelForm.description}
              onChange={(e) => setLevelForm({ ...levelForm, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Sort Order</label>
            <input
              type="number"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              value={levelForm.sortOrder}
              onChange={(e) => setLevelForm({ ...levelForm, sortOrder: Number(e.target.value) })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetLevelForm}>Cancel</Button>
            <Button onClick={handleSaveLevel} isLoading={createLevel.isPending || updateLevel.isPending}>
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
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              value={sectionForm.name}
              onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
              placeholder="e.g. A"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Capacity</label>
            <input
              type="number"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              value={sectionForm.capacity}
              onChange={(e) => setSectionForm({ ...sectionForm, capacity: Number(e.target.value) })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetSectionForm}>Cancel</Button>
            <Button onClick={handleSaveSection} isLoading={createSection.isPending || updateSection.isPending}>
              {editingSectionId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="mb-4 text-sm text-muted">
          Are you sure you want to delete this {deleteTarget?.type === "level" ? "class level" : "section"}? This cannot be undone.
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
