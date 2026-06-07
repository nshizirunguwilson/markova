"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Card, Button, Modal } from "@/components/ui";
import {
  useClassLevels,
  useSections,
  useSubjects,
  useTimetable,
  useCreateTimetable,
  useUpdateTimetable,
  useDeleteTimetable,
} from "@/hooks/use-academic";
import { useUsers } from "@/hooks/use-users";
import { CalendarDays, Trash2 } from "lucide-react";

// FullCalendar must run client-side only
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false });

// ── helpers ──────────────────────────────────────────────────────────────────
const jsToModelDay = (js: number) => (js === 0 ? 7 : js); // JS getDay 0..6 -> model 1..7
const modelToJsDay = (m: number) => (m === 7 ? 0 : m);
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const SUBJECT_COLORS = [
  "#1B4F72", "#117A65", "#B9770E", "#7D3C98", "#943126",
  "#1A5276", "#0E6655", "#6C3483", "#A04000", "#21618C",
];
function colorFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length];
}

type ModalState = {
  mode: "create" | "edit";
  entryId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  teacherId: string;
  room: string;
};

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function AdminTimetablePage() {
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId || undefined);
  const { data: subjects } = useSubjects();
  const { data: teacherData } = useUsers({ role: "TEACHER", limit: 100 });
  const teachers = teacherData?.data || [];
  const { data: entries } = useTimetable(sectionId || undefined);

  const createTt = useCreateTimetable();
  const updateTt = useUpdateTimetable();
  const deleteTt = useDeleteTimetable();

  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  // Expand each weekly recurring entry into concrete dated events for the visible range
  const events = useMemo(() => {
    if (!entries || !range) return [];
    const evs: any[] = [];
    for (const e of entries) {
      const targetJs = modelToJsDay(e.dayOfWeek);
      const cursor = new Date(range.start);
      for (; cursor < range.end; cursor.setDate(cursor.getDate() + 1)) {
        if (cursor.getDay() !== targetJs) continue;
        const [sh, sm] = e.startTime.split(":").map(Number);
        const [eh, em] = e.endTime.split(":").map(Number);
        const start = new Date(cursor); start.setHours(sh, sm, 0, 0);
        const end = new Date(cursor); end.setHours(eh, em, 0, 0);
        const color = colorFor(e.subject?.name || e.subjectId);
        const teacherName = e.teacher?.user
          ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}`
          : "";
        evs.push({
          id: `${e.id}|${start.toISOString()}`,
          title:
            `${e.subject?.name || "Lesson"}` +
            (teacherName ? ` · ${teacherName.split(" ")[0]}` : "") +
            (e.room ? ` (${e.room})` : ""),
          start,
          end,
          backgroundColor: color,
          borderColor: color,
          extendedProps: { entryId: e.id, entry: e },
        });
      }
    }
    return evs;
  }, [entries, range]);

  const openCreate = (start: Date, end: Date) => {
    setModal({
      mode: "create",
      dayOfWeek: jsToModelDay(start.getDay()),
      startTime: hhmm(start),
      endTime: hhmm(end),
      subjectId: "",
      teacherId: "",
      room: "",
    });
  };

  const openEdit = (entry: any) => {
    setModal({
      mode: "edit",
      entryId: entry.id,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      subjectId: entry.subjectId,
      teacherId: entry.teacherId,
      room: entry.room || "",
    });
  };

  // Drag-to-move and resize both land here
  const onDropResize = (info: any) => {
    const e = info.event;
    const entryId = e.extendedProps.entryId;
    if (!e.start || !e.end) return info.revert();
    updateTt.mutate(
      {
        id: entryId,
        dayOfWeek: jsToModelDay(e.start.getDay()),
        startTime: hhmm(e.start),
        endTime: hhmm(e.end),
      },
      { onError: () => info.revert() }
    );
  };

  const handleSave = () => {
    if (!modal) return;
    if (!modal.subjectId || !modal.teacherId) return;
    const payload = {
      subjectId: modal.subjectId,
      teacherId: modal.teacherId,
      dayOfWeek: Number(modal.dayOfWeek),
      startTime: modal.startTime,
      endTime: modal.endTime,
      room: modal.room || undefined,
    };
    if (modal.mode === "create") {
      createTt.mutate(
        { classSectionId: sectionId, ...payload },
        { onSuccess: () => setModal(null) }
      );
    } else {
      updateTt.mutate(
        { id: modal.entryId, ...payload },
        { onSuccess: () => setModal(null) }
      );
    }
  };

  const handleDelete = () => {
    if (modal?.entryId) {
      deleteTt.mutate(modal.entryId, { onSuccess: () => setModal(null) });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Timetable</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a class, then click a slot to add a lesson. Drag to move, drag the
          edge to resize. Switch between month, week and day.
        </p>
      </div>

      {/* Class picker */}
      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Class Level</label>
            <select
              className="rounded-lg border border-border px-3 py-2 text-sm"
              value={levelId}
              onChange={(e) => { setLevelId(e.target.value); setSectionId(""); }}
            >
              <option value="">Select level</option>
              {levels?.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Section</label>
            <select
              className="rounded-lg border border-border px-3 py-2 text-sm"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={!levelId}
            >
              <option value="">Select section</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Calendar */}
      <Card>
        {!sectionId ? (
          <div className="py-16 text-center text-muted">
            <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p>Select a class level and section to view its timetable.</p>
          </div>
        ) : (
          <div className="fc-wrap">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              firstDay={1}
              allDaySlot={false}
              slotMinTime="07:00:00"
              slotMaxTime="18:00:00"
              slotDuration="00:30:00"
              nowIndicator
              height={680}
              expandRows
              selectable
              selectMirror
              editable
              eventStartEditable
              eventDurationEditable
              events={events}
              datesSet={(arg: any) => setRange({ start: arg.start, end: arg.end })}
              select={(info: any) => openCreate(info.start, info.end)}
              dateClick={(info: any) => {
                const start = new Date(info.date);
                if (start.getHours() === 0 && start.getMinutes() === 0) start.setHours(8, 0, 0, 0);
                const end = new Date(start);
                end.setHours(start.getHours() + 1);
                openCreate(start, end);
              }}
              eventClick={(info: any) => openEdit(info.event.extendedProps.entry)}
              eventDrop={onDropResize}
              eventResize={onDropResize}
            />
          </div>
        )}
      </Card>

      {/* Create / Edit modal */}
      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "create" ? "Add lesson" : "Edit lesson"}
      >
        {modal && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Subject</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={modal.subjectId}
                onChange={(e) => setModal({ ...modal, subjectId: e.target.value })}
              >
                <option value="">Select subject</option>
                {subjects?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Teacher</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={modal.teacherId}
                onChange={(e) => setModal({ ...modal, teacherId: e.target.value })}
              >
                <option value="">Select teacher</option>
                {teachers.map((t: any) => (
                  <option key={t.id} value={t.teacher?.id || t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Day</label>
                <select
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm"
                  value={modal.dayOfWeek}
                  onChange={(e) => setModal({ ...modal, dayOfWeek: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>{DAY_NAMES[d]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Start</label>
                <input
                  type="time"
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm"
                  value={modal.startTime}
                  onChange={(e) => setModal({ ...modal, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">End</label>
                <input
                  type="time"
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm"
                  value={modal.endTime}
                  onChange={(e) => setModal({ ...modal, endTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Room (optional)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={modal.room}
                onChange={(e) => setModal({ ...modal, room: e.target.value })}
                placeholder="e.g. Lab 2"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {modal.mode === "edit" ? (
                <Button variant="ghost" onClick={handleDelete} isLoading={deleteTt.isPending}>
                  <Trash2 className="mr-1 h-4 w-4 text-danger" /> Remove
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
                <Button
                  onClick={handleSave}
                  isLoading={createTt.isPending || updateTt.isPending}
                  disabled={!modal.subjectId || !modal.teacherId}
                >
                  {modal.mode === "create" ? "Add lesson" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
