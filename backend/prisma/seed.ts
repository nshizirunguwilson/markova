import {
  PrismaClient,
  Role,
  SpecialRole,
  EmploymentStatus,
  StudentStatus,
  Gender,
  AttendanceStatus,
  AbsenceReason,
  LoanStatus,
  DisciplineAction,
  ConversationType,
  MessageContentType,
  NotificationType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── SCHOOL CONFIG ──────────────────────────────────────────────────────────
  const configs = [
    { key: 'school_name', value: 'Markova Academy' },
    { key: 'school_motto', value: 'Excellence Through Knowledge' },
    { key: 'logo_url', value: '/uploads/logo.png' },
    { key: 'stamp_url', value: '/uploads/stamp.png' },
    { key: 'signature_url', value: '/uploads/signature.png' },
    { key: 'primary_color', value: '#1B4F72' },
    { key: 'starting_discipline_points', value: '100' },
    { key: 'borrowing_limit', value: '3' },
    { key: 'borrowing_duration_days', value: '14' },
    { key: 'pass_threshold', value: '50' },
    { key: 'grading_scale', value: 'A:90,B:80,C:70,D:60,F:0' },
    { key: 'school_address', value: '123 Education Street, Kampala, Uganda' },
    { key: 'school_phone', value: '+256700000000' },
    { key: 'school_email', value: 'info@markova.academy' },
    { key: 'sms_provider', value: 'africas_talking' },
    { key: 'email_provider', value: 'smtp' },
  ];

  for (const config of configs) {
    await prisma.schoolConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }
  console.log('  ✅ SchoolConfig seeded');

  // ─── HASH PASSWORD ──────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // ─── ADMIN USER ─────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: 'wilsonshizirungu@gmail.com',
      phone: '+256700000001',
      passwordHash,
      role: Role.ADMIN,
      firstName: 'James',
      lastName: 'Mugisha',
      isActive: true,
      forcePasswordChange: true,
    },
  });
  console.log('  ✅ Admin user seeded');

  // ─── TEACHER USERS ──────────────────────────────────────────────────────────
  const teacherData = [
    { firstName: 'Sarah', lastName: 'Nakamya', email: 'sarah.nakamya@markova.academy', phone: '+256700000010' },
    { firstName: 'John', lastName: 'Okello', email: 'john.okello@markova.academy', phone: '+256700000011' },
    { firstName: 'Grace', lastName: 'Atim', email: 'grace.atim@markova.academy', phone: '+256700000012' },
    { firstName: 'Peter', lastName: 'Ssemakula', email: 'peter.ssemakula@markova.academy', phone: '+256700000013' },
    { firstName: 'Ruth', lastName: 'Nabirye', email: 'ruth.nabirye@markova.academy', phone: '+256700000014' },
  ];

  const teacherUsers = [];
  const teachers = [];
  for (const td of teacherData) {
    const user = await prisma.user.create({
      data: {
        email: td.email,
        phone: td.phone,
        passwordHash,
        role: Role.TEACHER,
        firstName: td.firstName,
        lastName: td.lastName,
        isActive: true,
        forcePasswordChange: true,
      },
    });
    const teacher = await prisma.teacher.create({
      data: {
        userId: user.id,
        employmentStatus: EmploymentStatus.FULL_TIME,
        isActive: true,
      },
    });
    teacherUsers.push(user);
    teachers.push(teacher);
  }
  console.log('  ✅ 5 Teachers seeded');

  // ─── LIBRARIAN USER ─────────────────────────────────────────────────────────
  const librarianUser = await prisma.user.create({
    data: {
      email: 'librarian@markova.academy',
      phone: '+256700000020',
      passwordHash,
      role: Role.LIBRARIAN,
      firstName: 'Dorothy',
      lastName: 'Kamya',
      isActive: true,
      forcePasswordChange: true,
    },
  });
  console.log('  ✅ Librarian seeded');

  // ─── ACADEMIC YEAR & TERMS ──────────────────────────────────────────────────
  const academicYear = await prisma.academicYear.create({
    data: {
      name: '2025-2026',
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-11-30'),
      isCurrent: true,
    },
  });

  const termNames = ['Term 1', 'Term 2', 'Term 3'];
  const termDates = [
    { start: '2025-02-01', end: '2025-04-30' },
    { start: '2025-05-15', end: '2025-08-15' },
    { start: '2025-09-01', end: '2025-11-30' },
  ];

  const terms = [];
  for (let i = 0; i < 3; i++) {
    const term = await prisma.term.create({
      data: {
        academicYearId: academicYear.id,
        name: termNames[i],
        startDate: new Date(termDates[i].start),
        endDate: new Date(termDates[i].end),
        isCurrent: i === 0,
        isClosed: false,
      },
    });
    terms.push(term);
  }
  console.log('  ✅ Academic year + 3 terms seeded');

  // ─── CLASS LEVELS & SECTIONS ────────────────────────────────────────────────
  const classLevels = [];
  const classLevelData = [
    { name: 'Senior 1', order: 1 },
    { name: 'Senior 2', order: 2 },
    { name: 'Senior 3', order: 3 },
  ];

  for (const cl of classLevelData) {
    const level = await prisma.classLevel.create({ data: cl });
    classLevels.push(level);
  }

  const classSections = [];
  const sectionNames = ['A'];
  for (const level of classLevels) {
    for (const sName of sectionNames) {
      const section = await prisma.classSection.create({
        data: {
          classLevelId: level.id,
          name: sName,
        },
      });
      classSections.push(section);
    }
  }
  console.log('  ✅ 3 class levels, 3 sections seeded');

  // ─── SUBJECTS ───────────────────────────────────────────────────────────────
  const subjectData = [
    { name: 'Mathematics', category: 'Sciences' },
    { name: 'English Language', category: 'Languages' },
    { name: 'Physics', category: 'Sciences' },
    { name: 'Chemistry', category: 'Sciences' },
    { name: 'Biology', category: 'Sciences' },
    { name: 'History', category: 'Humanities' },
    { name: 'Geography', category: 'Humanities' },
    { name: 'Computer Science', category: 'Sciences' },
  ];

  const subjects = [];
  for (const s of subjectData) {
    const subject = await prisma.subject.create({
      data: { ...s, maxMarks: 100, isActive: true },
    });
    subjects.push(subject);
  }
  console.log('  ✅ 8 subjects seeded');

  // ─── ASSESSMENT TYPES ───────────────────────────────────────────────────────
  const assessmentTypes = [];
  for (const name of ['Test 1', 'Test 2', 'Midterm Exam', 'Final Exam']) {
    const at = await prisma.assessmentType.create({ data: { name } });
    assessmentTypes.push(at);
  }
  console.log('  ✅ 4 assessment types seeded');

  // ─── TEACHER ROLES ──────────────────────────────────────────────────────────
  // Teacher 0 (Sarah) = DOS
  await prisma.teacherRole.create({
    data: { teacherId: teachers[0].id, role: SpecialRole.DOS },
  });
  // Teacher 1 (John) = HOD Sciences
  await prisma.teacherRole.create({
    data: { teacherId: teachers[1].id, role: SpecialRole.HOD, department: 'Sciences' },
  });
  // Teacher 2 (Grace) = Class Teacher S1A
  await prisma.teacherRole.create({
    data: { teacherId: teachers[2].id, role: SpecialRole.CLASS_TEACHER, classSectionId: classSections[0].id },
  });
  // Teacher 3 (Peter) = Class Teacher S2A
  await prisma.teacherRole.create({
    data: { teacherId: teachers[3].id, role: SpecialRole.CLASS_TEACHER, classSectionId: classSections[1].id },
  });
  // Teacher 4 (Ruth) = Class Teacher S3A
  await prisma.teacherRole.create({
    data: { teacherId: teachers[4].id, role: SpecialRole.CLASS_TEACHER, classSectionId: classSections[2].id },
  });
  console.log('  ✅ Teacher special roles seeded');

  // ─── TEACHER-SUBJECT-CLASS ASSIGNMENTS ──────────────────────────────────────
  // Distribute subjects across teachers for each section
  for (const section of classSections) {
    for (let si = 0; si < subjects.length; si++) {
      const teacherIdx = si % teachers.length;
      await prisma.teacherSubjectClass.create({
        data: {
          teacherId: teachers[teacherIdx].id,
          subjectId: subjects[si].id,
          classSectionId: section.id,
          academicYearId: academicYear.id,
        },
      });
    }
  }
  console.log('  ✅ Teacher-subject-class assignments seeded');

  // ─── STUDENT USERS ──────────────────────────────────────────────────────────
  const studentFirstNames = [
    'Allan', 'Betty', 'Charles', 'Diana', 'Edward',
    'Fiona', 'George', 'Helen', 'Isaac', 'Juliet',
    'Kevin', 'Linda', 'Moses', 'Nancy', 'Oscar',
    'Patricia', 'Robert', 'Sandra', 'Timothy', 'Violet',
    'William', 'Agnes', 'Brian', 'Catherine', 'Daniel',
    'Emma', 'Frank', 'Gloria', 'Henry', 'Irene',
  ];
  const studentLastNames = [
    'Tumwine', 'Namugera', 'Kato', 'Nalwanga', 'Ochieng',
    'Auma', 'Lubega', 'Namutebi', 'Ssebunya', 'Nantongo',
    'Musoke', 'Babirye', 'Waiswa', 'Nansubuga', 'Otim',
    'Nabukera', 'Kasule', 'Mirembe', 'Kibuuka', 'Ainomugisha',
    'Mwesigwa', 'Kyomuhendo', 'Mugume', 'Nakato', 'Ssempijja',
    'Namatovu', 'Kayongo', 'Nambi', 'Wasswa', 'Kemigisha',
  ];

  const genders: Gender[] = [
    Gender.MALE, Gender.FEMALE, Gender.MALE, Gender.FEMALE, Gender.MALE,
    Gender.FEMALE, Gender.MALE, Gender.FEMALE, Gender.MALE, Gender.FEMALE,
    Gender.MALE, Gender.FEMALE, Gender.MALE, Gender.FEMALE, Gender.MALE,
    Gender.FEMALE, Gender.MALE, Gender.FEMALE, Gender.MALE, Gender.FEMALE,
    Gender.MALE, Gender.FEMALE, Gender.MALE, Gender.FEMALE, Gender.MALE,
    Gender.FEMALE, Gender.MALE, Gender.FEMALE, Gender.MALE, Gender.FEMALE,
  ];

  const studentUsers = [];
  const students = [];
  for (let i = 0; i < 30; i++) {
    const sectionIdx = Math.floor(i / 10); // 10 per section
    const user = await prisma.user.create({
      data: {
        email: `student${i + 1}@markova.academy`,
        passwordHash,
        role: Role.STUDENT,
        firstName: studentFirstNames[i],
        lastName: studentLastNames[i],
        isActive: true,
        forcePasswordChange: true,
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        studentIdNumber: `MKV-2025-${String(i + 1).padStart(4, '0')}`,
        classSectionId: classSections[sectionIdx].id,
        dateOfBirth: new Date(`${2008 + sectionIdx}-${String((i % 12) + 1).padStart(2, '0')}-15`),
        gender: genders[i],
        status: StudentStatus.ACTIVE,
        disciplinePoints: 100,
      },
    });
    studentUsers.push(user);
    students.push(student);
  }
  console.log('  ✅ 30 students seeded');

  // ─── PARENT USERS ───────────────────────────────────────────────────────────
  const parentFirstNames = [
    'Joseph', 'Mary', 'David', 'Margaret', 'Paul',
    'Rebecca', 'Samuel', 'Elizabeth', 'Michael', 'Susan',
    'Andrew', 'Christine', 'Richard', 'Joyce', 'Stephen',
  ];
  const parentLastNames = [
    'Tumwine', 'Namugera', 'Kato', 'Nalwanga', 'Ochieng',
    'Auma', 'Lubega', 'Namutebi', 'Ssebunya', 'Nantongo',
    'Musoke', 'Babirye', 'Waiswa', 'Nansubuga', 'Otim',
  ];

  const parentUsers = [];
  for (let i = 0; i < 15; i++) {
    const user = await prisma.user.create({
      data: {
        phone: `+25670000010${String(i).padStart(2, '0')}`,
        passwordHash,
        role: Role.PARENT,
        firstName: parentFirstNames[i],
        lastName: parentLastNames[i],
        isActive: true,
        forcePasswordChange: true,
      },
    });
    parentUsers.push(user);

    // Each parent linked to 2 students
    const studentIdx1 = i * 2;
    const studentIdx2 = i * 2 + 1;
    if (studentIdx1 < students.length) {
      await prisma.parentStudent.create({
        data: {
          parentUserId: user.id,
          studentId: students[studentIdx1].id,
          relationship: i % 2 === 0 ? 'Father' : 'Mother',
        },
      });
    }
    if (studentIdx2 < students.length) {
      await prisma.parentStudent.create({
        data: {
          parentUserId: user.id,
          studentId: students[studentIdx2].id,
          relationship: i % 2 === 0 ? 'Father' : 'Mother',
        },
      });
    }
  }
  console.log('  ✅ 15 parents seeded (linked to students)');

  // ─── SAMPLE MARKS ───────────────────────────────────────────────────────────
  // Marks for Term 1, all students, first 4 subjects, first 2 assessment types
  let markCount = 0;
  for (let si = 0; si < students.length; si++) {
    const sectionIdx = Math.floor(si / 10);
    for (let subj = 0; subj < 4; subj++) {
      for (let at = 0; at < 2; at++) {
        const score = Math.floor(Math.random() * 40) + 50; // 50-89
        await prisma.mark.create({
          data: {
            studentId: students[si].id,
            subjectId: subjects[subj].id,
            classSectionId: classSections[sectionIdx].id,
            termId: terms[0].id,
            assessmentTypeId: assessmentTypes[at].id,
            score,
            maxScore: 100,
            teacherId: teachers[subj % teachers.length].id,
          },
        });
        markCount++;
      }
    }
  }
  console.log(`  ✅ ${markCount} marks seeded`);

  // ─── SAMPLE ATTENDANCE ──────────────────────────────────────────────────────
  // 5 days of attendance for all students
  const attendanceDates = [
    '2025-02-03', '2025-02-04', '2025-02-05', '2025-02-06', '2025-02-07',
  ];
  let attendanceCount = 0;
  for (const dateStr of attendanceDates) {
    for (let si = 0; si < students.length; si++) {
      const sectionIdx = Math.floor(si / 10);
      const rand = Math.random();
      let status: AttendanceStatus;
      let reason: AbsenceReason | null = null;
      if (rand < 0.85) {
        status = AttendanceStatus.PRESENT;
      } else if (rand < 0.92) {
        status = AttendanceStatus.LATE;
      } else {
        status = AttendanceStatus.ABSENT;
        reason = AbsenceReason.SICK;
      }
      await prisma.attendance.create({
        data: {
          studentId: students[si].id,
          classSectionId: classSections[sectionIdx].id,
          date: new Date(dateStr),
          type: 'daily',
          status,
          reasonCategory: reason,
          markedByUserId: teacherUsers[sectionIdx % teacherUsers.length].id,
        },
      });
      attendanceCount++;
    }
  }
  console.log(`  ✅ ${attendanceCount} attendance records seeded`);

  // ─── SAMPLE DISCIPLINE INCIDENTS ────────────────────────────────────────────
  const incidentDescriptions = [
    'Late to morning assembly',
    'Talking during class',
    'Incomplete homework',
    'Uniform violation',
    'Disruptive behavior in lab',
  ];

  for (let i = 0; i < 5; i++) {
    const student = students[i * 5]; // spread across students
    await prisma.disciplineIncident.create({
      data: {
        studentId: student.id,
        termId: terms[0].id,
        recordedByUserId: teacherUsers[0].id, // DOS records
        date: new Date(`2025-02-${10 + i}`),
        time: '08:30',
        location: 'Main Hall',
        description: incidentDescriptions[i],
        pointsDeducted: (i + 1) * 2,
        actionTaken: i < 3 ? DisciplineAction.VERBAL_WARNING : DisciplineAction.WRITTEN_WARNING,
        parentAcknowledged: i < 2,
        parentAcknowledgedAt: i < 2 ? new Date() : null,
      },
    });

    // Update discipline points
    await prisma.student.update({
      where: { id: student.id },
      data: { disciplinePoints: 100 - (i + 1) * 2 },
    });
  }
  console.log('  ✅ 5 discipline incidents seeded');

  // ─── LIBRARY BOOKS ──────────────────────────────────────────────────────────
  const bookData = [
    { title: 'Introduction to Physics', author: 'Paul Hewitt', isbn: '978-0321909107', category: 'Sciences' },
    { title: 'Chemistry: The Central Science', author: 'Brown & LeMay', isbn: '978-0134414232', category: 'Sciences' },
    { title: 'Biology: A Global Approach', author: 'Neil Campbell', isbn: '978-1292341637', category: 'Sciences' },
    { title: 'Calculus: Early Transcendentals', author: 'James Stewart', isbn: '978-1285741550', category: 'Mathematics' },
    { title: 'English Grammar in Use', author: 'Raymond Murphy', isbn: '978-1108457651', category: 'Languages' },
    { title: 'A History of Modern Africa', author: 'Richard Reid', isbn: '978-1108790543', category: 'Humanities' },
    { title: 'World Geography', author: 'James Rubenstein', isbn: '978-0134746210', category: 'Humanities' },
    { title: 'Computer Science: An Overview', author: 'Glenn Brookshear', isbn: '978-0134875460', category: 'Sciences' },
    { title: 'Things Fall Apart', author: 'Chinua Achebe', isbn: '978-0385474542', category: 'Literature' },
    { title: 'The River Between', author: 'Ngugi wa Thiongo', isbn: '978-0435905484', category: 'Literature' },
    { title: 'Organic Chemistry', author: 'John McMurry', isbn: '978-1305080485', category: 'Sciences' },
    { title: 'Linear Algebra Done Right', author: 'Sheldon Axler', isbn: '978-3319110790', category: 'Mathematics' },
    { title: 'Practical English Usage', author: 'Michael Swan', isbn: '978-0194202428', category: 'Languages' },
    { title: 'African Politics and Society', author: 'Peter Schraeder', isbn: '978-1626378070', category: 'Humanities' },
    { title: 'Fundamentals of Physics', author: 'Halliday & Resnick', isbn: '978-1119460138', category: 'Sciences' },
    { title: 'Python Programming', author: 'John Zelle', isbn: '978-1590282755', category: 'Sciences' },
    { title: 'Song of Lawino', author: "Okot p'Bitek", isbn: '978-1478607649', category: 'Literature' },
    { title: 'The Beautyful Ones Are Not Yet Born', author: 'Ayi Kwei Armah', isbn: '978-0435905361', category: 'Literature' },
    { title: 'Statistics for Business', author: 'David Anderson', isbn: '978-0357715857', category: 'Mathematics' },
    { title: 'Human Geography', author: 'Erin Fouberg', isbn: '978-1119626183', category: 'Humanities' },
  ];

  const books: any[] = [];
  for (const b of bookData) {
    const book = await prisma.book.create({
      data: {
        ...b,
        quantity: 5,
        availableCount: 5,
        barcode: `BK-${String(books.length + 1).padStart(5, '0')}`,
        replacementCost: 25000 + Math.floor(Math.random() * 50000),
        isActive: true,
      },
    });
    books.push(book);
  }

  // Create a few active loans, due 14 days from now so they aren't
  // immediately overdue every time the seed is re-run.
  const loanDueDate = new Date();
  loanDueDate.setDate(loanDueDate.getDate() + 14);
  for (let i = 0; i < 5; i++) {
    await prisma.bookLoan.create({
      data: {
        bookId: books[i].id,
        borrowerUserId: studentUsers[i].id,
        dueDate: loanDueDate,
        status: LoanStatus.ACTIVE,
      },
    });
    await prisma.book.update({
      where: { id: books[i].id },
      data: { availableCount: 4 },
    });
  }
  console.log('  ✅ 20 library books + 5 active loans seeded');

  // ─── SAMPLE HOMEWORK ───────────────────────────────────────────────────────
  const hw = await prisma.homework.create({
    data: {
      teacherId: teachers[0].id,
      subjectId: subjects[0].id,
      classSectionId: classSections[0].id,
      termId: terms[0].id,
      title: 'Algebra Practice Set 1',
      description: 'Complete exercises 1-20 from Chapter 3',
      dueDate: new Date('2025-02-15'),
      maxMarks: 20,
      lateDeductionPerDay: 2,
    },
  });

  // A few submissions
  for (let i = 0; i < 5; i++) {
    await prisma.homeworkSubmission.create({
      data: {
        homeworkId: hw.id,
        studentId: students[i].id,
        submittedAt: new Date('2025-02-14'),
        isLate: false,
        marks: 15 + Math.floor(Math.random() * 6),
        gradedAt: new Date('2025-02-16'),
        gradedByUserId: teacherUsers[0].id,
      },
    });
  }
  console.log('  ✅ Sample homework + submissions seeded');

  // ─── SAMPLE MESSAGES ────────────────────────────────────────────────────────
  // One-on-one: admin -> teacher
  const conv1 = await prisma.conversation.create({
    data: {
      type: ConversationType.ONE_ON_ONE,
      createdByUserId: admin.id,
    },
  });
  await prisma.conversationParticipant.createMany({
    data: [
      { conversationId: conv1.id, userId: admin.id, isAdmin: true },
      { conversationId: conv1.id, userId: teacherUsers[0].id },
    ],
  });
  await prisma.message.create({
    data: {
      conversationId: conv1.id,
      senderUserId: admin.id,
      content: 'Welcome to Markova Academy! Please complete your profile.',
      contentType: MessageContentType.TEXT,
    },
  });

  // Broadcast: admin -> all teachers
  const conv2 = await prisma.conversation.create({
    data: {
      type: ConversationType.BROADCAST,
      name: 'Staff Announcements',
      createdByUserId: admin.id,
    },
  });
  const broadcastParticipants = [
    { conversationId: conv2.id, userId: admin.id, isAdmin: true },
    ...teacherUsers.map((t) => ({ conversationId: conv2.id, userId: t.id, isAdmin: false })),
  ];
  await prisma.conversationParticipant.createMany({ data: broadcastParticipants });
  await prisma.message.create({
    data: {
      conversationId: conv2.id,
      senderUserId: admin.id,
      content: 'Staff meeting scheduled for Monday at 3:00 PM in the conference room.',
      contentType: MessageContentType.TEXT,
    },
  });
  console.log('  ✅ Sample conversations + messages seeded');

  // ─── SAMPLE NOTIFICATIONS ───────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        userId: admin.id,
        title: 'System Ready',
        message: 'Markova Academy system has been set up successfully.',
        type: NotificationType.EMAIL,
      },
      {
        userId: teacherUsers[0].id,
        title: 'New Assignment',
        message: 'You have been assigned to teach Mathematics for Senior 1A.',
        type: NotificationType.PUSH,
      },
      {
        userId: parentUsers[0].id,
        title: 'Attendance Alert',
        message: 'Your child was marked absent today. Please contact the school if needed.',
        type: NotificationType.SMS,
      },
    ],
  });
  console.log('  ✅ Notifications seeded');

  // ─── SAMPLE FAQ ARTICLES ────────────────────────────────────────────────────
  await prisma.faqArticle.createMany({
    data: [
      { title: 'How to reset my password?', content: 'Contact the school administrator to reset your password. You will receive an OTP on your registered phone number.', category: 'Account', displayOrder: 1 },
      { title: 'How to check my child\'s marks?', content: 'Log in to the parent portal, navigate to the Marks section, and select the relevant term.', category: 'Marks', displayOrder: 2 },
      { title: 'How to report an absence?', content: 'Parents can report an absence through the mobile app or by contacting the class teacher directly.', category: 'Attendance', displayOrder: 3 },
    ],
  });
  console.log('  ✅ FAQ articles seeded');

  // ─── TIMETABLE SAMPLE ──────────────────────────────────────────────────────
  const days = [1, 2, 3, 4, 5]; // Mon-Fri
  const timeSlots = [
    { start: '08:00', end: '08:45' },
    { start: '08:50', end: '09:35' },
    { start: '09:50', end: '10:35' },
    { start: '10:40', end: '11:25' },
    { start: '11:30', end: '12:15' },
    { start: '14:00', end: '14:45' },
    { start: '14:50', end: '15:35' },
  ];

  // Timetable for S1A only (to keep it manageable)
  let timetableCount = 0;
  for (const day of days) {
    for (let slot = 0; slot < Math.min(timeSlots.length, subjects.length); slot++) {
      const subjectIdx = (day * 3 + slot) % subjects.length;
      const teacherIdx = subjectIdx % teachers.length;
      await prisma.timetable.create({
        data: {
          classSectionId: classSections[0].id,
          subjectId: subjects[subjectIdx].id,
          teacherId: teachers[teacherIdx].id,
          dayOfWeek: day,
          startTime: timeSlots[slot].start,
          endTime: timeSlots[slot].end,
          room: `Room ${100 + slot}`,
        },
      });
      timetableCount++;
    }
  }
  console.log(`  ✅ ${timetableCount} timetable entries seeded`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('   Default password for all users: Password123!');
  console.log('   Admin email: wilsonshizirungu@gmail.com');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
