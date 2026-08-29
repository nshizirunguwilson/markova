"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
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
  useCreateClassLevel,
  useUpdateClassLevel,
  useDeleteClassLevel,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useTrades,
  useCreateTrade,
  useDeleteTrade,
} from "@/hooks/use-academic";
import { exportData } from "@/lib/export";
import {
  Plus,
  Pencil,
  Trash2,
  School,
  ChevronDown,
  ChevronRight,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

const O_LEVEL_MAX = 3;

const levelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  order: z.number().min(0, "Order must be 0 or greater"),
  stage: z.enum(["O_LEVEL", "A_LEVEL"]),
});
type LevelForm = z.infer<typeof levelSchema>;

const sectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  classLevelId: z.string().min(1, "Class level is required"),
  tradeId: z.string().optional(),
});
type SectionForm = z.infer<typeof sectionSchema>;

const tradeSchema = z.object({
  code: z.string().min(2, "Code is required").max(10),
  name: z.string().min(2, "Name is required"),
  sector: z.string().min(2, "Sector is required"),
});
type TradeForm = z.infer<typeof tradeSchema>;

export default function AdminClassesPage() {
  const { data: levels, isLoading } = useClassLevels();
  const { data: trades } = useTrades();
  const createLevel = useCreateClassLevel();
  const updateLevel = useUpdateClassLevel();
  const deleteLevel = useDeleteClassLevel();
  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const createTrade = useCreateTrade();
  const deleteTrade = useDeleteTrade();

  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionModalStage, setSectionModalStage] = useState<"O_LEVEL" | "A_LEVEL">("O_LEVEL");
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "level" | "section" | "trade";
    id: string;
    name: string;
  } | null>(null);

  const oLevels = (levels ?? []).filter((l: any) => l.stage !== "A_LEVEL");
  const aLevels = (levels ?? []).filter((l: any) => l.stage === "A_LEVEL");
  const oLevelFull = oLevels.length >= O_LEVEL_MAX;

  const {
    register: registerLevel,
    handleSubmit: handleSubmitLevel,
    reset: resetLevel,
    formState: { errors: levelErrors },
  } = useForm<LevelForm>({
    resolver: zodResolver(levelSchema),
    defaultValues: { name: "", order: 0, stage: "O_LEVEL" },
  });

  const {
    register: registerSection,
    handleSubmit: handleSubmitSection,
    reset: resetSection,
    formState: { errors: sectionErrors },
  } = useForm<SectionForm>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { name: "", classLevelId: "", tradeId: "" },
  });

  const {
    register: registerTrade,
    handleSubmit: handleSubmitTrade,
    reset: resetTrade,
    formState: { errors: tradeErrors },
  } = useForm<TradeForm>({
    resolver: zodResolver(tradeSchema),
    defaultValues: { code: "", name: "", sector: "" },
  });

  const resetLevelForm = () => {
    resetLevel({ name: "", order: 0, stage: "O_LEVEL" });
    setEditingLevelId(null);
    setShowLevelModal(false);
  };

  const resetSectionForm = () => {
    resetSection({ name: "", classLevelId: "", tradeId: "" });
    setEditingSectionId(null);
    setShowSectionModal(false);
  };

  const resetTradeForm = () => {
    resetTrade({ code: "", name: "", sector: "" });
    setShowTradeModal(false);
  };

  const openAddLevel = (stage: "O_LEVEL" | "A_LEVEL") => {
    const nextOrder = (levels ?? []).reduce((m: number, l: any) => Math.max(m, l.order || 0), 0) + 1;
    resetLevel({ name: "", order: nextOrder, stage });
    setEditingLevelId(null);
    setShowLevelModal(true);
  };

  const handleEditLevel = (level: any) => {
    resetLevel({ name: level.name, order: level.order || 0, stage: level.stage || "O_LEVEL" });
    setEditingLevelId(level.id);
    setShowLevelModal(true);
  };

  const onSubmitLevel = (data: LevelForm) => {
    if (editingLevelId) {
      // Stage is fixed after creation; only name/order can change.
      updateLevel.mutate(
        { id: editingLevelId, name: data.name, order: data.order },
        { onSuccess: resetLevelForm },
      );
    } else {
      createLevel.mutate(data, { onSuccess: resetLevelForm });
    }
  };

  const handleAddSection = (level: any) => {
    setSectionModalStage(level.stage === "A_LEVEL" ? "A_LEVEL" : "O_LEVEL");
    resetSection({ name: "", classLevelId: level.id, tradeId: "" });
    setEditingSectionId(null);
    setShowSectionModal(true);
  };

  const handleEditSection = (section: any, level: any) => {
    setSectionModalStage(level.stage === "A_LEVEL" ? "A_LEVEL" : "O_LEVEL");
    resetSection({
      name: section.name,
      classLevelId: section.classLevelId,
      tradeId: section.tradeId || "",
    });
    setEditingSectionId(section.id);
    setShowSectionModal(true);
  };

  const onSubmitSection = (data: SectionForm) => {
    if (sectionModalStage === "A_LEVEL" && !data.tradeId) {
      toast.error("Pick the trade this class belongs to");
      return;
    }
    const payload = {
      name: data.name,
      classLevelId: data.classLevelId,
      ...(sectionModalStage === "A_LEVEL" ? { tradeId: data.tradeId } : {}),
    };
    if (editingSectionId) {
      updateSection.mutate({ id: editingSectionId, ...payload }, { onSuccess: resetSectionForm });
    } else {
      createSection.mutate(payload, { onSuccess: resetSectionForm });
    }
  };

  const onSubmitTrade = (data: TradeForm) => {
    createTrade.mutate(
      { ...data, code: data.code.toUpperCase() },
      { onSuccess: resetTradeForm },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const onSuccess = () => setDeleteTarget(null);
    if (deleteTarget.type === "level") deleteLevel.mutate(deleteTarget.id, { onSuccess });
    else if (deleteTarget.type === "trade") deleteTrade.mutate(deleteTarget.id, { onSuccess });
    else deleteSection.mutate(deleteTarget.id, { onSuccess });
  };

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    const rows: Record<string, any>[] = [];
    (levels ?? []).forEach((level: any) => {
      const sections = level.sections || [];
      if (sections.length === 0) {
        rows.push({ _level: level.name, _trade: "-", _section: "-", _students: "-" });
      } else {
        sections.forEach((s: any) => {
          rows.push({
            _level: level.name,
            _trade: s.trade?.code ?? "-",
            _section: s.name,
            _students: s._count?.students ?? "-",
          });
        });
      }
    });
    exportData(format, {
      filename: "classes",
      title: "Classes",
      columns: [
        { header: "Class Level", key: "_level" },
        { header: "Trade", key: "_trade" },
        { header: "Stream", key: "_section" },
        { header: "Students", key: "_students" },
      ],
      data: rows,
    });
  };

  const renderLevelCard = (level: any) => {
    const isExpanded = expandedLevel === level.id;
    const sections = level.sections || [];
    const isALevel = level.stage === "A_LEVEL";
    return (
      <Card key={level.id} className="overflow-hidden" padding="sm">
        <div
          className="flex items-center justify-between p-2 cursor-pointer rounded-lg hover:bg-surface-muted"
          onClick={() => setExpandedLevel(isExpanded ? null : level.id)}
        >
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted" />
            )}
            <p className="font-semibold">{level.name}</p>
            <Badge variant="default">
              {sections.length} class{sections.length !== 1 ? "es" : ""}
            </Badge>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" onClick={() => handleAddSection(level)} aria-label={`Add class to ${level.name}`}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleEditLevel(level)} aria-label={`Edit ${level.name}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget({ type: "level", id: level.id, name: level.name })}
              aria-label={`Delete ${level.name}`}
            >
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        </div>

        {isExpanded && sections.length > 0 && (
          <div className="border-t border-border mt-1">
            <Table>
              <TableHeader>
                <TableRow>
                  {isALevel && <TableHead>Trade</TableHead>}
                  <TableHead>Stream</TableHead>
                  <TableHead>Class name</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...sections]
                  .sort((a: any, b: any) =>
                    `${a.trade?.code ?? ""}${a.name}`.localeCompare(`${b.trade?.code ?? ""}${b.name}`),
                  )
                  .map((s: any) => (
                    <TableRow key={s.id}>
                      {isALevel && (
                        <TableCell>
                          <span className="font-medium">{s.trade?.code ?? "-"}</span>
                          <span className="ml-2 text-xs text-muted">{s.trade?.name}</span>
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted">
                        {[level.name, s.trade?.code, s.name].filter(Boolean).join(" ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="info">{s._count?.students ?? 0}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditSection(s, level)} aria-label="Edit class">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDeleteTarget({
                                type: "section",
                                id: s.id,
                                name: [level.name, s.trade?.code, s.name].filter(Boolean).join(" "),
                              })
                            }
                            aria-label="Delete class"
                          >
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
          <div className="border-t border-border mt-1 p-4 text-center text-sm text-muted">
            No classes yet.{" "}
            <button className="text-primary underline" onClick={() => handleAddSection(level)}>
              Add one
            </button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Classes</h1>
          <p className="mt-1 text-sm text-muted">
            O-Level years with streams, A-Level trades with streams per level
          </p>
        </div>
        <ExportDropdown onExport={handleExport} disabled={!levels || levels.length === 0} />
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-8">
          {/* ── O-LEVEL ── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <School className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Ordinary Level
                </h2>
                <Badge variant="default">{oLevels.length} / {O_LEVEL_MAX} years</Badge>
              </div>
              <Button size="sm" onClick={() => openAddLevel("O_LEVEL")} disabled={oLevelFull}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add year level
              </Button>
            </div>
            {oLevelFull && (
              <p className="mb-3 text-xs text-muted">
                O-Level is limited to 3 year levels (Senior 1 to Senior 3).
              </p>
            )}
            <div className="space-y-3">
              {oLevels.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted">No O-Level years yet</Card>
              ) : (
                oLevels.map(renderLevelCard)
              )}
            </div>
          </section>

          {/* ── A-LEVEL (TVET) ── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Advanced Level (TVET)
                </h2>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowTradeModal(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add trade
                </Button>
                <Button size="sm" onClick={() => openAddLevel("A_LEVEL")}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add level
                </Button>
              </div>
            </div>

            {/* Trades */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(trades ?? []).map((t: any) => (
                <Card key={t.id} padding="sm" className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.code}</p>
                    <p className="text-sm text-foreground">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted">Sector of {t.sector}</p>
                    <p className="mt-1 text-xs text-muted">
                      {t._count?.sections ?? 0} classes · {t._count?.subjects ?? 0} modules
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget({ type: "trade", id: t.id, name: `${t.code} - ${t.name}` })}
                    aria-label={`Delete trade ${t.code}`}
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </Card>
              ))}
              {(trades ?? []).length === 0 && (
                <Card className="p-6 text-center text-sm text-muted sm:col-span-2 lg:col-span-4">
                  No trades yet. Add SWD, NIT, TOR, AUT or your own.
                </Card>
              )}
            </div>

            <div className="space-y-3">
              {aLevels.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted">No A-Level levels yet</Card>
              ) : (
                aLevels.map(renderLevelCard)
              )}
            </div>
          </section>
        </div>
      )}

      {/* Class Level Modal */}
      <Modal
        isOpen={showLevelModal}
        onClose={resetLevelForm}
        title={editingLevelId ? "Edit Year Level" : "Add Year Level"}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="f-name" className="mb-1 block text-sm font-medium">Name</label>
            <input id="f-name"
              className={`w-full rounded-lg border ${levelErrors.name ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerLevel("name")}
              placeholder="e.g. Senior 1 or Level 3"
            />
            {levelErrors.name && <p className="mt-1 text-xs text-danger">{levelErrors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="f-order" className="mb-1 block text-sm font-medium">Order</label>
            <input id="f-order"
              type="number"
              className={`w-full rounded-lg border ${levelErrors.order ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerLevel("order", { valueAsNumber: true })}
              placeholder="Display order (e.g. 1, 2, 3)"
            />
            {levelErrors.order && <p className="mt-1 text-xs text-danger">{levelErrors.order.message}</p>}
          </div>
          {!editingLevelId && (
            <div>
              <label htmlFor="f-stage" className="mb-1 block text-sm font-medium">Stage</label>
              <select id="f-stage"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                {...registerLevel("stage")}
              >
                <option value="O_LEVEL">Ordinary Level</option>
                <option value="A_LEVEL">Advanced Level (TVET)</option>
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetLevelForm}>Cancel</Button>
            <Button onClick={handleSubmitLevel(onSubmitLevel)} isLoading={createLevel.isPending || updateLevel.isPending}>
              {editingLevelId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Section Modal */}
      <Modal
        isOpen={showSectionModal}
        onClose={resetSectionForm}
        title={editingSectionId ? "Edit Class" : "Add Class"}
      >
        <div className="space-y-4">
          {sectionModalStage === "A_LEVEL" && (
            <div>
              <label htmlFor="f-trade" className="mb-1 block text-sm font-medium">Trade</label>
              <select id="f-trade"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                {...registerSection("tradeId")}
              >
                <option value="">Select a trade…</option>
                {(trades ?? []).map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="f-stream" className="mb-1 block text-sm font-medium">Stream</label>
            <input id="f-stream"
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

      {/* Trade Modal */}
      <Modal isOpen={showTradeModal} onClose={resetTradeForm} title="Add Trade">
        <div className="space-y-4">
          <div>
            <label htmlFor="f-code" className="mb-1 block text-sm font-medium">Code</label>
            <input id="f-code"
              className={`w-full rounded-lg border ${tradeErrors.code ? "border-danger" : "border-border"} px-3 py-2 text-sm uppercase focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerTrade("code")}
              placeholder="e.g. SWD"
            />
            {tradeErrors.code && <p className="mt-1 text-xs text-danger">{tradeErrors.code.message}</p>}
          </div>
          <div>
            <label htmlFor="f-name-2" className="mb-1 block text-sm font-medium">Name</label>
            <input id="f-name-2"
              className={`w-full rounded-lg border ${tradeErrors.name ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerTrade("name")}
              placeholder="e.g. Software Development"
            />
            {tradeErrors.name && <p className="mt-1 text-xs text-danger">{tradeErrors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="f-sector" className="mb-1 block text-sm font-medium">Sector</label>
            <input id="f-sector"
              className={`w-full rounded-lg border ${tradeErrors.sector ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...registerTrade("sector")}
              placeholder="e.g. ICT and Multimedia"
            />
            {tradeErrors.sector && <p className="mt-1 text-xs text-danger">{tradeErrors.sector.message}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetTradeForm}>Cancel</Button>
            <Button onClick={handleSubmitTrade(onSubmitTrade)} isLoading={createTrade.isPending}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="mb-4 text-sm text-muted">
          Are you sure you want to delete{" "}
          {deleteTarget?.type === "level" ? "year level" : deleteTarget?.type === "trade" ? "trade" : "class"}{" "}
          <strong>{deleteTarget?.name}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteLevel.isPending || deleteSection.isPending || deleteTrade.isPending}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
