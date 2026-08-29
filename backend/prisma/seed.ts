import {
  PrismaClient,
  AssessmentKind,
  Role,
  SpecialRole,
  EmploymentStatus,
  StudentStatus,
  Gender,
  AttendanceStatus,
  AbsenceReason,
  LoanStatus,
  DisciplineAction,
  AppealStatus,
  ConversationType,
  MessageContentType,
  NotificationType,
  EducationStage,
  SubjectScope,
  ActivityKind,
  ActivityAudience,
  ConsentState,
  ClinicSeverity,
  ClinicVisitOutcome,
  MeritCategory,
  FeeAppliesTo,
  PaymentMethod,
  WaiverKind,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { TERM_CONDUCT_MARK } from '../src/common/conduct';
import { chargesFor, invoiceTotal, nextReceiptNumber } from '../src/common/fees';
import {
  installBrandingAsset,
  shouldWriteConfig,
} from '../src/common/branding-install';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TeacherQualification } from '@prisma/client';
import { buildStudentId, studentIdSecret } from '../src/common/student-id';
import {
  computeSubjectTotal,
  countsTowardAggregate,
  gradeFor,
  overallGrade,
  MAX_POINTS_PER_SUBJECT,
} from '../src/common/grading';
import { NotificationSubject } from '../src/common/notification-target';

const prisma = new PrismaClient();

// ─── NAME POOLS ──────────────────────────────────────────────────────────────
// Rwandan naming, done properly:
//  - children do NOT inherit a surname; each gets their own Kinyarwanda name
//  - students (13-19) carry modern names, adults carry their generation's
//  - every Kinyarwanda and Western name is gendered (or explicitly unisex)
//  - a small minority of students carry a rare lineage name passed down from
//    a parent; those names stay inside one family

// Adults (teachers, parents) - Western first names of their generation.
const ADULT_WESTERN_MALE = [
  'Jean', 'Eric', 'Patrick', 'Emmanuel', 'Olivier', 'Fabrice', 'Thierry',
  'Aimable', 'Gilbert', 'Innocent', 'Claude', 'Bosco', 'Theogene', 'Faustin',
  'Vedaste', 'Celestin', 'Aloys', 'Dieudonne', 'Janvier', 'Pascal', 'Cyprien',
  'Anselme', 'Fidele', 'Egide', 'Moise', 'Eugene', 'Protais', 'Aime',
  'Felicien', 'Theoneste', 'Boniface', 'Augustin', 'Desire', 'Placide',
  'Schadrack', 'Straton', 'Damascene', 'Vianney', 'Elie', 'Gaspard',
  'Herve', 'Isaie', 'Jonas', 'Maurice', 'Norbert', 'Pacifique', 'Samuel',
  'Yves', 'Callixte', 'Deogratias',
];

const ADULT_WESTERN_FEMALE = [
  'Aline', 'Claudine', 'Diane', 'Esperance', 'Josiane', 'Solange', 'Yvette',
  'Chantal', 'Immaculee', 'Vestine', 'Beatha', 'Christine', 'Donatha',
  'Florence', 'Goretti', 'Henriette', 'Liliane', 'Mediatrice', 'Nadine',
  'Odette', 'Pelagie', 'Sandrine', 'Triphine', 'Valentine', 'Yvonne',
  'Honorine', 'Josee', 'Jeanne', 'Marie', 'Olive', 'Rose', 'Sonia',
  'Clarisse', 'Denyse', 'Gisele', 'Ines', 'Lea', 'Nelly', 'Pamela',
  'Winnie', 'Speciose', 'Dativa', 'Verena', 'Cecile', 'Alphonsine',
  'Bernadette', 'Emerthe', 'Francine', 'Judith', 'Seraphine',
];

// Adults - Kinyarwanda names, gendered.
const ADULT_KINYA_MALE = [
  'Habimana', 'Bizimana', 'Nshimiyimana', 'Hakizimana', 'Mugisha',
  'Ndayisaba', 'Nsengiyumva', 'Murenzi', 'Gatera', 'Karangwa', 'Kagabo',
  'Nkurunziza', 'Munyaneza', 'Sibomana', 'Ntirenganya', 'Byiringiro',
  'Gasana', 'Kalisa', 'Rugema', 'Ruterana', 'Sebahire', 'Twagiramungu',
  'Nizeyimana', 'Bizimungu', 'Nteziryayo', 'Gakwaya', 'Habyarimana',
  'Ndahiro', 'Ndagijimana', 'Niyonsenga', 'Twahirwa', 'Niyonzima',
  'Mbarushimana', 'Ndayambaje', 'Nkundimana', 'Muhirwa', 'Rutayisire',
  'Nsabimana', 'Bimenyimana', 'Harelimana', 'Nsengimana', 'Gasore',
  'Semasaka', 'Munyakazi', 'Nzeyimana', 'Habineza', 'Maniraguha',
  'Hategekimana', 'Niyomugabo', 'Rurangirwa', 'Munyemana', 'Ngendahimana',
  'Sentore', 'Muneza', 'Mugenzi', 'Kanamugire', 'Gatete', 'Rusanganwa',
  'Musonera', 'Nsanzimana', 'Karekezi', 'Niyonkuru', 'Ntawukuriryayo',
  'Ruzindana', 'Musabyimana', 'Nkundabanyanga',
];

const ADULT_KINYA_FEMALE = [
  'Mukamana', 'Uwase', 'Uwera', 'Mutoni', 'Kayitesi', 'Ingabire',
  'Mukandayisenga', 'Uwamahoro', 'Mukeshimana', 'Mukantwari', 'Umuhoza',
  'Nyirahabimana', 'Mukagatare', 'Mukarugwiza', 'Nyiransabimana',
  'Mukasine', 'Uwizeyimana', 'Mukamurenzi', 'Uwingabire', 'Mukashyaka',
  'Nyirarukundo', 'Mukandori', 'Mukanoheli', 'Uwimbabazi', 'Mukabalisa',
  'Umutesi', 'Mukansanga', 'Mukamazimpaka', 'Mukandutiye', 'Munganyinka',
  'Nikuze', 'Uwituze', 'Uwonkunda', 'Murekatete', 'Mukarurangwa',
  'Nyiraneza', 'Mukanyandwi', 'Uwimana', 'Iradukunda', 'Kayirebwa',
  'Mukarusanga', 'Nyirabagenzi', 'Mukandekezi', 'Uwamariya', 'Mukamusoni',
  'Nyiramugisha', 'Mukanyangezi', 'Uwacu', 'Mukundwa', 'Kanyamibwa',
];

// Students - modern Kinyarwanda names (Gen-Z / Gen-Alpha), gendered.
const STUDENT_KINYA_MALE = [
  'Shema', 'Manzi', 'Ganza', 'Hirwa', 'Mucyo', 'Gisa', 'Nkusi', 'Kwizera',
  'Cyubahiro', 'Intwari', 'Imanzi', 'Shyaka', 'Rugero', 'Kaze', 'Mugabo',
  'Ngabo', 'Hodari', 'Songa', 'Rugwiro', 'Turatsinze', 'Nshuti', 'Munezero',
  'Cyizere', 'Kirenga', 'Rukundo', 'Rugamba', 'Mazimpaka', 'Ndamage',
  'Semana', 'Rutagengwa', 'Karake', 'Kamali', 'Gatsinzi', 'Rwema',
  'Cyusa', 'Mvuyekure', 'Ndoli', 'Bwenge', 'Sabato', 'Rutaganira',
];

const STUDENT_KINYA_FEMALE = [
  'Keza', 'Ineza', 'Teta', 'Isaro', 'Isimbi', 'Ikirezi', 'Agasaro',
  'Kaliza', 'Kamikazi', 'Kundwa', 'Umutoni', 'Mutesi', 'Uwera', 'Umuhoza',
  'Nirere', 'Akaliza', 'Kirezi', 'Gikundiro', 'Icyeza', 'Umwali',
  'Umwari', 'Gasaro', 'Ihoza', 'Iriza', 'Impano', 'Ituze', 'Ubwiza',
  'Isano', 'Giramata', 'Ingoga', 'Keyla', 'Ishami', 'Umutuzo', 'Icyizere',
  'Inkindi', 'Kazeneza', 'Umurerwa', 'Uwineza', 'Umulisa', 'Akeza',
];

// Names used for both genders.
const STUDENT_KINYA_UNISEX = [
  'Ishimwe', 'Iradukunda', 'Irakoze', 'Mahoro', 'Amani', 'Gwiza', 'Shimwa',
  'Tetero', 'Hobe', 'Kunda', 'Sangwa', 'Cyuzuzo', 'Muhoza', 'Sano',
  'Ihirwe', 'Iranzi', 'Isheja', 'Nema',
];

// Students - modern Western/Christian first names.
const STUDENT_WESTERN_MALE = [
  'Ryan', 'Bryan', 'Brian', 'Ivan', 'Kevin', 'Ethan', 'Aidan', 'Alvin',
  'Chris', 'Danny', 'Arnold', 'Prince', 'Yannick', 'Cedric', 'Kenny',
  'Jayden', 'Liam', 'Dylan', 'Axel', 'Enzo', 'Andy', 'Alain', 'Nathan',
  'Aaron', 'Ian', 'Jason', 'Kayden', 'Darren', 'Warren', 'Keith',
  'Calvin', 'Elvis', 'Denzel', 'Travis', 'Marvin', 'Junior', 'Elton',
  'Hans', 'Lionel', 'Fiston',
];

const STUDENT_WESTERN_FEMALE = [
  'Ashley', 'Melissa', 'Vanessa', 'Leila', 'Keila', 'Gaella', 'Anaella',
  'Ornella', 'Sheila', 'Cynthia', 'Sandra', 'Tina', 'Bella', 'Stella',
  'Rachel', 'Raissa', 'Ketsia', 'Deborah', 'Queen', 'Angel', 'Divine',
  'Alicia', 'Tracy', 'Whitney', 'Fiona', 'Diana', 'Laura', 'Linda',
  'Erica', 'Jessica', 'Nicole', 'Michelle', 'Audrey', 'Chloe', 'Kelly',
  'Wendy', 'Sylvia', 'Carine', 'Anitha', 'Belinda',
];

// Rare lineage names, confirmed list. Each belongs to exactly ONE family in
// the school: the parent carries it and passes it to their child(ren).
const INHERITED_FATHER_LINE = [
  'Rwigema', 'Rudasingwa', 'Rwigara', 'Kayihura', 'Sebarenzi', 'Gatabazi',
  'Munyurangabo', 'Bizumuremyi', 'Nkubito', 'Semanza', 'Sekamana',
  'Gashumba', 'Rutaremara', 'Rwabutogo', 'Gakuba', 'Kajangwe', 'Ruganzu',
  'Mibambwe', 'Ndahindurwa', 'Rwabukamba',
];
const INHERITED_MOTHER_LINE = [
  'Kanyange', 'Nyampinga', 'Kanyana', 'Nyiramahoro', 'Kabatesi',
  'Kankindi', 'Umulinga', 'Nyiratunga', 'Kanakuze', 'Mukandoli',
];

// ─── SCHOOL STRUCTURE ────────────────────────────────────────────────────────
// O-Level: Senior 1-3, streams A and B. A-Level (TVET): Level 3-5, where each
// level runs the 4 trades and a trade has stream A or streams A+B. Every level
// lands on 7 or 8 classes, 25-30 students each.

const TRADES = [
  { code: 'SWD', name: 'Software Development', sector: 'ICT and Multimedia' },
  {
    code: 'NIT',
    name: 'Networking and Internet Technology',
    sector: 'ICT and Multimedia',
  },
  { code: 'TOR', name: 'Tourism', sector: 'Hospitality and Tourism' },
  {
    code: 'AUT',
    name: 'Automobile Technology',
    sector: 'Transport and Logistics',
  },
];

const O_LEVELS = [
  { name: 'Senior 1', order: 1 },
  { name: 'Senior 2', order: 2 },
  { name: 'Senior 3', order: 3 },
];
const A_LEVELS = [
  { name: 'Level 3', order: 4 },
  { name: 'Level 4', order: 5 },
  { name: 'Level 5', order: 6 },
];

// ─── SUBJECTS ────────────────────────────────────────────────────────────────
// O-Level: the 9 national core papers plus 3 electives. A-Level: general
// modules shared by every trade plus RTB trade-specific modules per level
// (module names follow NESA/RTB 2025-2026 assessment standards).

const O_CORE_SUBJECTS = [
  { name: 'Kinyarwanda', category: 'Languages' },
  { name: 'English', category: 'Languages' },
  { name: 'Mathematics', category: 'Sciences' },
  { name: 'Physics', category: 'Sciences' },
  { name: 'Chemistry', category: 'Sciences' },
  { name: 'Biology and Health Sciences', category: 'Sciences' },
  { name: 'Geography and Environment', category: 'Humanities' },
  { name: 'History and Citizenship', category: 'Humanities' },
  { name: 'Entrepreneurship', category: 'Business' },
];

const O_ELECTIVE_SUBJECTS = [
  { name: 'Kiswahili', category: 'Languages' },
  { name: 'ICT', category: 'Sciences' },
  { name: 'French', category: 'Languages' },
];

// Kinyarwanda and Entrepreneurship are shared with O-Level (same paper name),
// so A-Level classes reuse those two core rows as general modules.
const A_GENERAL_SUBJECTS = [
  { name: 'English (Communication Skills)', category: 'Languages' },
  { name: 'Mathematics for Technology', category: 'Sciences' },
  { name: 'Basic ICT', category: 'Sciences' },
];
const A_SHARED_CORE_NAMES = ['Kinyarwanda', 'Entrepreneurship'];

const TRADE_MODULES: Record<string, Record<string, string[]>> = {
  SWD: {
    'Level 3': [
      'Basic Graphic Design',
      'Website Development',
      'Version Control',
      'JavaScript Fundamentals',
      'Project Requirements Analysis',
      'UI/UX Design',
      'Vue.JS Framework',
    ],
    'Level 4': [
      'Database Development',
      'Data Structure and Algorithm Fundamentals',
      'Backend System Design',
      'PHP Programming',
      'Backend Application Development',
      'Windows Server Administration',
      'Basics of Networking',
    ],
    'Level 5': [
      'Blockchain Fundamentals',
      'Frontend Application Development using React.JS',
      'Mobile Application Development',
      'Machine Learning Application',
      'NoSQL Database Development',
      'DevOps Application',
      'Python Programming',
      'Quality Assurance Application',
    ],
  },
  NIT: {
    'Level 3': [
      'Basics of Electricity',
      'C Programming Fundamentals',
      'CCTV System Installation',
      'IoT System Installation',
      'LAN Installation',
      'Network Fundamentals',
      'VoIP System Installation',
      'Electronic Fundamentals',
      'Wireless Network Indoor',
    ],
    'Level 4': [
      'IoT System Development',
      'Fiber Optics Network Deployment',
      'Wireless Network Outdoor',
      'Wide Area Network',
      'IoT Web Application Development using PHP',
      'Basics of Technical Drawing',
      'Database Development',
      'Windows Server Administration',
    ],
    'Level 5': [
      'Zero Client Application',
      'Machine Learning Fundamentals',
      'Linux Server Administration',
      'Cyber Security',
      'Cloud Computing Technology in Data Center',
      'Python Programming Fundamentals',
    ],
  },
  TOR: {
    'Level 3': [
      'Introduction to Tourism',
      'Customer Care',
      'Rwandan Tourism Products',
      'Communication in Tourism',
      'First Aid',
    ],
    'Level 4': [
      'Tour Guiding Techniques',
      'Travel Agency Operations',
      'Front Office Operations',
      'Itinerary Preparation',
      'Tourist Transportation',
    ],
    'Level 5': [
      'Community Based Tourism and Heritage',
      'Tour Package Design',
      'Ecotourism and Conservation',
      'Tourism Marketing',
      'Events Management',
    ],
  },
  AUT: {
    'Level 3': [
      'Workshop Practice and Safety',
      'Engine Fundamentals',
      'Automotive Tools and Materials',
      'Basic Technical Drawing',
      'Vehicle Servicing',
    ],
    'Level 4': [
      'Engine Overhaul',
      'Automotive Electrical Systems',
      'Braking Systems',
      'Steering and Suspension',
      'Wheel and Tyre Service',
    ],
    'Level 5': [
      'Engine Diagnosis',
      'Transmission Systems',
      'Vehicle Electronics',
      'Air Conditioning Systems',
      'Vehicle Inspection and Diagnosis',
    ],
  },
};

// Assessment types and their roles. Weights live in src/common/grading.ts:
// general subjects 20/20/60, trade-specific modules 15/15/30/40.
const ASSESSMENT_NAMES = ['CAT 1', 'CAT 2', 'Practical', 'End of Term Exam'];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const rand = (n: number) => Math.floor(Math.random() * n);
const sample = <T,>(arr: T[]): T => arr[rand(arr.length)];
const chance = (p: number) => Math.random() < p;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Deals a pool card by card in random order, reshuffling only once the whole
// pool is used up - this spreads repeats as thinly as the pool allows.
function dealer(pool: string[]) {
  let deck = shuffled(pool);
  return () => {
    if (deck.length === 0) deck = shuffled(pool);
    return deck.pop()!;
  };
}

// ─── STUDENT NUMBERS ─────────────────────────────────────────────────────────
// STD-<year>-<ABC>-<DEF>. ABC encodes three letters of the student's own name;
// DEF is signed with the school secret, which is what makes the number both
// unique and impossible to invent. See backend/src/common/student-id.ts and
// docs/STUDENT-ID-CARD.md.
const issuedStudentIds = new Set<string>();
function studentNumber(first: string, last: string, year: number, key: string): string {
  for (let nonce = 0; nonce < 50; nonce++) {
    const id = buildStudentId(studentIdSecret(), {
      fullName: `${first} ${last}`,
      year,
      studentKey: key,
      nonce,
    });
    if (!issuedStudentIds.has(id)) {
      issuedStudentIds.add(id);
      return id;
    }
  }
  throw new Error(`Could not issue a student number for ${first} ${last}`);
}

// ─── NAME GENERATION ─────────────────────────────────────────────────────────

/**
 * initial.kinyarwandaname@markova.edu, for everyone in the school.
 *
 * One rule for staff, students and parents alike. A number is appended only
 * when the address is genuinely taken, so the first Wilson Mugisha is
 * `w.mugisha@` and the next one is `w.mugisha1@`. Numbering every address
 * unconditionally is what produced things like `aaron.iradukunda959@`, which
 * is not an address any school would issue.
 */
const usedEmails = new Set<string>();
function emailFor(first: string, last: string): string {
  const given = first.trim().split(' ')[0].toLowerCase();
  const family = last.trim().split(' ')[0].toLowerCase();
  const base = `${given[0]}.${family}`;

  let candidate = `${base}@markova.edu`;
  for (let n = 1; usedEmails.has(candidate); n++) {
    candidate = `${base}${n}@markova.edu`;
  }
  usedEmails.add(candidate);
  return candidate;
}

// ─── RWANDAN RECORD POOLS ────────────────────────────────────────────────────
// Residence follows the real 5-level address. Day students overwhelmingly
// come from Kigali; boarders mostly from the other provinces.
const KIGALI_AREAS = [
  { province: 'Kigali City', district: 'Gasabo', sectors: ['Kacyiru', 'Kimironko', 'Remera', 'Kinyinya', 'Gisozi', 'Kimihurura', 'Gatsata', 'Ndera', 'Rusororo'] },
  { province: 'Kigali City', district: 'Kicukiro', sectors: ['Niboye', 'Gatenga', 'Kicukiro', 'Kanombe', 'Gahanga', 'Kagarama'] },
  { province: 'Kigali City', district: 'Nyarugenge', sectors: ['Nyamirambo', 'Kimisagara', 'Muhima', 'Gitega', 'Nyakabanda'] },
];
const UPCOUNTRY_AREAS = [
  { province: 'Eastern Province', district: 'Rwamagana', sectors: ['Kigabiro', 'Muhazi', 'Rubona'] },
  { province: 'Eastern Province', district: 'Kayonza', sectors: ['Mukarange', 'Rukara'] },
  { province: 'Southern Province', district: 'Huye', sectors: ['Ngoma', 'Tumba', 'Mukura'] },
  { province: 'Southern Province', district: 'Muhanga', sectors: ['Nyamabuye', 'Shyogwe'] },
  { province: 'Northern Province', district: 'Musanze', sectors: ['Muhoza', 'Cyuve'] },
  { province: 'Northern Province', district: 'Gicumbi', sectors: ['Byumba', 'Kaniga'] },
  { province: 'Western Province', district: 'Rubavu', sectors: ['Gisenyi', 'Nyamyumba'] },
  { province: 'Western Province', district: 'Karongi', sectors: ['Bwishyura', 'Rubengera'] },
];
const CELLS = ['Kamatamu', 'Kibaza', 'Amajyambere', 'Ubumwe', 'Umucyo', 'Kabeza', 'Nyabisindu', 'Rugando', 'Gacuriro', 'Kibagabaga'];
const VILLAGES = ['Urugero', 'Amahoro', 'Ubwiza', 'Isangano', 'Umurava', 'Karisimbi', 'Ituze', 'Icyerekezo', 'Uburanga', 'Ubwuzu'];
const PRIMARY_SCHOOLS = ['EP Kacyiru', 'EP Kimironko', 'EP Remera', 'EP Gisozi', 'EP Kanombe', 'EP Nyamirambo', 'EP Muhima', 'EP Kabeza', 'EP Gatsata', 'EP Zindiro'];
const SECONDARY_SCHOOLS = ['GS Remera', 'GS Kicukiro', 'GS Byumba', 'GS Rugando', 'ES Kanombe', 'GS Musanze', 'GS Huye', 'GS Rwamagana', 'GS Gisenyi', 'GS Muhanga'];
const DISABILITIES = ['Visual impairment', 'Hearing impairment', 'Physical disability', 'Learning difficulty'];
const BLOOD_TYPES = ['O+', 'O+', 'O+', 'A+', 'A+', 'B+', 'B+', 'AB+', 'O-', 'A-'];
const ALLERGIES = ['Penicillin', 'Dust', 'Peanuts', 'Bee stings', 'Lactose'];
const CONDITIONS = ['Asthma', 'Epilepsy', 'Sickle cell trait', 'Type 1 diabetes'];

// NIDA layout: status, birth year, gender digit (8 male / 7 female), birth
// order, issuance count, security code. Unique across the seed.
const usedNids = new Set<string>();
function makeNid(gender: Gender, birthYear: number, status = '1'): string {
  for (;;) {
    let order = '';
    for (let i = 0; i < 7; i++) order += rand(10);
    const nid = `${status}${birthYear}${gender === Gender.MALE ? '8' : '7'}${order}0${String(rand(100)).padStart(2, '0')}`;
    if (!usedNids.has(nid)) {
      usedNids.add(nid);
      return nid;
    }
  }
}

// Everything SDMS expects on a student record, generated coherently: IDs
// only from age 16, boarders mostly upcountry, guardians as plain text
// (overridden later with the linked parent accounts' names where they exist).
function studentExtras(
  gender: Gender,
  birthYear: number,
  age: number,
  joinLevelOrder: number,
  joinYearStart: Date,
) {
  const natRoll = rand(100);
  const nationality =
    natRoll < 96 ? 'Rwandan' : natRoll < 98 ? 'Congolese' : 'Burundian';
  const status = nationality === 'Rwandan' ? '1' : nationality === 'Burundian' ? '2' : '3';
  const isBoarder = chance(0.28);
  const area = sample(
    (isBoarder ? chance(0.85) : chance(0.06)) ? UPCOUNTRY_AREAS : KIGALI_AREAS,
  );
  const religionRoll = rand(100);
  return {
    user: {
      nationalId:
        age >= 16 && chance(0.9) ? makeNid(gender, birthYear, status) : null,
      nationality,
    },
    student: {
      province: area.province,
      district: area.district,
      sector: sample(area.sectors),
      cell: sample(CELLS),
      village: sample(VILLAGES),
      isBoarder,
      disability: chance(0.025) ? sample(DISABILITIES) : null,
      religion:
        religionRoll < 45
          ? 'Catholic'
          : religionRoll < 80
            ? 'Protestant'
            : religionRoll < 90
              ? 'Adventist'
              : religionRoll < 95
                ? 'Muslim'
                : null,
      insuranceNumber: chance(0.85)
        ? String(1000000000 + rand(899999999))
        : null,
      bloodType: chance(0.6) ? sample(BLOOD_TYPES) : null,
      allergies: chance(0.06) ? sample(ALLERGIES) : null,
      medicalConditions: chance(0.05) ? sample(CONDITIONS) : null,
      previousSchool:
        joinLevelOrder <= 1 ? sample(PRIMARY_SCHOOLS) : sample(SECONDARY_SCHOOLS),
      enrollmentDate: joinYearStart,
      fatherName: `${sample(ADULT_WESTERN_MALE)} ${sample(ADULT_KINYA_MALE)}`,
      motherName: `${sample(ADULT_WESTERN_FEMALE)} ${sample(ADULT_KINYA_FEMALE)}`,
    },
  };
}

// Real Rwandan mobile numbers: MTN (078, 079) and Airtel (072, 073), random
// subscriber digits, unique across the seed. Documented demo numbers are
// reserved so they never collide.
const usedPhones = new Set<string>([
  '+250788000001',
  '+250788000010',
  '+250788000011',
  '+250788000012',
  '+250788000013',
  '+250788000014',
  '+250788000020',
  '+250788100000',
]);
const PHONE_PREFIXES = ['78', '78', '78', '79', '79', '72', '72', '73'];
function realPhone(): string {
  for (;;) {
    let digits = '';
    for (let i = 0; i < 7; i++) digits += rand(10);
    const phone = `+250${sample(PHONE_PREFIXES)}${digits}`;
    if (!usedPhones.has(phone)) {
      usedPhones.add(phone);
      return phone;
    }
  }
}

const usedFullNames = new Set<string>();
const nameKey = (first: string, last: string) =>
  `${first} ${last}`.toLowerCase();

function claimFullName(first: string, last: string): boolean {
  const key = nameKey(first, last);
  if (usedFullNames.has(key)) return false;
  usedFullNames.add(key);
  return true;
}

const adultWestern = {
  [Gender.MALE]: dealer(ADULT_WESTERN_MALE),
  [Gender.FEMALE]: dealer(ADULT_WESTERN_FEMALE),
};
const adultKinya = {
  [Gender.MALE]: dealer(ADULT_KINYA_MALE),
  [Gender.FEMALE]: dealer(ADULT_KINYA_FEMALE),
};

/** An adult (teacher/parent) name: Western first + gendered Kinyarwanda name. */
function adultName(gender: Gender, opts?: { kinyaOverride?: string }) {
  for (let t = 0; t < 200; t++) {
    const first = adultWestern[gender]();
    const last = opts?.kinyaOverride ?? adultKinya[gender]();
    if (claimFullName(first, last)) return { first, last };
  }
  throw new Error('adult name space exhausted');
}

const studentWestern = {
  [Gender.MALE]: dealer(STUDENT_WESTERN_MALE),
  [Gender.FEMALE]: dealer(STUDENT_WESTERN_FEMALE),
};
const studentKinya = {
  [Gender.MALE]: dealer([...STUDENT_KINYA_MALE, ...STUDENT_KINYA_UNISEX]),
  [Gender.FEMALE]: dealer([...STUDENT_KINYA_FEMALE, ...STUDENT_KINYA_UNISEX]),
};

/**
 * A student name: 2 names for most, 3 for about a third, 4 for a few.
 * firstName holds the Western part (1-2 names), lastName the Kinyarwanda part
 * (1-2 names, or the inherited lineage name). Within one class, no single
 * name component appears more than twice.
 */
function studentName(
  gender: Gender,
  classCounts: Map<string, number>,
  inheritedLast?: string,
) {
  for (let t = 0; t < 300; t++) {
    const western1 = studentWestern[gender]();
    const western2 = chance(0.25) ? studentWestern[gender]() : null;
    const first =
      western2 && western2 !== western1 ? `${western1} ${western2}` : western1;

    let last: string;
    if (inheritedLast) {
      last = inheritedLast;
    } else {
      const kinya1 = studentKinya[gender]();
      const kinya2 = chance(0.2) ? studentKinya[gender]() : null;
      last = kinya2 && kinya2 !== kinya1 ? `${kinya1} ${kinya2}` : kinya1;
    }

    const components = [...first.split(' '), ...last.split(' ')];
    const overused = components.some((c) => (classCounts.get(c) ?? 0) >= 2);
    if (overused && t < 250) continue;
    if (!claimFullName(first, last)) continue;

    for (const c of components) {
      classCounts.set(c, (classCounts.get(c) ?? 0) + 1);
    }
    return { first, last };
  }
  throw new Error('student name space exhausted');
}

// ─── DATE HELPERS ────────────────────────────────────────────────────────────
// All demo dates are derived from "now" so the data always looks current - the
// active term contains today, attendance includes today, loans are mostly not
// yet due. Re-seeding any day produces fresh-looking data.

const MS_DAY = 24 * 60 * 60 * 1000;
// Use UTC midnight everywhere. Storing dates at local midnight in a UTC+ zone
// (e.g. Kigali/CAT) reads back as the previous calendar day, which would shift
// every seeded weekday by one. UTC midnight keeps `date::date` exact.
const startOfToday = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const addDays = (base: Date, days: number) => new Date(base.getTime() + days * MS_DAY);

/**
 * Wipe every table (except the migration ledger) so the seed is fully
 * re-runnable. TRUNCATE … CASCADE clears child rows and resets identities in
 * one statement, independent of FK ordering.
 */
async function clearDatabase() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

async function main() {
  console.log('🌱 Seeding database (Rwandan TSS structure, realistic names)…');

  // Make the seed idempotent - clear everything first so it can be re-run
  // any time to restore a clean, current-looking demo.
  await clearDatabase();
  console.log('  🧹 Existing data cleared');

  // Reserve the documented demo names and addresses before any generation.
  ['Wilson Nshizirungu', 'Josiane Mutoni'].forEach((n) => {
    const [f, l] = n.split(' ');
    claimFullName(f, l);
  });
  [
    'aline.uwase@markova.edu',
    'student1@markova.edu',
    'librarian@markova.edu',
    'patron@markova.edu',
    'matron@markova.edu',
    'nurse@markova.edu',
  ].forEach((e) => usedEmails.add(e));

  // ─── SCHOOL CONFIG ──────────────────────────────────────────────────────────

  /**
   * The three branding images the school ships with.
   *
   * Each is committed under `assets/` and copied into `uploads/`, which is
   * gitignored and therefore rebuilt on every fresh clone. The config value is
   * only set when the copy actually happened: a key pointing at a file that is
   * not on disk would render a blank crest or a missing stamp, whereas an
   * empty value is understood everywhere as "the school has not supplied one"
   * and draws the placeholder instead.
   */
  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  /*
    Installs a shipped image only where doing so cannot destroy one the school
    chose for itself. This used to be a bare copyFileSync on every run, which
    meant a school that had put its own stamp at uploads/stamp.png lost it the
    next time anyone reseeded - silently, with no copy kept. See
    src/common/branding-install.ts.
  */
  const kept: string[] = [];
  const installAsset = (assetName: string, uploadName: string): string => {
    const { outcome, url } = installBrandingAsset(
      join(process.cwd(), 'assets', assetName),
      join(uploadsDir, uploadName),
      `/uploads/${uploadName}`,
    );
    if (outcome === 'kept-existing') kept.push(uploadName);
    return url;
  };

  const configs = [
    { key: 'school_name', value: 'Markova Academy' },
    { key: 'school_motto', value: 'Excellence Through Knowledge' },
    // The mark-only logo: the UI prints the school name as text wherever it is
    // needed, so the logo itself stays clean.
    { key: 'logo_url', value: installAsset('logo-mark.png', 'logo.png') },
    // Printed on every official document - the stamp beside the head
    // teacher's signature, at the foot of the letter.
    { key: 'stamp_url', value: installAsset('stamp.png', 'stamp.png') },
    {
      key: 'signature_url',
      value: installAsset('signature.png', 'signature.png'),
    },
    { key: 'primary_color', value: '#1B4F72' },
    // Forty a term, a hundred and twenty a year - see
    // src/common/conduct.ts for why conduct is marked per term.
    { key: 'starting_discipline_points', value: '40' },
    { key: 'borrowing_limit', value: '3' },
    { key: 'borrowing_duration_days', value: '14' },
    { key: 'pass_threshold', value: '50' },
    { key: 'school_address', value: 'KG 7 Ave, Kacyiru, Kigali, Rwanda' },
    { key: 'school_phone', value: '+250788000000' },
    { key: 'school_email', value: 'info@markova.edu' },
    { key: 'school_website', value: 'https://markova.edu' },
    // Both are printed on every letter the school issues: the head teacher
    // signs it, and a receiving school checks the registration number.
    { key: 'head_teacher_name', value: 'Aline Uwase' },
    { key: 'registration_number', value: 'REB/2015/0142' },
    { key: 'email_provider', value: 'smtp' },
  ];
  for (const config of configs) {
    // Branding a school has already set is its own; reseeding rebuilds demo
    // records, it does not revert a school's identity to the demo's.
    const existing = await prisma.schoolConfig.findUnique({
      where: { key: config.key },
    });
    if (!shouldWriteConfig(config.key, existing?.value)) continue;

    await prisma.schoolConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }
  console.log('  ✅ SchoolConfig seeded');
  if (kept.length > 0) {
    console.log(
      `     ↳ kept the school's own ${kept.join(', ')} (not overwritten)`,
    );
  }

  // Hash once - bcrypt is the slowest single thing in this script.
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // ─── ADMIN USER ─────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: 'wilsonshizirungu@gmail.com',
      phone: '+250788000001',
      code: `ADM-${new Date().getFullYear()}-001`,
      gender: Gender.MALE,
      dateOfBirth: new Date('1988-03-12'),
      nationalId: makeNid(Gender.MALE, 1988),
      nationality: 'Rwandan',
      passwordHash,
      role: Role.ADMIN,
      firstName: 'Wilson',
      lastName: 'Nshizirungu',
      isActive: true,
      forcePasswordChange: false, // demo account - log straight into dashboard
    },
  });
  console.log('  ✅ Admin user seeded');

  // ─── LIBRARIAN ──────────────────────────────────────────────────────────────
  const librarianUser = await prisma.user.create({
    data: {
      email: 'librarian@markova.edu',
      phone: '+250788000020',
      code: `LIB-${new Date().getFullYear()}-001`,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1992-07-04'),
      nationalId: makeNid(Gender.FEMALE, 1992),
      nationality: 'Rwandan',
      passwordHash,
      role: Role.LIBRARIAN,
      firstName: 'Josiane',
      lastName: 'Mutoni',
      isActive: true,
      forcePasswordChange: false, // demo account
    },
  });
  console.log('  ✅ Librarian seeded');

  // ─── BOARDING STAFF AND THE NURSE ───────────────────────────────────────────
  //
  // A patron, a matron and a nurse, seeded like the librarian so every fresh
  // database has one of each. Their pages - pocket money, the sick bay, the
  // activity register - were built and then never seen, because there was no
  // account in any seed that could sign in and reach them.
  //
  // Three separate people rather than one account with three hats: a boys'
  // patron and a girls' matron are two different members of staff in a
  // Rwandan boarding school, and the nurse is a third.
  const boardingStaff: {
    email: string;
    phone: string;
    code: string;
    role: Role;
    gender: Gender;
    firstName: string;
    lastName: string;
    born: string;
  }[] = [
    {
      email: 'patron@markova.edu',
      phone: '+250788000021',
      code: `PAT-${new Date().getFullYear()}-001`,
      role: Role.PATRON,
      gender: Gender.MALE,
      firstName: 'Emmanuel',
      lastName: 'Habimana',
      born: '1985-03-12',
    },
    {
      email: 'matron@markova.edu',
      phone: '+250788000022',
      code: `MAT-${new Date().getFullYear()}-001`,
      role: Role.MATRON,
      gender: Gender.FEMALE,
      firstName: 'Beatrice',
      lastName: 'Mukamana',
      born: '1983-11-05',
    },
    {
      email: 'nurse@markova.edu',
      phone: '+250788000023',
      code: `NUR-${new Date().getFullYear()}-001`,
      role: Role.NURSE,
      gender: Gender.FEMALE,
      firstName: 'Claudine',
      lastName: 'Ingabire',
      born: '1990-06-18',
    },
    /*
      The bursar. Keeps the fee ledger, takes money at the counter and decides
      who is carried. Seeded here with the rest of the non-teaching staff for
      the same reason they were: the pages exist, and without an account that
      can sign in nobody ever sees them.
    */
    {
      email: 'bursar@markova.edu',
      phone: '+250788000024',
      code: `BUR-${new Date().getFullYear()}-001`,
      role: Role.BURSAR,
      gender: Gender.MALE,
      firstName: 'Straton',
      lastName: 'Nsengiyumva',
      born: '1979-09-24',
    },
  ];

  /** Kept so the fee ledger can record who took each payment. */
  let bursarUser: any = null;

  for (const person of boardingStaff) {
    const created = await prisma.user.create({
      data: {
        email: person.email,
        phone: person.phone,
        code: person.code,
        gender: person.gender,
        dateOfBirth: new Date(person.born),
        nationalId: makeNid(person.gender, Number(person.born.slice(0, 4))),
        nationality: 'Rwandan',
        passwordHash,
        role: person.role,
        firstName: person.firstName,
        lastName: person.lastName,
        isActive: true,
        forcePasswordChange: false, // demo account
      },
    });
    if (person.role === Role.BURSAR) bursarUser = created;
  }
  console.log('  ✅ Patron, matron, nurse and bursar seeded');

  // ─── ACADEMIC YEAR & TERMS (real MINEDUC calendars) ─────────────────────────
  // The official term windows as published by the Ministry of Education. The
  // seed carries the three most recent school years that have started as of
  // today. When today falls in a holiday gap (between terms, or after Term 3
  // like every July-August), the most recent term's end date is stretched to
  // today+3 so the demo always has a live current term - that stretch is the
  // only departure from the published dates.
  const today = startOfToday();
  const yr = today.getFullYear();

  type CalTerm = { start: Date; end: Date };
  const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const published: { name: string; terms: [string, string][] }[] = [
    {
      name: '2023-2024', // 37 weeks
      terms: [
        ['2023-09-25', '2023-12-22'],
        ['2024-01-08', '2024-03-29'],
        ['2024-04-15', '2024-07-05'],
      ],
    },
    {
      name: '2024-2025', // 38 weeks
      terms: [
        ['2024-09-09', '2024-12-20'],
        ['2025-01-06', '2025-04-04'],
        ['2025-04-21', '2025-06-27'],
      ],
    },
    {
      name: '2025-2026',
      terms: [
        ['2025-09-08', '2025-12-19'],
        ['2026-01-05', '2026-04-03'],
        ['2026-04-20', '2026-07-03'],
      ],
    },
  ];
  let calendars: { name: string; terms: CalTerm[] }[] = published.map((c) => ({
    name: c.name,
    terms: c.terms.map(([s, e]) => ({ start: utcDay(s), end: utcDay(e) })),
  }));
  // Beyond the published years, extrapolate in 364-day steps (52 weeks), which
  // keeps every term date on its official weekday.
  while (addDays(calendars[calendars.length - 1].terms[0].start, 364) <= today) {
    const prev = calendars[calendars.length - 1];
    const y = prev.terms[0].start.getUTCFullYear() + 1;
    calendars.push({
      name: `${y}-${y + 1}`,
      terms: prev.terms.map((t) => ({
        start: addDays(t.start, 364),
        end: addDays(t.end, 364),
      })),
    });
  }
  calendars = calendars.filter((c) => c.terms[0].start <= today).slice(-3);
  if (calendars.length !== 3) throw new Error('calendar selection expects 3 started years');

  // The current term: the latest one that has started. If today is past its
  // end we are in a school holiday - stretch it (see above).
  let curTi = 0;
  for (let i = 0; i < 3; i++) {
    if (calendars[2].terms[i].start <= today) curTi = i;
  }
  if (today > calendars[2].terms[curTi].end) {
    calendars[2].terms[curTi].end = addDays(today, 3);
  }

  type YearBundle = { year: any; terms: any[] };
  const allYears: YearBundle[] = [];
  for (let yearIdx = 0; yearIdx < 3; yearIdx++) {
    const cal = calendars[yearIdx];
    const year = await prisma.academicYear.create({
      data: {
        name: cal.name,
        startDate: cal.terms[0].start,
        endDate: cal.terms[2].end,
        isCurrent: yearIdx === 2,
      },
    });
    const yearTerms: any[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await prisma.term.create({
        data: {
          academicYearId: year.id,
          name: `Term ${i + 1}`,
          startDate: cal.terms[i].start,
          endDate: cal.terms[i].end,
          isCurrent: yearIdx === 2 && i === curTi,
          isClosed: yearIdx < 2 || i < curTi,
        },
      });
      yearTerms.push(t);
    }
    allYears.push({ year, terms: yearTerms });
  }
  const academicYear = allYears[2].year;
  const terms = allYears[2].terms;
  const currentTerm = terms[curTi];
  // Terms that exist on the calendar but have not started yet carry no data.
  const termBegun = (t: any) => t.startDate <= today;
  console.log(
    `  ✅ Academic years ${calendars.map((c) => c.name).join(', ')} seeded (current: ${currentTerm.name} of ${academicYear.name})`,
  );

  // ─── TRADES ─────────────────────────────────────────────────────────────────
  const trades: any[] = [];
  const tradeByCode = new Map<string, any>();
  for (const t of TRADES) {
    const trade = await prisma.trade.create({ data: t });
    trades.push(trade);
    tradeByCode.set(t.code, trade);
  }
  console.log(`  ✅ ${trades.length} trades seeded (${TRADES.map((t) => t.code).join(', ')})`);

  // ─── CLASS LEVELS & SECTIONS ────────────────────────────────────────────────
  // Sections carry the info needed downstream: their level, stage and trade.
  type SectionMeta = {
    section: any;
    level: any;
    trade: any | null;
    displayName: string;
  };

  const classLevels: any[] = [];
  const sectionMetas: SectionMeta[] = [];

  for (const lv of O_LEVELS) {
    const level = await prisma.classLevel.create({
      data: { name: lv.name, order: lv.order, stage: EducationStage.O_LEVEL },
    });
    classLevels.push(level);
    for (const streamName of ['A', 'B']) {
      const section = await prisma.classSection.create({
        data: { classLevelId: level.id, name: streamName },
      });
      sectionMetas.push({
        section,
        level,
        trade: null,
        displayName: `${level.name} ${streamName}`,
      });
    }
  }

  for (const lv of A_LEVELS) {
    const level = await prisma.classLevel.create({
      data: { name: lv.name, order: lv.order, stage: EducationStage.A_LEVEL },
    });
    classLevels.push(level);
    // Each level runs all 4 trades. 3 or 4 of them (random) get streams A+B,
    // the rest stream A only - so a level totals 7 or 8 classes.
    const doubledCount = 3 + rand(2);
    const doubled = new Set(
      shuffled(TRADES.map((t) => t.code)).slice(0, doubledCount),
    );
    for (const t of TRADES) {
      const trade = tradeByCode.get(t.code);
      const streams = doubled.has(t.code) ? ['A', 'B'] : ['A'];
      for (const streamName of streams) {
        const section = await prisma.classSection.create({
          data: {
            classLevelId: level.id,
            tradeId: trade.id,
            name: streamName,
          },
        });
        sectionMetas.push({
          section,
          level,
          trade,
          displayName: `${level.name} ${t.code} ${streamName}`,
        });
      }
    }
  }
  console.log(
    `  ✅ ${classLevels.length} class levels + ${sectionMetas.length} classes seeded`,
  );

  // ─── SUBJECTS ───────────────────────────────────────────────────────────────
  const oCoreSubjects: any[] = [];
  for (const s of O_CORE_SUBJECTS) {
    oCoreSubjects.push(
      await prisma.subject.create({
        data: { ...s, scope: SubjectScope.O_CORE, maxMarks: 100, isActive: true },
      }),
    );
  }
  const oElectiveSubjects: any[] = [];
  for (const s of O_ELECTIVE_SUBJECTS) {
    oElectiveSubjects.push(
      await prisma.subject.create({
        data: { ...s, scope: SubjectScope.O_ELECTIVE, maxMarks: 100, isActive: true },
      }),
    );
  }
  const aGeneralSubjects: any[] = [];
  for (const s of A_GENERAL_SUBJECTS) {
    aGeneralSubjects.push(
      await prisma.subject.create({
        data: { ...s, scope: SubjectScope.A_GENERAL, maxMarks: 100, isActive: true },
      }),
    );
  }
  // Kinyarwanda + Entrepreneurship are taught at both stages - reuse core rows.
  const sharedCore = oCoreSubjects.filter((s) =>
    A_SHARED_CORE_NAMES.includes(s.name),
  );
  const aLevelGeneralSet = [...aGeneralSubjects, ...sharedCore];

  // Trade-specific modules, pinned to their trade and year level.
  const levelByName = new Map(classLevels.map((l) => [l.name, l]));
  const specificByTradeLevel = new Map<string, any[]>();
  let specificCount = 0;
  for (const t of TRADES) {
    for (const levelName of Object.keys(TRADE_MODULES[t.code])) {
      const level = levelByName.get(levelName);
      const list: any[] = [];
      for (const moduleName of TRADE_MODULES[t.code][levelName]) {
        list.push(
          await prisma.subject.create({
            data: {
              name: moduleName,
              category: tradeByCode.get(t.code).sector,
              scope: SubjectScope.A_SPECIFIC,
              tradeId: tradeByCode.get(t.code).id,
              classLevelId: level.id,
              maxMarks: 100,
              isActive: true,
            },
          }),
        );
        specificCount++;
      }
      specificByTradeLevel.set(`${t.code}|${levelName}`, list);
    }
  }
  console.log(
    `  ✅ Subjects seeded: 9 core + 3 electives + ${aLevelGeneralSet.length} general + ${specificCount} trade modules`,
  );

  // The subject set a given class actually studies.
  function subjectsForSection(meta: SectionMeta): any[] {
    if (!meta.trade) return [...oCoreSubjects, ...oElectiveSubjects];
    return [
      ...aLevelGeneralSet,
      ...(specificByTradeLevel.get(`${meta.trade.code}|${meta.level.name}`) ??
        []),
    ];
  }

  // ─── WEEKLY PERIOD WEIGHTS ──────────────────────────────────────────────────
  // 8 periods a day, 40 a week. O-Level: the national allocation - core
  // papers heavy, electives light. A-Level: a 12-period general block and 28
  // periods shared across the trade's modules for the level.
  const O_WEEKLY: Record<string, number> = {
    Mathematics: 6,
    English: 5,
    Kinyarwanda: 4,
    Physics: 4,
    Chemistry: 4,
    'Biology and Health Sciences': 4,
    'Geography and Environment': 3,
    'History and Citizenship': 3,
    Entrepreneurship: 2,
    Kiswahili: 2,
    ICT: 2,
    French: 1,
  }; // 40
  const A_GENERAL_WEEKLY: Record<string, number> = {
    Kinyarwanda: 2,
    Entrepreneurship: 2,
    'English (Communication Skills)': 3,
    'Mathematics for Technology': 3,
    'Basic ICT': 2,
  }; // 12 - trade modules share the remaining 28

  const planBySection = new Map<string, Map<string, number>>();
  for (const meta of sectionMetas) {
    const plan = new Map<string, number>();
    const subjects = subjectsForSection(meta);
    if (!meta.trade) {
      for (const s of subjects) plan.set(s.id, O_WEEKLY[s.name]);
    } else {
      const modules = subjects.filter(
        (s) => s.scope === SubjectScope.A_SPECIFIC,
      );
      let share = 40;
      for (const s of subjects) {
        if (s.scope !== SubjectScope.A_SPECIFIC) {
          plan.set(s.id, A_GENERAL_WEEKLY[s.name]);
          share -= A_GENERAL_WEEKLY[s.name];
        }
      }
      const base = Math.floor(share / modules.length);
      let extra = share - base * modules.length;
      for (const s of modules) plan.set(s.id, base + (extra-- > 0 ? 1 : 0));
    }
    planBySection.set(meta.section.id, plan);
  }

  // Rooms: O-Level and general periods sit in the class's home room; trade
  // modules live in their lab or workshop.
  const TRADE_ROOMS: Record<string, string> = {
    SWD: 'ICT Lab 1',
    NIT: 'Networking Lab',
    TOR: 'Tourism Training Room',
    AUT: 'Auto Workshop',
  };
  const sectionRoom = (si: number) => `Room ${101 + si}`;

  const GENERAL_FAMILIES: { family: string; count: number; subjects: string[] }[] = [
    {
      family: 'Languages',
      count: 0,
      subjects: [
        'Kinyarwanda',
        'English',
        'Kiswahili',
        'French',
        'English (Communication Skills)',
      ],
    },
    {
      family: 'Mathematics & Sciences',
      count: 0,
      subjects: [
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biology and Health Sciences',
        'ICT',
        'Basic ICT',
        'Mathematics for Technology',
      ],
    },
    {
      family: 'Humanities',
      count: 0,
      subjects: ['Geography and Environment', 'History and Citizenship'],
    },
    { family: 'Business', count: 0, subjects: ['Entrepreneurship'] },
  ];
  const familyOfSubject = (subject: any): string => {
    if (subject.tradeId) {
      const t = TRADES.find(
        (x) => tradeByCode.get(x.code)!.id === subject.tradeId,
      )!;
      return `${t.name} (${t.code})`;
    }
    return GENERAL_FAMILIES.find((f) => f.subjects.includes(subject.name))!
      .family;
  };

  const yrNow = new Date().getFullYear();

  // ─── TEACHER SPECIALTIES ────────────────────────────────────────────────────
  // A real TSS staff room: general-subject departments plus a small team per
  // trade. Index-aligned with the teacher roster below, so teacher i owns
  // exactly one family and never teaches outside it.
  type Specialty = {
    family: string;
    subjectNames: Set<string> | null; // null = trade family (match by tradeId)
    tradeCode: string | null;
  };
  // Staff size follows the school's sections, as at a real TSS: enough
  // teachers in each family to cover its weekly periods at a ~24-period
  // teaching load (trade instructors run ~28, practical blocks included).
  const familyPeriods = new Map<string, number>();
  for (const meta of sectionMetas) {
    const plan = planBySection.get(meta.section.id)!;
    for (const subject of subjectsForSection(meta)) {
      const fam = familyOfSubject(subject);
      familyPeriods.set(
        fam,
        (familyPeriods.get(fam) ?? 0) + (plan.get(subject.id) ?? 0),
      );
    }
  }
  for (const fam of GENERAL_FAMILIES) {
    fam.count = Math.max(
      3,
      Math.round((familyPeriods.get(fam.family) ?? 0) / 24),
    );
  }
  const TRADE_TEACHER_COUNTS: Record<string, number> = {};
  for (const t of TRADES) {
    TRADE_TEACHER_COUNTS[t.code] = Math.max(
      2,
      Math.ceil((familyPeriods.get(`${t.name} (${t.code})`) ?? 0) / 28),
    );
  }
  const specialtyByTeacher: Specialty[] = [];
  for (const fam of GENERAL_FAMILIES) {
    for (let k = 0; k < fam.count; k++) {
      specialtyByTeacher.push({
        family: fam.family,
        subjectNames: new Set(fam.subjects),
        tradeCode: null,
      });
    }
  }
  for (const t of TRADES) {
    for (let k = 0; k < TRADE_TEACHER_COUNTS[t.code]; k++) {
      specialtyByTeacher.push({
        family: `${t.name} (${t.code})`,
        subjectNames: null,
        tradeCode: t.code,
      });
    }
  }

  // ─── TEACHERS (40) ──────────────────────────────────────────────────────────
  // No two teachers share any name component - 40 staff with a repeated name
  // would read as fake immediately.
  const TEACHER_COUNT = specialtyByTeacher.length; // 40, from the specialty layout
  // The demo teacher keeps the address documented in CLAUDE.md; the other
  // fixed staff follow the i.name scheme like everyone else.
  const fixedTeachers = [
    { firstName: 'Aline', lastName: 'Uwase', email: 'aline.uwase@markova.edu', phone: '+250788000010', gender: Gender.FEMALE },
    { firstName: 'Eric', lastName: 'Niyonkuru', email: emailFor('Eric', 'Niyonkuru'), phone: '+250788000011', gender: Gender.MALE },
    { firstName: 'Diane', lastName: 'Mukamana', email: emailFor('Diane', 'Mukamana'), phone: '+250788000012', gender: Gender.FEMALE },
    { firstName: 'Patrick', lastName: 'Habimana', email: emailFor('Patrick', 'Habimana'), phone: '+250788000013', gender: Gender.MALE },
    { firstName: 'Solange', lastName: 'Ingabire', email: emailFor('Solange', 'Ingabire'), phone: '+250788000014', gender: Gender.FEMALE },
  ];
  const teacherComponents = new Set<string>(
    fixedTeachers.flatMap((t) => [t.firstName, t.lastName]),
  );
  fixedTeachers.forEach((t) => claimFullName(t.firstName, t.lastName));

  const generatedTeachers: typeof fixedTeachers = [];
  for (let i = 0; generatedTeachers.length < TEACHER_COUNT - fixedTeachers.length; i++) {
    if (i > 2000) throw new Error('teacher name space exhausted');
    const gender = generatedTeachers.length % 2 === 0 ? Gender.MALE : Gender.FEMALE;
    const first = adultWestern[gender]();
    const last = adultKinya[gender]();
    if (teacherComponents.has(first) || teacherComponents.has(last)) continue;
    if (!claimFullName(first, last)) continue;
    teacherComponents.add(first);
    teacherComponents.add(last);
    generatedTeachers.push({
      firstName: first,
      lastName: last,
      email: emailFor(first, last),
      phone: realPhone(),
      gender,
    });
  }
  const teacherData = [...fixedTeachers, ...generatedTeachers];

  const teacherUsers: any[] = [];
  const teachers: any[] = [];
  for (let ti = 0; ti < teacherData.length; ti++) {
    const td = teacherData[ti];
    const tBirthYear = yrNow - (26 + rand(30));
    const user = await prisma.user.create({
      data: {
        email: td.email,
        phone: td.phone,
        code: `TCH-${new Date().getFullYear()}-${String(ti + 1).padStart(3, '0')}`,
        gender: td.gender,
        dateOfBirth: new Date(
          Date.UTC(tBirthYear, rand(12), 1 + rand(27)),
        ),
        nationalId: makeNid(td.gender, tBirthYear),
        nationality: 'Rwandan',
        passwordHash,
        role: Role.TEACHER,
        firstName: td.firstName,
        lastName: td.lastName,
        isActive: true,
        forcePasswordChange: ti !== 0, // teacher[0] is the demo account
      },
    });
    const teacher = await prisma.teacher.create({
      data: {
        userId: user.id,
        employmentStatus: EmploymentStatus.FULL_TIME,
        // General-subject staff are mostly degree holders (A0); trade
        // instructors are mostly technician diplomas (A1/A2), as in real TSSs.
        qualification: specialtyByTeacher[ti].tradeCode
          ? sample([
              TeacherQualification.A1,
              TeacherQualification.A1,
              TeacherQualification.A2,
              TeacherQualification.A2,
              TeacherQualification.A0,
            ])
          : sample([
              TeacherQualification.A0,
              TeacherQualification.A0,
              TeacherQualification.A0,
              TeacherQualification.A1,
              TeacherQualification.A1,
            ]),
        rssbNumber: String(10000000 + rand(89999999)),
        hireDate: new Date(Date.UTC(yrNow - 1 - rand(11), 8, 1)),
        isActive: true,
      },
    });
    teacherUsers.push(user);
    teachers.push(teacher);
  }
  console.log(`  ✅ ${teachers.length} teachers seeded (no shared name components)`);


  // ─── SUBJECT ASSIGNMENT MAP (who teaches what, everywhere) ──────────────────
  // For every (class, subject) pick the least-loaded teacher qualified for
  // that subject. Deterministic, so marks, timetables and homework all agree
  // with the assignment table, and balanced, so every teacher carries a
  // believable load inside their own family.
  const qualifiedFor = (subject: any): number[] => {
    const out: number[] = [];
    for (let i = 0; i < specialtyByTeacher.length; i++) {
      const sp = specialtyByTeacher[i];
      if (sp.tradeCode) {
        if (
          subject.tradeId &&
          subject.tradeId === tradeByCode.get(sp.tradeCode)!.id
        ) {
          out.push(i);
        }
      } else if (sp.subjectNames!.has(subject.name)) {
        out.push(i);
      }
    }
    return out;
  };

  const teacherLoad = new Array(teachers.length).fill(0);
  const assignedTeacherIdx = new Map<string, number>();
  for (const meta of sectionMetas) {
    for (const subject of subjectsForSection(meta)) {
      const cands = qualifiedFor(subject);
      if (cands.length === 0) {
        throw new Error(`no specialty covers subject "${subject.name}"`);
      }
      let best = cands[0];
      for (const c of cands) if (teacherLoad[c] < teacherLoad[best]) best = c;
      // Balance real teaching hours: 6 periods of Mathematics weigh six
      // times one period of French.
      teacherLoad[best] += planBySection.get(meta.section.id)!.get(subject.id)!;
      assignedTeacherIdx.set(`${meta.section.id}|${subject.id}`, best);
    }
  }
  if (teacherLoad.some((l) => l === 0)) {
    throw new Error('specialization left a teacher with zero classes');
  }
  const teacherOf = (sectionId: string, subjectId: string) =>
    teachers[assignedTeacherIdx.get(`${sectionId}|${subjectId}`)!];
  const teacherUserOf = (sectionId: string, subjectId: string) =>
    teacherUsers[assignedTeacherIdx.get(`${sectionId}|${subjectId}`)!];

  // ─── ASSESSMENT TYPES ───────────────────────────────────────────────────────
  const assessmentTypes: any[] = [];
  const assessmentByName = new Map<string, any>();
  for (const name of ASSESSMENT_NAMES) {
    const at = await prisma.assessmentType.create({ data: { name } });
    assessmentTypes.push(at);
    assessmentByName.set(name, at);
  }
  console.log(`  ✅ ${assessmentTypes.length} assessment types seeded`);

  // ─── TEACHER SPECIAL ROLES ──────────────────────────────────────────────────
  // DOS, one HoD per department (drawn from that department), and a class
  // teacher per class who really teaches in it.
  await prisma.teacherRole.create({
    data: { teacherId: teachers[0].id, role: SpecialRole.DOS },
  });
  const firstOfFamily = (family: string) =>
    specialtyByTeacher.findIndex((s) => s.family === family);
  await prisma.teacherRole.create({
    data: {
      teacherId: teachers[firstOfFamily('Mathematics & Sciences')].id,
      role: SpecialRole.HOD,
      department: 'Sciences',
    },
  });
  await prisma.teacherRole.create({
    data: {
      teacherId: teachers[firstOfFamily('Humanities')].id,
      role: SpecialRole.HOD,
      department: 'Humanities',
    },
  });
  const classTeacherIdxOf = new Map<string, number>();
  {
    // Spread the role: nobody is class teacher twice until everyone teaching
    // has been considered once.
    const roleCount = new Array(teachers.length).fill(0);
    for (const meta of sectionMetas) {
      const own = [
        ...new Set(
          subjectsForSection(meta).map(
            (s) => assignedTeacherIdx.get(`${meta.section.id}|${s.id}`)!,
          ),
        ),
      ];
      let pick = own[0];
      for (const c of own) if (roleCount[c] < roleCount[pick]) pick = c;
      roleCount[pick]++;
      classTeacherIdxOf.set(meta.section.id, pick);
      await prisma.teacherRole.create({
        data: {
          teacherId: teachers[pick].id,
          role: SpecialRole.CLASS_TEACHER,
          classSectionId: meta.section.id,
        },
      });
    }
  }
  console.log('  ✅ Teacher special roles seeded');

  // ─── TEACHER-SUBJECT-CLASS ASSIGNMENTS ──────────────────────────────────────
  const assignmentRows: any[] = [];
  for (const meta of sectionMetas) {
    for (const subject of subjectsForSection(meta)) {
      assignmentRows.push({
        teacherId: teacherOf(meta.section.id, subject.id).id,
        subjectId: subject.id,
        classSectionId: meta.section.id,
        academicYearId: academicYear.id,
      });
    }
  }
  await prisma.teacherSubjectClass.createMany({ data: assignmentRows });
  console.log(
    `  ✅ ${assignmentRows.length} assignments seeded (specialized: ` +
      `${GENERAL_FAMILIES.map((f) => `${f.family} ${f.count}`).join(', ')}, ` +
      `${TRADES.map((t) => `${t.code} ${TRADE_TEACHER_COUNTS[t.code]}`).join(', ')})`,
  );

  // ─── ENROLLMENT JOURNEYS (across the 3 seeded years) ────────────────────────
  // Where was each person in the two previous years? Walked backwards with
  // realistic rates: ~85% promoted, ~8% repeated the year, ~7% joined the
  // school mid-path. Crossing back from Level 3 to Senior 3, only half did
  // O-Level here, and every past class is capped at 30 so history never
  // overfills a room (which also keeps the O→A intake imbalance honest).
  type Placement = { yearIdx: number; meta: SectionMeta; failed: boolean };

  const sectionsByLevel = new Map<string, SectionMeta[]>();
  for (const m of sectionMetas) {
    const key = `${m.level.order}|${m.trade?.code ?? '-'}`;
    const list = sectionsByLevel.get(key) ?? [];
    list.push(m);
    sectionsByLevel.set(key, list);
  }

  const pastOcc = new Map<string, number>();
  const occKey = (yearIdx: number, sectionId: string) => `${yearIdx}|${sectionId}`;
  const getOcc = (yearIdx: number, sectionId: string) =>
    pastOcc.get(occKey(yearIdx, sectionId)) ?? 0;
  const addOcc = (yearIdx: number, sectionId: string) =>
    pastOcc.set(occKey(yearIdx, sectionId), getOcc(yearIdx, sectionId) + 1);

  // One backward year-step: where was this person the year before, or null if
  // they were not at this school yet.
  const stepBack = (
    o: number,
    trade: any,
    yearIdx: number,
  ): { meta: SectionMeta; repeat: boolean } | null => {
    if (chance(0.07)) return null; // joined the school after this point
    const repeat = chance(0.08);
    const prevO = repeat ? o : o - 1;
    if (prevO === 0) return null; // came straight from primary school
    if (prevO === 3 && o === 4 && !repeat && chance(0.5)) return null; // did O-Level elsewhere
    const prevTrade = prevO >= 4 ? trade : null;
    const cands = (
      sectionsByLevel.get(`${prevO}|${prevTrade?.code ?? '-'}`) ?? []
    ).filter((m) => getOcc(yearIdx, m.section.id) < 30);
    if (cands.length === 0) return null; // past classes full - came from elsewhere
    const meta = sample(cands);
    addOcc(yearIdx, meta.section.id);
    return { meta, repeat };
  };

  const planJourney = (currentMeta: SectionMeta) => {
    const placements: Placement[] = [
      { yearIdx: 2, meta: currentMeta, failed: false },
    ];
    let repeats = 0;
    let o = currentMeta.level.order;
    let tr = currentMeta.trade;
    for (const yearIdx of [1, 0]) {
      const s = stepBack(o, tr, yearIdx);
      if (!s) break;
      // On a repeat, the earlier year is the failed attempt.
      placements.push({ yearIdx, meta: s.meta, failed: s.repeat });
      if (s.repeat) repeats++;
      o = s.meta.level.order;
      tr = s.meta.trade;
    }
    return { placements, repeats };
  };

  // ─── STUDENTS (25-30 per class) ─────────────────────────────────────────────
  type Enrolled = {
    student: any;
    user: any;
    meta: SectionMeta;
    placements: Placement[];
  };
  const enrolled: Enrolled[] = [];

  const classSizes = sectionMetas.map(() => 25 + rand(6)); // 25-30 each
  const STUDENT_COUNT = classSizes.reduce((a, b) => a + b, 0);

  // Lineage plan: every inherited name belongs to one family; ~30% of the
  // families have two children in the school (true siblings, same parents).
  type Family = {
    id: number;
    line: 'father' | 'mother';
    name: string;
    kidSlots: number[];
    kidGenders: Gender[];
    studentIds: string[];
  };
  const families: Family[] = [];
  const inheritedBySlot = new Map<number, Family>();
  {
    const slotDeck = shuffled(Array.from({ length: STUDENT_COUNT }, (_, i) => i));
    let familyId = 0;
    const lines: { line: 'father' | 'mother'; name: string }[] = [
      ...INHERITED_FATHER_LINE.map((name) => ({ line: 'father' as const, name })),
      ...INHERITED_MOTHER_LINE.map((name) => ({ line: 'mother' as const, name })),
    ];
    for (const { line, name } of lines) {
      const kids = chance(0.3) ? 2 : 1;
      const fam: Family = {
        id: familyId++,
        line,
        name,
        kidSlots: [],
        kidGenders: [],
        studentIds: [],
      };
      for (let k = 0; k < kids && slotDeck.length > 0; k++) {
        const slot = slotDeck.pop()!;
        // Father-line names go mostly to boys, sometimes to a daughter.
        // Mother-line names go to daughters.
        const gender =
          line === 'father'
            ? chance(0.7)
              ? Gender.MALE
              : Gender.FEMALE
            : Gender.FEMALE;
        fam.kidSlots.push(slot);
        fam.kidGenders.push(gender);
        inheritedBySlot.set(slot, fam);
      }
      families.push(fam);
    }
  }

  let studentIdx = 0;
  for (let si = 0; si < sectionMetas.length; si++) {
    const meta = sectionMetas[si];
    const classCounts = new Map<string, number>();
    for (let k = 0; k < classSizes[si]; k++) {
      const i = studentIdx++;
      const fam = inheritedBySlot.get(i);
      const gender = fam
        ? fam.kidGenders[fam.kidSlots.indexOf(i)]
        : chance(0.5)
          ? Gender.MALE
          : Gender.FEMALE;
      const { first, last } = studentName(gender, classCounts, fam?.name);
      const journey = planJourney(meta);
      const joinIdx = Math.min(...journey.placements.map((p) => p.yearIdx));
      const joinYear = allYears[joinIdx].year.startDate.getUTCFullYear();
      const earliest = journey.placements[journey.placements.length - 1];

      // S1 → ~13 yrs … L5 → ~19 yrs; repeaters are a year older per repeat.
      const ageBase = 11 + meta.level.order + rand(2) + journey.repeats;
      const dob = new Date(
        `${yr - ageBase}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
      );
      // NIDA issues IDs from the 16th birthday - gate on the real age, not
      // the birth-year difference.
      const actualAge = Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000),
      );
      const extras = studentExtras(
        gender,
        yr - ageBase,
        actualAge,
        earliest.meta.level.order,
        allYears[joinIdx].year.startDate,
      );

      const user = await prisma.user.create({
        data: {
          email:
            i < 30 ? `student${i + 1}@markova.edu` : emailFor(first, last),
          ...extras.user,
          passwordHash,
          role: Role.STUDENT,
          firstName: first,
          lastName: last,
          isActive: true,
          forcePasswordChange: i !== 0, // student1 is the demo account
        },
      });
      const student = await prisma.student.create({
        data: {
          userId: user.id,
          studentIdNumber: studentNumber(first, last, joinYear, user.id),
          classSectionId: meta.section.id,
          dateOfBirth: dob,
          gender,
          status: StudentStatus.ACTIVE,
          disciplinePoints: TERM_CONDUCT_MARK,
          ...extras.student,
        },
      });
      if (fam) fam.studentIds.push(student.id);
      enrolled.push({ student, user, meta, placements: journey.placements });
    }
  }
  const students = enrolled.map((e) => e.student);
  const studentUsers = enrolled.map((e) => e.user);
  const inheritedKids = families.reduce((s, f) => s + f.studentIds.length, 0);
  console.log(
    `  ✅ ${students.length} students seeded across ${sectionMetas.length} classes (${inheritedKids} carry a family lineage name)`,
  );

  // ─── PARENTS (family units) ─────────────────────────────────────────────────
  // Lineage families get a real father+mother pair (the line parent carries
  // the family name). Everyone else is grouped into family units so siblings
  // share parents; shapes vary between two-parent, single-parent and
  // guardian homes.
  const parentUsers: any[] = [];
  let parentPhoneIdx = 0;

  const createParent = async (
    gender: Gender,
    opts?: { kinyaOverride?: string; demo?: boolean },
  ) => {
    const i = parentPhoneIdx++;
    const { first, last } = adultName(gender, {
      kinyaOverride: opts?.kinyaOverride,
    });
    const pBirthYear = yr - (32 + rand(24));
    const user = await prisma.user.create({
      data: {
        phone: i === 0 ? '+250788100000' : realPhone(),
        code: `PAR-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
        gender,
        dateOfBirth: new Date(Date.UTC(pBirthYear, rand(12), 1 + rand(27))),
        nationalId: makeNid(gender, pBirthYear),
        nationality: 'Rwandan',
        // First 15 parents keep their phone-only login profile to match docs.
        email: i >= 15 ? emailFor(first, last) : null,
        passwordHash,
        role: Role.PARENT,
        firstName: first,
        lastName: last,
        isActive: true,
        forcePasswordChange: !opts?.demo,
      },
    });
    parentUsers.push(user);
    return user;
  };

  // The documented demo parent first: +250788100000.
  const demoParent = await createParent(Gender.MALE, { demo: true });

  // Family pairs for the lineage names.
  const familyParents = new Map<number, { father: any; mother: any }>();
  for (const fam of families) {
    if (fam.studentIds.length === 0) continue;
    const father = await createParent(Gender.MALE, {
      kinyaOverride: fam.line === 'father' ? fam.name : undefined,
    });
    const mother = await createParent(Gender.FEMALE, {
      kinyaOverride: fam.line === 'mother' ? fam.name : undefined,
    });
    familyParents.set(fam.id, { father, mother });
  }

  // Link lineage kids to their real parents.
  const parentLinkRows: any[] = [];
  const linkedStudentIds = new Set<string>();
  const guardianByStudent = new Map<string, { father?: any; mother?: any }>();
  for (const fam of families) {
    const pair = familyParents.get(fam.id);
    if (!pair) continue;
    for (const studentId of fam.studentIds) {
      parentLinkRows.push(
        { parentUserId: pair.father.id, studentId, relationship: 'Father' },
        { parentUserId: pair.mother.id, studentId, relationship: 'Mother' },
      );
      linkedStudentIds.add(studentId);
      guardianByStudent.set(studentId, {
        father: pair.father,
        mother: pair.mother,
      });
    }
  }

  // Everyone else lives in a family unit: siblings share the same two
  // parents; some homes are single-mother or single-father; a few children
  // live with a guardian (an aunt, uncle or grandparent), whose link says
  // so. Every guardian gets an account - whether they ever log in is a
  // different question the activity layer answers.
  const unlinked = students.filter((s) => !linkedStudentIds.has(s.id));
  const kidsQueue = shuffled(unlinked);
  // The demo parent's family first: student1 plus a sibling if available.
  const demoKids = [
    kidsQueue.find((s) => s.id === students[0].id) ?? kidsQueue[0],
  ];
  kidsQueue.splice(kidsQueue.indexOf(demoKids[0]), 1);
  if (kidsQueue.length > 0 && chance(0.5)) demoKids.push(kidsQueue.pop()!);
  const units: any[][] = [[...demoKids]];
  while (kidsQueue.length > 0) {
    const r = Math.random();
    const size = r < 0.02 ? 3 : r < 0.16 ? 2 : 1;
    units.push(kidsQueue.splice(0, Math.min(size, kidsQueue.length)));
  }
  let twoParent = 0;
  let singleParent = 0;
  let guardianHomes = 0;
  for (let u = 0; u < units.length; u++) {
    const kids = units[u];
    const shape = u === 0 ? 0 : Math.random(); // the demo family has both parents
    let father: any = null;
    let mother: any = null;
    if (shape < 0.78) {
      father = u === 0 ? demoParent : await createParent(Gender.MALE);
      mother = await createParent(Gender.FEMALE);
      twoParent++;
    } else if (shape < 0.93) {
      mother = await createParent(Gender.FEMALE);
      singleParent++;
    } else if (shape < 0.97) {
      father = await createParent(Gender.MALE);
      singleParent++;
    } else {
      const guardian = await createParent(
        chance(0.5) ? Gender.MALE : Gender.FEMALE,
      );
      guardianHomes++;
      for (const kid of kids) {
        parentLinkRows.push({
          parentUserId: guardian.id,
          studentId: kid.id,
          relationship: 'Guardian',
        });
        guardianByStudent.set(kid.id, {});
      }
      continue;
    }
    for (const kid of kids) {
      if (father) {
        parentLinkRows.push({
          parentUserId: father.id,
          studentId: kid.id,
          relationship: 'Father',
        });
      }
      if (mother) {
        parentLinkRows.push({
          parentUserId: mother.id,
          studentId: kid.id,
          relationship: 'Mother',
        });
      }
      guardianByStudent.set(kid.id, {
        ...(father && { father }),
        ...(mother && { mother }),
      });
    }
  }
  await prisma.parentStudent.createMany({ data: parentLinkRows });

  // The guardian names printed on a student's record must match the linked
  // parent accounts wherever those exist; a single-parent record carries
  // only that parent's name.
  for (const [studentId, g] of guardianByStudent) {
    if (!g.father && !g.mother) continue;
    await prisma.student.update({
      where: { id: studentId },
      data: {
        ...(g.father && {
          fatherName: `${g.father.firstName} ${g.father.lastName}`,
        }),
        ...(g.mother && {
          motherName: `${g.mother.firstName} ${g.mother.lastName}`,
        }),
      },
    });
  }
  const siblingKids = units
    .filter((k) => k.length > 1)
    .reduce((s, k) => s + k.length, 0);
  console.log(
    `  ✅ ${parentUsers.length} parents in ${units.length + familyParents.size} families ` +
      `(${twoParent} two-parent, ${singleParent} single-parent, ${guardianHomes} guardian homes, ` +
      `${siblingKids} kids with an enrolled sibling)`,
  );

  // ─── FORMER STUDENTS (fill the two past years to real class sizes) ──────────
  // Everyone who shared those classrooms but is gone today: Level 5 finishers
  // are GRADUATED, everyone else who left is TRANSFERRED. They exist so every
  // past rank and class average is computed against a full class. Their user
  // accounts are inactive, so they cannot log in.
  type Alumni = { student: any; user: any; placements: Placement[] };
  const alumni: Alumni[] = [];
  const alumniCounts = new Map<string, Map<string, number>>();
  const countsFor = (yearIdx: number, sectionId: string) => {
    const key = occKey(yearIdx, sectionId);
    if (!alumniCounts.has(key)) alumniCounts.set(key, new Map());
    return alumniCounts.get(key)!;
  };

  const createFormer = async (placements: Placement[], lastYearIdx: number) => {
    const last = placements[0].meta; // placements[0] is their latest year here
    const gender = chance(0.5) ? Gender.MALE : Gender.FEMALE;
    const name = studentName(gender, countsFor(lastYearIdx, last.section.id));
    const i = studentIdx++;
    const repeats = placements.filter((p) => p.failed).length;
    const yearsGone = 2 - lastYearIdx;
    const joinYear =
      allYears[
        Math.min(...placements.map((p) => p.yearIdx))
      ].year.startDate.getUTCFullYear();
    const age = 11 + last.level.order + rand(2) + repeats + yearsGone;
    const earliestPl = placements[placements.length - 1];
    const dob = new Date(
      `${yr - age}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
    );
    const actualAge = Math.floor(
      (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000),
    );
    const extras = studentExtras(
      gender,
      yr - age,
      actualAge,
      earliestPl.meta.level.order,
      allYears[earliestPl.yearIdx].year.startDate,
    );
    const user = await prisma.user.create({
      data: {
        email: emailFor(name.first, name.last),
        ...extras.user,
        passwordHash,
        role: Role.STUDENT,
        firstName: name.first,
        lastName: name.last,
        isActive: false,
        forcePasswordChange: true,
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        studentIdNumber: studentNumber(name.first, name.last, joinYear, user.id),
        classSectionId: last.section.id,
        dateOfBirth: dob,
        gender,
        status:
          last.level.order === 6
            ? StudentStatus.GRADUATED
            : StudentStatus.TRANSFERRED,
        disciplinePoints: TERM_CONDUCT_MARK,
        ...extras.student,
      },
    });
    alumni.push({ student, user, placements });
  };

  // Pass 1: top last year's classes up to 25-30, extending each former
  // student one more year back when the dice allow (which also fills year 0).
  for (const meta of sectionMetas) {
    const target = 25 + rand(6);
    while (getOcc(1, meta.section.id) < target) {
      addOcc(1, meta.section.id);
      const placements: Placement[] = [{ yearIdx: 1, meta, failed: false }];
      const s0 = stepBack(meta.level.order, meta.trade, 0);
      if (s0) placements.push({ yearIdx: 0, meta: s0.meta, failed: s0.repeat });
      await createFormer(placements, 1);
    }
  }
  // Pass 2: whatever two-years-ago classes still miss.
  for (const meta of sectionMetas) {
    const target = 25 + rand(6);
    while (getOcc(0, meta.section.id) < target) {
      addOcc(0, meta.section.id);
      await createFormer([{ yearIdx: 0, meta, failed: false }], 0);
    }
  }
  const graduatedCount = alumni.filter(
    (a) => a.student.status === StudentStatus.GRADUATED,
  ).length;
  console.log(
    `  ✅ ${alumni.length} former students seeded (${graduatedCount} graduated, ${alumni.length - graduatedCount} transferred)`,
  );

  // ─── SUBJECT DIFFICULTY PROFILES ────────────────────────────────────────────
  // Every subject examines with its own personality: a shift in percentage
  // points against a student's personal ability, and a spread multiplier for
  // how widely a class scatters on it. Mathematics and Physics genuinely
  // examine hard; Kinyarwanda and Entrepreneurship score generously and
  // tightly; hands-on trade modules cluster toward competence while a few
  // named theory-heavy modules bite.
  const SUBJECT_PROFILES: Record<string, { shift: number; spread?: number }> = {
    Mathematics: { shift: -9, spread: 1.3 },
    Physics: { shift: -7, spread: 1.25 },
    Chemistry: { shift: -5, spread: 1.15 },
    'Biology and Health Sciences': { shift: -3 },
    'Geography and Environment': { shift: -1 },
    'History and Citizenship': { shift: 1 },
    English: { shift: -2 },
    Kinyarwanda: { shift: 8, spread: 0.8 },
    Kiswahili: { shift: 3 },
    French: { shift: -4, spread: 1.2 },
    ICT: { shift: 2 },
    Entrepreneurship: { shift: 5, spread: 0.85 },
    'English (Communication Skills)': { shift: -1 },
    'Mathematics for Technology': { shift: -8, spread: 1.3 },
    'Basic ICT': { shift: 3 },
  };
  const HARD_MODULES = new Set([
    'Data Structure and Algorithm Fundamentals',
    'Machine Learning Application',
    'Machine Learning Fundamentals',
    'Blockchain Fundamentals',
    'Cyber Security',
    'C Programming Fundamentals',
    'Fiber Optics Network Deployment',
    'Engine Diagnosis',
    'Vehicle Electronics',
  ]);
  const profileFor = (subject: any): { shift: number; spread: number } => {
    const q = SUBJECT_PROFILES[subject.name];
    if (q) return { shift: q.shift, spread: q.spread ?? 1 };
    if (subject.scope === SubjectScope.A_SPECIFIC) {
      return HARD_MODULES.has(subject.name)
        ? { shift: -6, spread: 1.2 }
        : { shift: 4, spread: 0.85 };
    }
    return { shift: 0, spread: 1 };
  };

  // ─── MARKS (full assessment structure, per-subject personalities) ───────────
  // Every student is graded in every subject of their class: CAT 1, CAT 2 and
  // End of Term Exam everywhere, plus Practical on trade-specific modules.
  const markRows: any[] = [];
  // Every person (current and former) keeps one baseline ability and one
  // long-term drift anchored at the current year, so a child's line over up
  // to 9 terms tells a single story: improving, steady or slipping. A failed
  // (repeated) year dips ~8 points below their curve; per-subject strengths
  // persist across the years.
  // When was each component sat? CAT 1 lands about a third into the term,
  // CAT 2 near two thirds, practicals after them, the exam in the closing
  // week. Marks are typed in within days of the paper (sometimes late), and
  // a few current-term class components are still in the marking pile.
  const componentFrac: Record<string, number> = {
    'CAT 1': 0.32,
    'CAT 2': 0.62,
    Practical: 0.74,
    'End of Term Exam': 0.94,
  };
  const weekdayOnOrAfter = (d: Date) => {
    const out = new Date(d);
    while (out.getUTCDay() === 0 || out.getUTCDay() === 6)
      out.setTime(out.getTime() + MS_DAY);
    return out;
  };
  const componentDate = (term: any, name: string) =>
    weekdayOnOrAfter(
      addDays(
        term.startDate,
        Math.round(
          ((term.endDate.getTime() - term.startDate.getTime()) / MS_DAY) *
            componentFrac[name],
        ),
      ),
    );
  const minDate = (a: Date, b: Date) => (a < b ? a : b);
  const unreturned = new Set<string>();
  for (const meta of sectionMetas) {
    for (const subject of subjectsForSection(meta)) {
      if (!chance(0.03)) continue;
      const pick =
        subject.scope === SubjectScope.A_SPECIFIC && chance(0.5)
          ? 'Practical'
          : 'CAT 2';
      unreturned.add(`${meta.section.id}|${subject.id}|${pick}`);
    }
  }

  const strength = new Map<string, number>(); // per student|subject
  const allPeople = [
    ...enrolled.map((e) => ({ student: e.student, placements: e.placements })),
    ...alumni,
  ];

  for (const { student, placements } of allPeople) {
    const baseline = 45 + rand(41);
    const drift = rand(6) - 2; // -2 .. +3 per term
    for (const pl of placements) {
      const yearTerms = allYears[pl.yearIdx].terms;
      const subjectSet = subjectsForSection(pl.meta);
      for (let ti = 0; ti < yearTerms.length; ti++) {
        if (!termBegun(yearTerms[ti])) continue; // future term: no marks yet
        const g = pl.yearIdx * 3 + ti; // global term index, current year = 6..8
        const ability = clamp(
          baseline + drift * (g - 6) - (pl.failed ? 8 : 0),
          25,
          92,
        );

        for (let subj = 0; subj < subjectSet.length; subj++) {
          const subject = subjectSet[subj];
          const teacher = teacherOf(pl.meta.section.id, subject.id);
          const sKey = `${student.id}|${subject.id}`;
          if (!strength.has(sKey)) strength.set(sKey, rand(21) - 10);
          const prof = profileFor(subject);
          const perSubject = clamp(
            ability + strength.get(sKey)! + prof.shift,
            18,
            96,
          );
          const components =
            subject.scope === SubjectScope.A_SPECIFIC
              ? ['CAT 1', 'CAT 2', 'Practical', 'End of Term Exam']
              : ['CAT 1', 'CAT 2', 'End of Term Exam'];

          for (const assessmentName of components) {
            const term = yearTerms[ti];
            const isCurrentTerm = term.id === currentTerm.id;
            const sat = componentDate(term, assessmentName);
            if (sat > today) continue; // this component has not been sat yet
            if (
              isCurrentTerm &&
              unreturned.has(
                `${pl.meta.section.id}|${subject.id}|${assessmentName}`,
              )
            ) {
              continue; // whole class still in the teacher's marking pile
            }
            // Individual gaps: a few current-term absences (more likely for
            // struggling students), and rare permanent holes in closed
            // registers. Totals renormalize exactly like the live API does.
            const missP = isCurrentTerm
              ? assessmentName === 'End of Term Exam'
                ? 0.008
                : 0.02 + (ability < 40 ? 0.02 : 0)
              : assessmentName === 'End of Term Exam'
                ? 0.002
                : 0.005;
            if (chance(missP)) continue;
            // Practicals trend a bit higher (hands-on), exams a bit lower.
            const bias =
              assessmentName === 'Practical'
                ? 6
                : assessmentName === 'End of Term Exam'
                  ? -4
                  : 0;
            const score = clamp(
              perSubject + bias + Math.round((rand(17) - 8) * prof.spread),
              10,
              98,
            );
            const entered = minDate(
              addDays(sat, 1 + rand(4) + (chance(0.07) ? 4 + rand(8) : 0)),
              today,
            );
            const updated = chance(0.04)
              ? minDate(addDays(entered, 1 + rand(14)), today)
              : entered;
            markRows.push({
              studentId: student.id,
              subjectId: subject.id,
              classSectionId: pl.meta.section.id,
              termId: term.id,
              assessmentTypeId: assessmentByName.get(assessmentName).id,
              score,
              maxScore: 100,
              teacherId: teacher.id,
              createdAt: entered,
              updatedAt: updated,
            });
          }
        }
      }
    }
  }
  for (let i = 0; i < markRows.length; i += 5000) {
    await prisma.mark.createMany({ data: markRows.slice(i, i + 5000) });
  }
  console.log(`  ✅ ${markRows.length} marks seeded`);

  // ─── TERM RESULTS (national grading: weighted totals + aggregates) ──────────
  // Computed from the marks above with the same shared grading module the API
  // uses, so seeded report cards match what /marks/calculate would produce.
  const assessmentNameById = new Map(assessmentTypes.map((a) => [a.id, a.name]));
  const subjectById = new Map<string, any>();
  for (const m of sectionMetas) {
    for (const s of subjectsForSection(m)) subjectById.set(s.id, s);
  }

  const marksByStudentTerm = new Map<string, any[]>();
  for (const row of markRows) {
    const key = `${row.studentId}|${row.termId}`;
    const list = marksByStudentTerm.get(key) ?? [];
    list.push(row);
    marksByStudentTerm.set(key, list);
  }

  // Who sat in which class, each year - current students and alumni alike.
  const membership = new Map<string, any[]>();
  for (const { student, placements } of allPeople) {
    for (const pl of placements) {
      const key = occKey(pl.yearIdx, pl.meta.section.id);
      const list = membership.get(key) ?? [];
      list.push(student);
      membership.set(key, list);
    }
  }

  const termResultRows: any[] = [];
  for (let yearIdx = 0; yearIdx < allYears.length; yearIdx++)
  for (const term of allYears[yearIdx].terms.filter(termBegun))
  for (const meta of sectionMetas) {
    const classStudents = membership.get(occKey(yearIdx, meta.section.id)) ?? [];
    const computed: any[] = [];
    // The term in progress stays a draft; everything before it is finished.
    const isCurrentResultTerm = term.id === currentTerm.id;

    for (const student of classStudents) {
      const rows = marksByStudentTerm.get(`${student.id}|${term.id}`) ?? [];
      const bySubject = new Map<string, any[]>();
      for (const r of rows) {
        const list = bySubject.get(r.subjectId) ?? [];
        list.push(r);
        bySubject.set(r.subjectId, list);
      }

      let totalMarks = 0;
      let subjectCount = 0;
      let aggregate = 0;
      let aggregateMax = 0;
      for (const [subjectId, subjectRows] of bySubject) {
        const scope = subjectById.get(subjectId)!.scope as SubjectScope;
        const total = computeSubjectTotal(
          scope,
          subjectRows.map((r) => ({
            assessmentName: assessmentNameById.get(r.assessmentTypeId)!,
            score: r.score,
            maxScore: r.maxScore,
          })),
        );
        if (total === null) continue;
        totalMarks += total;
        subjectCount++;
        if (countsTowardAggregate(scope)) {
          aggregate += gradeFor(scope, total).points;
          aggregateMax += MAX_POINTS_PER_SUBJECT;
        }
      }

      const average = subjectCount > 0 ? totalMarks / subjectCount : 0;
      computed.push({
        studentId: student.id,
        classSectionId: meta.section.id,
        termId: term.id,
        totalMarks,
        average,
        letterGrade: overallGrade(average).letter,
        aggregate,
        aggregateMax,
        calculatedAt: new Date(),
        /**
         * Past terms are finished business: marks out, report cards issued.
         * The term in progress is left as a draft so the demo shows the
         * pipeline honestly - an admin can work out the results, release the
         * marks, then issue the cards, and watch a student's page change at
         * each step. Publishing everything up front hid the whole flow.
         */
        isPublished: !isCurrentResultTerm,
        publishedAt: isCurrentResultTerm ? null : new Date(),
        reportCardPublished: !isCurrentResultTerm,
        reportCardPublishedAt: isCurrentResultTerm ? null : new Date(),
      });
    }

    computed.sort((a, b) => b.average - a.average);
    computed.forEach((r, i) => {
      r.rank = i + 1;
      if (i === 0) r.teacherComment = 'Excellent work, keep leading the class.';
    });
    termResultRows.push(...computed);
  }
  for (let i = 0; i < termResultRows.length; i += 5000) {
    await prisma.termResult.createMany({
      data: termResultRows.slice(i, i + 5000),
    });
  }
  console.log(
    `  ✅ ${termResultRows.length} term results computed and seeded across 3 years`,
  );

  // ─── ATTENDANCE (every school day of the current year) ──────────────────────
  // A register line for every enrolled student on every school day of the
  // year so far, with per-student personalities: most attend solidly, some
  // are late-prone, a few carry multi-day sick streaks and a small chronic
  // tail skips often. Mondays run late-heavy, Fridays lose a few more, and
  // every line is marked by the class teacher with a morning scan time.
  const schoolDays: Date[] = [];
  for (const term of terms) {
    if (!termBegun(term)) continue;
    const lastDay = minDate(term.endDate, today);
    for (let d = new Date(term.startDate); d <= lastDay; d = addDays(d, 1)) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) schoolDays.push(new Date(d));
    }
  }
  type AttProfile = {
    lateP: number;
    absentP: number;
    streakP: number;
    chronic: boolean;
  };
  const attProfileOf = new Map<string, AttProfile>();
  for (const { student } of enrolled) {
    const r = Math.random();
    attProfileOf.set(
      student.id,
      r < 0.84
        ? { lateP: 0.015, absentP: 0.008, streakP: 0.001, chronic: false }
        : r < 0.94
          ? { lateP: 0.12, absentP: 0.015, streakP: 0.001, chronic: false }
          : r < 0.98
            ? { lateP: 0.02, absentP: 0.02, streakP: 0.012, chronic: false }
            : { lateP: 0.07, absentP: 0.1, streakP: 0.004, chronic: true },
    );
  }
  const pickReason = (chronic: boolean): AbsenceReason => {
    const r = Math.random();
    if (chronic) {
      if (r < 0.4) return AbsenceReason.UNEXCUSED;
      if (r < 0.7) return AbsenceReason.SICK;
      if (r < 0.85) return AbsenceReason.FAMILY;
      return AbsenceReason.PERMISSION;
    }
    if (r < 0.55) return AbsenceReason.SICK;
    if (r < 0.75) return AbsenceReason.FAMILY;
    if (r < 0.9) return AbsenceReason.PERMISSION;
    return AbsenceReason.UNEXCUSED;
  };
  const attRows: any[] = [];
  const sickLeft = new Map<string, number>();
  for (const { student, meta } of enrolled) {
    const prof = attProfileOf.get(student.id)!;
    const markerId = teacherUsers[classTeacherIdxOf.get(meta.section.id)!].id;
    for (const date of schoolDays) {
      const dow = date.getUTCDay();
      let status: AttendanceStatus = AttendanceStatus.PRESENT;
      let reason: AbsenceReason | null = null;
      const left = sickLeft.get(student.id) ?? 0;
      if (left > 0) {
        sickLeft.set(student.id, left - 1);
        status = AttendanceStatus.ABSENT;
        reason = AbsenceReason.SICK;
      } else if (chance(prof.streakP)) {
        sickLeft.set(student.id, 1 + rand(3)); // a 2-4 day sick run
        status = AttendanceStatus.ABSENT;
        reason = AbsenceReason.SICK;
      } else if (chance(prof.absentP * (dow === 5 ? 1.3 : 1))) {
        status = AttendanceStatus.ABSENT;
        reason = pickReason(prof.chronic);
      } else if (chance(prof.lateP * (dow === 1 ? 1.6 : 1))) {
        status = AttendanceStatus.LATE;
      }
      // Kigali mornings, stored in UTC (CAT = UTC+2): the gate scan lands
      // 07:40-08:05 local, latecomers 08:05-08:45.
      const scannedAt =
        status === AttendanceStatus.ABSENT
          ? null
          : new Date(
              Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate(),
                status === AttendanceStatus.LATE ? 6 : 5,
                status === AttendanceStatus.LATE ? 5 + rand(40) : 40 + rand(25),
              ),
            );
      attRows.push({
        studentId: student.id,
        classSectionId: meta.section.id,
        date,
        type: 'daily',
        status,
        reasonCategory: reason,
        scannedAt,
        markedByUserId: markerId,
      });
    }
  }
  for (let i = 0; i < attRows.length; i += 10000) {
    await prisma.attendance.createMany({ data: attRows.slice(i, i + 10000) });
  }
  console.log(
    `  ✅ ${attRows.length} attendance lines across ${schoolDays.length} school days (year to date)`,
  );

  // ─── TEACHER ATTENDANCE (staff sign-in, year to date) ───────────────────────
  // Staff scan in before the students do: near-perfect presence, the odd
  // late morning, rare absence.
  const tAttRows: any[] = [];
  for (const teacher of teachers) {
    for (const date of schoolDays) {
      const r = Math.random();
      const status =
        r < 0.955
          ? AttendanceStatus.PRESENT
          : r < 0.985
            ? AttendanceStatus.LATE
            : AttendanceStatus.ABSENT;
      tAttRows.push({
        teacherId: teacher.id,
        date,
        status,
        scannedAt:
          status === AttendanceStatus.ABSENT
            ? null
            : new Date(
                Date.UTC(
                  date.getUTCFullYear(),
                  date.getUTCMonth(),
                  date.getUTCDate(),
                  status === AttendanceStatus.LATE ? 6 : 4,
                  status === AttendanceStatus.LATE ? rand(50) : 45 + rand(70),
                ),
              ),
      });
    }
  }
  for (let i = 0; i < tAttRows.length; i += 10000) {
    await prisma.teacherAttendance.createMany({
      data: tAttRows.slice(i, i + 10000),
    });
  }
  console.log(`  ✅ ${tAttRows.length} teacher attendance lines seeded`);

  // ─── EXAM SCHEDULES (end-of-term timetables, current year) ──────────────────
  // Published for every class for each term so far this year: up to three
  // papers a day through the closing stretch, practicals as task-based
  // assessments in the trade's own lab or workshop.
  const EXAM_SLOTS = [
    { start: '08:30', end: '10:30' },
    { start: '11:00', end: '13:00' },
    { start: '14:00', end: '16:00' },
  ];
  const SYLLABUS_NOTES = [
    'Covers the whole term',
    'Units 1-5',
    'Units 1-6; section B compulsory',
    'All modules covered this term',
    'Closed book; answer all questions',
  ];
  const examRows: any[] = [];
  for (const term of terms) {
    if (!termBegun(term)) continue;
    const examStart = componentDate(term, 'End of Term Exam');
    for (let si = 0; si < sectionMetas.length; si++) {
      const meta = sectionMetas[si];
      const subjects = subjectsForSection(meta);
      const days: Date[] = [];
      for (let d = new Date(examStart); days.length < 10; d = addDays(d, 1)) {
        const dow = d.getUTCDay();
        if (dow !== 0 && dow !== 6) days.push(new Date(d));
        if (d >= term.endDate && days.length * 3 >= subjects.length) break;
      }
      const perDay = Math.min(3, Math.ceil(subjects.length / days.length));
      for (let i = 0; i < subjects.length; i++) {
        const subject = subjects[i];
        const day = days[Math.min(Math.floor(i / perDay), days.length - 1)];
        const slot = EXAM_SLOTS[i % perDay];
        const practical = subject.scope === SubjectScope.A_SPECIFIC;
        examRows.push({
          classSectionId: meta.section.id,
          subjectId: subject.id,
          termId: term.id,
          examDate: day,
          startTime: slot.start,
          endTime: slot.end,
          room: practical ? TRADE_ROOMS[meta.trade!.code] : sectionRoom(si),
          syllabus: practical
            ? 'Task-based practical assessment; report submitted same day'
            : SYLLABUS_NOTES[(si + i) % SYLLABUS_NOTES.length],
        });
      }
    }
  }
  await prisma.examSchedule.createMany({ data: examRows });
  console.log(
    `  ✅ ${examRows.length} exam timetable entries seeded (every class, every term so far)`,
  );

  // ─── DISCIPLINE (mostly minor, few majors, repeat offenders) ────────────────
  // Roughly 8% of students have a record this year. The bulk is lateness,
  // uniform and noise; a small band repeats and escalates (verbal → written
  // → detention); majors are rare, mostly acknowledged by parents, and a few
  // carry appeals. Chronic absentees show up here more than anyone else.
  const MINOR_KINDS = [
    { desc: 'Late to morning assembly', loc: 'Assembly Ground', time: '07:20' },
    { desc: 'Incomplete uniform (no tie)', loc: 'Main Gate', time: '07:15' },
    { desc: 'Noise during evening prep', loc: 'Prep Hall', time: '19:40' },
    { desc: 'Talking during class', loc: 'Classroom', time: '10:15' },
    { desc: 'Homework not submitted twice', loc: 'Classroom', time: '08:30' },
    { desc: 'Late back after lunch', loc: 'Main Gate', time: '14:05' },
    { desc: 'Skipped classroom cleaning duty', loc: 'Classroom', time: '16:30' },
  ];
  const MODERATE_KINDS = [
    { desc: 'Phone found in class', loc: 'Classroom', time: '09:20' },
    { desc: 'Skipping evening prep', loc: 'Prep Hall', time: '19:30' },
    { desc: 'Left class without permission', loc: 'Classroom', time: '11:10' },
    {
      desc: 'Disrespectful language to a classmate',
      loc: 'School Yard',
      time: '13:20',
    },
  ];
  const MAJOR_KINDS = [
    { desc: 'Fighting in the dormitory corridor', loc: 'Dormitory', time: '21:30' },
    { desc: 'Bullying a junior student', loc: 'School Yard', time: '13:00' },
    { desc: 'Sneaked out of school premises', loc: 'Back Fence', time: '17:45' },
    { desc: 'Caught cheating in a CAT', loc: 'Classroom', time: '10:00' },
    { desc: 'Vandalism: broke a lab stool', loc: 'ICT Lab 1', time: '15:10' },
  ];
  const begunTerms = terms.filter(termBegun);
  const schoolDaysByTerm = new Map<string, Date[]>();
  for (const t of begunTerms) {
    schoolDaysByTerm.set(
      t.id,
      schoolDays.filter((d) => d >= t.startDate && d <= t.endDate),
    );
  }
  let incidentCount = 0;
  let majorCount = 0;
  const appealTargets: { incident: any; student: any }[] = [];
  for (const { student, meta } of enrolled) {
    const chronic = attProfileOf.get(student.id)!.chronic;
    if (!chance(chronic ? 0.35 : 0.075)) continue;
    const count = chance(chronic ? 0.5 : 0.18) ? 2 + rand(4) : 1;
    const picks = Array.from({ length: count }, () => {
      const term = sample(begunTerms);
      return { term, date: sample(schoolDaysByTerm.get(term.id)!) };
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
    for (let n = 0; n < picks.length; n++) {
      const { term, date } = picks[n];
      const sev = Math.random();
      const isMajor = sev < 0.06;
      const isModerate = !isMajor && sev < 0.3;
      const kind = isMajor
        ? sample(MAJOR_KINDS)
        : isModerate
          ? sample(MODERATE_KINDS)
          : sample(MINOR_KINDS);
      /*
        Scaled to the forty-point term. Against the old hundred these were
        10-16 for a major; the same proportion of forty is 4-6, so a
        suspension still costs a good part of the term's conduct mark without
        a single incident wiping it out.
      */
      const pts = isMajor ? 4 + rand(3) : isModerate ? 2 + rand(2) : 1 + rand(2);
      const action = isMajor
        ? DisciplineAction.SUSPENSION
        : isModerate
          ? n >= 2 || chance(0.5)
            ? DisciplineAction.DETENTION
            : DisciplineAction.WRITTEN_WARNING
          : n >= 1
            ? DisciplineAction.WRITTEN_WARNING
            : DisciplineAction.VERBAL_WARNING;
      const acknowledged = chance(isMajor ? 0.85 : isModerate ? 0.4 : 0.15);
      const recordedBy = chance(0.6)
        ? teacherUsers[classTeacherIdxOf.get(meta.section.id)!]
        : teacherUsers[0]; // the DOS records the rest
      const incident = await prisma.disciplineIncident.create({
        data: {
          studentId: student.id,
          termId: term.id,
          recordedByUserId: recordedBy.id,
          date,
          time: kind.time,
          location: kind.loc,
          description: kind.desc,
          pointsDeducted: pts,
          actionTaken: action,
          parentAcknowledged: acknowledged,
          parentAcknowledgedAt: acknowledged
            ? minDate(addDays(date, 1 + rand(4)), today)
            : null,
          createdAt: minDate(addDays(date, rand(2)), today),
        },
      });
      incidentCount++;
      if (isMajor) {
        majorCount++;
        if (appealTargets.length < 3) appealTargets.push({ incident, student });
      }
      // The mark is per term, so only the running term's deductions show on
      // the student's own standing. Floored at nothing: a term cannot end
      // below zero, and a decrement on its own can.
      if (term.id === currentTerm.id) {
        const standing = await prisma.student.findUnique({
          where: { id: student.id },
          select: { disciplinePoints: true },
        });
        await prisma.student.update({
          where: { id: student.id },
          data: {
            disciplinePoints: Math.max(0, (standing?.disciplinePoints ?? 0) - pts),
          },
        });
      }
    }
  }
  // A few appeals on the majors: one approved, one rejected, one pending.
  const appealStatuses = [
    AppealStatus.APPROVED,
    AppealStatus.REJECTED,
    AppealStatus.PENDING,
  ];
  let appealCount = 0;
  for (let i = 0; i < appealTargets.length; i++) {
    const { incident, student } = appealTargets[i];
    const g = guardianByStudent.get(student.id);
    const submitter = g?.father ?? g?.mother;
    if (!submitter) continue;
    const status = appealStatuses[i];
    await prisma.disciplineAppeal.create({
      data: {
        incidentId: incident.id,
        submittedByUserId: submitter.id,
        statement:
          'My child explains the situation differently; we request a review of the record and the points deducted.',
        evidenceUrls: [],
        status,
        reviewedByUserId: status === AppealStatus.PENDING ? null : admin.id,
        reviewNotes:
          status === AppealStatus.APPROVED
            ? 'Reviewed with the class teacher; the account partially confirmed the appeal. Action reduced.'
            : status === AppealStatus.REJECTED
              ? 'Two staff witnesses confirmed the report. The record stands.'
              : null,
      },
    });
    appealCount++;
  }
  console.log(
    `  ✅ ${incidentCount} discipline incidents (${majorCount} major) + ${appealCount} appeals seeded`,
  );

  // ─── LIBRARY (REB textbooks, trade shelves, African literature) ─────────────
  // The catalog a Rwandan TSS actually holds: REB class-set textbooks per
  // subject and level, technical references per trade, African and Rwandan
  // literature, French classics and reference works. Loans carry a term of
  // history: most returned (some late), a couple dozen out now, a few
  // overdue and two lost.
  type BookSpec = {
    title: string;
    author: string;
    isbn?: string;
    category: string;
    qty: number;
    cost: number;
    shelf: string;
  };
  const bookData: BookSpec[] = [
    // REB class sets - shelf A (no ISBN: local curriculum prints)
    { title: 'Mathematics for Rwanda Schools, Senior 1', author: 'REB', category: 'Textbooks', qty: 40, cost: 6500, shelf: 'A1' },
    { title: 'Mathematics for Rwanda Schools, Senior 2', author: 'REB', category: 'Textbooks', qty: 40, cost: 6500, shelf: 'A1' },
    { title: 'Mathematics for Rwanda Schools, Senior 3', author: 'REB', category: 'Textbooks', qty: 35, cost: 6800, shelf: 'A1' },
    { title: 'Physics for Rwanda Schools, Senior 2', author: 'REB', category: 'Textbooks', qty: 30, cost: 7200, shelf: 'A2' },
    { title: 'Chemistry for Rwanda Schools, Senior 3', author: 'REB', category: 'Textbooks', qty: 30, cost: 7200, shelf: 'A2' },
    { title: 'Biology and Health Sciences, Senior 1', author: 'REB', category: 'Textbooks', qty: 30, cost: 7000, shelf: 'A2' },
    { title: 'English for Rwanda Secondary Schools, Senior 1', author: 'REB', category: 'Textbooks', qty: 35, cost: 6000, shelf: 'A3' },
    { title: 'Ikinyarwanda mu Mashuri Yisumbuye, Igitabo 1', author: 'REB', category: 'Kinyarwanda', qty: 35, cost: 5500, shelf: 'A3' },
    { title: 'Ikinyarwanda mu Mashuri Yisumbuye, Igitabo 2', author: 'REB', category: 'Kinyarwanda', qty: 32, cost: 5500, shelf: 'A3' },
    { title: 'Kiswahili kwa Shule za Sekondari, Kitabu 1', author: 'REB', category: 'Textbooks', qty: 25, cost: 5800, shelf: 'A4' },
    { title: 'Entrepreneurship for Rwandan Schools, Senior 3', author: 'REB', category: 'Textbooks', qty: 30, cost: 6200, shelf: 'A4' },
    { title: 'Geography and Environment for Rwanda, Senior 2', author: 'REB', category: 'Textbooks', qty: 28, cost: 6900, shelf: 'A4' },
    { title: 'History and Citizenship, Senior 3', author: 'REB', category: 'Textbooks', qty: 28, cost: 6900, shelf: 'A4' },
    // Sciences and mathematics references - shelf B
    { title: 'English Grammar in Use', author: 'Raymond Murphy', isbn: '978-1108457651', category: 'Languages', qty: 12, cost: 18000, shelf: 'B1' },
    { title: 'Practical English Usage', author: 'Michael Swan', isbn: '978-0194202428', category: 'Languages', qty: 6, cost: 22000, shelf: 'B1' },
    { title: 'Fundamentals of Physics', author: 'Halliday & Resnick', isbn: '978-1119460138', category: 'Sciences', qty: 5, cost: 38000, shelf: 'B2' },
    { title: 'Chemistry: The Central Science', author: 'Brown & LeMay', isbn: '978-0134414232', category: 'Sciences', qty: 4, cost: 36000, shelf: 'B2' },
    { title: 'Biology: A Global Approach', author: 'Neil Campbell', isbn: '978-1292341637', category: 'Sciences', qty: 4, cost: 34000, shelf: 'B2' },
    { title: 'Calculus: Early Transcendentals', author: 'James Stewart', isbn: '978-1285741550', category: 'Mathematics', qty: 5, cost: 32000, shelf: 'B3' },
    { title: 'Statistics for Business', author: 'David Anderson', isbn: '978-0357715857', category: 'Mathematics', qty: 4, cost: 28000, shelf: 'B3' },
    // ICT and trades - shelf C
    { title: 'HTML and CSS: Design and Build Websites', author: 'Jon Duckett', isbn: '978-1118008188', category: 'ICT & Trades', qty: 8, cost: 26000, shelf: 'C1' },
    { title: 'JavaScript and JQuery', author: 'Jon Duckett', isbn: '978-1118531648', category: 'ICT & Trades', qty: 8, cost: 27000, shelf: 'C1' },
    { title: 'Eloquent JavaScript', author: 'Marijn Haverbeke', isbn: '978-1593279509', category: 'ICT & Trades', qty: 6, cost: 24000, shelf: 'C1' },
    { title: 'Python Crash Course', author: 'Eric Matthes', isbn: '978-1593279288', category: 'ICT & Trades', qty: 8, cost: 25000, shelf: 'C1' },
    { title: 'Clean Code', author: 'Robert C. Martin', isbn: '978-0132350884', category: 'ICT & Trades', qty: 4, cost: 30000, shelf: 'C2' },
    { title: 'Database System Concepts', author: 'Silberschatz, Korth & Sudarshan', isbn: '978-0078022159', category: 'ICT & Trades', qty: 4, cost: 40000, shelf: 'C2' },
    { title: 'CCNA Routing and Switching Study Guide', author: 'Todd Lammle', isbn: '978-1118749616', category: 'ICT & Trades', qty: 6, cost: 35000, shelf: 'C2' },
    { title: 'Networking All-in-One For Dummies', author: 'Doug Lowe', isbn: '978-1119689010', category: 'ICT & Trades', qty: 5, cost: 28000, shelf: 'C2' },
    { title: 'Linux Pocket Guide', author: 'Daniel J. Barrett', isbn: '978-1491927571', category: 'ICT & Trades', qty: 6, cost: 15000, shelf: 'C3' },
    { title: 'Automotive Technology: Principles, Diagnosis, and Service', author: 'James D. Halderman', isbn: '978-0134616797', category: 'ICT & Trades', qty: 6, cost: 42000, shelf: 'C3' },
    { title: 'Modern Automotive Technology', author: 'James E. Duffy', isbn: '978-1590070956', category: 'ICT & Trades', qty: 5, cost: 40000, shelf: 'C3' },
    { title: 'Tourism: Principles and Practice', author: 'John Fletcher', isbn: '978-1292172354', category: 'ICT & Trades', qty: 6, cost: 33000, shelf: 'C4' },
    { title: 'Hotel Front Office Management', author: 'James A. Bardi', isbn: '978-0470637524', category: 'ICT & Trades', qty: 4, cost: 30000, shelf: 'C4' },
    { title: 'First Aid Manual', author: 'St John Ambulance', isbn: '978-0241241233', category: 'ICT & Trades', qty: 10, cost: 12000, shelf: 'C4' },
    // African and Rwandan literature - shelf D
    { title: 'Things Fall Apart', author: 'Chinua Achebe', isbn: '978-0385474542', category: 'Literature', qty: 15, cost: 9000, shelf: 'D1' },
    { title: 'The River Between', author: 'Ngugi wa Thiongo', isbn: '978-0435905484', category: 'Literature', qty: 12, cost: 8500, shelf: 'D1' },
    { title: 'Weep Not, Child', author: 'Ngugi wa Thiongo', isbn: '978-0143106692', category: 'Literature', qty: 10, cost: 8500, shelf: 'D1' },
    { title: 'A Grain of Wheat', author: 'Ngugi wa Thiongo', isbn: '978-0143106760', category: 'Literature', qty: 8, cost: 9000, shelf: 'D1' },
    { title: 'Song of Lawino', author: "Okot p'Bitek", isbn: '978-1478607649', category: 'Literature', qty: 10, cost: 8000, shelf: 'D2' },
    { title: 'So Long a Letter', author: 'Mariama Ba', isbn: '978-0435905552', category: 'Literature', qty: 10, cost: 7500, shelf: 'D2' },
    { title: 'The Beautyful Ones Are Not Yet Born', author: 'Ayi Kwei Armah', isbn: '978-0435905361', category: 'Literature', qty: 8, cost: 8500, shelf: 'D2' },
    { title: 'Purple Hibiscus', author: 'Chimamanda Ngozi Adichie', isbn: '978-1616202415', category: 'Literature', qty: 10, cost: 11000, shelf: 'D2' },
    { title: 'Half of a Yellow Sun', author: 'Chimamanda Ngozi Adichie', isbn: '978-1400095209', category: 'Literature', qty: 6, cost: 12000, shelf: 'D3' },
    { title: 'The Concubine', author: 'Elechi Amadi', isbn: '978-0435905569', category: 'Literature', qty: 6, cost: 7500, shelf: 'D3' },
    { title: 'Mine Boy', author: 'Peter Abrahams', isbn: '978-0435905620', category: 'Literature', qty: 6, cost: 7500, shelf: 'D3' },
    { title: 'Small Country', author: 'Gael Faye', isbn: '978-1524759872', category: 'Literature', qty: 8, cost: 13000, shelf: 'D3' },
    { title: 'The Girl Who Smiled Beads', author: 'Clemantine Wamariya', isbn: '978-0451495334', category: 'Literature', qty: 6, cost: 14000, shelf: 'D4' },
    { title: 'Baking Cakes in Kigali', author: 'Gaile Parkin', isbn: '978-0385343435', category: 'Literature', qty: 5, cost: 12000, shelf: 'D4' },
    { title: 'Imigani y i Kinyarwanda: Rwandan Folktales', author: 'Anthology', category: 'Kinyarwanda', qty: 12, cost: 6000, shelf: 'D4' },
    // French and reference - shelf E
    { title: 'Le Petit Prince', author: 'Antoine de Saint-Exupery', isbn: '978-0156012195', category: 'Languages', qty: 10, cost: 9500, shelf: 'E1' },
    { title: "L'Enfant Noir", author: 'Camara Laye', isbn: '978-2266083614', category: 'Languages', qty: 8, cost: 8500, shelf: 'E1' },
    { title: "Oxford Advanced Learner's Dictionary", author: 'Oxford University Press', isbn: '978-0194798488', category: 'Reference', qty: 15, cost: 25000, shelf: 'E2' },
    { title: 'Kinyarwanda-English Modern Dictionary', author: 'Emmanuel Bagabo', category: 'Reference', qty: 8, cost: 15000, shelf: 'E2' },
    { title: 'Collins World Atlas', author: 'Collins', isbn: '978-0008436162', category: 'Reference', qty: 6, cost: 20000, shelf: 'E2' },
    { title: 'A History of Modern Africa', author: 'Richard Reid', isbn: '978-1108790543', category: 'Humanities', qty: 5, cost: 26000, shelf: 'E3' },
    { title: 'Human Geography', author: 'Erin Fouberg', isbn: '978-1119626183', category: 'Humanities', qty: 4, cost: 28000, shelf: 'E3' },
  ];
  const books: any[] = [];
  for (let i = 0; i < bookData.length; i++) {
    const b = bookData[i];
    books.push(
      await prisma.book.create({
        data: {
          title: b.title,
          author: b.author,
          isbn: b.isbn ?? null,
          category: b.category,
          quantity: b.qty,
          availableCount: b.qty,
          barcode: `BK-${String(i + 1).padStart(5, '0')}`,
          shelfLocation: b.shelf,
          replacementCost: b.cost,
          isActive: true,
        },
      }),
    );
  }

  // Loan history across the year: returned (some late), out now, overdue
  // (kept ACTIVE - the app derives overdue from the due date), and lost.
  const borrowDays = 14; // matches borrowing_duration_days config
  const outByBook = new Map<string, number>();
  const loanRows: any[] = [];
  const borrowerPool = [
    ...studentUsers,
    ...teacherUsers.slice(0, 8), // teachers borrow too, less often
  ];
  // Never let open loans exceed a title's copies.
  const canGoOut = (book: any, spec: BookSpec) =>
    (outByBook.get(book.id) ?? 0) < spec.qty - 1;
  const pickLendable = (): { book: any; spec: BookSpec } => {
    for (;;) {
      const idx = rand(books.length);
      if (canGoOut(books[idx], bookData[idx])) {
        return { book: books[idx], spec: bookData[idx] };
      }
    }
  };
  const RETURNED_COUNT = 140;
  for (let i = 0; i < RETURNED_COUNT; i++) {
    const book = sample(books);
    const out = addDays(today, -(20 + rand(240)));
    const due = addDays(out, borrowDays);
    const late = chance(0.18);
    const returned = addDays(out, late ? borrowDays + 1 + rand(10) : 4 + rand(10));
    loanRows.push({
      bookId: book.id,
      borrowerUserId: sample(borrowerPool).id,
      checkedOutAt: out,
      dueDate: due,
      returnedAt: minDate(returned, today),
      status: LoanStatus.RETURNED,
    });
  }
  for (let i = 0; i < 24; i++) {
    const { book } = pickLendable();
    const out = addDays(today, -(1 + rand(12)));
    outByBook.set(book.id, (outByBook.get(book.id) ?? 0) + 1);
    loanRows.push({
      bookId: book.id,
      borrowerUserId: sample(studentUsers).id,
      checkedOutAt: out,
      dueDate: addDays(out, borrowDays),
      returnedAt: null,
      status: LoanStatus.ACTIVE,
    });
  }
  for (let i = 0; i < 6; i++) {
    const { book } = pickLendable();
    const due = addDays(today, -(2 + rand(14)));
    outByBook.set(book.id, (outByBook.get(book.id) ?? 0) + 1);
    loanRows.push({
      bookId: book.id,
      borrowerUserId: sample(studentUsers).id,
      checkedOutAt: addDays(due, -borrowDays),
      dueDate: due,
      returnedAt: null,
      status: LoanStatus.ACTIVE, // overdue by date
    });
  }
  for (let i = 0; i < 2; i++) {
    const { book, spec } = pickLendable();
    const out = addDays(today, -(90 + rand(60)));
    outByBook.set(book.id, (outByBook.get(book.id) ?? 0) + 1);
    loanRows.push({
      bookId: book.id,
      borrowerUserId: sample(studentUsers).id,
      checkedOutAt: out,
      dueDate: addDays(out, borrowDays),
      returnedAt: null,
      status: LoanStatus.LOST,
      replacementCost: spec.cost,
    });
  }
  await prisma.bookLoan.createMany({ data: loanRows });
  for (const [bookId, out] of outByBook) {
    await prisma.book.update({
      where: { id: bookId },
      data: { availableCount: { decrement: out } },
    });
  }
  console.log(
    `  ✅ ${books.length} library titles + ${loanRows.length} loans seeded (24 out, 6 overdue, 2 lost)`,
  );

  // ─── HOMEWORK (every class, all year) ───────────────────────────────────────
  // Each class collects 3-5 assignments per term across its own subjects,
  // due on school days through the term, with one recent/upcoming one in the
  // running term so dashboards stay alive. Most students submit, some late,
  // chronic absentees least; anything past due is graded by its teacher.
  const HW_GENERAL = [
    {
      t: (s: any) => `${s.name}: exercise set from Unit ${1 + rand(6)}`,
      d: 'Answer all questions in your exercise book and show your working.',
    },
    {
      t: (s: any) => `${s.name}: past paper practice`,
      d: 'Attempt the paper under exam conditions; we mark together on the due day.',
      k: AssessmentKind.TEST,
    },
    {
      t: (s: any) => `${s.name} research assignment`,
      d: 'One page, handwritten. Cite at least two sources from the library.',
      k: AssessmentKind.ASSIGNMENT,
    },
    {
      t: (s: any) => `${s.name}: revision worksheet`,
      d: 'Complete the worksheet and bring questions on the hard items.',
      k: AssessmentKind.HOMEWORK,
    },
  ];
  const HW_TRADE = [
    {
      t: (s: any) => `${s.name}: practical report`,
      d: 'Write up the last lab session: objective, steps, result, what went wrong.',
      k: AssessmentKind.PRACTICAL,
    },
    {
      t: (s: any) => `${s.name}: project milestone`,
      d: 'Bring your project to the next checkpoint and be ready to demo it.',
      k: AssessmentKind.PROJECT,
    },
    {
      t: (s: any) => `${s.name}: task write-up`,
      d: 'Document the assigned task following the workshop template.',
      k: AssessmentKind.ASSIGNMENT,
    },
  ];
  const studentsBySection = new Map<string, any[]>();
  for (const e of enrolled) {
    const list = studentsBySection.get(e.meta.section.id) ?? [];
    list.push(e.student);
    studentsBySection.set(e.meta.section.id, list);
  }
  const now = new Date();
  const hwSubmissionRows: any[] = [];
  let hwCount = 0;
  for (const meta of sectionMetas) {
    const classStudents = studentsBySection.get(meta.section.id) ?? [];
    const subjects = subjectsForSection(meta);
    for (const term of begunTerms) {
      const dates = schoolDaysByTerm.get(term.id)!;
      const n = 3 + rand(3);
      for (let k = 0; k < n; k++) {
        const subject = sample(subjects);
        const isTrade = subject.scope === SubjectScope.A_SPECIFIC;
        const isCurrent = term.id === currentTerm.id;
        const due =
          isCurrent && k === n - 1
            ? addDays(today, rand(5) - 2) // one lands around today
            : dates[
                Math.min(
                  dates.length - 1,
                  10 + rand(Math.max(1, dates.length - 12)),
                )
              ];
        const dueAt = new Date(
          Date.UTC(
            due.getUTCFullYear(),
            due.getUTCMonth(),
            due.getUTCDate(),
            15,
            0,
          ),
        );
        const tpl = isTrade ? sample(HW_TRADE) : sample(HW_GENERAL);
        const maxMarks = sample([10, 20, 20, 30]);
        const hw = await prisma.homework.create({
          data: {
            teacherId: teacherOf(meta.section.id, subject.id).id,
            subjectId: subject.id,
            classSectionId: meta.section.id,
            termId: term.id,
            kind: (tpl as any).k ?? AssessmentKind.HOMEWORK,
            title: tpl.t(subject),
            description: tpl.d,
            dueDate: dueAt,
            maxMarks,
            lateDeductionPerDay: sample([0, 1, 2]),
            createdAt: minDate(addDays(due, -(5 + rand(9))), today),
          },
        });
        hwCount++;
        const graded = dueAt < addDays(today, -1);
        for (const st of classStudents) {
          const prof = attProfileOf.get(st.id)!;
          if (dueAt > now) {
            if (!chance(0.35)) continue; // early birds only, so far
          } else if (!chance(prof.chronic ? 0.55 : 0.86)) {
            continue; // never handed in
          }
          const late = dueAt <= now && chance(prof.chronic ? 0.25 : 0.07);
          const sd = late ? addDays(due, 1 + rand(3)) : addDays(due, -rand(3));
          const submittedAt = minDate(
            new Date(
              Date.UTC(
                sd.getUTCFullYear(),
                sd.getUTCMonth(),
                sd.getUTCDate(),
                14 + rand(5),
                rand(60),
              ),
            ),
            now,
          );
          hwSubmissionRows.push({
            homeworkId: hw.id,
            studentId: st.id,
            submittedAt,
            isLate: late,
            marks: graded
              ? Math.round(maxMarks * (0.4 + Math.random() * 0.55) * 10) / 10
              : null,
            gradedAt: graded ? minDate(addDays(dueAt, 1 + rand(5)), now) : null,
            gradedByUserId: graded
              ? teacherUserOf(meta.section.id, subject.id).id
              : null,
          });
        }
      }
    }
  }
  for (let i = 0; i < hwSubmissionRows.length; i += 5000) {
    await prisma.homeworkSubmission.createMany({
      data: hwSubmissionRows.slice(i, i + 5000),
    });
  }
  console.log(
    `  ✅ ${hwCount} homeworks + ${hwSubmissionRows.length} submissions seeded across every class`,
  );

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
  /**
   * Real staffroom traffic.
   *
   * Two conversations made the inbox look broken rather than quiet. A school
   * that has been running three years has teachers asking each other about
   * cover, parents chasing marks, and a head teacher sending notices, so the
   * seed produces that instead of a welcome message.
   */
  const staffThreads: [string, string[]][] = [
    ['Senior 1 A needs cover on Thursday', [
      'Aline is at the district meeting on Thursday. Can anyone take Senior 1 A period 3?',
      'I can take it. Which topic are they on?',
      'Quadratic equations, exercise 4. The books are in the staffroom cupboard.',
      'Noted, thank you.',
    ]],
    ['Term 2 marks deadline', [
      'Please have Term 2 marks entered by Friday so report cards can go out next week.',
      'Mine are in for both my classes.',
      'Still finishing the practicals for Level 4 SWD. Monday at the latest?',
      'Monday is fine, but not later, the printer is booked for Tuesday.',
    ]],
    ['Library books not returned', [
      'Six titles are still out past their date from Senior 2. Can class teachers remind them?',
      'I will read the list out at assembly tomorrow.',
    ]],
    ['Sports day arrangements', [
      'Sports day is the 14th. Each class needs two students for the relay.',
      'Senior 1 B has their two already.',
      'Level 3 SWD as well.',
    ]],
  ];

  let convCount = 0;
  let msgCount = 0;
  for (const [name, lines] of staffThreads) {
    const members = shuffled(teacherUsers).slice(0, 3 + rand(2));
    const conv = await prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name,
        createdByUserId: admin.id,
      },
    });
    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv.id, userId: admin.id, isAdmin: true },
        ...members.map((m) => ({ conversationId: conv.id, userId: m.id })),
      ],
    });
    const speakers = [admin, ...members];
    for (let i = 0; i < lines.length; i++) {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderUserId: speakers[i % speakers.length].id,
          content: lines[i],
          contentType: MessageContentType.TEXT,
          createdAt: minDate(addDays(today, -(lines.length - i) - rand(4)), today),
        },
      });
      msgCount++;
    }
    convCount++;
  }

  // A parent asking a teacher about their child, which is the other half of
  // what this inbox is for.
  const parentThreads: [string, string][] = [
    ['Good afternoon, could you tell me how my son is finding Mathematics this term?', 'He has improved a lot since Term 1, particularly on the written work. Keep him practising past papers.'],
    ['My daughter was unwell on Tuesday, I have sent a note with her today.', 'Thank you for letting us know, I have marked it as excused.'],
    ['Will there be extra lessons before the end of term exams?', 'Yes, Saturdays from the 9th, 9am to noon. No charge.'],
  ];
  for (let i = 0; i < parentThreads.length; i++) {
    const parent = parentUsers[i * 7];
    const teacher = teacherUsers[i % teacherUsers.length];
    if (!parent || !teacher) continue;
    const conv = await prisma.conversation.create({
      data: { type: ConversationType.ONE_ON_ONE, createdByUserId: parent.id },
    });
    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv.id, userId: parent.id },
        { conversationId: conv.id, userId: teacher.id },
      ],
    });
    const [ask, reply] = parentThreads[i];
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderUserId: parent.id,
        content: ask,
        contentType: MessageContentType.TEXT,
        createdAt: minDate(addDays(today, -(3 + i)), today),
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderUserId: teacher.id,
        content: reply,
        contentType: MessageContentType.TEXT,
        createdAt: minDate(addDays(today, -(2 + i)), today),
      },
    });
    convCount++;
    msgCount += 2;
  }
  // ─── THE CLASS GROUPS ───────────────────────────────────────────────────────
  //
  // Every class has one, and nobody creates it. It holds the class and the
  // adult who answers for them: the class teacher where the class has been
  // given one, the administrator where it has not - a room of thirty children
  // with no adult in it is not a room a school would allow.
  //
  // The application reconciles these on read as students move between classes,
  // so this only has to make the first one.
  let classGroups = 0;
  for (const section of await prisma.classSection.findMany({
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true } },
      trade: { select: { code: true } },
    },
  })) {
    const [students, classTeacher] = await Promise.all([
      prisma.student.findMany({
        where: { classSectionId: section.id, status: StudentStatus.ACTIVE },
        select: { userId: true },
      }),
      prisma.teacherRole.findFirst({
        where: { role: SpecialRole.CLASS_TEACHER, classSectionId: section.id },
        select: { teacher: { select: { userId: true } } },
      }),
    ]);

    const responsible = classTeacher?.teacher?.userId ?? admin.id;
    const members = [
      ...new Set([...students.map((s) => s.userId), responsible]),
    ];
    if (members.length === 0) continue;

    const conv = await prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: [section.classLevel?.name, section.trade?.code, section.name]
          .filter(Boolean)
          .join(' '),
        classSectionId: section.id,
        createdByUserId: responsible,
      },
    });
    await prisma.conversationParticipant.createMany({
      data: members.map((userId) => ({
        conversationId: conv.id,
        userId,
        isAdmin: userId === responsible,
      })),
    });
    classGroups++;
    convCount++;
  }
  console.log(`  ✅ ${classGroups} class groups seeded`);

  console.log(`  ✅ ${convCount} conversations + ${msgCount} messages seeded`);

  // ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
  // The bell is only useful if it has something in it. These are the notices a
  // school actually generates in a week.
  // `subject` is what the notice is ABOUT, which is what the bell opens.
  // `type` is only the channel it went out on, and routing off that was why
  // clicking a notification never went anywhere.
  const notices: {
    userId: string;
    title: string;
    message: string;
    type: NotificationType;
    subject?: string;
    daysAgo: number;
  }[] = [
    { userId: admin.id, title: 'Term 2 marks are due', message: 'Nine teachers have not finished entering Term 2 marks. Reports print on Tuesday.', type: NotificationType.PUSH, subject: NotificationSubject.MARKS, daysAgo: 0 },
    { userId: admin.id, title: 'Six books are overdue', message: 'Six library titles are past their return date, the oldest by 21 days.', type: NotificationType.EMAIL, subject: NotificationSubject.BOOK_LOAN, daysAgo: 1 },
    { userId: admin.id, title: 'Attendance below 90%', message: 'Senior 2 B attendance was 87% this week, the lowest in the school.', type: NotificationType.PUSH, subject: NotificationSubject.ATTENDANCE, daysAgo: 2 },
    { userId: admin.id, title: 'A discipline appeal is waiting', message: 'A parent has appealed an incident and is waiting on a decision.', type: NotificationType.EMAIL, subject: NotificationSubject.DISCIPLINE, daysAgo: 3 },
    // Deliberately without one: a notice that is not about anything in
    // particular should stay a plain notice rather than open a random page.
    { userId: admin.id, title: 'System Ready', message: 'Markova Academy system has been set up successfully.', type: NotificationType.EMAIL, daysAgo: 6 },
  ];
  for (const t of teacherUsers.slice(0, 6)) {
    notices.push({
      userId: t.id,
      title: 'Marks entry closes Friday',
      message: 'Please enter Term 2 marks for your classes before Friday.',
      type: NotificationType.PUSH,
      subject: NotificationSubject.MARKS,
      daysAgo: rand(4),
    });
  }
  for (const p of parentUsers.slice(0, 8)) {
    notices.push({
      userId: p.id,
      title: 'Report card published',
      message: "Your child's Term 2 report card is now available to view.",
      type: NotificationType.EMAIL,
      subject: NotificationSubject.REPORT_CARD,
      daysAgo: rand(5),
    });
  }
  await prisma.notification.createMany({
    data: notices.map((n) => ({
      userId: n.userId,
      title: n.title,
      message: n.message,
      type: n.type,
      relatedEntityType: n.subject ?? null,
      createdAt: minDate(addDays(today, -n.daysAgo), today),
    })),
  });
  console.log(`  ✅ ${notices.length} notifications seeded`);

  // ─── SUPPORT TICKETS ────────────────────────────────────────────────────────
  // An empty queue reads as a broken feature. These are the things staff
  // actually raise.
  const ticketRows = [
    { user: teacherUsers[0], title: 'Projector in Senior 1 A will not connect', description: 'The HDMI port is loose and the picture cuts out during lessons.', category: 'Technical', status: 'OPEN', daysAgo: 1 },
    { user: teacherUsers[1], title: 'Cannot enter marks for Level 4 SWD', description: 'The subject does not appear in my list even though I teach it.', category: 'Account', status: 'IN_PROGRESS', daysAgo: 3 },
    { user: parentUsers[0], title: 'Report card shows the wrong term', description: 'Term 2 marks appear under Term 3 on the card I downloaded.', category: 'Bug Report', status: 'RESOLVED', daysAgo: 9 },
    { user: teacherUsers[2], title: 'Add a column for practical marks', description: 'TVET subjects are marked on theory and practical separately.', category: 'Feature Request', status: 'OPEN', daysAgo: 5 },
    { user: librarianUser, title: 'Barcode scanner types the wrong digits', description: 'Every scan drops the last character of the book code.', category: 'Technical', status: 'IN_PROGRESS', daysAgo: 2 },
  ].filter((t) => t.user);

  await prisma.supportTicket.createMany({
    data: ticketRows.map((t) => ({
      userId: t.user!.id,
      title: t.title,
      description: t.description,
      category: t.category,
      status: t.status,
      createdAt: minDate(addDays(today, -t.daysAgo), today),
      resolvedAt:
        t.status === 'RESOLVED'
          ? minDate(addDays(today, -(t.daysAgo - 2)), today)
          : null,
    })),
  });
  console.log(`  ✅ ${ticketRows.length} support tickets seeded`);

  // ─── SCHOOL FEES ────────────────────────────────────────────────────────────
  // The ledger a Rwandan day-and-boarding secondary school actually keeps.
  // Seeded as a real book: a price list per class level, one frozen invoice
  // per student per term, and entries against it. Nothing here stores a
  // balance - every figure the app shows is the sum of these rows, which is
  // the only way the demo can be trusted to behave like the real thing.
  //
  // The amounts are ordinary for a Rwandan TSS: tuition rising a little with
  // the level, boarding and meals for the roughly three in ten who board, and
  // a bus for some of the day students.
  const FEE_LINES: {
    name: string;
    appliesTo: FeeAppliesTo;
    base: number;
    /** Added per level above Senior 1, so Level 5 costs more than Senior 1. */
    step: number;
  }[] = [
    { name: 'Tuition', appliesTo: FeeAppliesTo.ALL, base: 82000, step: 6000 },
    { name: 'Boarding', appliesTo: FeeAppliesTo.BOARDER, base: 58000, step: 2000 },
    { name: 'Meals', appliesTo: FeeAppliesTo.BOARDER, base: 44000, step: 1500 },
    { name: 'Transport', appliesTo: FeeAppliesTo.DAY, base: 24000, step: 0 },
    { name: 'Materials and practicals', appliesTo: FeeAppliesTo.ALL, base: 12000, step: 2500 },
    { name: 'Examinations', appliesTo: FeeAppliesTo.ALL, base: 5000, step: 500 },
  ];

  const feeItemRows: any[] = [];
  // Every term of the current year, and the year before it, so the demo has a
  // history to read rather than one live term hanging in space.
  const billedTerms = [...allYears[1].terms, ...allYears[2].terms].filter(
    (t: any) => t.startDate <= today,
  );

  for (const term of billedTerms) {
    for (const level of classLevels) {
      FEE_LINES.forEach((line, position) => {
        feeItemRows.push({
          termId: term.id,
          classLevelId: level.id,
          name: line.name,
          // Rounded to the nearest 500: nobody bills a family 83,750 RWF.
          amount:
            Math.round((line.base + line.step * (level.order - 1)) / 500) * 500,
          appliesTo: line.appliesTo,
          position,
        });
      });
    }
  }
  await prisma.feeItem.createMany({ data: feeItemRows });

  const feeItems = await prisma.feeItem.findMany({
    orderBy: [{ position: 'asc' }],
  });
  const itemsByTermLevel = new Map<string, any[]>();
  for (const item of feeItems) {
    const key = `${item.termId}::${item.classLevelId}`;
    if (!itemsByTermLevel.has(key)) itemsByTermLevel.set(key, []);
    itemsByTermLevel.get(key)!.push(item);
  }

  /*
    How each family is doing, decided once per student rather than per term,
    because a family that struggles in January is usually the same family
    struggling in May. That is what makes the register worth looking at: the
    same names recur, which is exactly the pattern a bursar chases.
  */
  type PayerKind = 'PROMPT' | 'STEADY' | 'LATE' | 'STRUGGLING' | 'SPONSORED';
  const payerOf = new Map<string, PayerKind>();
  for (const st of students) {
    payerOf.set(
      st.id,
      // Most families pay. A handful are sponsored outright, and a real tail
      // is behind - without that tail the gate has nothing to demonstrate.
      chance(0.04)
        ? 'SPONSORED'
        : chance(0.46)
          ? 'PROMPT'
          : chance(0.5)
            ? 'STEADY'
            : chance(0.55)
              ? 'LATE'
              : 'STRUGGLING',
    );
  }

  /*
    The student demo account is put behind on the current term, deliberately.

    Signing in as student1 is how anybody looks at this feature, and a roll
    where that account happens to be paid up shows nothing. Their past terms
    settle normally, so the older report cards still open and only the live
    term is held - which is the behaviour being demonstrated.
  */
  const demoStudent = enrolled.find(
    (e) => e.user.email === 'student1@markova.edu',
  );
  if (demoStudent) payerOf.set(demoStudent.student.id, 'STRUGGLING');

  const levelBySection = new Map(
    sectionMetas.map((m) => [m.section.id, m.level]),
  );

  const invoiceRows: any[] = [];
  for (const term of billedTerms) {
    for (const st of students) {
      const level = levelBySection.get(st.classSectionId);
      if (!level) continue;
      const items = itemsByTermLevel.get(`${term.id}::${level.id}`) ?? [];
      if (items.length === 0) continue;
      const charges = chargesFor(items, st.isBoarder);
      invoiceRows.push({
        studentId: st.id,
        termId: term.id,
        total: invoiceTotal(charges),
        issuedAt: term.startDate,
        lines: charges,
      });
    }
  }

  for (let i = 0; i < invoiceRows.length; i += 2000) {
    await prisma.feeInvoice.createMany({
      data: invoiceRows.slice(i, i + 2000).map((r) => ({
        studentId: r.studentId,
        termId: r.termId,
        total: r.total,
        issuedAt: r.issuedAt,
      })),
    });
  }

  const invoices = await prisma.feeInvoice.findMany({
    select: { id: true, studentId: true, termId: true, total: true },
  });
  const invoiceIdBy = new Map(
    invoices.map((inv) => [`${inv.studentId}::${inv.termId}`, inv.id]),
  );

  const lineRows: any[] = [];
  for (const row of invoiceRows) {
    const id = invoiceIdBy.get(`${row.studentId}::${row.termId}`);
    if (!id) continue;
    row.lines.forEach((line: any, position: number) => {
      lineRows.push({
        invoiceId: id,
        name: line.name,
        amount: line.amount,
        position,
      });
    });
  }
  for (let i = 0; i < lineRows.length; i += 5000) {
    await prisma.feeInvoiceLine.createMany({ data: lineRows.slice(i, i + 5000) });
  }

  // Money in. Methods weighted the way a Rwandan school actually receives it:
  // most families pay into the school's bank account, mobile money is common
  // and growing, and cash still walks through the office door.
  const PAY_METHODS: PaymentMethod[] = [
    PaymentMethod.BANK_DEPOSIT,
    PaymentMethod.BANK_DEPOSIT,
    PaymentMethod.BANK_DEPOSIT,
    PaymentMethod.MOBILE_MONEY,
    PaymentMethod.MOBILE_MONEY,
    PaymentMethod.CASH,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.CHEQUE,
  ];

  const referenceFor = (method: PaymentMethod, when: Date) => {
    const stamp = `${String(when.getFullYear()).slice(2)}${String(
      when.getMonth() + 1,
    ).padStart(2, '0')}${String(when.getDate()).padStart(2, '0')}`;
    switch (method) {
      case PaymentMethod.MOBILE_MONEY:
        return `MP${stamp}.${1000 + rand(9000)}.A${10000 + rand(89999)}`;
      case PaymentMethod.BANK_DEPOSIT:
      case PaymentMethod.BANK_TRANSFER:
        return `BK/${stamp}/${100000 + rand(899999)}`;
      case PaymentMethod.CHEQUE:
        return `CHQ ${100000 + rand(899999)}`;
      default:
        return null;
    }
  };

  /** What share of the bill a family has found, by the kind of payer. */
  const settledShare = (kind: PayerKind, isPastTerm: boolean): number => {
    if (kind === 'SPONSORED') return 0; // covered by a waiver, below
    if (isPastTerm) {
      // A closed term is nearly always settled: the school does not let a
      // student sit the next one otherwise. A few stragglers remain.
      return kind === 'STRUGGLING' && chance(0.45) ? 0.55 + Math.random() * 0.3 : 1;
    }
    switch (kind) {
      case 'PROMPT':
        return 1;
      case 'STEADY':
        return chance(0.65) ? 1 : 0.6 + Math.random() * 0.35;
      case 'LATE':
        return 0.35 + Math.random() * 0.4;
      default:
        // A real tail has families who have paid nothing at all this term.
        // Without them the register never shows an untouched account and the
        // status that matters most to a bursar is never on screen.
        return chance(0.4) ? 0 : Math.random() * 0.35;
    }
  };

  const paymentRows: any[] = [];
  const waiverRows: any[] = [];
  let receipt: string | null = null;
  const currentTermId = currentTerm.id;

  const WAIVERS: { kind: WaiverKind; reason: string }[] = [
    { kind: WaiverKind.BURSARY, reason: 'School bursary, means-tested by the committee' },
    { kind: WaiverKind.SCHOLARSHIP, reason: 'Merit scholarship, top of the year group' },
    { kind: WaiverKind.SPONSORSHIP, reason: 'District bursary, confirmed by the sector office' },
    { kind: WaiverKind.HARDSHIP, reason: 'Remission after a bereavement in the family' },
    { kind: WaiverKind.STAFF_CHILD, reason: 'Staff child, half of tuition remitted' },
  ];

  for (const inv of invoices) {
    const kind = payerOf.get(inv.studentId) ?? 'STEADY';
    const isPastTerm = inv.termId !== currentTermId;
    const term = billedTerms.find((t: any) => t.id === inv.termId);
    const opened = term ? new Date(term.startDate) : today;

    if (kind === 'SPONSORED') {
      const w = sample(WAIVERS.slice(0, 4));
      waiverRows.push({
        invoiceId: inv.id,
        kind: w.kind,
        amount: inv.total,
        reason: w.reason,
        grantedByUserId: bursarUser?.id ?? admin.id,
        createdAt: addDays(opened, 2 + rand(10)),
      });
      continue;
    }

    const isDemoAccount =
      !!demoStudent && inv.studentId === demoStudent.student.id;

    // A few families carry part of the bill rather than all of it. Not the
    // demo account: a waiver landing on it would clear the term this seed
    // exists to leave held.
    let owedAfterWaiver = inv.total;
    if (!isDemoAccount && chance(0.05)) {
      const part = Math.round((inv.total * (0.25 + Math.random() * 0.35)) / 500) * 500;
      waiverRows.push({
        invoiceId: inv.id,
        kind: WaiverKind.STAFF_CHILD,
        amount: part,
        reason: WAIVERS[4].reason,
        grantedByUserId: bursarUser?.id ?? admin.id,
        createdAt: addDays(opened, 3 + rand(12)),
      });
      owedAfterWaiver -= part;
    }

    /* Every closed term paid off, the live one behind: the older report
       cards open and only the current one is held. */
    const share = isDemoAccount
      ? isPastTerm
        ? 1
        : 0.4
      : settledShare(kind, isPastTerm);
    let target = Math.round((owedAfterWaiver * share) / 500) * 500;
    if (target <= 0) continue;

    // Families pay in one, two or three goes across the term.
    const instalments = share >= 1 ? 1 + rand(2) : 1 + rand(2);
    let paidSoFar = 0;
    for (let n = 0; n < instalments && paidSoFar < target; n++) {
      const last = n === instalments - 1;
      const amount = last
        ? target - paidSoFar
        : Math.round((target / instalments) / 500) * 500;
      if (amount <= 0) continue;
      const when = addDays(opened, 2 + n * (12 + rand(20)) + rand(8));
      // Never dated into the future: a receipt for money not yet received is
      // the one entry that would make the whole book unreadable.
      const paidAt = when > today ? today : when;
      const method = sample(PAY_METHODS);
      receipt = nextReceiptNumber(receipt, paidAt.getFullYear());
      paymentRows.push({
        invoiceId: inv.id,
        receiptNumber: receipt,
        amount,
        method,
        reference: referenceFor(method, paidAt),
        paidAt,
        note: last && share >= 1 ? 'Balance settled' : null,
        recordedByUserId: bursarUser?.id ?? admin.id,
        createdAt: paidAt,
      });
      paidSoFar += amount;
    }
  }

  /*
    A handful of receipts entered twice and then voided. Every real cash book
    has them, and they are what proves the balance is the sum of the entries
    rather than a number somebody typed: a voided row is still on the page and
    still adds to nothing.
  */
  const duplicates = shuffled(paymentRows).slice(0, 6);
  for (const original of duplicates) {
    receipt = nextReceiptNumber(receipt, original.paidAt.getFullYear());
    paymentRows.push({
      ...original,
      receiptNumber: receipt,
      note: null,
      voidedAt: addDays(original.paidAt, 1 + rand(3)),
      voidedByUserId: bursarUser?.id ?? admin.id,
      voidReason: sample([
        'Entered twice at the counter',
        'Receipted against the wrong term',
        'Bank deposit reversed by the bank',
      ]),
    });
  }

  // Sorted by date so the receipt numbers run in the order the money came in,
  // which is how a numbered book reads and how anybody checks one.
  paymentRows.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  paymentRows.forEach((row, i) => {
    row.receiptNumber = `RCT-${row.paidAt.getFullYear()}-${String(i + 1).padStart(4, '0')}`;
  });

  for (let i = 0; i < paymentRows.length; i += 2000) {
    await prisma.feePayment.createMany({ data: paymentRows.slice(i, i + 2000) });
  }
  if (waiverRows.length) {
    for (let i = 0; i < waiverRows.length; i += 2000) {
      await prisma.feeWaiver.createMany({ data: waiverRows.slice(i, i + 2000) });
    }
  }

  console.log(
    `  ✅ Fees seeded: ${feeItemRows.length} price lines, ${invoices.length} invoices, ${paymentRows.length} receipts, ${waiverRows.length} waivers`,
  );

  // ─── POCKET MONEY ───────────────────────────────────────────────────────────
  // A boarding school holds cash for its students: a parent hands it over on
  // visiting day and the student draws it down at the canteen. Seeded as a
  // real ledger, so the balances are the sum of the entries rather than a
  // number somebody typed.
  // Roughly two thirds of a TSS roll board, which is who holds money here.
  const boarders = students.filter((_, i) => i % 3 !== 2).slice(0, 240);
  const pmAccounts: any[] = [];
  for (const st of boarders) {
    pmAccounts.push({
      studentId: st.id,
      // A parent who sends a term's money does not want it gone by Wednesday.
      dailyLimit: sample([null, null, 1000, 2000, 2000, 5000]),
      lowBalanceAlert: sample([null, 1000, 2000]),
    });
  }
  await prisma.pocketMoneyAccount.createMany({ data: pmAccounts });
  const createdAccounts = await prisma.pocketMoneyAccount.findMany({
    select: { id: true, studentId: true },
  });

  const pmRows: any[] = [];
  const counterStaff = [admin.id, ...teacherUsers.slice(0, 2).map((t) => t.id)];
  for (const acct of createdAccounts) {
    // Visiting day money, once or twice a term.
    let running = 0;
    const deposits = 1 + rand(2);
    for (let d = 0; d < deposits; d++) {
      const amount = sample([5000, 10000, 10000, 15000, 20000]);
      running += amount;
      pmRows.push({
        accountId: acct.id,
        kind: 'DEPOSIT',
        amount,
        note: sample([
          'Visiting day, handed in by mother',
          'Visiting day, handed in by father',
          'Sent through the bursar',
        ]),
        recordedByUserId: sample(counterStaff),
        createdAt: minDate(addDays(today, -(20 + rand(50))), today),
      });
    }
    // Then the canteen, a little at a time.
    const trips = rand(9);
    for (let w = 0; w < trips; w++) {
      const amount = sample([200, 300, 500, 500, 800, 1000, 1500]);
      if (amount > running) break;
      running -= amount;
      pmRows.push({
        accountId: acct.id,
        kind: 'WITHDRAWAL',
        amount,
        note: sample(['Canteen', 'Soap and toothpaste', 'Bread', 'Airtime', 'Exercise books']),
        recordedByUserId: sample(counterStaff),
        createdAt: minDate(addDays(today, -rand(18)), today),
      });
    }
  }
  for (let i = 0; i < pmRows.length; i += 5000) {
    await prisma.pocketMoneyTransaction.createMany({
      data: pmRows.slice(i, i + 5000),
    });
  }
  console.log(
    `  ✅ ${createdAccounts.length} pocket money accounts + ${pmRows.length} entries seeded`,
  );


  // ─── ACTIVITIES ─────────────────────────────────────────────────────────────
  // A school's week is not only lessons. These are the things a Rwandan
  // secondary school actually runs, so the calendar reads like one rather than
  // like a list of test rows.
  const activityStaff = [admin.id, ...teacherUsers.slice(0, 4).map((t) => t.id)];
  // Which year level each class belongs to, so a level audience can be turned
  // into the students actually in it.
  const sectionLevelId = new Map(
    sectionMetas.map((m) => [m.section.id, m.level.id]),
  );
  const oLevels = classLevels.filter((l) => l.stage === EducationStage.O_LEVEL);
  const aLevels = classLevels.filter((l) => l.stage === EducationStage.A_LEVEL);

  const dayAt = (offset: number, hour: number, minute = 0) => {
    const d = addDays(today, offset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const activityPlan: {
    kind: ActivityKind;
    title: string;
    description: string;
    location: string;
    offset: number;
    hour: number;
    hours: number;
    audience: ActivityAudience;
    levels?: any[];
    requiresConsent?: boolean;
    tracksAttendance?: boolean;
    capacity?: number;
    cancelled?: string;
  }[] = [
    { kind: ActivityKind.ASSEMBLY, title: 'Monday assembly', description: 'Flag raising, notices and the week ahead.', location: 'Assembly ground', offset: 3, hour: 7, hours: 1, audience: ActivityAudience.WHOLE_SCHOOL },
    { kind: ActivityKind.CLUB, title: 'Debate club', description: 'Weekly motion practice ahead of the inter-school debate.', location: 'Room 4', offset: 2, hour: 15, hours: 2, audience: ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true, capacity: 40 },
    { kind: ActivityKind.CLUB, title: 'Anti-AIDS club', description: 'Peer education session with the school nurse.', location: 'Room 7', offset: 5, hour: 15, hours: 1, audience: ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
    { kind: ActivityKind.CLUB, title: 'Umuganda club', description: 'Community work in the school garden and the road outside.', location: 'School garden', offset: 9, hour: 8, hours: 3, audience: ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
    { kind: ActivityKind.CLUB, title: 'ICT club', description: 'Robotics and web projects in the computer lab.', location: 'Computer lab', offset: 4, hour: 15, hours: 2, audience: ActivityAudience.LEVELS, levels: aLevels, tracksAttendance: true, capacity: 30 },
    { kind: ActivityKind.SPORT, title: 'Football against Groupe Scolaire Kacyiru', description: 'Home match, senior boys and girls.', location: 'School field', offset: 6, hour: 15, hours: 2, audience: ActivityAudience.WHOLE_SCHOOL },
    { kind: ActivityKind.SPORT, title: 'Inter-class volleyball', description: 'Class against class, all week.', location: 'Volleyball court', offset: 12, hour: 15, hours: 2, audience: ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
    { kind: ActivityKind.VISITING_DAY, title: 'Visiting day', description: 'Families may visit boarders between 10:00 and 16:00. Pocket money can be handed in at the office.', location: 'School grounds', offset: 10, hour: 10, hours: 6, audience: ActivityAudience.WHOLE_SCHOOL },
    { kind: ActivityKind.TRIP, title: 'Nyungwe forest trip', description: 'Senior 2 biology field trip. Depart 06:00, return by 19:00.', location: 'Nyungwe National Park', offset: 18, hour: 6, hours: 13, audience: ActivityAudience.LEVELS, levels: oLevels.slice(1, 2), requiresConsent: true, tracksAttendance: true, capacity: 45 },
    { kind: ActivityKind.TRIP, title: 'Kigali Genocide Memorial visit', description: 'Senior 3 history visit to Gisozi.', location: 'Kigali Genocide Memorial', offset: 24, hour: 8, hours: 5, audience: ActivityAudience.LEVELS, levels: oLevels.slice(2, 3), requiresConsent: true, tracksAttendance: true, capacity: 60 },
    { kind: ActivityKind.SCHOOL_EVENT, title: 'Parents meeting, Senior 1', description: 'First term progress and boarding arrangements.', location: 'School hall', offset: 15, hour: 14, hours: 2, audience: ActivityAudience.LEVELS, levels: oLevels.slice(0, 1) },
    { kind: ActivityKind.SCHOOL_EVENT, title: 'Career day', description: 'Alumni and employers talk to the TVET levels.', location: 'School hall', offset: 21, hour: 9, hours: 4, audience: ActivityAudience.LEVELS, levels: aLevels },
    { kind: ActivityKind.SPORT, title: 'Swimming gala', description: 'Inter-house gala at the Kigali pool.', location: 'Amahoro pool', offset: 8, hour: 9, hours: 4, audience: ActivityAudience.WHOLE_SCHOOL, requiresConsent: true, cancelled: 'The pool is closed for repairs. A new date will be announced.' },
    // Behind us, so the calendar has a past as well as a future.
    { kind: ActivityKind.ASSEMBLY, title: 'Term opening assembly', description: 'Welcome back and the term calendar.', location: 'Assembly ground', offset: -30, hour: 7, hours: 1, audience: ActivityAudience.WHOLE_SCHOOL },
    { kind: ActivityKind.SPORT, title: 'Cross country', description: 'Whole school run through Kimironko.', location: 'Kimironko', offset: -14, hour: 7, hours: 3, audience: ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
    { kind: ActivityKind.VISITING_DAY, title: 'Visiting day (last month)', description: 'Families visited boarders.', location: 'School grounds', offset: -21, hour: 10, hours: 6, audience: ActivityAudience.WHOLE_SCHOOL },
  ];

  const createdActivities: any[] = [];
  for (const a of activityPlan) {
    const activity = await prisma.activity.create({
      data: {
        kind: a.kind,
        title: a.title,
        description: a.description,
        location: a.location,
        startsAt: dayAt(a.offset, a.hour),
        endsAt: dayAt(a.offset, a.hour + a.hours),
        audience: a.audience,
        requiresConsent: a.requiresConsent ?? false,
        tracksAttendance: a.tracksAttendance ?? false,
        capacity: a.capacity ?? null,
        isCancelled: !!a.cancelled,
        cancelledReason: a.cancelled ?? null,
        createdByUserId: sample(activityStaff),
        termId: currentTerm.id,
        ...(a.levels?.length && {
          classLevels: {
            create: a.levels.map((l: any) => ({ classLevelId: l.id })),
          },
        }),
      },
    });
    createdActivities.push({ ...activity, plan: a });
  }

  // Who is signed up, and whether their family answered. The pending ones are
  // the point: a head teacher's real question the day before a trip is "who
  // has not answered yet".
  const activityParticipants: any[] = [];
  for (const activity of createdActivities) {
    const plan = activity.plan;
    if (!plan.tracksAttendance && !plan.requiresConsent) continue;
    if (activity.isCancelled) continue;

    const pool = plan.levels?.length
      ? students.filter((st: any) =>
          plan.levels.some(
            (l: any) => sectionLevelId.get(st.classSectionId) === l.id,
          ),
        )
      : students;

    const size = Math.min(plan.capacity ?? 35, pool.length, 35);
    const chosen = shuffled(pool).slice(0, size);
    const past = plan.offset < 0;

    for (const st of chosen) {
      // A third of families have not answered yet, which is what the office
      // spends the day before a trip chasing.
      const consent = plan.requiresConsent
        ? sample([
            ConsentState.GIVEN,
            ConsentState.GIVEN,
            ConsentState.GIVEN,
            ConsentState.PENDING,
            ConsentState.PENDING,
            ConsentState.REFUSED,
          ])
        : ConsentState.PENDING;

      activityParticipants.push({
        activityId: activity.id,
        studentId: st.id,
        consent,
        consentByUserId:
          consent === ConsentState.PENDING ? null : sample(activityStaff),
        consentAt:
          consent === ConsentState.PENDING
            ? null
            : addDays(today, -(1 + rand(10))),
        // A register only exists for something that has already happened.
        attended: past && plan.tracksAttendance ? rand(10) > 1 : null,
        attendedAt: past && plan.tracksAttendance ? activity.startsAt : null,
      });
    }
  }
  for (let i = 0; i < activityParticipants.length; i += 5000) {
    await prisma.activityParticipant.createMany({
      data: activityParticipants.slice(i, i + 5000),
    });
  }
  console.log(
    `  ✅ ${createdActivities.length} activities + ${activityParticipants.length} sign-ups seeded`,
  );

  // ─── HEALTH ─────────────────────────────────────────────────────────────────
  // The sick bay, as it actually runs: mostly headaches and stomach aches,
  // a few referrals, and one or two students who keep coming back.
  const clinicalStaff = [admin.id, ...teacherUsers.slice(0, 2).map((t) => t.id)];

  const COMPLAINTS: {
    complaint: string;
    findings: string;
    treatment: string;
    severity: ClinicSeverity;
    medicine?: string;
    dose?: string;
  }[] = [
    { complaint: 'Headache since morning assembly', findings: 'No fever. Slept badly.', treatment: 'Rest and water', severity: ClinicSeverity.MINOR, medicine: 'Paracetamol', dose: '500mg' },
    { complaint: 'Stomach ache after breakfast', findings: 'Tender, no fever', treatment: 'Rest, plain food', severity: ClinicSeverity.MINOR },
    { complaint: 'Toothache on the left side', findings: 'Swollen gum', treatment: 'Pain relief, dentist advised', severity: ClinicSeverity.MODERATE, medicine: 'Paracetamol', dose: '500mg' },
    { complaint: 'Cough and blocked nose for three days', findings: 'Mild fever, chest clear', treatment: 'Fluids and rest', severity: ClinicSeverity.MINOR },
    { complaint: 'Fever since last night', findings: '38.4 degrees', treatment: 'Antipyretic, kept in the sick bay', severity: ClinicSeverity.MODERATE, medicine: 'Paracetamol', dose: '500mg' },
    { complaint: 'Cut on the knee from the football pitch', findings: 'Superficial graze', treatment: 'Cleaned and dressed', severity: ClinicSeverity.MINOR },
    { complaint: 'Twisted ankle during the match', findings: 'Swelling, weight bearing painful', treatment: 'Cold compress, referred', severity: ClinicSeverity.SERIOUS },
    { complaint: 'Period pains', findings: 'No fever', treatment: 'Rest and pain relief', severity: ClinicSeverity.MINOR, medicine: 'Ibuprofen', dose: '200mg' },
    { complaint: 'Dizzy at assembly', findings: 'Skipped breakfast, low blood pressure', treatment: 'Sugar water, rest', severity: ClinicSeverity.MODERATE },
    { complaint: 'Rash on both arms', findings: 'Contact rash, no fever', treatment: 'Cream applied, watched', severity: ClinicSeverity.MINOR },
    { complaint: 'Malaria symptoms, chills and headache', findings: 'Temperature 38.9', treatment: 'Referred for a test', severity: ClinicSeverity.SERIOUS },
    { complaint: 'Eye redness and itching', findings: 'Conjunctivitis, both eyes', treatment: 'Drops, kept away from class', severity: ClinicSeverity.MODERATE },
  ];

  const HEALTH_CENTRES = [
    'Kacyiru Health Centre',
    'Kimironko Health Centre',
    'King Faisal Hospital',
    'Kibagabaga Hospital',
  ];

  // Boarders live here, so they are who the sick bay mostly sees.
  const clinicPool = shuffled(students).slice(0, 150);
  const visitRows: any[] = [];
  const repeatOffenders = clinicPool.slice(0, 4);

  for (const st of clinicPool) {
    // Most students visit once or twice a term. A few keep coming back, which
    // is the pattern the summary exists to surface.
    const visits = repeatOffenders.includes(st) ? 4 + rand(3) : rand(3);
    for (let v = 0; v < visits; v++) {
      const c = sample(COMPLAINTS);
      const daysAgo = rand(60);
      const outcome =
        c.severity === ClinicSeverity.SERIOUS
          ? sample([
              ClinicVisitOutcome.REFERRED_OUT,
              ClinicVisitOutcome.REFERRED_OUT,
              ClinicVisitOutcome.SENT_HOME,
            ])
          : c.severity === ClinicSeverity.MODERATE
            ? sample([
                ClinicVisitOutcome.RESTING_IN_SICK_BAY,
                ClinicVisitOutcome.RETURNED_TO_CLASS,
              ])
            : ClinicVisitOutcome.RETURNED_TO_CLASS;

      visitRows.push({
        studentId: st.id,
        complaint: c.complaint,
        findings: c.findings,
        treatment: c.treatment,
        severity: c.severity,
        outcome,
        temperature:
          c.severity === ClinicSeverity.MINOR
            ? null
            : Number((36.5 + Math.random() * 2.4).toFixed(1)),
        referredTo:
          outcome === ClinicVisitOutcome.REFERRED_OUT
            ? sample(HEALTH_CENTRES)
            : null,
        seenByUserId: sample(clinicalStaff),
        visitedAt: addDays(today, -daysAgo),
        // A stay in the sick bay ends the same day unless it is today's.
        dischargedAt:
          outcome === ClinicVisitOutcome.RESTING_IN_SICK_BAY && daysAgo > 0
            ? addDays(today, -daysAgo)
            : null,
        // The families of the serious ones were told; the minor ones were not,
        // which is exactly the gap a school should be able to see.
        parentNotifiedAt:
          c.severity === ClinicSeverity.MINOR
            ? null
            : addDays(today, -daysAgo),
        updatedAt: addDays(today, -daysAgo),
        medicine: c.medicine,
        dose: c.dose,
      });
    }
  }

  // Three students lying in the sick bay right now. Without these the demo's
  // first screen is always empty, and a nurse looking at it would reasonably
  // conclude the feature does not work.
  for (const st of clinicPool.slice(4, 7)) {
    const c = COMPLAINTS.find((x) => x.severity === ClinicSeverity.MODERATE)!;
    visitRows.push({
      studentId: st.id,
      complaint: c.complaint,
      findings: c.findings,
      treatment: c.treatment,
      severity: c.severity,
      outcome: ClinicVisitOutcome.RESTING_IN_SICK_BAY,
      temperature: Number((37.8 + Math.random()).toFixed(1)),
      referredTo: null,
      seenByUserId: sample(clinicalStaff),
      visitedAt: addDays(today, 0),
      // Still in there, so not discharged.
      dischargedAt: null,
      parentNotifiedAt: null,
      updatedAt: today,
      medicine: c.medicine,
      dose: c.dose,
    });
  }

  for (const row of visitRows) {
    const { medicine, dose, ...visitData } = row;
    const visit = await prisma.clinicVisit.create({ data: visitData });
    if (medicine) {
      await prisma.medicationAdministration.create({
        data: {
          studentId: visit.studentId,
          visitId: visit.id,
          medicine,
          dose,
          reason: visit.complaint,
          givenByUserId: visit.seenByUserId,
          givenAt: visit.visitedAt,
        },
      });
    }
  }

  // The emergency card, for the students who have something worth recording.
  // Deliberately not everybody: a card on every student would be a lie about
  // how much a school actually knows.
  const CONDITIONS = [
    { chronicConditions: 'Asthma', regularMedication: 'Blue inhaler as needed', emergencyPlan: 'Inhaler is kept in the dormitory locker. If breathing does not settle in ten minutes, go to Kacyiru Health Centre.' },
    { chronicConditions: 'Sickle cell', regularMedication: 'Folic acid daily', emergencyPlan: 'Keep warm and hydrated. Any severe pain is an emergency, go straight to King Faisal.' },
    { chronicConditions: 'Epilepsy', regularMedication: 'Carbamazepine, morning and evening', emergencyPlan: 'Turn onto the side, do not restrain, time the seizure. Over five minutes, call an ambulance.' },
    { chronicConditions: 'Type 1 diabetes', regularMedication: 'Insulin before meals', emergencyPlan: 'Sugar and a snack if shaky or confused. Glucometer is with the nurse.' },
    { chronicConditions: 'Severe peanut allergy', allergyNotes: 'Peanuts and groundnut sauce', emergencyPlan: 'Adrenaline pen is in the sick bay fridge. Use it and call an ambulance.' },
  ];

  const healthRecordRows: any[] = [];
  const cardStudents = shuffled(students).slice(0, 60);
  for (const [i, st] of cardStudents.entries()) {
    const condition = i < 15 ? CONDITIONS[i % CONDITIONS.length] : {};
    healthRecordRows.push({
      studentId: st.id,
      ...condition,
      // Not always the parent on the account: an aunt in Kigali is who a
      // boarding school can actually reach at three in the morning.
      emergencyContactName: (() => {
        const n = adultName(sample([Gender.MALE, Gender.FEMALE]));
        return `${n.first} ${n.last}`;
      })(),
      emergencyContactPhone: realPhone(),
      emergencyRelationship: sample([
        'Mother',
        'Father',
        'Aunt',
        'Uncle',
        'Grandmother',
        'Elder brother',
      ]),
      insuranceProvider: sample([
        'Mutuelle de Sante',
        'Mutuelle de Sante',
        'RSSB',
        'Radiant',
        'Britam',
      ]),
      insuranceNumber: `MUT-${1000 + rand(9000)}`,
      preferredClinic: sample(HEALTH_CENTRES),
      updatedByUserId: sample(clinicalStaff),
      updatedAt: addDays(today, -rand(90)),
    });
  }
  await prisma.studentHealthRecord.createMany({ data: healthRecordRows });
  console.log(
    `  ✅ ${visitRows.length} clinic visits + ${healthRecordRows.length} emergency cards seeded`,
  );

  // ─── MERITS ─────────────────────────────────────────────────────────────────
  // The other half of behaviour. Deliberately fewer than the incidents, which
  // is honest about where most schools are and is exactly what the ratio on
  // the discipline page is there to show.
  const MERITS: { category: MeritCategory; description: string; points: number }[] = [
    { category: MeritCategory.HELPING_OTHERS, description: 'Stayed behind to help clear the science lab', points: 5 },
    { category: MeritCategory.HELPING_OTHERS, description: 'Walked a younger student to the sick bay and waited with her', points: 5 },
    { category: MeritCategory.ACADEMIC_EFFORT, description: 'Kept working at maths through the whole term despite a hard start', points: 8 },
    { category: MeritCategory.ACADEMIC_EFFORT, description: 'Best improvement in physics this term', points: 10 },
    { category: MeritCategory.LEADERSHIP, description: 'Led the Senior 2 debate team to the district final', points: 10 },
    { category: MeritCategory.LEADERSHIP, description: 'Ran the dormitory as head girl without a single complaint', points: 10 },
    { category: MeritCategory.SPORT, description: 'Scored the winning goal against Groupe Scolaire Kacyiru', points: 5 },
    { category: MeritCategory.SPORT, description: 'Captained the volleyball team all season', points: 8 },
    { category: MeritCategory.ARTS, description: 'Painted the mural in the school hall', points: 8 },
    { category: MeritCategory.ARTS, description: 'Wrote and directed the Liberation Day drama', points: 10 },
    { category: MeritCategory.SERVICE, description: 'Worked every umuganda in the school garden this term', points: 8 },
    { category: MeritCategory.SERVICE, description: 'Kept the library shelves in order without being asked', points: 5 },
    { category: MeritCategory.HONESTY, description: 'Handed in a wallet found on the football pitch', points: 10 },
    { category: MeritCategory.HONESTY, description: 'Owned up to breaking a lab flask nobody had seen', points: 8 },
    { category: MeritCategory.IMPROVEMENT, description: 'Turned around a difficult first term. No incidents since March.', points: 12 },
    { category: MeritCategory.IMPROVEMENT, description: 'Went from constant lateness to first in the classroom every day', points: 12 },
  ];

  // Dated across the same school days the incidents use, and deliberately
  // fewer than them. Both matter: comparing a term of praise against a month
  // of trouble would make the ratio meaningless, and a seed showing more
  // praise than trouble would hide the very thing the ratio exists to show.
  const meritDays = schoolDaysByTerm.get(currentTerm.id) ?? [];
  const meritRows: any[] = [];
  const merited = shuffled(students).slice(0, 25);
  const award = (st: any) => {
    const merit = sample(MERITS);
    meritRows.push({
      studentId: st.id,
      termId: currentTerm.id,
      awardedByUserId: sample(activityStaff),
      category: merit.category,
      description: merit.description,
      points: merit.points,
      date: meritDays.length ? sample(meritDays) : addDays(today, -rand(30)),
    });
  };
  for (const st of merited) award(st);
  // A few students turn up again and again, so "most recognised" is a real
  // list rather than six names that each happen to have one.
  for (const st of merited.slice(0, 6)) {
    for (let m = 0; m < 1 + rand(2); m++) award(st);
  }
  await prisma.meritAward.createMany({ data: meritRows });

  // The points a merit restores, applied once at the end rather than per row,
  // because the ledger is what matters and the score is derived from it.
  const meritTotals = new Map<string, number>();
  for (const row of meritRows) {
    meritTotals.set(
      row.studentId,
      (meritTotals.get(row.studentId) ?? 0) + row.points,
    );
  }
  for (const [studentId, earned] of meritTotals) {
    const st = await prisma.student.findUnique({
      where: { id: studentId },
      select: { disciplinePoints: true },
    });
    if (!st) continue;
    // Capped at a clean sheet, exactly as the service does it, so the seeded
    // numbers agree with what the app would have produced.
    await prisma.student.update({
      where: { id: studentId },
      data: {
        disciplinePoints: Math.min(TERM_CONDUCT_MARK, st.disciplinePoints + earned),
      },
    });
  }
  console.log(`  ✅ ${meritRows.length} merits seeded`);

  // ─── FAQ ────────────────────────────────────────────────────────────────────
  await prisma.faqArticle.createMany({
    data: [
      { title: 'How to reset my password?', content: 'Contact the school administrator to reset your password. You will receive an OTP on your registered phone number.', category: 'Account', displayOrder: 1 },
      { title: "How to check my child's marks?", content: 'Log in to the parent portal, navigate to the Marks section, and select the relevant term.', category: 'Marks', displayOrder: 2 },
      { title: 'How to report an absence?', content: 'Parents can report an absence through the mobile app or by contacting the class teacher directly.', category: 'Attendance', displayOrder: 3 },
    ],
  });
  console.log('  ✅ FAQ articles seeded');

  // ─── TIMETABLE (weighted weekly plan) ───────────────────────────────────────
  // Every class gets its weekly plan placed onto an 8-period day: core
  // subjects carry more periods than electives, trade modules fill the
  // technical block mostly as double periods in their own lab or workshop,
  // and a teacher is never in two rooms at once. A few free periods remain,
  // as on any real board.
  const timeSlots = [
    { start: '08:00', end: '08:45' },
    { start: '08:50', end: '09:35' },
    { start: '09:50', end: '10:35' },
    { start: '10:40', end: '11:25' },
    { start: '11:30', end: '12:15' },
    { start: '14:00', end: '14:45' },
    { start: '14:50', end: '15:35' },
    { start: '15:40', end: '16:25' },
  ];
  const timetableRows: any[] = [];
  const busyTeachers = new Map<string, Set<string>>();
  const busyAt = (day: number, slot: number) => {
    const key = `${day}-${slot}`;
    if (!busyTeachers.has(key)) busyTeachers.set(key, new Set());
    return busyTeachers.get(key)!;
  };
  let demandTotal = 0;
  for (let si = 0; si < sectionMetas.length; si++) {
    const meta = sectionMetas[si];
    const subjectsById = new Map<string, any>(
      subjectsForSection(meta).map((s) => [s.id, s]),
    );
    const remaining = new Map(planBySection.get(meta.section.id)!);
    for (const v of remaining.values()) demandTotal += v;
    const roomFor = (subject: any) =>
      subject.scope === SubjectScope.A_SPECIFIC
        ? TRADE_ROOMS[meta.trade!.code]
        : sectionRoom(si);

    for (const day of [1, 2, 3, 4, 5]) {
      const todayCount = new Map<string, number>();
      const occupied = new Set<number>();
      const place = (subjectId: string, atSlot: number) => {
        const t = teacherOf(meta.section.id, subjectId);
        busyAt(day, atSlot).add(t.id);
        occupied.add(atSlot);
        timetableRows.push({
          classSectionId: meta.section.id,
          subjectId,
          teacherId: t.id,
          dayOfWeek: day,
          startTime: timeSlots[atSlot].start,
          endTime: timeSlots[atSlot].end,
          room: roomFor(subjectsById.get(subjectId)!),
        });
        remaining.set(subjectId, remaining.get(subjectId)! - 1);
        todayCount.set(subjectId, (todayCount.get(subjectId) ?? 0) + 1);
      };

      for (let slot = 0; slot < timeSlots.length; slot++) {
        if (occupied.has(slot)) continue;
        const taken = busyAt(day, slot);

        // 1) A trade module with 2+ periods left takes a double block when
        //    its teacher is free for both and the pair does not span lunch.
        let chosen: string | null = null;
        let asDouble = false;
        const canDouble =
          slot !== 4 && slot + 1 < timeSlots.length && !occupied.has(slot + 1);
        if (canDouble) {
          for (const [sid, left] of remaining) {
            if (left < 2) continue;
            if (subjectsById.get(sid)!.scope !== SubjectScope.A_SPECIFIC)
              continue;
            if ((todayCount.get(sid) ?? 0) > 0) continue;
            const tid = teacherOf(meta.section.id, sid).id;
            if (taken.has(tid) || busyAt(day, slot + 1).has(tid)) continue;
            chosen = sid;
            asDouble = true;
            break;
          }
        }
        // 2) Otherwise the subject with the most periods left whose teacher
        //    is free - first one not yet seen today, then allowing a second
        //    (non-consecutive) period.
        if (!chosen) {
          for (const pass of [0, 1] as const) {
            let bestLeft = 0;
            for (const [sid, left] of remaining) {
              if (left <= 0) continue;
              if ((todayCount.get(sid) ?? 0) > pass) continue;
              if (taken.has(teacherOf(meta.section.id, sid).id)) continue;
              if (left > bestLeft) {
                bestLeft = left;
                chosen = sid;
              }
            }
            if (chosen) break;
          }
        }
        if (!chosen) continue; // free period on the board
        place(chosen, slot);
        if (asDouble) place(chosen, slot + 1);
      }
    }
  }
  await prisma.timetable.createMany({ data: timetableRows });
  console.log(
    `  ✅ ${timetableRows.length}/${demandTotal} weighted timetable periods placed across ${sectionMetas.length} classes`,
  );

  // ─── PROFILE AVATARS ────────────────────────────────────────────────────────
  // Deterministic duotone SVG initials written into uploads/avatars - real
  // files served by the API, exercising the same pipeline uploaded photos
  // use. Coverage varies like a real school's: all demo accounts, nearly
  // all staff, most students, under half of parents, few alumni.
  const AVATAR_PALETTES: [string, string][] = [
    ['#1B4F72', '#2E86C1'],
    ['#145A32', '#27AE60'],
    ['#6E2C00', '#CA6F1E'],
    ['#4A235A', '#8E44AD'],
    ['#641E16', '#C0392B'],
    ['#154360', '#5DADE2'],
    ['#0B5345', '#16A085'],
    ['#7B241C', '#E74C3C'],
    ['#1C2833', '#566573'],
    ['#7D6608', '#B7950B'],
  ];
  const avatarsDir = join(uploadsDir, 'avatars');
  rmSync(avatarsDir, { recursive: true, force: true });
  mkdirSync(avatarsDir, { recursive: true });
  const avatarSvg = (first: string, last: string, key: number): string => {
    const [a, b] = AVATAR_PALETTES[key % AVATAR_PALETTES.length];
    const initials = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">` +
      `<rect width="160" height="160" fill="${a}"/>` +
      `<path d="M0 160 L160 0 L160 160 Z" fill="${b}" opacity="0.85"/>` +
      `<text x="80" y="80" dy="0.36em" text-anchor="middle" ` +
      `font-family="Arial, Helvetica, sans-serif" font-size="62" ` +
      `font-weight="700" fill="#FFFFFF">${initials}</text></svg>`
    );
  };
  const hashOf = (s: string) => {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  const photoRows: { id: string; url: string }[] = [];
  const giveAvatar = (user: any, always = false, prob = 1) => {
    if (!always && !chance(prob)) return;
    const file = `${user.id}.svg`;
    writeFileSync(
      join(avatarsDir, file),
      avatarSvg(user.firstName, user.lastName, hashOf(user.id)),
    );
    photoRows.push({ id: user.id, url: `/uploads/avatars/${file}` });
  };
  giveAvatar(admin, true);
  giveAvatar(librarianUser, true);
  teacherUsers.forEach((u, i) => giveAvatar(u, i === 0, 0.95));
  studentUsers.forEach((u, i) => giveAvatar(u, i === 0, 0.85));
  parentUsers.forEach((u) => giveAvatar(u, u.id === demoParent.id, 0.45));
  alumni.forEach((a) => giveAvatar(a.user, false, 0.25));
  for (let i = 0; i < photoRows.length; i += 500) {
    const values = photoRows
      .slice(i, i + 500)
      .map((r) => `('${r.id}'::text, '${r.url}'::text)`)
      .join(',');
    await prisma.$executeRawUnsafe(
      `UPDATE users u SET photo_url = v.p FROM (VALUES ${values}) AS v(id, p) WHERE u.id = v.id`,
    );
  }
  console.log(`  ✅ ${photoRows.length} profile avatars generated and linked`);

  // ─── SIGNS OF LIFE (created dates, last logins) ─────────────────────────────
  // The school adopted Markova a week before the 2024-25 year opened: staff
  // accounts first, then the student and guardian import waves, and each
  // later September its own onboarding. Logins spread like a live school's:
  // admins daily, teachers on weekdays, students in bursts, a share of
  // parents never activated, alumni dormant. Raw SQL keeps updated_at from
  // stamping the seed instant on everyone.
  const adoption = addDays(allYears[1].year.startDate, -7);
  const maxDate = (a: Date, b: Date) => (a > b ? a : b);
  const withTime = (d: Date, hUtc: number) =>
    new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hUtc, rand(60)),
    );
  const recentLogin = (daysBack: number) => {
    let d = addDays(today, -rand(daysBack + 1));
    const dow = d.getUTCDay();
    if (dow === 0) d = addDays(d, -2);
    if (dow === 6) d = addDays(d, -1);
    return withTime(d, 4 + rand(14)); // 06:00-20:00 Kigali
  };
  type LifeRow = { id: string; created: Date; login: Date | null; seen: Date | null };
  const lifeRows: LifeRow[] = [];
  const life = (id: string, created: Date, login: Date | null) => {
    lifeRows.push({
      id,
      created,
      login,
      seen: login ? new Date(login.getTime() + (5 + rand(35)) * 60000) : null,
    });
  };
  life(admin.id, addDays(adoption, -3), recentLogin(1));
  life(librarianUser.id, addDays(adoption, 2), recentLogin(2));
  for (let i = 0; i < teacherUsers.length; i++) {
    const created = addDays(maxDate(adoption, teachers[i].hireDate), rand(10));
    const r = Math.random();
    const login =
      i === 0
        ? recentLogin(1)
        : r < 0.7
          ? recentLogin(3)
          : r < 0.95
            ? recentLogin(14)
            : recentLogin(42);
    life(teacherUsers[i].id, created, login);
  }
  for (let i = 0; i < enrolled.length; i++) {
    const joinIdx = Math.min(...enrolled[i].placements.map((pl) => pl.yearIdx));
    const created = addDays(
      maxDate(adoption, allYears[joinIdx].year.startDate),
      3 + rand(21),
    );
    const r = Math.random();
    const login =
      i === 0
        ? recentLogin(1)
        : r < 0.5
          ? recentLogin(3)
          : r < 0.8
            ? recentLogin(14)
            : r < 0.95
              ? recentLogin(56)
              : null;
    life(studentUsers[i].id, created, login);
  }
  for (const pu of parentUsers) {
    const r = Math.random();
    const login =
      pu.id === demoParent.id
        ? recentLogin(1)
        : r < 0.4
          ? recentLogin(7)
          : r < 0.65
            ? recentLogin(30)
            : r < 0.85
              ? recentLogin(180)
              : null;
    life(pu.id, addDays(adoption, rand(75)), login);
  }
  for (const a of alumni) {
    life(a.student.userId, addDays(adoption, 20 + rand(40)), null);
  }
  for (let i = 0; i < lifeRows.length; i += 500) {
    const chunk = lifeRows.slice(i, i + 500);
    const values = chunk
      .map((r) => {
        const c = `'${r.created.toISOString()}'::timestamptz`;
        const l = r.login
          ? `'${r.login.toISOString()}'::timestamptz`
          : 'NULL::timestamptz';
        const s = r.seen
          ? `'${r.seen.toISOString()}'::timestamptz`
          : 'NULL::timestamptz';
        return `('${r.id}'::text, ${c}, ${l}, ${s})`;
      })
      .join(',');
    await prisma.$executeRawUnsafe(
      `UPDATE users u SET created_at = v.c, ` +
        `updated_at = GREATEST(v.c, COALESCE(v.l, v.c)), ` +
        `last_login_at = v.l, last_seen_at = v.s ` +
        `FROM (VALUES ${values}) AS v(id, c, l, s) WHERE u.id = v.id`,
    );
  }
  const neverActivated = lifeRows.filter((r) => !r.login).length;
  console.log(
    `  ✅ Signs of life: ${lifeRows.length} accounts carry real created/login dates (${neverActivated} never activated)`,
  );

  const oClasses = sectionMetas.filter((m) => !m.trade).length;
  const aClasses = sectionMetas.length - oClasses;
  console.log('\n🎉 Seed completed successfully!');
  console.log(
    `   ${teachers.length} teachers · ${students.length} students · ${parentUsers.length} parents`,
  );
  console.log(
    `   ${oClasses} O-Level classes (Senior 1-3, streams A-B) + ${aClasses} A-Level classes (Level 3-5 × SWD/NIT/TOR/AUT)`,
  );
  console.log(
    `   3 academic years of records · ${alumni.length} former students filling the past classes`,
  );
  console.log(
    `   ${families.filter((f) => f.studentIds.length > 0).length} lineage families (${inheritedKids} students carry an inherited name)`,
  );
  console.log('   Default password for all users: Password123!');
  console.log('   Demo accounts (no forced password change):');
  console.log('     Admin     wilsonshizirungu@gmail.com');
  console.log('     Teacher   aline.uwase@markova.edu');
  console.log('     Student   student1@markova.edu');
  console.log('     Librarian librarian@markova.edu');
  console.log('     Bursar    bursar@markova.edu');
  console.log('     Parent    +250788100000 (phone login)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
