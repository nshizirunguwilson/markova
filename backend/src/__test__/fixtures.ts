export const mockAdmin = {
  id: 'admin-user-id-1',
  email: 'admin@school.test',
  phone: '+237600000001',
  role: 'ADMIN' as const,
  firstName: 'Admin',
  lastName: 'User',
  isActive: true,
  accountId: 'acc-admin',
  account: {
    email: 'admin@school.test',
    phone: '+237600000001',
    forcePasswordChange: false,
  },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const mockTeacher = {
  id: 'teacher-user-id-1',
  email: 'teacher@school.test',
  phone: '+237600000002',
  role: 'TEACHER' as const,
  firstName: 'Teacher',
  lastName: 'User',
  isActive: true,
  accountId: 'acc-teacher',
  account: {
    email: 'teacher@school.test',
    phone: '+237600000002',
    forcePasswordChange: false,
  },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const mockStudent = {
  id: 'student-user-id-1',
  email: 'student@school.test',
  phone: '+237600000003',
  role: 'STUDENT' as const,
  firstName: 'Student',
  lastName: 'User',
  isActive: true,
  accountId: 'acc-student',
  account: {
    email: 'student@school.test',
    phone: '+237600000003',
    forcePasswordChange: false,
  },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const mockParent = {
  id: 'parent-user-id-1',
  email: 'parent@school.test',
  phone: '+237600000004',
  role: 'PARENT' as const,
  firstName: 'Parent',
  lastName: 'User',
  isActive: true,
  accountId: 'acc-parent',
  account: {
    email: 'parent@school.test',
    phone: '+237600000004',
    forcePasswordChange: false,
  },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const mockStudentRecord = {
  id: 'student-record-id-1',
  userId: mockStudent.id,
  studentIdNumber: 'STU-2025-001',
  classSectionId: 'class-section-id-1',
  status: 'ACTIVE' as const,
  disciplinePoints: 100,
  enrollmentDate: new Date('2025-09-01'),
  createdAt: new Date('2025-09-01'),
};
