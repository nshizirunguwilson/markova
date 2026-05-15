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

// ─── NAME POOLS ──────────────────────────────────────────────────────────────
// Large pools so 330 students + 200 parents + 30 teachers come out with
// distinct first/last-name combinations.

const MALE_FIRSTS = [
  'Allan', 'Brian', 'Charles', 'Daniel', 'Edward', 'Frank', 'George', 'Henry',
  'Isaac', 'James', 'Kenneth', 'Lawrence', 'Moses', 'Nathan', 'Oscar', 'Peter',
  'Quincy', 'Robert', 'Samuel', 'Timothy', 'Umar', 'Victor', 'William', 'Xavier',
  'Yusuf', 'Zachary', 'Alex', 'Benjamin', 'Christopher', 'David', 'Ethan',
  'Felix', 'Gilbert', 'Hassan', 'Ibrahim', 'Joseph', 'Kevin', 'Lawrence',
  'Martin', 'Nicholas', 'Owen', 'Patrick', 'Raymond', 'Stephen', 'Thomas',
  'Vincent', 'Walter', 'Andrew', 'Benedict', 'Cyrus',
];

const FEMALE_FIRSTS = [
  'Agnes', 'Beatrice', 'Catherine', 'Diana', 'Emma', 'Fiona', 'Gloria',
  'Helen', 'Irene', 'Joyce', 'Kate', 'Linda', 'Margaret', 'Nancy', 'Olivia',
  'Patricia', 'Queen', 'Rebecca', 'Sandra', 'Teresa', 'Ursula', 'Violet',
  'Winnie', 'Xenia', 'Yvonne', 'Zara', 'Alice', 'Brenda', 'Christine',
  'Daphne', 'Ellen', 'Florence', 'Grace', 'Hope', 'Ivy', 'Juliet', 'Karen',
  'Lillian', 'Mary', 'Nora', 'Pamela', 'Ruth', 'Sophia', 'Tabitha', 'Valerie',
  'Wendy', 'Yasmin', 'Zoe', 'Amanda', 'Barbara',
];

// Ugandan surnames covering Buganda, Acholi, Langi, Iteso, Banyankole, etc.
const LAST_NAMES = [
  'Tumwine', 'Namugera', 'Kato', 'Nalwanga', 'Ochieng', 'Auma', 'Lubega',
  'Namutebi', 'Ssebunya', 'Nantongo', 'Musoke', 'Babirye', 'Waiswa',
  'Nansubuga', 'Otim', 'Nabukera', 'Kasule', 'Mirembe', 'Kibuuka',
  'Ainomugisha', 'Mwesigwa', 'Kyomuhendo', 'Mugume', 'Nakato', 'Ssempijja',
  'Namatovu', 'Kayongo', 'Nambi', 'Wasswa', 'Kemigisha', 'Aine', 'Bwambale',
  'Chemonges', 'Doryne', 'Echodu', 'Faridah', 'Gulu', 'Hakim', 'Iga',
  'Jjingo', 'Kakuru', 'Lwanga', 'Magezi', 'Nakimuli', 'Okurut', 'Pulkol',
  'Rukundo', 'Sserwadda', 'Tushabe', 'Umutoni', 'Vianney', 'Wandera',
  'Yiga', 'Zziwa', 'Akampwera', 'Bagonza', 'Cherop', 'Drazu', 'Etomet',
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const rand = (n: number) => Math.floor(Math.random() * n);
const sample = <T>(arr: T[]): T => arr[rand(arr.length)];

/**
 * Stateful name allocator — guarantees every name returned is unique across
 * every call to next(), even across roles. Walks the cartesian product of
 * (first, last) deterministically.
 */
function makeNameAllocator() {
  const seen = new Set<string>();
  let i = 0;

  function next(): { first: string; last: string; gender: Gender } {
    while (true) {
      const gender = i % 2 === 0 ? Gender.MALE : Gender.FEMALE;
      const firstPool = gender === Gender.MALE ? MALE_FIRSTS : FEMALE_FIRSTS;
      const first = firstPool[i % firstPool.length];
      const last = LAST_NAMES[Math.floor(i / firstPool.length) % LAST_NAMES.length];
      i++;
      const key = `${first}|${last}`;
      if (!seen.has(key)) {
        seen.add(key);
        return { first, last, gender };
      }
      if (i > 1_000_000) throw new Error('name pool exhausted');
    }
  }

  function take(count: number) {
    return Array.from({ length: count }, () => next());
  }

  return { next, take };
}

async function main() {
  console.log('🌱 Seeding database (large dataset)…');

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

  // Hash once — bcrypt is the slowest single thing in this script.
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

  // Single allocator so names are globally unique across teachers/students/parents.
  const names = makeNameAllocator();

  // ─── TEACHERS (30) ──────────────────────────────────────────────────────────
  const TEACHER_COUNT = 30;
  // First 5 keep their original emails so existing tests + docs still work.
  const fixedTeachers = [
    { firstName: 'Sarah', lastName: 'Nakamya', email: 'sarah.nakamya@markova.academy', phone: '+256700000010' },
    { firstName: 'John', lastName: 'Okello', email: 'john.okello@markova.academy', phone: '+256700000011' },
    { firstName: 'Grace', lastName: 'Atim', email: 'grace.atim@markova.academy', phone: '+256700000012' },
    { firstName: 'Peter', lastName: 'Ssemakula', email: 'peter.ssemakula@markova.academy', phone: '+256700000013' },
    { firstName: 'Ruth', lastName: 'Nabirye', email: 'ruth.nabirye@markova.academy', phone: '+256700000014' },
  ];
  const generatedTeachers = names.take(TEACHER_COUNT - fixedTeachers.length).map(
    (n, idx) => ({
      firstName: n.first,
      lastName: n.last,
      email: `${n.first.toLowerCase()}.${n.last.toLowerCase()}${idx}@markova.academy`,
      phone: `+256722${String(100 + idx).padStart(6, '0')}`,
    }),
  );
  const teacherData = [...fixedTeachers, ...generatedTeachers];

  const teacherUsers: any[] = [];
  const teachers: any[] = [];
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
  console.log(`  ✅ ${teachers.length} teachers seeded`);

  // ─── LIBRARIAN ──────────────────────────────────────────────────────────────
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
  const now = new Date();
  const yr = now.getFullYear();
  const academicYear = await prisma.academicYear.create({
    data: {
      name: `${yr}-${yr + 1}`,
      startDate: new Date(`${yr}-02-01`),
      endDate: new Date(`${yr}-11-30`),
      isCurrent: true,
    },
  });
  const terms: any[] = [];
  const termDates = [
    { name: 'Term 1', start: `${yr}-02-01`, end: `${yr}-04-30` },
    { name: 'Term 2', start: `${yr}-05-15`, end: `${yr}-08-15` },
    { name: 'Term 3', start: `${yr}-09-01`, end: `${yr}-11-30` },
  ];
  for (let i = 0; i < termDates.length; i++) {
    const t = await prisma.term.create({
      data: {
        academicYearId: academicYear.id,
        name: termDates[i].name,
        startDate: new Date(termDates[i].start),
        endDate: new Date(termDates[i].end),
        isCurrent: i === 0,
        isClosed: false,
      },
    });
    terms.push(t);
  }
  console.log('  ✅ Academic year + 3 terms seeded');

  // ─── CLASS LEVELS (S1–S6) & SECTIONS (A–E) ──────────────────────────────────
  const LEVEL_NAMES = ['Senior 1', 'Senior 2', 'Senior 3', 'Senior 4', 'Senior 5', 'Senior 6'];
  const SECTION_NAMES = ['A', 'B', 'C', 'D', 'E'];
  const classLevels: any[] = [];
  for (let i = 0; i < LEVEL_NAMES.length; i++) {
    classLevels.push(
      await prisma.classLevel.create({ data: { name: LEVEL_NAMES[i], order: i + 1 } }),
    );
  }
  const classSections: any[] = [];
  for (const level of classLevels) {
    for (const sName of SECTION_NAMES) {
      classSections.push(
        await prisma.classSection.create({
          data: { classLevelId: level.id, name: sName },
        }),
      );
    }
  }
  console.log(
    `  ✅ ${classLevels.length} class levels + ${classSections.length} sections seeded`,
  );

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
    { name: 'Literature in English', category: 'Languages' },
    { name: 'Religious Education', category: 'Humanities' },
    { name: 'Agriculture', category: 'Sciences' },
    { name: 'Economics', category: 'Humanities' },
    { name: 'Fine Art', category: 'Arts' },
    { name: 'Physical Education', category: 'Arts' },
    { name: 'French', category: 'Languages' },
  ];
  const subjects: any[] = [];
  for (const s of subjectData) {
    subjects.push(
      await prisma.subject.create({
        data: { ...s, maxMarks: 100, isActive: true },
      }),
    );
  }
  console.log(`  ✅ ${subjects.length} subjects seeded`);

  // ─── ASSESSMENT TYPES ───────────────────────────────────────────────────────
  const assessmentTypes: any[] = [];
  for (const name of ['Test 1', 'Test 2', 'Midterm Exam', 'Final Exam']) {
    assessmentTypes.push(await prisma.assessmentType.create({ data: { name } }));
  }
  console.log(`  ✅ ${assessmentTypes.length} assessment types seeded`);

  // ─── TEACHER SPECIAL ROLES ──────────────────────────────────────────────────
  // DOS, two HoDs, plus one class teacher per section (30 class teachers).
  await prisma.teacherRole.create({
    data: { teacherId: teachers[0].id, role: SpecialRole.DOS },
  });
  await prisma.teacherRole.create({
    data: { teacherId: teachers[1].id, role: SpecialRole.HOD, department: 'Sciences' },
  });
  await prisma.teacherRole.create({
    data: { teacherId: teachers[2].id, role: SpecialRole.HOD, department: 'Humanities' },
  });
  for (let i = 0; i < classSections.length; i++) {
    // Cycle through teachers as class teachers.
    const teacherIdx = (i + 3) % teachers.length;
    await prisma.teacherRole.create({
      data: {
        teacherId: teachers[teacherIdx].id,
        role: SpecialRole.CLASS_TEACHER,
        classSectionId: classSections[i].id,
      },
    });
  }
  console.log('  ✅ Teacher special roles seeded');

  // ─── TEACHER-SUBJECT-CLASS ASSIGNMENTS ──────────────────────────────────────
  // Each section gets every subject taught by some teacher, cycling.
  for (let si = 0; si < classSections.length; si++) {
    const section = classSections[si];
    for (let subj = 0; subj < subjects.length; subj++) {
      const teacherIdx = (si + subj) % teachers.length;
      await prisma.teacherSubjectClass.create({
        data: {
          teacherId: teachers[teacherIdx].id,
          subjectId: subjects[subj].id,
          classSectionId: section.id,
          academicYearId: academicYear.id,
        },
      });
    }
  }
  console.log('  ✅ Teacher-subject-class assignments seeded');

  // ─── STUDENTS (~330, distributed across 30 sections) ────────────────────────
  const STUDENTS_PER_SECTION = 11;
  const STUDENT_COUNT = classSections.length * STUDENTS_PER_SECTION;
  const studentNames = names.take(STUDENT_COUNT);

  const studentUsers: any[] = [];
  const students: any[] = [];
  for (let i = 0; i < STUDENT_COUNT; i++) {
    const sectionIdx = Math.floor(i / STUDENTS_PER_SECTION);
    const section = classSections[sectionIdx];
    const { first, last, gender } = studentNames[i];
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@student.markova.academy`;
    const user = await prisma.user.create({
      data: {
        email: i < 30 ? `student${i + 1}@markova.academy` : email, // keep doc-referenced student1
        passwordHash,
        role: Role.STUDENT,
        firstName: first,
        lastName: last,
        isActive: true,
        forcePasswordChange: true,
      },
    });
    const ageBase = 12 + Math.floor(sectionIdx / 5); // S1 → ~12 yrs, S6 → ~17 yrs
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        studentIdNumber: `MKV-${yr}-${String(i + 1).padStart(4, '0')}`,
        classSectionId: section.id,
        dateOfBirth: new Date(
          `${yr - ageBase}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
        ),
        gender,
        status: StudentStatus.ACTIVE,
        disciplinePoints: 100,
      },
    });
    studentUsers.push(user);
    students.push(student);
  }
  console.log(`  ✅ ${students.length} students seeded`);

  // ─── PARENTS (200) ──────────────────────────────────────────────────────────
  const PARENT_COUNT = 200;
  const parentNames = names.take(PARENT_COUNT);
  const parentUsers: any[] = [];
  for (let i = 0; i < PARENT_COUNT; i++) {
    const { first, last } = parentNames[i];
    const phone = `+256711${String(i).padStart(6, '0')}`;
    const user = await prisma.user.create({
      data: {
        phone,
        // First 15 parents keep their phone-only login profile to match docs.
        email: i >= 15 ? `${first.toLowerCase()}.${last.toLowerCase()}${i}@parent.markova.academy` : null,
        passwordHash,
        role: Role.PARENT,
        firstName: first,
        lastName: last,
        isActive: true,
        forcePasswordChange: true,
      },
    });
    parentUsers.push(user);
  }

  // Link parents to students: every student gets 1–2 parents. Cycle parents.
  let pcursor = 0;
  for (let si = 0; si < students.length; si++) {
    const numParents = (si % 4 === 0) ? 1 : 2; // most students have two parents
    for (let p = 0; p < numParents; p++) {
      const parent = parentUsers[pcursor % parentUsers.length];
      pcursor++;
      await prisma.parentStudent.create({
        data: {
          parentUserId: parent.id,
          studentId: students[si].id,
          relationship: p === 0 ? 'Father' : 'Mother',
        },
      });
    }
  }
  console.log(`  ✅ ${parentUsers.length} parents seeded and linked`);

  // ─── MARKS ──────────────────────────────────────────────────────────────────
  // Term 1, first 6 subjects × 2 assessment types for every student.
  // That's 330 × 6 × 2 = 3,960 mark rows. createMany for speed.
  const markRows: any[] = [];
  for (let si = 0; si < students.length; si++) {
    const sectionIdx = Math.floor(si / STUDENTS_PER_SECTION);
    for (let subj = 0; subj < 6; subj++) {
      for (let at = 0; at < 2; at++) {
        const score = 40 + rand(55); // 40-94
        const teacherIdx = (sectionIdx + subj) % teachers.length;
        markRows.push({
          studentId: students[si].id,
          subjectId: subjects[subj].id,
          classSectionId: classSections[sectionIdx].id,
          termId: terms[0].id,
          assessmentTypeId: assessmentTypes[at].id,
          score,
          maxScore: 100,
          teacherId: teachers[teacherIdx].id,
        });
      }
    }
  }
  await prisma.mark.createMany({ data: markRows });
  console.log(`  ✅ ${markRows.length} marks seeded`);

  // ─── ATTENDANCE (5 weekdays) ────────────────────────────────────────────────
  const startMonday = new Date(`${yr}-02-03`); // Mon
  const attRows: any[] = [];
  for (let d = 0; d < 5; d++) {
    const date = new Date(startMonday);
    date.setDate(startMonday.getDate() + d);
    for (let si = 0; si < students.length; si++) {
      const sectionIdx = Math.floor(si / STUDENTS_PER_SECTION);
      const r = Math.random();
      let status: AttendanceStatus;
      let reason: AbsenceReason | null = null;
      if (r < 0.86) status = AttendanceStatus.PRESENT;
      else if (r < 0.93) status = AttendanceStatus.LATE;
      else {
        status = AttendanceStatus.ABSENT;
        reason = AbsenceReason.SICK;
      }
      attRows.push({
        studentId: students[si].id,
        classSectionId: classSections[sectionIdx].id,
        date,
        type: 'daily',
        status,
        reasonCategory: reason,
        markedByUserId: teacherUsers[sectionIdx % teacherUsers.length].id,
      });
    }
  }
  await prisma.attendance.createMany({ data: attRows });
  console.log(`  ✅ ${attRows.length} attendance records seeded`);

  // ─── DISCIPLINE INCIDENTS ───────────────────────────────────────────────────
  const incidentDescriptions = [
    'Late to morning assembly',
    'Talking during class',
    'Incomplete homework',
    'Uniform violation',
    'Disruptive behavior in lab',
    'Phone use in class',
    'Disrespect to staff',
    'Bullying reported',
    'Skipping prep',
    'Vandalism (minor)',
  ];
  // 30 incidents spread across students.
  for (let i = 0; i < 30; i++) {
    const student = students[(i * 11) % students.length];
    const pts = 2 + (i % 5) * 2;
    await prisma.disciplineIncident.create({
      data: {
        studentId: student.id,
        termId: terms[0].id,
        recordedByUserId: teacherUsers[i % teacherUsers.length].id,
        date: new Date(`${yr}-02-${String(3 + (i % 25)).padStart(2, '0')}`),
        time: '08:30',
        location: i % 2 ? 'Classroom' : 'Main Hall',
        description: incidentDescriptions[i % incidentDescriptions.length],
        pointsDeducted: pts,
        actionTaken:
          i < 15 ? DisciplineAction.VERBAL_WARNING : DisciplineAction.WRITTEN_WARNING,
        parentAcknowledged: i % 3 === 0,
        parentAcknowledgedAt: i % 3 === 0 ? new Date() : null,
      },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: { disciplinePoints: { decrement: pts } },
    });
  }
  console.log('  ✅ 30 discipline incidents seeded');

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
  for (let i = 0; i < bookData.length; i++) {
    books.push(
      await prisma.book.create({
        data: {
          ...bookData[i],
          quantity: 10,
          availableCount: 10,
          barcode: `BK-${String(i + 1).padStart(5, '0')}`,
          replacementCost: 25000 + rand(50000),
          isActive: true,
        },
      }),
    );
  }
  // 20 active loans, due 14 days from now.
  const loanDueDate = new Date();
  loanDueDate.setDate(loanDueDate.getDate() + 14);
  for (let i = 0; i < 20; i++) {
    await prisma.bookLoan.create({
      data: {
        bookId: books[i % books.length].id,
        borrowerUserId: studentUsers[i].id,
        dueDate: loanDueDate,
        status: LoanStatus.ACTIVE,
      },
    });
    await prisma.book.update({
      where: { id: books[i % books.length].id },
      data: { availableCount: { decrement: 1 } },
    });
  }
  console.log(`  ✅ ${books.length} books + 20 active loans seeded`);

  // ─── HOMEWORK ───────────────────────────────────────────────────────────────
  // One homework per subject for S1A so multiple appear on a student's dashboard.
  const hwDueDate = new Date();
  hwDueDate.setDate(hwDueDate.getDate() + 7);
  for (let i = 0; i < Math.min(subjects.length, 8); i++) {
    const hw = await prisma.homework.create({
      data: {
        teacherId: teachers[i % teachers.length].id,
        subjectId: subjects[i].id,
        classSectionId: classSections[0].id,
        termId: terms[0].id,
        title: `${subjects[i].name} — Practice Set ${i + 1}`,
        description: 'Complete the prescribed exercises and submit on time.',
        dueDate: hwDueDate,
        maxMarks: 20,
        lateDeductionPerDay: 2,
      },
    });
    // First 5 students in S1A submit.
    for (let s = 0; s < 5; s++) {
      await prisma.homeworkSubmission.create({
        data: {
          homeworkId: hw.id,
          studentId: students[s].id,
          submittedAt: new Date(),
          isLate: false,
          marks: 12 + rand(8),
          gradedAt: new Date(),
          gradedByUserId: teacherUsers[i % teacherUsers.length].id,
        },
      });
    }
  }
  console.log('  ✅ Homework + sample submissions seeded');

  // ─── MESSAGES ───────────────────────────────────────────────────────────────
  const conv1 = await prisma.conversation.create({
    data: { type: ConversationType.ONE_ON_ONE, createdByUserId: admin.id },
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

  const conv2 = await prisma.conversation.create({
    data: {
      type: ConversationType.BROADCAST,
      name: 'Staff Announcements',
      createdByUserId: admin.id,
    },
  });
  await prisma.conversationParticipant.createMany({
    data: [
      { conversationId: conv2.id, userId: admin.id, isAdmin: true },
      ...teacherUsers.map((t) => ({ conversationId: conv2.id, userId: t.id, isAdmin: false })),
    ],
  });
  await prisma.message.create({
    data: {
      conversationId: conv2.id,
      senderUserId: admin.id,
      content: 'Staff meeting scheduled for Monday at 3:00 PM in the conference room.',
      contentType: MessageContentType.TEXT,
    },
  });
  console.log('  ✅ Conversations + messages seeded');

  // ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
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
        type: NotificationType.EMAIL,
      },
    ],
  });
  console.log('  ✅ Notifications seeded');

  // ─── FAQ ────────────────────────────────────────────────────────────────────
  await prisma.faqArticle.createMany({
    data: [
      { title: 'How to reset my password?', content: 'Contact the school administrator to reset your password. You will receive an OTP on your registered phone number.', category: 'Account', displayOrder: 1 },
      { title: "How to check my child's marks?", content: 'Log in to the parent portal, navigate to the Marks section, and select the relevant term.', category: 'Marks', displayOrder: 2 },
      { title: 'How to report an absence?', content: 'Parents can report an absence through the mobile app or by contacting the class teacher directly.', category: 'Attendance', displayOrder: 3 },
    ],
  });
  console.log('  ✅ FAQ articles seeded');

  // ─── TIMETABLE ──────────────────────────────────────────────────────────────
  // Build for the first 6 sections (one per level) so every level has a sample.
  const days = [1, 2, 3, 4, 5];
  const timeSlots = [
    { start: '08:00', end: '08:45' },
    { start: '08:50', end: '09:35' },
    { start: '09:50', end: '10:35' },
    { start: '10:40', end: '11:25' },
    { start: '11:30', end: '12:15' },
    { start: '14:00', end: '14:45' },
    { start: '14:50', end: '15:35' },
  ];
  let timetableCount = 0;
  for (let lvl = 0; lvl < classLevels.length; lvl++) {
    const section = classSections[lvl * SECTION_NAMES.length]; // section A of each level
    for (const day of days) {
      for (let slot = 0; slot < Math.min(timeSlots.length, subjects.length); slot++) {
        const subjectIdx = (day * 3 + slot + lvl) % subjects.length;
        const teacherIdx = (subjectIdx + lvl) % teachers.length;
        await prisma.timetable.create({
          data: {
            classSectionId: section.id,
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
  }
  console.log(`  ✅ ${timetableCount} timetable entries seeded`);

  console.log('\n🎉 Seed completed successfully!');
  console.log(`   ${teachers.length} teachers · ${students.length} students · ${parentUsers.length} parents · ${classSections.length} classes`);
  console.log('   Default password for all users: Password123!');
  console.log('   Admin email: wilsonshizirungu@gmail.com');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
