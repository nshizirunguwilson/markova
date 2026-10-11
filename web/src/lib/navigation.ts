import {
  Accessibility,
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  Calendar,
  AlertTriangle,
  Library,
  MessageSquare,
  Settings,
  BarChart3,
  FileText,
  HelpCircle,
  History,
  CalendarClock,
  type LucideIcon,
  Clock,
  UserCheck,
  Backpack,
  CreditCard,
  ArrowUpCircle,
  Wallet,
  HeartPulse,
  CalendarDays,
  Megaphone,
  Receipt,
  Landmark,
  Inbox,
  FileCheck,
  School,
  CalendarCheck,
  Scale,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const adminNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Admissions", href: "/admin/admissions", icon: Inbox },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Students", href: "/admin/students", icon: GraduationCap },
      { label: "Teachers", href: "/admin/teachers", icon: UserCheck },
    ],
  },
  {
    title: "Academics",
    items: [
      { label: "Subjects", href: "/admin/subjects", icon: BookOpen },
      { label: "Classes", href: "/admin/classes", icon: Backpack },
      { label: "Timetable", href: "/admin/timetable", icon: Clock },
      /* The exam timetable. The endpoints have existed since the academic
         module was written and nothing reached them, so a school could store
         one and no student could ever see it. */
      { label: "Exams", href: "/admin/exams", icon: CalendarClock },
      { label: "Support plans", href: "/admin/support", icon: Accessibility },
      { label: "Grading", href: "/grading", icon: Scale },
      /* Marks, report cards and the register are the Director of Studies'.
         They are not listed here, and the API refuses them, so a menu that
         offered them would be a menu that leads to a refusal. */
      { label: "ID Cards", href: "/admin/id-cards", icon: CreditCard },
      /* Transfer letters, transcripts and testimonials. The principal signs
         these, and until now had no way to reach the page that makes them:
         it sat only in the DOS's menu, where every button on it was refused. */
      { label: "Documents", href: "/admin/reports", icon: FileText },
      { label: "Promotion", href: "/admin/promotion", icon: ArrowUpCircle },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Discipline", href: "/admin/discipline", icon: AlertTriangle },
      { label: "Library", href: "/admin/library", icon: Library },
      { label: "School Fees", href: "/admin/finance", icon: Landmark },
      { label: "Pocket Money", href: "/admin/pocket-money", icon: Wallet },
      { label: "Health", href: "/admin/health", icon: HeartPulse },
      { label: "Assessments", href: "/admin/homework", icon: ClipboardList },
      { label: "Activities", href: "/admin/activities", icon: CalendarDays },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/admin/messages", icon: MessageSquare },
      { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      /* Every change anybody has made. Recorded since the audit interceptor
         was written and, until this entry, readable only through SQL. */
      { label: "What has changed", href: "/admin/audit", icon: History },
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "Help & Support", href: "/admin/help", icon: HelpCircle },
    ],
  },
];

const teacherNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/teacher", icon: LayoutDashboard },
    ],
  },
  {
    title: "Teaching",
    items: [
      { label: "Marks Entry", href: "/teacher/marks", icon: ClipboardList },
      /* Where a class teacher writes the comment on each card. The same
         screen the head teacher confirms from, shared rather than copied. */
      { label: "Report cards", href: "/admin/report-cards", icon: FileCheck },
      { label: "Grading", href: "/grading", icon: Scale },
      { label: "Assessments", href: "/teacher/homework", icon: FileText },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Attendance", href: "/teacher/attendance", icon: Calendar },
      { label: "Discipline", href: "/teacher/discipline", icon: AlertTriangle },
      { label: "Activities", href: "/teacher/activities", icon: CalendarDays },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/teacher/messages", icon: MessageSquare },
      { label: "Announcements", href: "/teacher/announcements", icon: Megaphone },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Analytics", href: "/teacher/analytics", icon: BarChart3 },
      { label: "Help", href: "/help", icon: HelpCircle },
    ],
  },
];

const studentNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/student", icon: LayoutDashboard },
    ],
  },
  {
    title: "Academics",
    items: [
      { label: "My Marks", href: "/student/marks", icon: ClipboardList },
      { label: "Grading", href: "/grading", icon: Scale },
      { label: "Report Card", href: "/student/reports", icon: FileText },
      { label: "School Fees", href: "/student/fees", icon: Landmark },
      { label: "My Work", href: "/student/homework", icon: BookOpen },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Attendance", href: "/student/attendance", icon: Calendar },
      { label: "Activities", href: "/student/activities", icon: CalendarDays },
      { label: "Library", href: "/student/library", icon: Library },
      { label: "Messages", href: "/student/messages", icon: MessageSquare },
      { label: "Analytics", href: "/student/analytics", icon: BarChart3 },
      { label: "Help", href: "/help", icon: HelpCircle },
    ],
  },
];

/**
 * A student who has left the school: their report cards, and nothing else.
 * The API refuses every other page to them; see
 * backend/src/common/interceptors/former-student.interceptor.ts.
 */
const formerStudentNav: NavSection[] = [
  {
    items: [{ label: "Report Card", href: "/student/reports", icon: FileText }],
  },
];

/** The pages a student who has left may still open. */
export const FORMER_STUDENT_PAGES = ["/student/reports", "/profile"];

/** A student no longer on the roll: withdrawn, expelled, moved or graduated. */
export function isFormerStudent(
  user: { role?: string; studentStatus?: string | null } | null | undefined,
): boolean {
  return (
    user?.role === "STUDENT" &&
    !!user.studentStatus &&
    user.studentStatus !== "ACTIVE"
  );
}

const parentNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/parent", icon: LayoutDashboard },
    ],
  },
  {
    title: "My Children",
    items: [
      { label: "Marks", href: "/parent/marks", icon: ClipboardList },
      { label: "Grading", href: "/grading", icon: Scale },
      { label: "Attendance", href: "/parent/attendance", icon: Calendar },
      { label: "Discipline", href: "/parent/discipline", icon: AlertTriangle },
      { label: "Report Cards", href: "/parent/reports", icon: FileText },
      { label: "School Fees", href: "/parent/fees", icon: Landmark },
      { label: "Pocket Money", href: "/parent/pocket-money", icon: Wallet },
      { label: "Activities", href: "/parent/activities", icon: CalendarDays },
      { label: "Health", href: "/parent/health", icon: HeartPulse },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/parent/messages", icon: MessageSquare },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Analytics", href: "/parent/analytics", icon: BarChart3 },
      { label: "Help", href: "/help", icon: HelpCircle },
    ],
  },
];

const librarianNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/librarian", icon: LayoutDashboard },
    ],
  },
  {
    title: "Library",
    items: [
      { label: "Books", href: "/librarian/books", icon: Library },
      { label: "Borrowed books", href: "/librarian/loans", icon: BookOpen },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/librarian/messages", icon: MessageSquare },
    ],
  },
  {
    items: [
      { label: "Help", href: "/help", icon: HelpCircle },
    ],
  },
];

/**
 * The boarding staff.
 *
 * Deliberately narrow: they handle money, welfare and health, and nothing
 * academic. A matron has no business reading marks.
 */
const boardingNav: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/boarding", icon: LayoutDashboard }],
  },
  {
    title: "Student welfare",
    items: [
      { label: "Pocket Money", href: "/admin/pocket-money", icon: Wallet },
      { label: "Health", href: "/admin/health", icon: HeartPulse },
      { label: "Activities", href: "/admin/activities", icon: CalendarDays },
    ],
  },
  {
    title: "Communication",
    items: [{ label: "Messages", href: "/messages", icon: MessageSquare }],
  },
  {
    items: [{ label: "Help", href: "/help", icon: HelpCircle }],
  },
];

const nurseNav: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/nurse", icon: LayoutDashboard }],
  },
  {
    title: "Clinic",
    items: [
      { label: "Health", href: "/admin/health", icon: HeartPulse },
      { label: "Support plans", href: "/admin/support", icon: Accessibility },
    ],
  },
  {
    title: "Communication",
    items: [{ label: "Messages", href: "/messages", icon: MessageSquare }],
  },
  {
    items: [{ label: "Help", href: "/help", icon: HelpCircle }],
  },
];

/**
 * The bursar.
 *
 * As narrow as the boarding staff's, and for the same reason: they handle
 * money and the roll, and nothing academic. A bursar has no business in a
 * mark book, and the fee register already tells them everything about a
 * student that collecting fees requires.
 */
const bursarNav: NavSection[] = [
  {
    items: [{ label: "Fee register", href: "/admin/finance", icon: Landmark }],
  },
  {
    title: "Fees",
    items: [
      { label: "Fee structure", href: "/admin/finance/structure", icon: Receipt },
    ],
  },
  {
    title: "Communication",
    items: [{ label: "Messages", href: "/messages", icon: MessageSquare }],
  },
  {
    items: [{ label: "Help", href: "/help", icon: HelpCircle }],
  },
];

/**
 * The head teacher, the Director of Studies.
 *
 * Ordered by how often the post touches each thing rather than by module:
 * the report cards waiting on their check are the daily job in exam season,
 * the mark book is what they read to make that check, and the staff pages
 * are the rest of the week. Nothing about fees, the sick bay or the
 * dormitories, none of which is theirs.
 */
const headTeacherNav: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/head-teacher", icon: LayoutDashboard },
      { label: "Report cards", href: "/admin/report-cards", icon: FileCheck },
    ],
  },
  {
    title: "Academic",
    items: [
      { label: "Marks", href: "/admin/marks", icon: ClipboardList },
      /* Where a card is generated, printed and downloaded. It moved off the
         principal's menu with everything else about report cards. */
      { label: "Generate cards", href: "/admin/reports", icon: FileText },
      { label: "Classes", href: "/admin/classes", icon: School },
      { label: "Timetable", href: "/admin/timetable", icon: CalendarDays },
      /* The DOS runs academic delivery, so the exam timetable is theirs to
         set as much as the lesson one. */
      { label: "Exams", href: "/admin/exams", icon: CalendarClock },
      { label: "Support plans", href: "/admin/support", icon: Accessibility },
      { label: "Grading", href: "/grading", icon: Scale },
    ],
  },
  {
    title: "Attendance",
    items: [
      { label: "Students", href: "/admin/attendance", icon: CalendarCheck },
      { label: "Teachers", href: "/admin/teachers", icon: Users },
    ],
  },
  {
    title: "Communication",
    items: [{ label: "Messages", href: "/messages", icon: MessageSquare }],
  },
  {
    items: [{ label: "Help", href: "/help", icon: HelpCircle }],
  },
];

/**
 * Where a role lands: after signing in, and when it asks for a page that is
 * not its own.
 *
 * One copy, because there were two. The shell knew about the bursar and the
 * head teacher; the sign-in guard held its own older list and did not, so
 * signing in as either sent them to `/bursar` or `/head_teacher` - a 404 as
 * the first thing they ever saw. A role's home belongs with the role's
 * navigation, and this is where that lives.
 */
export function homeFor(role: string): string {
  // A patron and a matron do the same job on opposite sides of the school.
  if (role === "PATRON" || role === "MATRON") return "/boarding";
  if (role === "NURSE") return "/nurse";
  // The bursar's home is the register itself. There is no separate dashboard
  // worth building: the one screen they open every morning is the roll of who
  // has paid, and a summary page in front of it would be a click to nowhere.
  if (role === "BURSAR") return "/admin/finance";
  if (role === "HEAD_TEACHER") return "/head-teacher";
  return `/${role.toLowerCase()}`;
}

export function getNavigation(role: Role, formerStudent = false): NavSection[] {
  if (role === "STUDENT" && formerStudent) return formerStudentNav;
  const navMap: Record<Role, NavSection[]> = {
    ADMIN: adminNav,
    HEAD_TEACHER: headTeacherNav,
    TEACHER: teacherNav,
    STUDENT: studentNav,
    PARENT: parentNav,
    LIBRARIAN: librarianNav,
    PATRON: boardingNav,
    MATRON: boardingNav,
    NURSE: nurseNav,
    BURSAR: bursarNav,
  };
  return navMap[role] || adminNav;
}
