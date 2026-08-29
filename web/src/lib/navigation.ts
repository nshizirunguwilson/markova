import {
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
      { label: "Marks", href: "/admin/marks", icon: ClipboardList },
      { label: "Report Cards", href: "/admin/reports", icon: FileText },
      { label: "ID Cards", href: "/admin/id-cards", icon: CreditCard },
      { label: "Promotion", href: "/admin/promotion", icon: ArrowUpCircle },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Attendance", href: "/admin/attendance", icon: Calendar },
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
    items: [{ label: "Health", href: "/admin/health", icon: HeartPulse }],
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
      { label: "Report cards", href: "/admin/report-cards", icon: FileCheck },
    ],
  },
  {
    title: "Academic",
    items: [
      { label: "Marks", href: "/admin/marks", icon: ClipboardList },
      { label: "Classes", href: "/admin/classes", icon: School },
      { label: "Timetable", href: "/admin/timetable", icon: CalendarDays },
      { label: "Grading", href: "/grading", icon: Scale },
    ],
  },
  {
    title: "Staff",
    items: [
      { label: "Teachers", href: "/admin/teachers", icon: Users },
      { label: "Attendance", href: "/admin/attendance", icon: CalendarCheck },
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

export function getNavigation(role: Role): NavSection[] {
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
