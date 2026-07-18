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
  AppealStatus,
  ConversationType,
  MessageContentType,
  NotificationType,
  EducationStage,
  SubjectScope,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { TeacherQualification } from '@prisma/client';
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
      gender: Gender.MALE,
      dateOfBirth: new Date('1988-03-12'),
      nationalId: makeNid(Gender.MALE, 1988),
      nationality: 'Rwandan',
      passwordHash,
      role: Role.ADMIN,
      firstName: 'Wilson',
      lastName: 'Nshizirungu',
      isActive: true,
      forcePasswordChange: false, // demo account — log straight into dashboard
    },
  });
  console.log('  ✅ Admin user seeded');

  // ─── LIBRARIAN ──────────────────────────────────────────────────────────────
  await prisma.user.create({
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

  // ─── ACADEMIC YEAR & TERMS (real MINEDUC calendars) ─────────────────────────
  // The official term windows as published by the Ministry of Education. The
  // seed carries the three most recent school years that have started as of
  // today. When today falls in a holiday gap (between terms, or after Term 3
  // like every July-August), the most recent term's end date is stretched to
  // today+3 so the demo always has a live current term — that stretch is the
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
  // end we are in a school holiday — stretch it (see above).
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

  // ─── WEEKLY PERIOD WEIGHTS ──────────────────────────────────────────────────
  // 8 periods a day, 40 a week. O-Level: the national allocation — core
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
  }; // 12 — trade modules share the remaining 28

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
  // No two teachers share any name component — 40 staff with a repeated name
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
        hireDate: new Date(Date.UTC(yrNow - rand(12), 8, 1)),
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
      const joinIdx = Math.min(...journey.placements.map((p) => p.yearIdx));
      const joinYear = allYears[joinIdx].year.startDate.getUTCFullYear();
      const earliest = journey.placements[journey.placements.length - 1];

      // S1 → ~13 yrs … L5 → ~19 yrs; repeaters are a year older per repeat.
      const ageBase = 11 + meta.level.order + rand(2) + journey.repeats;
      const dob = new Date(
        `${yr - ageBase}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
      );
      // NIDA issues IDs from the 16th birthday — gate on the real age, not
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
          email: i === 0 ? 'student1@markova.edu' : emailFor(first, last),
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
          studentIdNumber: `STD-${joinYear}-${String(i + 1).padStart(4, '0')}`,
          classSectionId: meta.section.id,
          dateOfBirth: dob,
          gender,
          status: StudentStatus.ACTIVE,
          disciplinePoints: 100,
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

  // Everyone else: 1-2 parents, cycling the generic pools.
  let fCursor = 0;
  let mCursor = 0;
  for (let si = 0; si < students.length; si++) {
    if (linkedStudentIds.has(students[si].id)) continue;
    const father = genericFathers[fCursor++ % genericFathers.length];
    const guardians: { father?: any; mother?: any } = { father };
    parentLinkRows.push({
      parentUserId: father.id,
      studentId: students[si].id,
      relationship: 'Father',
    });
    if (si % 4 !== 0) {
      const mother = genericMothers[mCursor++ % genericMothers.length];
      guardians.mother = mother;
      parentLinkRows.push({
        parentUserId: mother.id,
        studentId: students[si].id,
        relationship: 'Mother',
      });
    }
    guardianByStudent.set(students[si].id, guardians);
  }
  await prisma.parentStudent.createMany({ data: parentLinkRows });

  // The guardian names printed on a student's record must match the linked
  // parent accounts wherever those exist.
  for (const [studentId, g] of guardianByStudent) {
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
        studentIdNumber: `STD-${joinYear}-${String(i + 1).padStart(4, '0')}`,
        classSectionId: last.section.id,
        dateOfBirth: dob,
        gender,
        status:
          last.level.order === 6
            ? StudentStatus.GRADUATED
            : StudentStatus.TRANSFERRED,
        disciplinePoints: 100,
        ...extras.student,
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
  for (const term of allYears[yearIdx].terms.filter(termBegun))
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
      const pts = isMajor ? 10 + rand(6) : isModerate ? 5 + rand(4) : 2 + rand(3);
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
      // Points reset each term, so only the running term's deductions show.
      if (term.id === currentTerm.id) {
        await prisma.student.update({
          where: { id: student.id },
          data: { disciplinePoints: { decrement: pts } },
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
        teacherId: teacherOf(sectionMetas[0].section.id, s1aSubjects[i].id).id,
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
        //    is free — first one not yet seen today, then allowing a second
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
