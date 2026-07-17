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
  EducationStage,
  SubjectScope,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  computeSubjectTotal,
  countsTowardAggregate,
  gradeFor,
  overallGrade,
  MAX_POINTS_PER_SUBJECT,
} from '../src/common/grading';

const prisma = new PrismaClient();

// ─── NAME POOLS ──────────────────────────────────────────────────────────────
// Rwandan naming, done properly:
//  - children do NOT inherit a surname; each gets their own Kinyarwanda name
//  - students (13-19) carry modern names, adults carry their generation's
//  - every Kinyarwanda and Western name is gendered (or explicitly unisex)
//  - a small minority of students carry a rare lineage name passed down from
//    a parent; those names stay inside one family

// Adults (teachers, parents) — Western first names of their generation.
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

// Adults — Kinyarwanda names, gendered.
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

// Students — modern Kinyarwanda names (Gen-Z / Gen-Alpha), gendered.
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

// Students — modern Western/Christian first names.
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
// pool is used up — this spreads repeats as thinly as the pool allows.
function dealer(pool: string[]) {
  let deck = shuffled(pool);
  return () => {
    if (deck.length === 0) deck = shuffled(pool);
    return deck.pop()!;
  };
}

// ─── NAME GENERATION ─────────────────────────────────────────────────────────

// initial.kinyarwandaname@markova.edu — collisions get a number, so the
// address is short, memorable and still unique.
const usedEmails = new Set<string>();
function emailFor(first: string, last: string): string {
  const base = `${first.trim()[0].toLowerCase()}.${last.split(' ')[0].toLowerCase()}`;
  let candidate = `${base}@markova.edu`;
  for (let n = 2; usedEmails.has(candidate); n++) {
    candidate = `${base}${n}@markova.edu`;
  }
  usedEmails.add(candidate);
  return candidate;
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
// All demo dates are derived from "now" so the data always looks current — the
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

/** The most recent `count` weekdays (Mon–Fri), ending with today if it's a weekday. */
function recentWeekdays(count: number): Date[] {
  const out: Date[] = [];
  const cursor = startOfToday();
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(new Date(cursor));
    cursor.setTime(cursor.getTime() - MS_DAY);
  }
  return out;
}

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

  // Make the seed idempotent — clear everything first so it can be re-run
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
  ].forEach((e) => usedEmails.add(e));

  // ─── SCHOOL CONFIG ──────────────────────────────────────────────────────────
  const configs = [
    { key: 'school_name', value: 'Markova Academy' },
    { key: 'school_motto', value: 'Excellence Through Knowledge' },
    { key: 'logo_url', value: '/uploads/logo.png' },
    // No stamp or signature images ship with the demo; empty means the
    // school has not uploaded them yet, so nothing requests missing files.
    { key: 'stamp_url', value: '' },
    { key: 'signature_url', value: '' },
    { key: 'primary_color', value: '#1B4F72' },
    { key: 'starting_discipline_points', value: '100' },
    { key: 'borrowing_limit', value: '3' },
    { key: 'borrowing_duration_days', value: '14' },
    { key: 'pass_threshold', value: '50' },
    { key: 'school_address', value: 'KG 7 Ave, Kacyiru, Kigali, Rwanda' },
    { key: 'school_phone', value: '+250788000000' },
    { key: 'school_email', value: 'info@markova.edu' },
    { key: 'email_provider', value: 'smtp' },
  ];
  // logo_url must point at a real file: copy the bundled mark into uploads.
  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  // The mark-only version: the UI prints the school name as text wherever
  // it is needed, so the logo itself stays clean.
  const logoSrc = join(process.cwd(), 'assets', 'logo-mark.png');
  if (existsSync(logoSrc)) {
    copyFileSync(logoSrc, join(uploadsDir, 'logo.png'));
  }

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
      phone: '+250788000001',
      code: `ADM-${new Date().getFullYear()}-001`,
      passwordHash,
      role: Role.ADMIN,
      firstName: 'Wilson',
      lastName: 'Nshizirungu',
      isActive: true,
      forcePasswordChange: false, // demo account — log straight into dashboard
    },
  });
  console.log('  ✅ Admin user seeded');

  // ─── TEACHERS (40) ──────────────────────────────────────────────────────────
  // No two teachers share any name component — 40 staff with a repeated name
  // would read as fake immediately.
  const TEACHER_COUNT = 40;
  // The demo teacher keeps the address documented in CLAUDE.md; the other
  // fixed staff follow the i.name scheme like everyone else.
  const fixedTeachers = [
    { firstName: 'Aline', lastName: 'Uwase', email: 'aline.uwase@markova.edu', phone: '+250788000010' },
    { firstName: 'Eric', lastName: 'Niyonkuru', email: emailFor('Eric', 'Niyonkuru'), phone: '+250788000011' },
    { firstName: 'Diane', lastName: 'Mukamana', email: emailFor('Diane', 'Mukamana'), phone: '+250788000012' },
    { firstName: 'Patrick', lastName: 'Habimana', email: emailFor('Patrick', 'Habimana'), phone: '+250788000013' },
    { firstName: 'Solange', lastName: 'Ingabire', email: emailFor('Solange', 'Ingabire'), phone: '+250788000014' },
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
    });
  }
  const teacherData = [...fixedTeachers, ...generatedTeachers];

  const teacherUsers: any[] = [];
  const teachers: any[] = [];
  for (let ti = 0; ti < teacherData.length; ti++) {
    const td = teacherData[ti];
    const user = await prisma.user.create({
      data: {
        email: td.email,
        phone: td.phone,
        code: `TCH-${new Date().getFullYear()}-${String(ti + 1).padStart(3, '0')}`,
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
        isActive: true,
      },
    });
    teacherUsers.push(user);
    teachers.push(teacher);
  }
  console.log(`  ✅ ${teachers.length} teachers seeded (no shared name components)`);

  // ─── LIBRARIAN ──────────────────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      email: 'librarian@markova.edu',
      phone: '+250788000020',
      code: `LIB-${new Date().getFullYear()}-001`,
      passwordHash,
      role: Role.LIBRARIAN,
      firstName: 'Josiane',
      lastName: 'Mutoni',
      isActive: true,
      forcePasswordChange: false, // demo account
    },
  });
  console.log('  ✅ Librarian seeded');

  // ─── ACADEMIC YEAR & TERMS ──────────────────────────────────────────────────
  // Anchored to today: Term 1 is the *current* term and its window contains
  // today, so every term selector defaults to a term that actually has data.
  const today = startOfToday();
  const yr = today.getFullYear();
  // Three school years: the two past ones are fully closed and graded; in the
  // current one Terms 1-2 are done and Term 3 contains today.
  const term1Start = addDays(today, -224);
  type YearBundle = { year: any; terms: any[] };
  const allYears: YearBundle[] = [];
  for (let yearIdx = 0; yearIdx < 3; yearIdx++) {
    const back = 2 - yearIdx; // 2, 1, 0 years ago
    const start = addDays(term1Start, -365 * back);
    const year = await prisma.academicYear.create({
      data: {
        name: `${yr - back}-${yr - back + 1}`,
        startDate: start,
        endDate: addDays(start, 294),
        isCurrent: back === 0,
      },
    });
    const offsets = [
      { name: 'Term 1', from: 0, to: 84 },
      { name: 'Term 2', from: 98, to: 189 },
      { name: 'Term 3', from: 203, to: 294 },
    ];
    const yearTerms: any[] = [];
    for (let i = 0; i < offsets.length; i++) {
      const t = await prisma.term.create({
        data: {
          academicYearId: year.id,
          name: offsets[i].name,
          startDate: addDays(start, offsets[i].from),
          endDate: addDays(start, offsets[i].to),
          isCurrent: back === 0 && i === 2,
          isClosed: back > 0 || i < 2,
        },
      });
      yearTerms.push(t);
    }
    allYears.push({ year, terms: yearTerms });
  }
  const academicYear = allYears[2].year;
  const terms = allYears[2].terms;
  const currentTerm = terms[2];
  console.log('  ✅ 3 academic years + 9 terms seeded (Term 3 of the newest is current)');

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
    // the rest stream A only — so a level totals 7 or 8 classes.
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
  // Kinyarwanda + Entrepreneurship are taught at both stages — reuse core rows.
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
  // DOS, two HoDs, plus one class teacher per class.
  await prisma.teacherRole.create({
    data: { teacherId: teachers[0].id, role: SpecialRole.DOS },
  });
  await prisma.teacherRole.create({
    data: { teacherId: teachers[1].id, role: SpecialRole.HOD, department: 'Sciences' },
  });
  await prisma.teacherRole.create({
    data: { teacherId: teachers[2].id, role: SpecialRole.HOD, department: 'Humanities' },
  });
  for (let i = 0; i < sectionMetas.length; i++) {
    const teacherIdx = (i + 3) % teachers.length;
    await prisma.teacherRole.create({
      data: {
        teacherId: teachers[teacherIdx].id,
        role: SpecialRole.CLASS_TEACHER,
        classSectionId: sectionMetas[i].section.id,
      },
    });
  }
  console.log('  ✅ Teacher special roles seeded');

  // ─── TEACHER-SUBJECT-CLASS ASSIGNMENTS ──────────────────────────────────────
  // Each class gets its own subject set taught by cycling teachers. The
  // teacher for (class, subject) is deterministic so marks reference the same
  // teacher as the assignment.
  const teacherFor = (sectionIdx: number, subjectIdx: number) =>
    teachers[(sectionIdx + subjectIdx) % teachers.length];

  const assignmentRows: any[] = [];
  for (let si = 0; si < sectionMetas.length; si++) {
    const meta = sectionMetas[si];
    const subjectSet = subjectsForSection(meta);
    for (let subj = 0; subj < subjectSet.length; subj++) {
      assignmentRows.push({
        teacherId: teacherFor(si, subj).id,
        subjectId: subjectSet[subj].id,
        classSectionId: meta.section.id,
        academicYearId: academicYear.id,
      });
    }
  }
  await prisma.teacherSubjectClass.createMany({ data: assignmentRows });
  console.log(`  ✅ ${assignmentRows.length} teacher-subject-class assignments seeded`);

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
    if (cands.length === 0) return null; // past classes full — came from elsewhere
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
      const joinYear =
        yr - 2 + Math.min(...journey.placements.map((p) => p.yearIdx));

      const user = await prisma.user.create({
        data: {
          email: i === 0 ? 'student1@markova.edu' : emailFor(first, last),
          passwordHash,
          role: Role.STUDENT,
          firstName: first,
          lastName: last,
          isActive: true,
          forcePasswordChange: i !== 0, // student1 is the demo account
        },
      });
      // S1 → ~13 yrs … L5 → ~19 yrs; repeaters are a year older per repeat.
      const ageBase = 11 + meta.level.order + rand(2) + journey.repeats;
      const student = await prisma.student.create({
        data: {
          userId: user.id,
          studentIdNumber: `STD-${joinYear}-${String(i + 1).padStart(4, '0')}`,
          classSectionId: meta.section.id,
          dateOfBirth: new Date(
            `${yr - ageBase}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
          ),
          gender,
          status: StudentStatus.ACTIVE,
          disciplinePoints: 100,
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

  // ─── PARENTS (400) ──────────────────────────────────────────────────────────
  // Lineage families get a real father+mother pair (the line parent carries
  // the family name). Everyone else draws from the generic pools, alternating
  // genders so Father/Mother relationships always match the person.
  const PARENT_COUNT = 400;
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
    const user = await prisma.user.create({
      data: {
        phone: i === 0 ? '+250788100000' : realPhone(),
        code: `PAR-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
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

  // Generic parents, alternating genders: even index male, odd female.
  const genericFathers: any[] = [demoParent];
  const genericMothers: any[] = [];
  while (parentUsers.length < PARENT_COUNT) {
    const gender =
      genericFathers.length <= genericMothers.length
        ? Gender.MALE
        : Gender.FEMALE;
    const u = await createParent(gender);
    (gender === Gender.MALE ? genericFathers : genericMothers).push(u);
  }

  // Link lineage kids to their real parents.
  const parentLinkRows: any[] = [];
  const linkedStudentIds = new Set<string>();
  for (const fam of families) {
    const pair = familyParents.get(fam.id);
    if (!pair) continue;
    for (const studentId of fam.studentIds) {
      parentLinkRows.push(
        { parentUserId: pair.father.id, studentId, relationship: 'Father' },
        { parentUserId: pair.mother.id, studentId, relationship: 'Mother' },
      );
      linkedStudentIds.add(studentId);
    }
  }

  // Everyone else: 1-2 parents, cycling the generic pools.
  let fCursor = 0;
  let mCursor = 0;
  for (let si = 0; si < students.length; si++) {
    if (linkedStudentIds.has(students[si].id)) continue;
    const father = genericFathers[fCursor++ % genericFathers.length];
    parentLinkRows.push({
      parentUserId: father.id,
      studentId: students[si].id,
      relationship: 'Father',
    });
    if (si % 4 !== 0) {
      const mother = genericMothers[mCursor++ % genericMothers.length];
      parentLinkRows.push({
        parentUserId: mother.id,
        studentId: students[si].id,
        relationship: 'Mother',
      });
    }
  }
  await prisma.parentStudent.createMany({ data: parentLinkRows });
  console.log(
    `  ✅ ${parentUsers.length} parents seeded (${familyParents.size} lineage families) and linked`,
  );

  // ─── FORMER STUDENTS (fill the two past years to real class sizes) ──────────
  // Everyone who shared those classrooms but is gone today: Level 5 finishers
  // are GRADUATED, everyone else who left is TRANSFERRED. They exist so every
  // past rank and class average is computed against a full class. Their user
  // accounts are inactive, so they cannot log in.
  type Alumni = { student: any; placements: Placement[] };
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
      yr - 2 + Math.min(...placements.map((p) => p.yearIdx));
    const age = 11 + last.level.order + rand(2) + repeats + yearsGone;
    const user = await prisma.user.create({
      data: {
        email: emailFor(name.first, name.last),
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
        studentIdNumber: `STD-${joinYear}-${String(i + 1).padStart(4, '0')}`,
        classSectionId: last.section.id,
        dateOfBirth: new Date(
          `${yr - age}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
        ),
        gender,
        status:
          last.level.order === 6
            ? StudentStatus.GRADUATED
            : StudentStatus.TRANSFERRED,
        disciplinePoints: 100,
      },
    });
    alumni.push({ student, placements });
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

  // ─── MARKS (Term 1, full assessment structure) ──────────────────────────────
  // Every student is graded in every subject of their class: CAT 1, CAT 2 and
  // End of Term Exam everywhere, plus Practical on trade-specific modules.
  const markRows: any[] = [];
  const sectionIndexBySectionId = new Map(
    sectionMetas.map((m, idx) => [m.section.id, idx]),
  );

  // Every person (current and former) keeps one baseline ability and one
  // long-term drift anchored at the current year, so a child's line over up
  // to 9 terms tells a single story: improving, steady or slipping. A failed
  // (repeated) year dips ~8 points below their curve; per-subject strengths
  // persist across the years.
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
      const si = sectionIndexBySectionId.get(pl.meta.section.id)!;
      const subjectSet = subjectsForSection(pl.meta);
      for (let ti = 0; ti < yearTerms.length; ti++) {
        const g = pl.yearIdx * 3 + ti; // global term index, current year = 6..8
        const ability = clamp(
          baseline + drift * (g - 6) - (pl.failed ? 8 : 0),
          25,
          92,
        );

        for (let subj = 0; subj < subjectSet.length; subj++) {
          const subject = subjectSet[subj];
          const teacher = teacherFor(si, subj);
          const sKey = `${student.id}|${subject.id}`;
          if (!strength.has(sKey)) strength.set(sKey, rand(21) - 10);
          const perSubject = clamp(ability + strength.get(sKey)!, 25, 95);
          const components =
            subject.scope === SubjectScope.A_SPECIFIC
              ? ['CAT 1', 'CAT 2', 'Practical', 'End of Term Exam']
              : ['CAT 1', 'CAT 2', 'End of Term Exam'];

          for (const assessmentName of components) {
            // Practicals trend a bit higher (hands-on), exams a bit lower.
            const bias =
              assessmentName === 'Practical'
                ? 6
                : assessmentName === 'End of Term Exam'
                  ? -4
                  : 0;
            const score = clamp(perSubject + bias + rand(17) - 8, 20, 98);
            markRows.push({
              studentId: student.id,
              subjectId: subject.id,
              classSectionId: pl.meta.section.id,
              termId: yearTerms[ti].id,
              assessmentTypeId: assessmentByName.get(assessmentName).id,
              score,
              maxScore: 100,
              teacherId: teacher.id,
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

  // Who sat in which class, each year — current students and alumni alike.
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
  for (const term of allYears[yearIdx].terms)
  for (const meta of sectionMetas) {
    const classStudents = membership.get(occKey(yearIdx, meta.section.id)) ?? [];
    const computed: any[] = [];

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
        isPublished: true,
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

  // ─── ATTENDANCE (last 10 weekdays, incl. today) ─────────────────────────────
  // Anchored to today so the attendance dashboard (which defaults to today)
  // always has data to show.
  const attendanceDates = recentWeekdays(10);
  const attRows: any[] = [];
  for (const date of attendanceDates) {
    for (const { student, meta } of enrolled) {
      const si = sectionIndexBySectionId.get(meta.section.id)!;
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
        studentId: student.id,
        classSectionId: meta.section.id,
        date,
        type: 'daily',
        status,
        reasonCategory: reason,
        markedByUserId: teacherUsers[si % teacherUsers.length].id,
      });
    }
  }
  for (let i = 0; i < attRows.length; i += 5000) {
    await prisma.attendance.createMany({ data: attRows.slice(i, i + 5000) });
  }
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
        termId: currentTerm.id,
        recordedByUserId: teacherUsers[i % teacherUsers.length].id,
        date: addDays(today, -((i % 28) + 1)), // within the last 4 weeks
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
  // 20 active loans. Most are due in the future; the last 3 are intentionally
  // overdue so the overdue list/reminders are demonstrable without the whole
  // library looking delinquent.
  for (let i = 0; i < 20; i++) {
    const dueDate =
      i < 17
        ? addDays(today, 5 + (i % 9)) // due 5-13 days out
        : addDays(today, -(2 + (i - 17) * 2)); // 3 loans overdue by 2-6 days
    const checkedOutAt = addDays(today, -(7 + (i % 5)));
    await prisma.bookLoan.create({
      data: {
        bookId: books[i % books.length].id,
        borrowerUserId: studentUsers[i].id,
        checkedOutAt,
        dueDate,
        status: LoanStatus.ACTIVE,
      },
    });
    await prisma.book.update({
      where: { id: books[i % books.length].id },
      data: { availableCount: { decrement: 1 } },
    });
  }
  console.log(`  ✅ ${books.length} books + 20 active loans (3 overdue) seeded`);

  // ─── HOMEWORK ───────────────────────────────────────────────────────────────
  // One homework per subject for Senior 1 A so multiple appear on a student's
  // dashboard.
  const s1aSubjects = subjectsForSection(sectionMetas[0]);
  const hwDueDate = new Date();
  hwDueDate.setDate(hwDueDate.getDate() + 7);
  for (let i = 0; i < Math.min(s1aSubjects.length, 8); i++) {
    const hw = await prisma.homework.create({
      data: {
        teacherId: teacherFor(0, i).id,
        subjectId: s1aSubjects[i].id,
        classSectionId: sectionMetas[0].section.id,
        termId: currentTerm.id,
        title: `${s1aSubjects[i].name} — Practice Set ${i + 1}`,
        description: 'Complete the prescribed exercises and submit on time.',
        dueDate: hwDueDate,
        maxMarks: 20,
        lateDeductionPerDay: 2,
      },
    });
    // First 5 students in S1 A submit.
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
        message: 'You have been assigned to teach Mathematics for Senior 1 A.',
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
  // A full week for every class from its own subject set. A teacher is never
  // booked in two classes during the same period; if every teacher of a class
  // is busy in a slot, that slot stays free (which real timetables have too).
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
  const timetableRows: any[] = [];
  const busyTeachers = new Map<string, Set<string>>(); // "day-slot" -> teacher ids
  for (let si = 0; si < sectionMetas.length; si++) {
    const meta = sectionMetas[si];
    const subjectSet = subjectsForSection(meta);
    for (const day of days) {
      for (let slot = 0; slot < Math.min(timeSlots.length, subjectSet.length); slot++) {
        const key = `${day}-${slot}`;
        if (!busyTeachers.has(key)) busyTeachers.set(key, new Set());
        const taken = busyTeachers.get(key)!;
        let subjectIdx = -1;
        for (let probe = 0; probe < subjectSet.length; probe++) {
          const candidate = (day * 3 + slot + si + probe) % subjectSet.length;
          if (!taken.has(teacherFor(si, candidate).id)) {
            subjectIdx = candidate;
            break;
          }
        }
        if (subjectIdx === -1) continue; // all of this class's teachers are busy
        const teacher = teacherFor(si, subjectIdx);
        taken.add(teacher.id);
        timetableRows.push({
          classSectionId: meta.section.id,
          subjectId: subjectSet[subjectIdx].id,
          teacherId: teacher.id,
          dayOfWeek: day,
          startTime: timeSlots[slot].start,
          endTime: timeSlots[slot].end,
          room: `Room ${100 + (si % 20)}`,
        });
      }
    }
  }
  await prisma.timetable.createMany({ data: timetableRows });
  console.log(
    `  ✅ ${timetableRows.length} timetable entries seeded across all ${sectionMetas.length} classes`,
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
