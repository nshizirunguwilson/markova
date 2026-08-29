"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Shield,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  PageSpinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { useUser } from "@/hooks/use-users";
import { classDisplayName } from "@/lib/utils";
import { formatNid } from "@/lib/person-form";

/** Timetable rows carry 1=Monday … 7=Sunday. */
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const SPECIAL_ROLE_LABEL: Record<string, string> = {
  DOS: "Director of Studies",
  HOD: "Head of Department",
  CLASS_TEACHER: "Class Teacher",
};

/** "08:30" → minutes since midnight, for comparing against the clock. */
function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/**
 * The lesson the teacher is in at this moment, and the one after it.
 *
 * Exported so the clock arithmetic can be checked without standing up a page:
 * "where is this teacher right now" is the question the front office asks, and
 * an off-by-one here sends somebody to the wrong classroom.
 */
export function currentLesson(
  timetable: any[],
  now: Date = new Date(),
): { now: any | null; next: any | null } {
  // JS Sunday is 0; the schema counts Monday as 1 through Sunday as 7.
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  const today = (timetable || [])
    .filter((t) => t.dayOfWeek === day)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  const inProgress =
    today.find(
      (t) => toMinutes(t.startTime) <= minutes && minutes < toMinutes(t.endTime),
    ) ?? null;
  const next = today.find((t) => toMinutes(t.startTime) > minutes) ?? null;

  return { now: inProgress, next };
}

export default function TeacherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: user, isLoading } = useUser(id);

  const teacher = user?.teacher;
  const assignments = useMemo(
    () => teacher?.teacherSubjectClasses ?? [],
    [teacher],
  );
  const timetable = useMemo(() => teacher?.timetables ?? [], [teacher]);

  /**
   * One row per class this teacher takes, with every subject they take it
   * for. Teachers are assigned per subject per class, so a flat list repeats
   * the same class four times over and never answers "which classes do they
   * teach".
   */
  const classes = useMemo(() => {
    const byClass = new Map<string, { section: any; subjects: string[]; students: number }>();
    for (const a of assignments) {
      // Nothing to group a row without a class by, and nothing to show for it
      // either - the row would render as a blank class name.
      const key = a.classSection?.id;
      if (!key) continue;
      const entry = byClass.get(key) ?? {
        section: a.classSection,
        subjects: [] as string[],
        students: a.classSection?._count?.students ?? 0,
      };
      if (a.subject?.name && !entry.subjects.includes(a.subject.name)) {
        entry.subjects.push(a.subject.name);
      }
      byClass.set(key, entry);
    }
    return [...byClass.values()].sort((a, b) =>
      classDisplayName(a.section).localeCompare(classDisplayName(b.section)),
    );
  }, [assignments]);

  const subjects = useMemo(() => {
    const names = new Set<string>();
    for (const a of assignments) if (a.subject?.name) names.add(a.subject.name);
    return [...names].sort();
  }, [assignments]);

  const classTeacherOf = useMemo(
    () =>
      (teacher?.roles ?? []).filter(
        (r: any) => r.role === "CLASS_TEACHER" && r.classSection,
      ),
    [teacher],
  );

  const lesson = useMemo(() => currentLesson(timetable), [timetable]);

  const byDay = useMemo(() => {
    const days = new Map<number, any[]>();
    for (const row of timetable) {
      days.set(row.dayOfWeek, [...(days.get(row.dayOfWeek) ?? []), row]);
    }
    return [...days.entries()].sort((a, b) => a[0] - b[0]);
  }, [timetable]);

  if (isLoading) return <PageSpinner />;
  if (!user) return <p className="p-8 text-muted">Teacher not found</p>;
  if (user.role !== "TEACHER") {
    return (
      <div className="p-8">
        <p className="text-muted">
          {user.firstName} {user.lastName} is not a teacher.
        </p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => router.push(`/admin/users/${user.id}`)}
        >
          Open their profile instead
        </Button>
      </div>
    );
  }

  const residence = [user.province, user.district, user.sector]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            aria-label="Go back"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/admin/teachers")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar
            src={user.photoUrl}
            fallback={`${user.firstName[0]}${user.lastName[0]}`}
            size="lg"
          />
          <div>
            <h1 className="text-xl font-bold text-foreground md:text-2xl">
              {user.firstName} {user.lastName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {user.code && (
                <span className="font-mono text-xs text-muted">{user.code}</span>
              )}
              <Badge variant={user.isActive ? "success" : "danger"}>
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
              {(teacher?.roles ?? []).map((r: any) => (
                <Badge key={r.id} variant="info">
                  {SPECIAL_ROLE_LABEL[r.role] ?? r.role}
                  {r.classSection ? ` - ${classDisplayName(r.classSection)}` : ""}
                  {r.department ? ` - ${r.department}` : ""}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <Button onClick={() => router.push(`/admin/users/${user.id}`)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit details
        </Button>
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Classes taught" value={String(classes.length)} icon={Users} />
        <Stat label="Subjects" value={String(subjects.length)} icon={BookOpen} />
        <Stat
          label="Periods a week"
          value={String(timetable.length)}
          icon={CalendarClock}
        />
        <Stat
          label="Class teacher of"
          value={
            classTeacherOf.length
              ? classTeacherOf
                  .map((r: any) => classDisplayName(r.classSection))
                  .join(", ")
              : "-"
          }
          icon={GraduationCap}
        />
      </div>

      {/* Right now */}
      <Card>
        <CardTitle>Right now</CardTitle>
        <div className="mt-3 text-sm">
          {lesson.now ? (
            <p className="text-foreground">
              Teaching{" "}
              <strong>{lesson.now.subject?.name}</strong> to{" "}
              <strong>{classDisplayName(lesson.now.classSection)}</strong>
              {lesson.now.room ? ` in ${lesson.now.room}` : ""} until{" "}
              {lesson.now.endTime}.
            </p>
          ) : (
            <p className="text-muted">Not scheduled to be teaching at the moment.</p>
          )}
          {lesson.next && (
            <p className="mt-1 text-muted">
              Next: {lesson.next.subject?.name} with{" "}
              {classDisplayName(lesson.next.classSection)} at {lesson.next.startTime}
              {lesson.next.room ? ` in ${lesson.next.room}` : ""}.
            </p>
          )}
          {!lesson.now && !lesson.next && timetable.length > 0 && (
            <p className="mt-1 text-muted">Nothing further on the timetable today.</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Classes */}
          <Card>
            <CardTitle>Classes &amp; subjects</CardTitle>
            {classes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Not assigned to any class this year.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Subjects taught</TableHead>
                      <TableHead>Students</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classes.map((c) => (
                      <TableRow key={c.section?.id ?? classDisplayName(c.section)}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {classDisplayName(c.section) || "-"}
                            {classTeacherOf.some(
                              (r: any) => r.classSection?.id === c.section?.id,
                            ) && <Badge variant="info">Class teacher</Badge>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {c.subjects.map((s) => (
                              <Badge key={s}>{s}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{c.students || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* Timetable */}
          <Card>
            <CardTitle>Weekly timetable</CardTitle>
            {byDay.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No periods on the timetable yet.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {byDay.map(([day, rows]) => (
                  <div key={day}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                      {DAYS[day] ?? `Day ${day}`}
                    </p>
                    <div className="space-y-1">
                      {rows.map((row: any) => (
                        <div
                          key={row.id}
                          className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 text-sm ${
                            row.id === lesson.now?.id
                              ? "bg-accent-light text-foreground"
                              : "bg-surface-muted"
                          }`}
                        >
                          <span className="font-mono text-xs text-muted">
                            {row.startTime}-{row.endTime}
                          </span>
                          <span className="font-medium">{row.subject?.name}</span>
                          <span className="text-muted">
                            {classDisplayName(row.classSection)}
                          </span>
                          {row.room && (
                            <span className="text-xs text-muted">{row.room}</span>
                          )}
                          {row.id === lesson.now?.id && (
                            <Badge variant="success">Now</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Personal + employment */}
        <div className="space-y-5">
          <Card>
            <CardTitle>Contact</CardTitle>
            <div className="mt-3 space-y-3">
              <Field icon={Mail} label="Email" value={user.email || "-"} />
              <Field icon={Phone} label="Phone" value={user.phone || "-"} />
              {residence && (
                <Field icon={MapPin} label="Residence" value={residence} />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Employment</CardTitle>
            <div className="mt-3 space-y-3">
              <Field
                label="Status"
                value={(teacher?.employmentStatus || "-").replace("_", " ")}
              />
              <Field label="Qualification" value={teacher?.qualification || "-"} />
              <Field label="RSSB number" value={teacher?.rssbNumber || "-"} />
              <Field
                label="Hired"
                value={
                  teacher?.hireDate
                    ? new Date(teacher.hireDate).toLocaleDateString()
                    : "-"
                }
              />
            </div>
          </Card>

          <Card>
            <CardTitle>Personal</CardTitle>
            <div className="mt-3 space-y-3">
              <Field
                icon={Shield}
                label="National ID"
                value={user.nationalId ? formatNid(user.nationalId) : "-"}
              />
              <Field label="Nationality" value={user.nationality || "-"} />
              <Field label="Gender" value={user.gender || "-"} />
              <Field
                label="Date of birth"
                value={
                  user.dateOfBirth
                    ? new Date(user.dateOfBirth).toLocaleDateString()
                    : "-"
                }
              />
            </div>
          </Card>

          <Card>
            <CardTitle>Account</CardTitle>
            <div className="mt-3 space-y-3">
              <Field
                label="Last login"
                value={
                  user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : "Never"
                }
              />
              <Field
                label="Must change password"
                value={user.forcePasswordChange ? "Yes" : "No"}
              />
              <Field
                label="Joined"
                value={new Date(user.createdAt).toLocaleDateString()}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: any;
}) {
  return (
    <Card padding="sm">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-xs text-muted">{label}</p>
          <p className="truncate text-lg font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon?: any;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
