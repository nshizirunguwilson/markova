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
  CreditCard,
  ArrowUpCircle,
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
      { label: "Homework", href: "/teacher/homework", icon: FileText },
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
      { label: "Homework", href: "/student/homework", icon: BookOpen },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Attendance", href: "/student/attendance", icon: Calendar },
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
      { label: "Fees", href: "/parent/fees", icon: DollarSign },
      { label: "Report Cards", href: "/parent/reports", icon: FileText },
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
      { label: "Loans", href: "/librarian/loans", icon: BookOpen },
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
