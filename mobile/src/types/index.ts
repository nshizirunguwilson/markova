// Academic
export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface Term {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isClosed: boolean;
}

export interface ClassLevel {
  id: string;
  name: string;
  order: number;
}

export interface ClassSection {
  id: string;
  classLevelId: string;
  name: string;
  classLevel?: ClassLevel;
}

export interface Subject {
  id: string;
  name: string;
  category?: string;
  maxMarks?: number;
  isActive: boolean;
}

export interface AssessmentType {
  id: string;
  name: string;
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  subjectId: string;
  classSectionId: string;
  academicYearId: string;
  subject?: Subject;
  classSection?: ClassSection;
}

// Students
export interface Student {
  id: string;
  userId: string;
  classSectionId: string;
  studentIdNumber: string;
  nfcCardId?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    photoUrl?: string;
  };
  classSection?: ClassSection;
}

// Attendance
export interface AttendanceRecord {
  id: string;
  studentId: string;
  classSectionId: string;
  date: string;
  type: 'DAILY' | 'SUBJECT';
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  subjectId?: string;
  reasonCategory?: string;
  student?: Student;
}

export interface AttendanceSummary {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendanceRate: number;
}

// Marks
export interface Mark {
  id: string;
  studentId: string;
  subjectId: string;
  classSectionId: string;
  termId: string;
  assessmentTypeId: string;
  score: number;
  maxScore: number;
  subject?: Subject;
  assessmentType?: AssessmentType;
}

export interface TermResult {
  id: string;
  studentId: string;
  termId: string;
  totalMarks: number;
  averagePercentage: number;
  rank?: number;
  teacherComment?: string;
  headmasterComment?: string;
  isPublished: boolean;
}

// Discipline
export interface DisciplineIncident {
  id: string;
  studentId: string;
  termId: string;
  date: string;
  time?: string;
  location?: string;
  description: string;
  pointsDeducted: number;
  actionTaken: string;
  isAcknowledged: boolean;
  student?: Student;
}

// Homework
export interface Homework {
  id: string;
  subjectId: string;
  classSectionId: string;
  termId: string;
  teacherId?: string;
  title: string;
  description?: string;
  dueDate: string;
  maxMarks?: number;
  subject?: Subject;
  classSection?: ClassSection;
  submissions?: HomeworkSubmission[];
}

export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  fileUrl?: string;
  marks?: number;
  submittedAt: string;
  student?: Student;
}

// Notifications
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

// Parent
export interface ParentChild {
  id: string;
  studentId: string;
  student: Student;
}
