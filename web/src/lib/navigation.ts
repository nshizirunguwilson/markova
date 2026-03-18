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
  DollarSign,
  Settings,
  BarChart3,
  FileText,
  HelpCircle,
  type LucideIcon,
  Clock,
  UserCheck,
  Backpack,
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
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Attendance", href: "/admin/attendance", icon: Calendar },
      { label: "Discipline", href: "/admin/discipline", icon: AlertTriangle },
      { label: "Library", href: "/admin/library", icon: Library },
      { label: "Fees", href: "/admin/fees", icon: DollarSign },
      { label: "Homework", href: "/admin/homework", icon: ClipboardList },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/admin/messages", icon: MessageSquare },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "Support", href: "/admin/support", icon: HelpCircle },
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
      { label: "My Classes", href: "/teacher/classes", icon: Backpack },
      { label: "Marks Entry", href: "/teacher/marks", icon: ClipboardList },
      { label: "Homework", href: "/teacher/homework", icon: FileText },
      { label: "Timetable", href: "/teacher/timetable", icon: Clock },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Attendance", href: "/teacher/attendance", icon: Calendar },
      { label: "Discipline", href: "/teacher/discipline", icon: AlertTriangle },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/teacher/messages", icon: MessageSquare },
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
      { label: "Report Card", href: "/student/report", icon: FileText },
      { label: "Homework", href: "/student/homework", icon: BookOpen },
      { label: "Timetable", href: "/student/timetable", icon: Clock },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Attendance", href: "/student/attendance", icon: Calendar },
      { label: "Library", href: "/student/library", icon: Library },
      { label: "Messages", href: "/student/messages", icon: MessageSquare },
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
      { label: "Fees", href: "/parent/fees", icon: DollarSign },
      { label: "Homework", href: "/parent/homework", icon: FileText },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/parent/messages", icon: MessageSquare },
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
      { label: "Loans", href: "/librarian/loans", icon: BookOpen },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Messages", href: "/librarian/messages", icon: MessageSquare },
    ],
  },
];

export function getNavigation(role: Role): NavSection[] {
  const navMap: Record<Role, NavSection[]> = {
    ADMIN: adminNav,
    TEACHER: teacherNav,
    STUDENT: studentNav,
    PARENT: parentNav,
    LIBRARIAN: librarianNav,
  };
  return navMap[role] || adminNav;
}
