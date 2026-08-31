"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const conduct_1 = require("../src/common/conduct");
const fees_1 = require("../src/common/fees");
const branding_install_1 = require("../src/common/branding-install");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path_1 = require("path");
const client_2 = require("@prisma/client");
const student_id_1 = require("../src/common/student-id");
const grading_1 = require("../src/common/grading");
const report_comments_1 = require("../src/common/report-comments");
const notification_target_1 = require("../src/common/notification-target");
const prisma = new client_1.PrismaClient();
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
const STUDENT_KINYA_UNISEX = [
    'Ishimwe', 'Iradukunda', 'Irakoze', 'Mahoro', 'Amani', 'Gwiza', 'Shimwa',
    'Tetero', 'Hobe', 'Kunda', 'Sangwa', 'Cyuzuzo', 'Muhoza', 'Sano',
    'Ihirwe', 'Iranzi', 'Isheja', 'Nema',
];
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
const A_GENERAL_SUBJECTS = [
    { name: 'English (Communication Skills)', category: 'Languages' },
    { name: 'Mathematics for Technology', category: 'Sciences' },
    { name: 'Basic ICT', category: 'Sciences' },
];
const A_SHARED_CORE_NAMES = ['Kinyarwanda', 'Entrepreneurship'];
const TRADE_MODULES = {
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
const ASSESSMENT_NAMES = ['CAT 1', 'CAT 2', 'Practical', 'End of Term Exam'];
const rand = (n) => Math.floor(Math.random() * n);
const sample = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function shuffled(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = rand(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
function dealer(pool) {
    let deck = shuffled(pool);
    return () => {
        if (deck.length === 0)
            deck = shuffled(pool);
        return deck.pop();
    };
}
const issuedStudentIds = new Set();
function studentNumber(first, last, year, key) {
    for (let nonce = 0; nonce < 50; nonce++) {
        const id = (0, student_id_1.buildStudentId)((0, student_id_1.studentIdSecret)(), {
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
const usedEmails = new Set();
function emailFor(first, last) {
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
const usedNids = new Set();
function makeNid(gender, birthYear, status = '1') {
    for (;;) {
        let order = '';
        for (let i = 0; i < 7; i++)
            order += rand(10);
        const nid = `${status}${birthYear}${gender === client_1.Gender.MALE ? '8' : '7'}${order}0${String(rand(100)).padStart(2, '0')}`;
        if (!usedNids.has(nid)) {
            usedNids.add(nid);
            return nid;
        }
    }
}
function studentExtras(gender, birthYear, age, joinLevelOrder, joinYearStart) {
    const natRoll = rand(100);
    const nationality = natRoll < 96 ? 'Rwandan' : natRoll < 98 ? 'Congolese' : 'Burundian';
    const status = nationality === 'Rwandan' ? '1' : nationality === 'Burundian' ? '2' : '3';
    const isBoarder = chance(0.28);
    const area = sample((isBoarder ? chance(0.85) : chance(0.06)) ? UPCOUNTRY_AREAS : KIGALI_AREAS);
    const religionRoll = rand(100);
    return {
        user: {
            nationalId: age >= 16 && chance(0.9) ? makeNid(gender, birthYear, status) : null,
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
            religion: religionRoll < 45
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
            previousSchool: joinLevelOrder <= 1 ? sample(PRIMARY_SCHOOLS) : sample(SECONDARY_SCHOOLS),
            enrollmentDate: joinYearStart,
            fatherName: `${sample(ADULT_WESTERN_MALE)} ${sample(ADULT_KINYA_MALE)}`,
            motherName: `${sample(ADULT_WESTERN_FEMALE)} ${sample(ADULT_KINYA_FEMALE)}`,
        },
    };
}
const usedPhones = new Set([
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
function realPhone() {
    for (;;) {
        let digits = '';
        for (let i = 0; i < 7; i++)
            digits += rand(10);
        const phone = `+250${sample(PHONE_PREFIXES)}${digits}`;
        if (!usedPhones.has(phone)) {
            usedPhones.add(phone);
            return phone;
        }
    }
}
const usedFullNames = new Set();
const nameKey = (first, last) => `${first} ${last}`.toLowerCase();
function claimFullName(first, last) {
    const key = nameKey(first, last);
    if (usedFullNames.has(key))
        return false;
    usedFullNames.add(key);
    return true;
}
const adultWestern = {
    [client_1.Gender.MALE]: dealer(ADULT_WESTERN_MALE),
    [client_1.Gender.FEMALE]: dealer(ADULT_WESTERN_FEMALE),
};
const adultKinya = {
    [client_1.Gender.MALE]: dealer(ADULT_KINYA_MALE),
    [client_1.Gender.FEMALE]: dealer(ADULT_KINYA_FEMALE),
};
function adultName(gender, opts) {
    for (let t = 0; t < 200; t++) {
        const first = adultWestern[gender]();
        const last = opts?.kinyaOverride ?? adultKinya[gender]();
        if (claimFullName(first, last))
            return { first, last };
    }
    throw new Error('adult name space exhausted');
}
const studentWestern = {
    [client_1.Gender.MALE]: dealer(STUDENT_WESTERN_MALE),
    [client_1.Gender.FEMALE]: dealer(STUDENT_WESTERN_FEMALE),
};
const studentKinya = {
    [client_1.Gender.MALE]: dealer([...STUDENT_KINYA_MALE, ...STUDENT_KINYA_UNISEX]),
    [client_1.Gender.FEMALE]: dealer([...STUDENT_KINYA_FEMALE, ...STUDENT_KINYA_UNISEX]),
};
function studentName(gender, classCounts, inheritedLast) {
    for (let t = 0; t < 300; t++) {
        const western1 = studentWestern[gender]();
        const western2 = chance(0.25) ? studentWestern[gender]() : null;
        const first = western2 && western2 !== western1 ? `${western1} ${western2}` : western1;
        let last;
        if (inheritedLast) {
            last = inheritedLast;
        }
        else {
            const kinya1 = studentKinya[gender]();
            const kinya2 = chance(0.2) ? studentKinya[gender]() : null;
            last = kinya2 && kinya2 !== kinya1 ? `${kinya1} ${kinya2}` : kinya1;
        }
        const components = [...first.split(' '), ...last.split(' ')];
        const overused = components.some((c) => (classCounts.get(c) ?? 0) >= 2);
        if (overused && t < 250)
            continue;
        if (!claimFullName(first, last))
            continue;
        for (const c of components) {
            classCounts.set(c, (classCounts.get(c) ?? 0) + 1);
        }
        return { first, last };
    }
    throw new Error('student name space exhausted');
}
const MS_DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const addDays = (base, days) => new Date(base.getTime() + days * MS_DAY);
async function clearDatabase() {
    const rows = await prisma.$queryRaw `
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
    if (rows.length === 0)
        return;
    const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
async function main() {
    console.log('🌱 Seeding database (Rwandan TSS structure, realistic names)…');
    await clearDatabase();
    console.log('  🧹 Existing data cleared');
    ['Wilson Nshizirungu', 'Josiane Mutoni', 'Speciose Mukarugwiza'].forEach((n) => {
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
        'headteacher@markova.edu',
    ].forEach((e) => usedEmails.add(e));
    const uploadsDir = (0, path_1.join)(process.cwd(), 'uploads');
    (0, fs_1.mkdirSync)(uploadsDir, { recursive: true });
    const kept = [];
    const installAsset = (assetName, uploadName) => {
        const { outcome, url } = (0, branding_install_1.installBrandingAsset)((0, path_1.join)(process.cwd(), 'assets', assetName), (0, path_1.join)(uploadsDir, uploadName), `/uploads/${uploadName}`);
        if (outcome === 'kept-existing')
            kept.push(uploadName);
        return url;
    };
    const configs = [
        { key: 'school_name', value: 'Markova Academy' },
        { key: 'school_motto', value: 'Excellence Through Knowledge' },
        { key: 'logo_url', value: installAsset('logo-mark.png', 'logo.png') },
        { key: 'stamp_url', value: installAsset('stamp.png', 'stamp.png') },
        {
            key: 'signature_url',
            value: installAsset('signature.png', 'signature.png'),
        },
        { key: 'primary_color', value: '#1B4F72' },
        { key: 'starting_discipline_points', value: '40' },
        { key: 'borrowing_limit', value: '3' },
        { key: 'borrowing_duration_days', value: '14' },
        { key: 'pass_threshold', value: '50' },
        { key: 'school_address', value: 'KG 7 Ave, Kacyiru, Kigali, Rwanda' },
        { key: 'school_phone', value: '+250788000000' },
        { key: 'school_email', value: 'info@markova.edu' },
        { key: 'school_website', value: 'https://markova.edu' },
        { key: 'head_teacher_name', value: 'Aline Uwase' },
        { key: 'registration_number', value: 'REB/2015/0142' },
        { key: 'email_provider', value: 'smtp' },
    ];
    for (const config of configs) {
        const existing = await prisma.schoolConfig.findUnique({
            where: { key: config.key },
        });
        if (!(0, branding_install_1.shouldWriteConfig)(config.key, existing?.value))
            continue;
        await prisma.schoolConfig.upsert({
            where: { key: config.key },
            update: { value: config.value },
            create: config,
        });
    }
    console.log('  ✅ SchoolConfig seeded');
    if (kept.length > 0) {
        console.log(`     ↳ kept the school's own ${kept.join(', ')} (not overwritten)`);
    }
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const admin = await prisma.user.create({
        data: {
            email: 'wilsonshizirungu@gmail.com',
            phone: '+250788000001',
            code: `ADM-${new Date().getFullYear()}-001`,
            gender: client_1.Gender.MALE,
            dateOfBirth: new Date('1988-03-12'),
            nationalId: makeNid(client_1.Gender.MALE, 1988),
            nationality: 'Rwandan',
            passwordHash,
            role: client_1.Role.ADMIN,
            firstName: 'Wilson',
            lastName: 'Nshizirungu',
            isActive: true,
            forcePasswordChange: false,
        },
    });
    console.log('  ✅ Admin user seeded');
    const librarianUser = await prisma.user.create({
        data: {
            email: 'librarian@markova.edu',
            phone: '+250788000020',
            code: `LIB-${new Date().getFullYear()}-001`,
            gender: client_1.Gender.FEMALE,
            dateOfBirth: new Date('1992-07-04'),
            nationalId: makeNid(client_1.Gender.FEMALE, 1992),
            nationality: 'Rwandan',
            passwordHash,
            role: client_1.Role.LIBRARIAN,
            firstName: 'Josiane',
            lastName: 'Mutoni',
            isActive: true,
            forcePasswordChange: false,
        },
    });
    console.log('  ✅ Librarian seeded');
    const boardingStaff = [
        {
            email: 'patron@markova.edu',
            phone: '+250788000021',
            code: `PAT-${new Date().getFullYear()}-001`,
            role: client_1.Role.PATRON,
            gender: client_1.Gender.MALE,
            firstName: 'Emmanuel',
            lastName: 'Habimana',
            born: '1985-03-12',
        },
        {
            email: 'matron@markova.edu',
            phone: '+250788000022',
            code: `MAT-${new Date().getFullYear()}-001`,
            role: client_1.Role.MATRON,
            gender: client_1.Gender.FEMALE,
            firstName: 'Beatrice',
            lastName: 'Mukamana',
            born: '1983-11-05',
        },
        {
            email: 'nurse@markova.edu',
            phone: '+250788000023',
            code: `NUR-${new Date().getFullYear()}-001`,
            role: client_1.Role.NURSE,
            gender: client_1.Gender.FEMALE,
            firstName: 'Claudine',
            lastName: 'Ingabire',
            born: '1990-06-18',
        },
        {
            email: 'bursar@markova.edu',
            phone: '+250788000024',
            code: `BUR-${new Date().getFullYear()}-001`,
            role: client_1.Role.BURSAR,
            gender: client_1.Gender.MALE,
            firstName: 'Straton',
            lastName: 'Nsengiyumva',
            born: '1979-09-24',
        },
        {
            email: 'headteacher@markova.edu',
            phone: '+250788000025',
            code: `HTC-${new Date().getFullYear()}-001`,
            role: client_1.Role.HEAD_TEACHER,
            gender: client_1.Gender.FEMALE,
            firstName: 'Speciose',
            lastName: 'Mukarugwiza',
            born: '1976-02-08',
        },
    ];
    let bursarUser = null;
    let headTeacherUser = null;
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
                forcePasswordChange: false,
            },
        });
        if (person.role === client_1.Role.BURSAR)
            bursarUser = created;
        if (person.role === client_1.Role.HEAD_TEACHER)
            headTeacherUser = created;
    }
    console.log('  ✅ Patron, matron, nurse, bursar and head teacher seeded');
    const today = startOfToday();
    const yr = today.getFullYear();
    const utcDay = (iso) => new Date(`${iso}T00:00:00.000Z`);
    const published = [
        {
            name: '2023-2024',
            terms: [
                ['2023-09-25', '2023-12-22'],
                ['2024-01-08', '2024-03-29'],
                ['2024-04-15', '2024-07-05'],
            ],
        },
        {
            name: '2024-2025',
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
    let calendars = published.map((c) => ({
        name: c.name,
        terms: c.terms.map(([s, e]) => ({ start: utcDay(s), end: utcDay(e) })),
    }));
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
    if (calendars.length !== 3)
        throw new Error('calendar selection expects 3 started years');
    let curTi = 0;
    for (let i = 0; i < 3; i++) {
        if (calendars[2].terms[i].start <= today)
            curTi = i;
    }
    if (today > calendars[2].terms[curTi].end) {
        calendars[2].terms[curTi].end = addDays(today, 3);
    }
    const allYears = [];
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
        const yearTerms = [];
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
    const termBegun = (t) => t.startDate <= today;
    console.log(`  ✅ Academic years ${calendars.map((c) => c.name).join(', ')} seeded (current: ${currentTerm.name} of ${academicYear.name})`);
    const trades = [];
    const tradeByCode = new Map();
    for (const t of TRADES) {
        const trade = await prisma.trade.create({ data: t });
        trades.push(trade);
        tradeByCode.set(t.code, trade);
    }
    console.log(`  ✅ ${trades.length} trades seeded (${TRADES.map((t) => t.code).join(', ')})`);
    const classLevels = [];
    const sectionMetas = [];
    for (const lv of O_LEVELS) {
        const level = await prisma.classLevel.create({
            data: { name: lv.name, order: lv.order, stage: client_1.EducationStage.O_LEVEL },
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
            data: { name: lv.name, order: lv.order, stage: client_1.EducationStage.A_LEVEL },
        });
        classLevels.push(level);
        const doubledCount = 3 + rand(2);
        const doubled = new Set(shuffled(TRADES.map((t) => t.code)).slice(0, doubledCount));
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
    console.log(`  ✅ ${classLevels.length} class levels + ${sectionMetas.length} classes seeded`);
    const oCoreSubjects = [];
    for (const s of O_CORE_SUBJECTS) {
        oCoreSubjects.push(await prisma.subject.create({
            data: { ...s, scope: client_1.SubjectScope.O_CORE, maxMarks: 100, isActive: true },
        }));
    }
    const oElectiveSubjects = [];
    for (const s of O_ELECTIVE_SUBJECTS) {
        oElectiveSubjects.push(await prisma.subject.create({
            data: { ...s, scope: client_1.SubjectScope.O_ELECTIVE, maxMarks: 100, isActive: true },
        }));
    }
    const aGeneralSubjects = [];
    for (const s of A_GENERAL_SUBJECTS) {
        aGeneralSubjects.push(await prisma.subject.create({
            data: { ...s, scope: client_1.SubjectScope.A_GENERAL, maxMarks: 100, isActive: true },
        }));
    }
    const sharedCore = oCoreSubjects.filter((s) => A_SHARED_CORE_NAMES.includes(s.name));
    const aLevelGeneralSet = [...aGeneralSubjects, ...sharedCore];
    const levelByName = new Map(classLevels.map((l) => [l.name, l]));
    const specificByTradeLevel = new Map();
    let specificCount = 0;
    for (const t of TRADES) {
        for (const levelName of Object.keys(TRADE_MODULES[t.code])) {
            const level = levelByName.get(levelName);
            const list = [];
            for (const moduleName of TRADE_MODULES[t.code][levelName]) {
                list.push(await prisma.subject.create({
                    data: {
                        name: moduleName,
                        category: tradeByCode.get(t.code).sector,
                        scope: client_1.SubjectScope.A_SPECIFIC,
                        tradeId: tradeByCode.get(t.code).id,
                        classLevelId: level.id,
                        maxMarks: 100,
                        isActive: true,
                    },
                }));
                specificCount++;
            }
            specificByTradeLevel.set(`${t.code}|${levelName}`, list);
        }
    }
    console.log(`  ✅ Subjects seeded: 9 core + 3 electives + ${aLevelGeneralSet.length} general + ${specificCount} trade modules`);
    function subjectsForSection(meta) {
        if (!meta.trade)
            return [...oCoreSubjects, ...oElectiveSubjects];
        return [
            ...aLevelGeneralSet,
            ...(specificByTradeLevel.get(`${meta.trade.code}|${meta.level.name}`) ??
                []),
        ];
    }
    const O_WEEKLY = {
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
    };
    const A_GENERAL_WEEKLY = {
        Kinyarwanda: 2,
        Entrepreneurship: 2,
        'English (Communication Skills)': 3,
        'Mathematics for Technology': 3,
        'Basic ICT': 2,
    };
    const planBySection = new Map();
    for (const meta of sectionMetas) {
        const plan = new Map();
        const subjects = subjectsForSection(meta);
        if (!meta.trade) {
            for (const s of subjects)
                plan.set(s.id, O_WEEKLY[s.name]);
        }
        else {
            const modules = subjects.filter((s) => s.scope === client_1.SubjectScope.A_SPECIFIC);
            let share = 40;
            for (const s of subjects) {
                if (s.scope !== client_1.SubjectScope.A_SPECIFIC) {
                    plan.set(s.id, A_GENERAL_WEEKLY[s.name]);
                    share -= A_GENERAL_WEEKLY[s.name];
                }
            }
            const base = Math.floor(share / modules.length);
            let extra = share - base * modules.length;
            for (const s of modules)
                plan.set(s.id, base + (extra-- > 0 ? 1 : 0));
        }
        planBySection.set(meta.section.id, plan);
    }
    const TRADE_ROOMS = {
        SWD: 'ICT Lab 1',
        NIT: 'Networking Lab',
        TOR: 'Tourism Training Room',
        AUT: 'Auto Workshop',
    };
    const sectionRoom = (si) => `Room ${101 + si}`;
    const GENERAL_FAMILIES = [
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
    const familyOfSubject = (subject) => {
        if (subject.tradeId) {
            const t = TRADES.find((x) => tradeByCode.get(x.code).id === subject.tradeId);
            return `${t.name} (${t.code})`;
        }
        return GENERAL_FAMILIES.find((f) => f.subjects.includes(subject.name))
            .family;
    };
    const yrNow = new Date().getFullYear();
    const familyPeriods = new Map();
    for (const meta of sectionMetas) {
        const plan = planBySection.get(meta.section.id);
        for (const subject of subjectsForSection(meta)) {
            const fam = familyOfSubject(subject);
            familyPeriods.set(fam, (familyPeriods.get(fam) ?? 0) + (plan.get(subject.id) ?? 0));
        }
    }
    for (const fam of GENERAL_FAMILIES) {
        fam.count = Math.max(3, Math.round((familyPeriods.get(fam.family) ?? 0) / 24));
    }
    const TRADE_TEACHER_COUNTS = {};
    for (const t of TRADES) {
        TRADE_TEACHER_COUNTS[t.code] = Math.max(2, Math.ceil((familyPeriods.get(`${t.name} (${t.code})`) ?? 0) / 28));
    }
    const specialtyByTeacher = [];
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
    const TEACHER_COUNT = specialtyByTeacher.length;
    const fixedTeachers = [
        { firstName: 'Aline', lastName: 'Uwase', email: 'aline.uwase@markova.edu', phone: '+250788000010', gender: client_1.Gender.FEMALE },
        { firstName: 'Eric', lastName: 'Niyonkuru', email: emailFor('Eric', 'Niyonkuru'), phone: '+250788000011', gender: client_1.Gender.MALE },
        { firstName: 'Diane', lastName: 'Mukamana', email: emailFor('Diane', 'Mukamana'), phone: '+250788000012', gender: client_1.Gender.FEMALE },
        { firstName: 'Patrick', lastName: 'Habimana', email: emailFor('Patrick', 'Habimana'), phone: '+250788000013', gender: client_1.Gender.MALE },
        { firstName: 'Solange', lastName: 'Ingabire', email: emailFor('Solange', 'Ingabire'), phone: '+250788000014', gender: client_1.Gender.FEMALE },
    ];
    const teacherComponents = new Set(fixedTeachers.flatMap((t) => [t.firstName, t.lastName]));
    fixedTeachers.forEach((t) => claimFullName(t.firstName, t.lastName));
    const generatedTeachers = [];
    for (let i = 0; generatedTeachers.length < TEACHER_COUNT - fixedTeachers.length; i++) {
        if (i > 2000)
            throw new Error('teacher name space exhausted');
        const gender = generatedTeachers.length % 2 === 0 ? client_1.Gender.MALE : client_1.Gender.FEMALE;
        const first = adultWestern[gender]();
        const last = adultKinya[gender]();
        if (teacherComponents.has(first) || teacherComponents.has(last))
            continue;
        if (!claimFullName(first, last))
            continue;
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
    const teacherUsers = [];
    const teachers = [];
    for (let ti = 0; ti < teacherData.length; ti++) {
        const td = teacherData[ti];
        const tBirthYear = yrNow - (26 + rand(30));
        const user = await prisma.user.create({
            data: {
                email: td.email,
                phone: td.phone,
                code: `TCH-${new Date().getFullYear()}-${String(ti + 1).padStart(3, '0')}`,
                gender: td.gender,
                dateOfBirth: new Date(Date.UTC(tBirthYear, rand(12), 1 + rand(27))),
                nationalId: makeNid(td.gender, tBirthYear),
                nationality: 'Rwandan',
                passwordHash,
                role: client_1.Role.TEACHER,
                firstName: td.firstName,
                lastName: td.lastName,
                isActive: true,
                forcePasswordChange: ti !== 0,
            },
        });
        const teacher = await prisma.teacher.create({
            data: {
                userId: user.id,
                employmentStatus: client_1.EmploymentStatus.FULL_TIME,
                qualification: specialtyByTeacher[ti].tradeCode
                    ? sample([
                        client_2.TeacherQualification.A1,
                        client_2.TeacherQualification.A1,
                        client_2.TeacherQualification.A2,
                        client_2.TeacherQualification.A2,
                        client_2.TeacherQualification.A0,
                    ])
                    : sample([
                        client_2.TeacherQualification.A0,
                        client_2.TeacherQualification.A0,
                        client_2.TeacherQualification.A0,
                        client_2.TeacherQualification.A1,
                        client_2.TeacherQualification.A1,
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
    const qualifiedFor = (subject) => {
        const out = [];
        for (let i = 0; i < specialtyByTeacher.length; i++) {
            const sp = specialtyByTeacher[i];
            if (sp.tradeCode) {
                if (subject.tradeId &&
                    subject.tradeId === tradeByCode.get(sp.tradeCode).id) {
                    out.push(i);
                }
            }
            else if (sp.subjectNames.has(subject.name)) {
                out.push(i);
            }
        }
        return out;
    };
    const teacherLoad = new Array(teachers.length).fill(0);
    const assignedTeacherIdx = new Map();
    for (const meta of sectionMetas) {
        for (const subject of subjectsForSection(meta)) {
            const cands = qualifiedFor(subject);
            if (cands.length === 0) {
                throw new Error(`no specialty covers subject "${subject.name}"`);
            }
            let best = cands[0];
            for (const c of cands)
                if (teacherLoad[c] < teacherLoad[best])
                    best = c;
            teacherLoad[best] += planBySection.get(meta.section.id).get(subject.id);
            assignedTeacherIdx.set(`${meta.section.id}|${subject.id}`, best);
        }
    }
    if (teacherLoad.some((l) => l === 0)) {
        throw new Error('specialization left a teacher with zero classes');
    }
    const teacherOf = (sectionId, subjectId) => teachers[assignedTeacherIdx.get(`${sectionId}|${subjectId}`)];
    const teacherUserOf = (sectionId, subjectId) => teacherUsers[assignedTeacherIdx.get(`${sectionId}|${subjectId}`)];
    const assessmentTypes = [];
    const assessmentByName = new Map();
    for (const name of ASSESSMENT_NAMES) {
        const at = await prisma.assessmentType.create({ data: { name } });
        assessmentTypes.push(at);
        assessmentByName.set(name, at);
    }
    console.log(`  ✅ ${assessmentTypes.length} assessment types seeded`);
    await prisma.teacherRole.create({
        data: { teacherId: teachers[0].id, role: client_1.SpecialRole.DOS },
    });
    const firstOfFamily = (family) => specialtyByTeacher.findIndex((s) => s.family === family);
    await prisma.teacherRole.create({
        data: {
            teacherId: teachers[firstOfFamily('Mathematics & Sciences')].id,
            role: client_1.SpecialRole.HOD,
            department: 'Sciences',
        },
    });
    await prisma.teacherRole.create({
        data: {
            teacherId: teachers[firstOfFamily('Humanities')].id,
            role: client_1.SpecialRole.HOD,
            department: 'Humanities',
        },
    });
    const classTeacherIdxOf = new Map();
    {
        const roleCount = new Array(teachers.length).fill(0);
        for (const meta of sectionMetas) {
            const own = [
                ...new Set(subjectsForSection(meta).map((s) => assignedTeacherIdx.get(`${meta.section.id}|${s.id}`))),
            ];
            let pick = own[0];
            for (const c of own)
                if (roleCount[c] < roleCount[pick])
                    pick = c;
            roleCount[pick]++;
            classTeacherIdxOf.set(meta.section.id, pick);
            await prisma.teacherRole.create({
                data: {
                    teacherId: teachers[pick].id,
                    role: client_1.SpecialRole.CLASS_TEACHER,
                    classSectionId: meta.section.id,
                },
            });
        }
    }
    console.log('  ✅ Teacher special roles seeded');
    const assignmentRows = [];
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
    console.log(`  ✅ ${assignmentRows.length} assignments seeded (specialized: ` +
        `${GENERAL_FAMILIES.map((f) => `${f.family} ${f.count}`).join(', ')}, ` +
        `${TRADES.map((t) => `${t.code} ${TRADE_TEACHER_COUNTS[t.code]}`).join(', ')})`);
    const sectionsByLevel = new Map();
    for (const m of sectionMetas) {
        const key = `${m.level.order}|${m.trade?.code ?? '-'}`;
        const list = sectionsByLevel.get(key) ?? [];
        list.push(m);
        sectionsByLevel.set(key, list);
    }
    const pastOcc = new Map();
    const occKey = (yearIdx, sectionId) => `${yearIdx}|${sectionId}`;
    const getOcc = (yearIdx, sectionId) => pastOcc.get(occKey(yearIdx, sectionId)) ?? 0;
    const addOcc = (yearIdx, sectionId) => pastOcc.set(occKey(yearIdx, sectionId), getOcc(yearIdx, sectionId) + 1);
    const stepBack = (o, trade, yearIdx) => {
        if (chance(0.07))
            return null;
        const repeat = chance(0.08);
        const prevO = repeat ? o : o - 1;
        if (prevO === 0)
            return null;
        if (prevO === 3 && o === 4 && !repeat && chance(0.5))
            return null;
        const prevTrade = prevO >= 4 ? trade : null;
        const cands = (sectionsByLevel.get(`${prevO}|${prevTrade?.code ?? '-'}`) ?? []).filter((m) => getOcc(yearIdx, m.section.id) < 30);
        if (cands.length === 0)
            return null;
        const meta = sample(cands);
        addOcc(yearIdx, meta.section.id);
        return { meta, repeat };
    };
    const planJourney = (currentMeta) => {
        const placements = [
            { yearIdx: 2, meta: currentMeta, failed: false },
        ];
        let repeats = 0;
        let o = currentMeta.level.order;
        let tr = currentMeta.trade;
        for (const yearIdx of [1, 0]) {
            const s = stepBack(o, tr, yearIdx);
            if (!s)
                break;
            placements.push({ yearIdx, meta: s.meta, failed: s.repeat });
            if (s.repeat)
                repeats++;
            o = s.meta.level.order;
            tr = s.meta.trade;
        }
        return { placements, repeats };
    };
    const enrolled = [];
    const classSizes = sectionMetas.map(() => 25 + rand(6));
    const STUDENT_COUNT = classSizes.reduce((a, b) => a + b, 0);
    const families = [];
    const inheritedBySlot = new Map();
    {
        const slotDeck = shuffled(Array.from({ length: STUDENT_COUNT }, (_, i) => i));
        let familyId = 0;
        const lines = [
            ...INHERITED_FATHER_LINE.map((name) => ({ line: 'father', name })),
            ...INHERITED_MOTHER_LINE.map((name) => ({ line: 'mother', name })),
        ];
        for (const { line, name } of lines) {
            const kids = chance(0.3) ? 2 : 1;
            const fam = {
                id: familyId++,
                line,
                name,
                kidSlots: [],
                kidGenders: [],
                studentIds: [],
            };
            for (let k = 0; k < kids && slotDeck.length > 0; k++) {
                const slot = slotDeck.pop();
                const gender = line === 'father'
                    ? chance(0.7)
                        ? client_1.Gender.MALE
                        : client_1.Gender.FEMALE
                    : client_1.Gender.FEMALE;
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
        const classCounts = new Map();
        for (let k = 0; k < classSizes[si]; k++) {
            const i = studentIdx++;
            const fam = inheritedBySlot.get(i);
            const gender = fam
                ? fam.kidGenders[fam.kidSlots.indexOf(i)]
                : chance(0.5)
                    ? client_1.Gender.MALE
                    : client_1.Gender.FEMALE;
            const { first, last } = studentName(gender, classCounts, fam?.name);
            const journey = planJourney(meta);
            const joinIdx = Math.min(...journey.placements.map((p) => p.yearIdx));
            const joinYear = allYears[joinIdx].year.startDate.getUTCFullYear();
            const earliest = journey.placements[journey.placements.length - 1];
            const ageBase = 11 + meta.level.order + rand(2) + journey.repeats;
            const dob = new Date(`${yr - ageBase}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`);
            const actualAge = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
            const extras = studentExtras(gender, yr - ageBase, actualAge, earliest.meta.level.order, allYears[joinIdx].year.startDate);
            const user = await prisma.user.create({
                data: {
                    email: i < 30 ? `student${i + 1}@markova.edu` : emailFor(first, last),
                    ...extras.user,
                    passwordHash,
                    role: client_1.Role.STUDENT,
                    firstName: first,
                    lastName: last,
                    isActive: true,
                    forcePasswordChange: i !== 0,
                },
            });
            const student = await prisma.student.create({
                data: {
                    userId: user.id,
                    studentIdNumber: studentNumber(first, last, joinYear, user.id),
                    classSectionId: meta.section.id,
                    dateOfBirth: dob,
                    gender,
                    status: client_1.StudentStatus.ACTIVE,
                    disciplinePoints: conduct_1.TERM_CONDUCT_MARK,
                    ...extras.student,
                },
            });
            if (fam)
                fam.studentIds.push(student.id);
            enrolled.push({ student, user, meta, placements: journey.placements });
        }
    }
    const students = enrolled.map((e) => e.student);
    const studentUsers = enrolled.map((e) => e.user);
    const inheritedKids = families.reduce((s, f) => s + f.studentIds.length, 0);
    console.log(`  ✅ ${students.length} students seeded across ${sectionMetas.length} classes (${inheritedKids} carry a family lineage name)`);
    const parentUsers = [];
    let parentPhoneIdx = 0;
    const createParent = async (gender, opts) => {
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
                email: i >= 15 ? emailFor(first, last) : null,
                passwordHash,
                role: client_1.Role.PARENT,
                firstName: first,
                lastName: last,
                isActive: true,
                forcePasswordChange: !opts?.demo,
            },
        });
        parentUsers.push(user);
        return user;
    };
    const demoParent = await createParent(client_1.Gender.MALE, { demo: true });
    const familyParents = new Map();
    for (const fam of families) {
        if (fam.studentIds.length === 0)
            continue;
        const father = await createParent(client_1.Gender.MALE, {
            kinyaOverride: fam.line === 'father' ? fam.name : undefined,
        });
        const mother = await createParent(client_1.Gender.FEMALE, {
            kinyaOverride: fam.line === 'mother' ? fam.name : undefined,
        });
        familyParents.set(fam.id, { father, mother });
    }
    const parentLinkRows = [];
    const linkedStudentIds = new Set();
    const guardianByStudent = new Map();
    for (const fam of families) {
        const pair = familyParents.get(fam.id);
        if (!pair)
            continue;
        for (const studentId of fam.studentIds) {
            parentLinkRows.push({ parentUserId: pair.father.id, studentId, relationship: 'Father' }, { parentUserId: pair.mother.id, studentId, relationship: 'Mother' });
            linkedStudentIds.add(studentId);
            guardianByStudent.set(studentId, {
                father: pair.father,
                mother: pair.mother,
            });
        }
    }
    const unlinked = students.filter((s) => !linkedStudentIds.has(s.id));
    const kidsQueue = shuffled(unlinked);
    const demoKids = [
        kidsQueue.find((s) => s.id === students[0].id) ?? kidsQueue[0],
    ];
    kidsQueue.splice(kidsQueue.indexOf(demoKids[0]), 1);
    if (kidsQueue.length > 0 && chance(0.5))
        demoKids.push(kidsQueue.pop());
    const units = [[...demoKids]];
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
        const shape = u === 0 ? 0 : Math.random();
        let father = null;
        let mother = null;
        if (shape < 0.78) {
            father = u === 0 ? demoParent : await createParent(client_1.Gender.MALE);
            mother = await createParent(client_1.Gender.FEMALE);
            twoParent++;
        }
        else if (shape < 0.93) {
            mother = await createParent(client_1.Gender.FEMALE);
            singleParent++;
        }
        else if (shape < 0.97) {
            father = await createParent(client_1.Gender.MALE);
            singleParent++;
        }
        else {
            const guardian = await createParent(chance(0.5) ? client_1.Gender.MALE : client_1.Gender.FEMALE);
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
    for (const [studentId, g] of guardianByStudent) {
        if (!g.father && !g.mother)
            continue;
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
    console.log(`  ✅ ${parentUsers.length} parents in ${units.length + familyParents.size} families ` +
        `(${twoParent} two-parent, ${singleParent} single-parent, ${guardianHomes} guardian homes, ` +
        `${siblingKids} kids with an enrolled sibling)`);
    const alumni = [];
    const alumniCounts = new Map();
    const countsFor = (yearIdx, sectionId) => {
        const key = occKey(yearIdx, sectionId);
        if (!alumniCounts.has(key))
            alumniCounts.set(key, new Map());
        return alumniCounts.get(key);
    };
    const createFormer = async (placements, lastYearIdx) => {
        const last = placements[0].meta;
        const gender = chance(0.5) ? client_1.Gender.MALE : client_1.Gender.FEMALE;
        const name = studentName(gender, countsFor(lastYearIdx, last.section.id));
        const i = studentIdx++;
        const repeats = placements.filter((p) => p.failed).length;
        const yearsGone = 2 - lastYearIdx;
        const joinYear = allYears[Math.min(...placements.map((p) => p.yearIdx))].year.startDate.getUTCFullYear();
        const age = 11 + last.level.order + rand(2) + repeats + yearsGone;
        const earliestPl = placements[placements.length - 1];
        const dob = new Date(`${yr - age}-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`);
        const actualAge = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
        const extras = studentExtras(gender, yr - age, actualAge, earliestPl.meta.level.order, allYears[earliestPl.yearIdx].year.startDate);
        const user = await prisma.user.create({
            data: {
                email: emailFor(name.first, name.last),
                ...extras.user,
                passwordHash,
                role: client_1.Role.STUDENT,
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
                status: last.level.order === 6
                    ? client_1.StudentStatus.GRADUATED
                    : client_1.StudentStatus.TRANSFERRED,
                disciplinePoints: conduct_1.TERM_CONDUCT_MARK,
                ...extras.student,
            },
        });
        alumni.push({ student, user, placements });
    };
    for (const meta of sectionMetas) {
        const target = 25 + rand(6);
        while (getOcc(1, meta.section.id) < target) {
            addOcc(1, meta.section.id);
            const placements = [{ yearIdx: 1, meta, failed: false }];
            const s0 = stepBack(meta.level.order, meta.trade, 0);
            if (s0)
                placements.push({ yearIdx: 0, meta: s0.meta, failed: s0.repeat });
            await createFormer(placements, 1);
        }
    }
    for (const meta of sectionMetas) {
        const target = 25 + rand(6);
        while (getOcc(0, meta.section.id) < target) {
            addOcc(0, meta.section.id);
            await createFormer([{ yearIdx: 0, meta, failed: false }], 0);
        }
    }
    const graduatedCount = alumni.filter((a) => a.student.status === client_1.StudentStatus.GRADUATED).length;
    console.log(`  ✅ ${alumni.length} former students seeded (${graduatedCount} graduated, ${alumni.length - graduatedCount} transferred)`);
    const SUBJECT_PROFILES = {
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
    const profileFor = (subject) => {
        const q = SUBJECT_PROFILES[subject.name];
        if (q)
            return { shift: q.shift, spread: q.spread ?? 1 };
        if (subject.scope === client_1.SubjectScope.A_SPECIFIC) {
            return HARD_MODULES.has(subject.name)
                ? { shift: -6, spread: 1.2 }
                : { shift: 4, spread: 0.85 };
        }
        return { shift: 0, spread: 1 };
    };
    const markRows = [];
    const componentFrac = {
        'CAT 1': 0.32,
        'CAT 2': 0.62,
        Practical: 0.74,
        'End of Term Exam': 0.94,
    };
    const weekdayOnOrAfter = (d) => {
        const out = new Date(d);
        while (out.getUTCDay() === 0 || out.getUTCDay() === 6)
            out.setTime(out.getTime() + MS_DAY);
        return out;
    };
    const componentDate = (term, name) => weekdayOnOrAfter(addDays(term.startDate, Math.round(((term.endDate.getTime() - term.startDate.getTime()) / MS_DAY) *
        componentFrac[name])));
    const minDate = (a, b) => (a < b ? a : b);
    const unreturned = new Set();
    for (const meta of sectionMetas) {
        for (const subject of subjectsForSection(meta)) {
            if (!chance(0.03))
                continue;
            const pick = subject.scope === client_1.SubjectScope.A_SPECIFIC && chance(0.5)
                ? 'Practical'
                : 'CAT 2';
            unreturned.add(`${meta.section.id}|${subject.id}|${pick}`);
        }
    }
    const strength = new Map();
    const allPeople = [
        ...enrolled.map((e) => ({
            student: e.student,
            user: e.user,
            placements: e.placements,
        })),
        ...alumni,
    ];
    const nameOfStudent = new Map(allPeople.map((p) => [p.student.id, p.user.firstName]));
    for (const { student, placements } of allPeople) {
        const baseline = 45 + rand(41);
        const drift = rand(6) - 2;
        for (const pl of placements) {
            const yearTerms = allYears[pl.yearIdx].terms;
            const subjectSet = subjectsForSection(pl.meta);
            for (let ti = 0; ti < yearTerms.length; ti++) {
                if (!termBegun(yearTerms[ti]))
                    continue;
                const g = pl.yearIdx * 3 + ti;
                const ability = clamp(baseline + drift * (g - 6) - (pl.failed ? 8 : 0), 25, 92);
                for (let subj = 0; subj < subjectSet.length; subj++) {
                    const subject = subjectSet[subj];
                    const teacher = teacherOf(pl.meta.section.id, subject.id);
                    const sKey = `${student.id}|${subject.id}`;
                    if (!strength.has(sKey))
                        strength.set(sKey, rand(21) - 10);
                    const prof = profileFor(subject);
                    const perSubject = clamp(ability + strength.get(sKey) + prof.shift, 18, 96);
                    const components = subject.scope === client_1.SubjectScope.A_SPECIFIC
                        ? ['CAT 1', 'CAT 2', 'Practical', 'End of Term Exam']
                        : ['CAT 1', 'CAT 2', 'End of Term Exam'];
                    for (const assessmentName of components) {
                        const term = yearTerms[ti];
                        const isCurrentTerm = term.id === currentTerm.id;
                        const sat = componentDate(term, assessmentName);
                        if (sat > today)
                            continue;
                        if (isCurrentTerm &&
                            unreturned.has(`${pl.meta.section.id}|${subject.id}|${assessmentName}`)) {
                            continue;
                        }
                        const missP = isCurrentTerm
                            ? assessmentName === 'End of Term Exam'
                                ? 0.008
                                : 0.02 + (ability < 40 ? 0.02 : 0)
                            : assessmentName === 'End of Term Exam'
                                ? 0.002
                                : 0.005;
                        if (chance(missP))
                            continue;
                        const bias = assessmentName === 'Practical'
                            ? 6
                            : assessmentName === 'End of Term Exam'
                                ? -4
                                : 0;
                        const score = clamp(perSubject + bias + Math.round((rand(17) - 8) * prof.spread), 10, 98);
                        const entered = minDate(addDays(sat, 1 + rand(4) + (chance(0.07) ? 4 + rand(8) : 0)), today);
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
    const assessmentNameById = new Map(assessmentTypes.map((a) => [a.id, a.name]));
    const subjectById = new Map();
    for (const m of sectionMetas) {
        for (const s of subjectsForSection(m))
            subjectById.set(s.id, s);
    }
    const marksByStudentTerm = new Map();
    for (const row of markRows) {
        const key = `${row.studentId}|${row.termId}`;
        const list = marksByStudentTerm.get(key) ?? [];
        list.push(row);
        marksByStudentTerm.set(key, list);
    }
    const membership = new Map();
    for (const { student, placements } of allPeople) {
        for (const pl of placements) {
            const key = occKey(pl.yearIdx, pl.meta.section.id);
            const list = membership.get(key) ?? [];
            list.push(student);
            membership.set(key, list);
        }
    }
    function currentTermStage(sectionIndex) {
        switch (sectionIndex % 5) {
            case 0:
                return 'TO_CHECK';
            case 1:
                return 'TO_ISSUE';
            case 2:
                return 'WRITING';
            default:
                return 'DRAFT';
        }
    }
    const termResultRows = [];
    const averageByStudentTerm = new Map();
    for (let yearIdx = 0; yearIdx < allYears.length; yearIdx++)
        for (const [termIdx, term] of allYears[yearIdx].terms
            .filter(termBegun)
            .entries())
            for (const meta of sectionMetas) {
                const priorTerm = termIdx > 0
                    ? allYears[yearIdx].terms.filter(termBegun)[termIdx - 1]
                    : null;
                const classStudents = membership.get(occKey(yearIdx, meta.section.id)) ?? [];
                const computed = [];
                const isCurrentResultTerm = term.id === currentTerm.id;
                const isDemoTeachersClass = classTeacherIdxOf.get(meta.section.id) === 0;
                const stage = !isCurrentResultTerm
                    ? 'ISSUED'
                    : isDemoTeachersClass
                        ? 'WRITING'
                        : currentTermStage(sectionMetas.indexOf(meta));
                const marksOut = stage !== 'DRAFT';
                const checked = stage === 'TO_ISSUE' || stage === 'ISSUED';
                for (const student of classStudents) {
                    const rows = marksByStudentTerm.get(`${student.id}|${term.id}`) ?? [];
                    const bySubject = new Map();
                    for (const r of rows) {
                        const list = bySubject.get(r.subjectId) ?? [];
                        list.push(r);
                        bySubject.set(r.subjectId, list);
                    }
                    let totalMarks = 0;
                    let subjectCount = 0;
                    let aggregate = 0;
                    let aggregateMax = 0;
                    const commentSubjects = [];
                    for (const [subjectId, subjectRows] of bySubject) {
                        const subject = subjectById.get(subjectId);
                        const scope = subject.scope;
                        const total = (0, grading_1.computeSubjectTotal)(scope, subjectRows.map((r) => ({
                            assessmentName: assessmentNameById.get(r.assessmentTypeId),
                            score: r.score,
                            maxScore: r.maxScore,
                        })));
                        if (total === null)
                            continue;
                        totalMarks += total;
                        subjectCount++;
                        commentSubjects.push({
                            name: subject.name,
                            total,
                            grade: (0, grading_1.gradeFor)(scope, total).letter,
                            competence: total >= grading_1.COMPETENCE_THRESHOLD
                                ? 'COMPETENT'
                                : 'NOT_YET_COMPETENT',
                        });
                        if ((0, grading_1.countsTowardAggregate)(scope)) {
                            aggregate += (0, grading_1.gradeFor)(scope, total).points;
                            aggregateMax += grading_1.MAX_POINTS_PER_SUBJECT;
                        }
                    }
                    const average = subjectCount > 0 ? totalMarks / subjectCount : 0;
                    computed.push({
                        studentId: student.id,
                        classSectionId: meta.section.id,
                        termId: term.id,
                        totalMarks,
                        average,
                        letterGrade: (0, grading_1.overallGrade)(average).letter,
                        aggregate,
                        aggregateMax,
                        calculatedAt: new Date(),
                        isPublished: marksOut,
                        publishedAt: marksOut ? new Date() : null,
                        reportCardPublished: stage === 'ISSUED',
                        reportCardPublishedAt: stage === 'ISSUED' ? new Date() : null,
                        dosConfirmed: checked,
                        dosConfirmedAt: checked ? new Date() : null,
                        _subjects: commentSubjects,
                        _firstName: nameOfStudent.get(student.id) ?? 'This student',
                    });
                }
                computed.sort((a, b) => b.average - a.average);
                computed.forEach((r, i) => {
                    r.rank = i + 1;
                    if (stage === 'DRAFT')
                        return;
                    if (stage === 'WRITING' && i % 5 >= 3)
                        return;
                    const previous = priorTerm
                        ? (averageByStudentTerm.get(`${r.studentId}|${priorTerm.id}`) ?? null)
                        : null;
                    const both = (0, report_comments_1.suggestComments)({
                        studentId: r.studentId,
                        firstName: r._firstName,
                        average: r.average,
                        letterGrade: r.letterGrade,
                        rank: r.rank,
                        classSize: computed.length,
                        aggregate: r.aggregate,
                        aggregateMax: r.aggregateMax,
                        previousAverage: previous,
                        subjects: r._subjects,
                        conduct: null,
                    });
                    r.teacherComment = both.classTeacher;
                    r.headmasterComment = checked ? both.headTeacher : null;
                });
                for (const r of computed) {
                    averageByStudentTerm.set(`${r.studentId}|${term.id}`, r.average);
                }
                for (const r of computed) {
                    delete r._subjects;
                    delete r._firstName;
                }
                termResultRows.push(...computed);
            }
    for (let i = 0; i < termResultRows.length; i += 5000) {
        await prisma.termResult.createMany({
            data: termResultRows.slice(i, i + 5000),
        });
    }
    console.log(`  ✅ ${termResultRows.length} term results computed and seeded across 3 years`);
    const byStudentYear = new Map();
    for (const r of termResultRows) {
        const yearIdx = allYears.findIndex((y) => y.terms.some((t) => t.id === r.termId));
        if (yearIdx < 0)
            continue;
        const key = `${r.studentId}|${allYears[yearIdx].year.id}`;
        if (!byStudentYear.has(key)) {
            byStudentYear.set(key, {
                classSectionId: r.classSectionId,
                averages: [],
                terms: new Map(),
            });
        }
        const held = byStudentYear.get(key);
        held.averages.push(r.average);
        held.terms.set(r.termId, r.average);
    }
    const yearResultRows = [];
    for (const [key, held] of byStudentYear) {
        const [studentId, academicYearId] = key.split('|');
        const yearIdx = allYears.findIndex((y) => y.year.id === academicYearId);
        if (yearIdx === allYears.length - 1)
            continue;
        const termIds = allYears[yearIdx].terms.map((t) => t.id);
        const yearlyAverage = held.averages.reduce((a, b) => a + b, 0) / held.averages.length;
        yearResultRows.push({
            studentId,
            classSectionId: held.classSectionId,
            academicYearId,
            term1Avg: held.terms.get(termIds[0]) ?? null,
            term2Avg: held.terms.get(termIds[1]) ?? null,
            term3Avg: held.terms.get(termIds[2]) ?? null,
            yearlyAverage,
            letterGrade: (0, grading_1.overallGrade)(yearlyAverage).letter,
            disciplineAverage: conduct_1.YEAR_CONDUCT_MARK,
            isPromoted: yearlyAverage >= 50,
        });
    }
    const byClassYear = new Map();
    for (const r of yearResultRows) {
        const key = `${r.classSectionId}|${r.academicYearId}`;
        byClassYear.set(key, [...(byClassYear.get(key) ?? []), r]);
    }
    for (const rows of byClassYear.values()) {
        rows.sort((a, b) => b.yearlyAverage - a.yearlyAverage);
        rows.forEach((r, i) => (r.rank = i + 1));
    }
    for (let i = 0; i < yearResultRows.length; i += 5000) {
        await prisma.yearResult.createMany({
            data: yearResultRows.slice(i, i + 5000),
            skipDuplicates: true,
        });
    }
    console.log(`  ✅ ${yearResultRows.length} year results computed for the years that finished`);
    const schoolDays = [];
    for (const term of terms) {
        if (!termBegun(term))
            continue;
        const lastDay = minDate(term.endDate, today);
        for (let d = new Date(term.startDate); d <= lastDay; d = addDays(d, 1)) {
            const dow = d.getUTCDay();
            if (dow !== 0 && dow !== 6)
                schoolDays.push(new Date(d));
        }
    }
    const attProfileOf = new Map();
    for (const { student } of enrolled) {
        const r = Math.random();
        attProfileOf.set(student.id, r < 0.84
            ? { lateP: 0.015, absentP: 0.008, streakP: 0.001, chronic: false }
            : r < 0.94
                ? { lateP: 0.12, absentP: 0.015, streakP: 0.001, chronic: false }
                : r < 0.98
                    ? { lateP: 0.02, absentP: 0.02, streakP: 0.012, chronic: false }
                    : { lateP: 0.07, absentP: 0.1, streakP: 0.004, chronic: true });
    }
    const pickReason = (chronic) => {
        const r = Math.random();
        if (chronic) {
            if (r < 0.4)
                return client_1.AbsenceReason.UNEXCUSED;
            if (r < 0.7)
                return client_1.AbsenceReason.SICK;
            if (r < 0.85)
                return client_1.AbsenceReason.FAMILY;
            return client_1.AbsenceReason.PERMISSION;
        }
        if (r < 0.55)
            return client_1.AbsenceReason.SICK;
        if (r < 0.75)
            return client_1.AbsenceReason.FAMILY;
        if (r < 0.9)
            return client_1.AbsenceReason.PERMISSION;
        return client_1.AbsenceReason.UNEXCUSED;
    };
    const attRows = [];
    const sickLeft = new Map();
    for (const { student, meta } of enrolled) {
        const prof = attProfileOf.get(student.id);
        const markerId = teacherUsers[classTeacherIdxOf.get(meta.section.id)].id;
        for (const date of schoolDays) {
            const dow = date.getUTCDay();
            let status = client_1.AttendanceStatus.PRESENT;
            let reason = null;
            const left = sickLeft.get(student.id) ?? 0;
            if (left > 0) {
                sickLeft.set(student.id, left - 1);
                status = client_1.AttendanceStatus.ABSENT;
                reason = client_1.AbsenceReason.SICK;
            }
            else if (chance(prof.streakP)) {
                sickLeft.set(student.id, 1 + rand(3));
                status = client_1.AttendanceStatus.ABSENT;
                reason = client_1.AbsenceReason.SICK;
            }
            else if (chance(prof.absentP * (dow === 5 ? 1.3 : 1))) {
                status = client_1.AttendanceStatus.ABSENT;
                reason = pickReason(prof.chronic);
            }
            else if (chance(prof.lateP * (dow === 1 ? 1.6 : 1))) {
                status = client_1.AttendanceStatus.LATE;
            }
            const scannedAt = status === client_1.AttendanceStatus.ABSENT
                ? null
                : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), status === client_1.AttendanceStatus.LATE ? 6 : 5, status === client_1.AttendanceStatus.LATE ? 5 + rand(40) : 40 + rand(25)));
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
    console.log(`  ✅ ${attRows.length} attendance lines across ${schoolDays.length} school days (year to date)`);
    const tAttRows = [];
    for (const teacher of teachers) {
        for (const date of schoolDays) {
            const r = Math.random();
            const status = r < 0.955
                ? client_1.AttendanceStatus.PRESENT
                : r < 0.985
                    ? client_1.AttendanceStatus.LATE
                    : client_1.AttendanceStatus.ABSENT;
            tAttRows.push({
                teacherId: teacher.id,
                date,
                status,
                scannedAt: status === client_1.AttendanceStatus.ABSENT
                    ? null
                    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), status === client_1.AttendanceStatus.LATE ? 6 : 4, status === client_1.AttendanceStatus.LATE ? rand(50) : 45 + rand(70))),
            });
        }
    }
    for (let i = 0; i < tAttRows.length; i += 10000) {
        await prisma.teacherAttendance.createMany({
            data: tAttRows.slice(i, i + 10000),
        });
    }
    console.log(`  ✅ ${tAttRows.length} teacher attendance lines seeded`);
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
    const examRows = [];
    for (const term of terms) {
        if (!termBegun(term))
            continue;
        const examStart = componentDate(term, 'End of Term Exam');
        for (let si = 0; si < sectionMetas.length; si++) {
            const meta = sectionMetas[si];
            const subjects = subjectsForSection(meta);
            const days = [];
            for (let d = new Date(examStart); days.length < 10; d = addDays(d, 1)) {
                const dow = d.getUTCDay();
                if (dow !== 0 && dow !== 6)
                    days.push(new Date(d));
                if (d >= term.endDate && days.length * 3 >= subjects.length)
                    break;
            }
            const perDay = Math.min(3, Math.ceil(subjects.length / days.length));
            for (let i = 0; i < subjects.length; i++) {
                const subject = subjects[i];
                const day = days[Math.min(Math.floor(i / perDay), days.length - 1)];
                const slot = EXAM_SLOTS[i % perDay];
                const practical = subject.scope === client_1.SubjectScope.A_SPECIFIC;
                examRows.push({
                    classSectionId: meta.section.id,
                    subjectId: subject.id,
                    termId: term.id,
                    examDate: day,
                    startTime: slot.start,
                    endTime: slot.end,
                    room: practical ? TRADE_ROOMS[meta.trade.code] : sectionRoom(si),
                    syllabus: practical
                        ? 'Task-based practical assessment; report submitted same day'
                        : SYLLABUS_NOTES[(si + i) % SYLLABUS_NOTES.length],
                });
            }
        }
    }
    await prisma.examSchedule.createMany({ data: examRows });
    console.log(`  ✅ ${examRows.length} exam timetable entries seeded (every class, every term so far)`);
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
    const schoolDaysByTerm = new Map();
    for (const t of begunTerms) {
        schoolDaysByTerm.set(t.id, schoolDays.filter((d) => d >= t.startDate && d <= t.endDate));
    }
    let incidentCount = 0;
    let majorCount = 0;
    const appealTargets = [];
    for (const { student, meta } of enrolled) {
        const chronic = attProfileOf.get(student.id).chronic;
        if (!chance(chronic ? 0.35 : 0.075))
            continue;
        const count = chance(chronic ? 0.5 : 0.18) ? 2 + rand(4) : 1;
        const picks = Array.from({ length: count }, () => {
            const term = sample(begunTerms);
            return { term, date: sample(schoolDaysByTerm.get(term.id)) };
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
            const pts = isMajor ? 4 + rand(3) : isModerate ? 2 + rand(2) : 1 + rand(2);
            const action = isMajor
                ? client_1.DisciplineAction.SUSPENSION
                : isModerate
                    ? n >= 2 || chance(0.5)
                        ? client_1.DisciplineAction.DETENTION
                        : client_1.DisciplineAction.WRITTEN_WARNING
                    : n >= 1
                        ? client_1.DisciplineAction.WRITTEN_WARNING
                        : client_1.DisciplineAction.VERBAL_WARNING;
            const acknowledged = chance(isMajor ? 0.85 : isModerate ? 0.4 : 0.15);
            const recordedBy = chance(0.6)
                ? teacherUsers[classTeacherIdxOf.get(meta.section.id)]
                : teacherUsers[0];
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
                if (appealTargets.length < 3)
                    appealTargets.push({ incident, student });
            }
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
    const appealStatuses = [
        client_1.AppealStatus.APPROVED,
        client_1.AppealStatus.REJECTED,
        client_1.AppealStatus.PENDING,
    ];
    let appealCount = 0;
    for (let i = 0; i < appealTargets.length; i++) {
        const { incident, student } = appealTargets[i];
        const g = guardianByStudent.get(student.id);
        const submitter = g?.father ?? g?.mother;
        if (!submitter)
            continue;
        const status = appealStatuses[i];
        await prisma.disciplineAppeal.create({
            data: {
                incidentId: incident.id,
                submittedByUserId: submitter.id,
                statement: 'My child explains the situation differently; we request a review of the record and the points deducted.',
                evidenceUrls: [],
                status,
                reviewedByUserId: status === client_1.AppealStatus.PENDING ? null : admin.id,
                reviewNotes: status === client_1.AppealStatus.APPROVED
                    ? 'Reviewed with the class teacher; the account partially confirmed the appeal. Action reduced.'
                    : status === client_1.AppealStatus.REJECTED
                        ? 'Two staff witnesses confirmed the report. The record stands.'
                        : null,
            },
        });
        appealCount++;
    }
    console.log(`  ✅ ${incidentCount} discipline incidents (${majorCount} major) + ${appealCount} appeals seeded`);
    const bookData = [
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
        { title: 'English Grammar in Use', author: 'Raymond Murphy', isbn: '978-1108457651', category: 'Languages', qty: 12, cost: 18000, shelf: 'B1' },
        { title: 'Practical English Usage', author: 'Michael Swan', isbn: '978-0194202428', category: 'Languages', qty: 6, cost: 22000, shelf: 'B1' },
        { title: 'Fundamentals of Physics', author: 'Halliday & Resnick', isbn: '978-1119460138', category: 'Sciences', qty: 5, cost: 38000, shelf: 'B2' },
        { title: 'Chemistry: The Central Science', author: 'Brown & LeMay', isbn: '978-0134414232', category: 'Sciences', qty: 4, cost: 36000, shelf: 'B2' },
        { title: 'Biology: A Global Approach', author: 'Neil Campbell', isbn: '978-1292341637', category: 'Sciences', qty: 4, cost: 34000, shelf: 'B2' },
        { title: 'Calculus: Early Transcendentals', author: 'James Stewart', isbn: '978-1285741550', category: 'Mathematics', qty: 5, cost: 32000, shelf: 'B3' },
        { title: 'Statistics for Business', author: 'David Anderson', isbn: '978-0357715857', category: 'Mathematics', qty: 4, cost: 28000, shelf: 'B3' },
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
        { title: 'Le Petit Prince', author: 'Antoine de Saint-Exupery', isbn: '978-0156012195', category: 'Languages', qty: 10, cost: 9500, shelf: 'E1' },
        { title: "L'Enfant Noir", author: 'Camara Laye', isbn: '978-2266083614', category: 'Languages', qty: 8, cost: 8500, shelf: 'E1' },
        { title: "Oxford Advanced Learner's Dictionary", author: 'Oxford University Press', isbn: '978-0194798488', category: 'Reference', qty: 15, cost: 25000, shelf: 'E2' },
        { title: 'Kinyarwanda-English Modern Dictionary', author: 'Emmanuel Bagabo', category: 'Reference', qty: 8, cost: 15000, shelf: 'E2' },
        { title: 'Collins World Atlas', author: 'Collins', isbn: '978-0008436162', category: 'Reference', qty: 6, cost: 20000, shelf: 'E2' },
        { title: 'A History of Modern Africa', author: 'Richard Reid', isbn: '978-1108790543', category: 'Humanities', qty: 5, cost: 26000, shelf: 'E3' },
        { title: 'Human Geography', author: 'Erin Fouberg', isbn: '978-1119626183', category: 'Humanities', qty: 4, cost: 28000, shelf: 'E3' },
    ];
    const books = [];
    for (let i = 0; i < bookData.length; i++) {
        const b = bookData[i];
        books.push(await prisma.book.create({
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
        }));
    }
    const borrowDays = 14;
    const outByBook = new Map();
    const loanRows = [];
    const borrowerPool = [
        ...studentUsers,
        ...teacherUsers.slice(0, 8),
    ];
    const canGoOut = (book, spec) => (outByBook.get(book.id) ?? 0) < spec.qty - 1;
    const pickLendable = () => {
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
            status: client_1.LoanStatus.RETURNED,
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
            status: client_1.LoanStatus.ACTIVE,
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
            status: client_1.LoanStatus.ACTIVE,
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
            status: client_1.LoanStatus.LOST,
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
    console.log(`  ✅ ${books.length} library titles + ${loanRows.length} loans seeded (24 out, 6 overdue, 2 lost)`);
    const HW_GENERAL = [
        {
            t: (s) => `${s.name}: exercise set from Unit ${1 + rand(6)}`,
            d: 'Answer all questions in your exercise book and show your working.',
        },
        {
            t: (s) => `${s.name}: past paper practice`,
            d: 'Attempt the paper under exam conditions; we mark together on the due day.',
            k: client_1.AssessmentKind.TEST,
        },
        {
            t: (s) => `${s.name} research assignment`,
            d: 'One page, handwritten. Cite at least two sources from the library.',
            k: client_1.AssessmentKind.ASSIGNMENT,
        },
        {
            t: (s) => `${s.name}: revision worksheet`,
            d: 'Complete the worksheet and bring questions on the hard items.',
            k: client_1.AssessmentKind.HOMEWORK,
        },
    ];
    const HW_TRADE = [
        {
            t: (s) => `${s.name}: practical report`,
            d: 'Write up the last lab session: objective, steps, result, what went wrong.',
            k: client_1.AssessmentKind.PRACTICAL,
        },
        {
            t: (s) => `${s.name}: project milestone`,
            d: 'Bring your project to the next checkpoint and be ready to demo it.',
            k: client_1.AssessmentKind.PROJECT,
        },
        {
            t: (s) => `${s.name}: task write-up`,
            d: 'Document the assigned task following the workshop template.',
            k: client_1.AssessmentKind.ASSIGNMENT,
        },
    ];
    const studentsBySection = new Map();
    for (const e of enrolled) {
        const list = studentsBySection.get(e.meta.section.id) ?? [];
        list.push(e.student);
        studentsBySection.set(e.meta.section.id, list);
    }
    const now = new Date();
    const hwSubmissionRows = [];
    let hwCount = 0;
    for (const meta of sectionMetas) {
        const classStudents = studentsBySection.get(meta.section.id) ?? [];
        const subjects = subjectsForSection(meta);
        for (const term of begunTerms) {
            const dates = schoolDaysByTerm.get(term.id);
            const n = 3 + rand(3);
            for (let k = 0; k < n; k++) {
                const subject = sample(subjects);
                const isTrade = subject.scope === client_1.SubjectScope.A_SPECIFIC;
                const isCurrent = term.id === currentTerm.id;
                const due = isCurrent && k === n - 1
                    ? addDays(today, rand(5) - 2)
                    : dates[Math.min(dates.length - 1, 10 + rand(Math.max(1, dates.length - 12)))];
                const dueAt = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 15, 0));
                const tpl = isTrade ? sample(HW_TRADE) : sample(HW_GENERAL);
                const maxMarks = sample([10, 20, 20, 30]);
                const hw = await prisma.homework.create({
                    data: {
                        teacherId: teacherOf(meta.section.id, subject.id).id,
                        subjectId: subject.id,
                        classSectionId: meta.section.id,
                        termId: term.id,
                        kind: tpl.k ?? client_1.AssessmentKind.HOMEWORK,
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
                    const prof = attProfileOf.get(st.id);
                    if (dueAt > now) {
                        if (!chance(0.35))
                            continue;
                    }
                    else if (!chance(prof.chronic ? 0.55 : 0.86)) {
                        continue;
                    }
                    const late = dueAt <= now && chance(prof.chronic ? 0.25 : 0.07);
                    const sd = late ? addDays(due, 1 + rand(3)) : addDays(due, -rand(3));
                    const submittedAt = minDate(new Date(Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate(), 14 + rand(5), rand(60))), now);
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
    console.log(`  ✅ ${hwCount} homeworks + ${hwSubmissionRows.length} submissions seeded across every class`);
    const conv1 = await prisma.conversation.create({
        data: { type: client_1.ConversationType.ONE_ON_ONE, createdByUserId: admin.id },
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
            contentType: client_1.MessageContentType.TEXT,
        },
    });
    const conv2 = await prisma.conversation.create({
        data: {
            type: client_1.ConversationType.BROADCAST,
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
            contentType: client_1.MessageContentType.TEXT,
        },
    });
    const staffThreads = [
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
                type: client_1.ConversationType.GROUP,
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
                    contentType: client_1.MessageContentType.TEXT,
                    createdAt: minDate(addDays(today, -(lines.length - i) - rand(4)), today),
                },
            });
            msgCount++;
        }
        convCount++;
    }
    const parentThreads = [
        ['Good afternoon, could you tell me how my son is finding Mathematics this term?', 'He has improved a lot since Term 1, particularly on the written work. Keep him practising past papers.'],
        ['My daughter was unwell on Tuesday, I have sent a note with her today.', 'Thank you for letting us know, I have marked it as excused.'],
        ['Will there be extra lessons before the end of term exams?', 'Yes, Saturdays from the 9th, 9am to noon. No charge.'],
    ];
    for (let i = 0; i < parentThreads.length; i++) {
        const parent = parentUsers[i * 7];
        const teacher = teacherUsers[i % teacherUsers.length];
        if (!parent || !teacher)
            continue;
        const conv = await prisma.conversation.create({
            data: { type: client_1.ConversationType.ONE_ON_ONE, createdByUserId: parent.id },
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
                contentType: client_1.MessageContentType.TEXT,
                createdAt: minDate(addDays(today, -(3 + i)), today),
            },
        });
        await prisma.message.create({
            data: {
                conversationId: conv.id,
                senderUserId: teacher.id,
                content: reply,
                contentType: client_1.MessageContentType.TEXT,
                createdAt: minDate(addDays(today, -(2 + i)), today),
            },
        });
        convCount++;
        msgCount += 2;
    }
    let classGroups = 0;
    let seededGroup = null;
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
                where: { classSectionId: section.id, status: client_1.StudentStatus.ACTIVE },
                select: { userId: true },
            }),
            prisma.teacherRole.findFirst({
                where: { role: client_1.SpecialRole.CLASS_TEACHER, classSectionId: section.id },
                select: { teacher: { select: { userId: true } } },
            }),
        ]);
        const responsible = classTeacher?.teacher?.userId ?? admin.id;
        const members = [
            ...new Set([...students.map((s) => s.userId), responsible]),
        ];
        if (members.length === 0)
            continue;
        const conv = await prisma.conversation.create({
            data: {
                type: client_1.ConversationType.GROUP,
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
        if (!seededGroup)
            seededGroup = { id: conv.id, name: conv.name, members };
    }
    console.log(`  ✅ ${classGroups} class groups seeded`);
    console.log(`  ✅ ${convCount} conversations + ${msgCount} messages seeded`);
    const notices = [
        { userId: admin.id, title: 'Term 2 marks are due', message: 'Nine teachers have not finished entering Term 2 marks. Reports print on Tuesday.', type: client_1.NotificationType.PUSH, subject: notification_target_1.NotificationSubject.MARKS, daysAgo: 0 },
        { userId: admin.id, title: 'Six books are overdue', message: 'Six library titles are past their return date, the oldest by 21 days.', type: client_1.NotificationType.EMAIL, subject: notification_target_1.NotificationSubject.BOOK_LOAN, daysAgo: 1 },
        { userId: admin.id, title: 'Attendance below 90%', message: 'Senior 2 B attendance was 87% this week, the lowest in the school.', type: client_1.NotificationType.PUSH, subject: notification_target_1.NotificationSubject.ATTENDANCE, daysAgo: 2 },
        { userId: admin.id, title: 'A discipline appeal is waiting', message: 'A parent has appealed an incident and is waiting on a decision.', type: client_1.NotificationType.EMAIL, subject: notification_target_1.NotificationSubject.DISCIPLINE, daysAgo: 3 },
        { userId: admin.id, title: 'System Ready', message: 'Markova Academy system has been set up successfully.', type: client_1.NotificationType.EMAIL, daysAgo: 6 },
    ];
    for (const t of teacherUsers.slice(0, 6)) {
        notices.push({
            userId: t.id,
            title: 'Marks entry closes Friday',
            message: 'Please enter Term 2 marks for your classes before Friday.',
            type: client_1.NotificationType.PUSH,
            subject: notification_target_1.NotificationSubject.MARKS,
            daysAgo: rand(4),
        });
    }
    for (const p of parentUsers.slice(0, 8)) {
        notices.push({
            userId: p.id,
            title: 'Report card published',
            message: "Your child's Term 2 report card is now available to view.",
            type: client_1.NotificationType.EMAIL,
            subject: notification_target_1.NotificationSubject.REPORT_CARD,
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
    if (seededGroup) {
        const readers = seededGroup.members.slice(0, 12);
        const where = seededGroup.name ?? 'a conversation';
        await prisma.notification.createMany({
            data: [
                ...readers.map((userId, i) => ({
                    userId,
                    title: `${2 + (i % 4)} new messages in ${where}`,
                    message: 'Please bring your practical notebooks tomorrow.',
                    type: client_1.NotificationType.PUSH,
                    relatedEntityType: 'MESSAGE',
                    relatedEntityId: seededGroup.id,
                    count: 2 + (i % 4),
                    isRead: false,
                    createdAt: new Date(Date.now() - (2 + i) * 3600_000),
                })),
                ...readers.slice(0, 4).map((userId) => ({
                    userId,
                    title: `Aline mentioned you in ${where}`,
                    message: '@you can you check the Term 2 marks before Friday',
                    type: client_1.NotificationType.PUSH,
                    relatedEntityType: 'MENTION',
                    relatedEntityId: seededGroup.id,
                    isRead: false,
                    createdAt: new Date(Date.now() - 3600_000),
                })),
            ],
        });
        console.log(`  ✅ ${readers.length + 4} message notifications waiting in the bell`);
    }
    const ticketRows = [
        { user: teacherUsers[0], title: 'Projector in Senior 1 A will not connect', description: 'The HDMI port is loose and the picture cuts out during lessons.', category: 'Technical', status: 'OPEN', daysAgo: 1 },
        { user: teacherUsers[1], title: 'Cannot enter marks for Level 4 SWD', description: 'The subject does not appear in my list even though I teach it.', category: 'Account', status: 'IN_PROGRESS', daysAgo: 3 },
        { user: parentUsers[0], title: 'Report card shows the wrong term', description: 'Term 2 marks appear under Term 3 on the card I downloaded.', category: 'Bug Report', status: 'RESOLVED', daysAgo: 9 },
        { user: teacherUsers[2], title: 'Add a column for practical marks', description: 'TVET subjects are marked on theory and practical separately.', category: 'Feature Request', status: 'OPEN', daysAgo: 5 },
        { user: librarianUser, title: 'Barcode scanner types the wrong digits', description: 'Every scan drops the last character of the book code.', category: 'Technical', status: 'IN_PROGRESS', daysAgo: 2 },
    ].filter((t) => t.user);
    await prisma.supportTicket.createMany({
        data: ticketRows.map((t) => ({
            userId: t.user.id,
            title: t.title,
            description: t.description,
            category: t.category,
            status: t.status,
            createdAt: minDate(addDays(today, -t.daysAgo), today),
            resolvedAt: t.status === 'RESOLVED'
                ? minDate(addDays(today, -(t.daysAgo - 2)), today)
                : null,
        })),
    });
    console.log(`  ✅ ${ticketRows.length} support tickets seeded`);
    const admissionYear = allYears[2].year;
    const s1Level = classLevels.find((l) => l.name === 'Senior 1');
    const l3Level = classLevels.find((l) => l.name === 'Level 3');
    const s4Level = classLevels.find((l) => l.name === 'Level 4');
    const intakeRows = [
        {
            level: s1Level,
            entryPoint: 'SENIOR_ONE',
            name: `Senior 1 intake, ${admissionYear.name}`,
            places: 80,
            count: 120,
        },
        {
            level: l3Level,
            entryPoint: 'ADVANCED_LEVEL',
            name: `Level 3 trade intake, ${admissionYear.name}`,
            places: 60,
            count: 45,
        },
        {
            level: s4Level,
            entryPoint: 'TRANSFER',
            name: `Transfers, ${admissionYear.name}`,
            places: 12,
            count: 14,
        },
    ].filter((r) => r.level);
    const intakes = [];
    for (const row of intakeRows) {
        intakes.push(await prisma.admissionIntake.create({
            data: {
                academicYearId: admissionYear.id,
                classLevelId: row.level.id,
                entryPoint: row.entryPoint,
                name: row.name,
                places: row.places,
                opensAt: addDays(today, -42),
                closesAt: addDays(today, 14),
                isOpen: true,
            },
        }));
    }
    const examMark = () => {
        const rolls = [Math.random(), Math.random(), Math.random()];
        const middle = rolls.reduce((a, b) => a + b, 0) / 3;
        return Math.round(24 + middle * 62);
    };
    const GUARDIAN_RELATIONS = ['Mother', 'Father', 'Guardian', 'Aunt', 'Uncle'];
    const FUNDING_WITH_LETTER = [
        { funding: 'DISTRICT_BURSARY', detail: 'District bursary, confirmed by the sector office' },
        { funding: 'GOVERNMENT_SPONSORED', detail: 'Government sponsorship, NESA placement' },
        { funding: 'NGO_SPONSOR', detail: 'Sponsored by Compassion Rwanda' },
        { funding: 'FARG', detail: 'FARG entitlement, genocide survivors fund' },
        { funding: 'STAFF_CHILD', detail: 'Child of a member of staff' },
    ];
    const DOC_KINDS = {
        SENIOR_ONE: ['BIRTH_CERTIFICATE', 'NATIONAL_EXAM_RESULT', 'PREVIOUS_REPORT_CARD', 'PASSPORT_PHOTO', 'PARENT_ID'],
        ADVANCED_LEVEL: ['BIRTH_CERTIFICATE', 'NATIONAL_EXAM_RESULT', 'PREVIOUS_REPORT_CARD', 'PASSPORT_PHOTO', 'PARENT_ID'],
        TRANSFER: ['BIRTH_CERTIFICATE', 'TRANSFER_LETTER', 'PREVIOUS_REPORT_CARD', 'PASSPORT_PHOTO', 'PARENT_ID'],
    };
    const REJECTION_REASONS = [
        'Below the mark for this intake',
        'The intake was full before this application was reviewed',
        'The trade applied for has no places left, and no second choice was given',
        'Age outside the range for this level',
    ];
    const appRows = [];
    const docRows = [];
    const eventRows = [];
    const noteRows = [];
    const offerRows = [];
    let appSeq = 0;
    const admissionsClassCounts = new Map();
    const buildApplication = (intake, entryPoint, opts = {}) => {
        const gender = chance(0.51) ? client_1.Gender.FEMALE : client_1.Gender.MALE;
        const child = opts.twinOf
            ? { first: opts.twinOf.firstName, last: opts.twinOf.lastName }
            : studentName(gender, admissionsClassCounts);
        const guardianGender = chance(0.6) ? client_1.Gender.FEMALE : client_1.Gender.MALE;
        const guardian = adultName(guardianGender);
        const area = sample(chance(0.55) ? KIGALI_AREAS : UPCOUNTRY_AREAS);
        const isBoarder = chance(0.34);
        const funded = chance(0.12);
        const money = funded ? sample(FUNDING_WITH_LETTER) : null;
        const age = entryPoint === 'SENIOR_ONE' ? 12 + rand(2) : 15 + rand(3);
        const dob = opts.twinOf?.dateOfBirth ??
            new Date(today.getFullYear() - age, rand(12), 1 + rand(27));
        const submittedAt = addDays(today, -(1 + rand(40)));
        appSeq += 1;
        const reference = `APP-${today.getFullYear()}-${String(appSeq).padStart(4, '0')}`;
        const required = [
            ...DOC_KINDS[entryPoint],
            ...(isBoarder ? ['MEDICAL_FORM', 'INSURANCE_CARD'] : []),
            ...(funded ? ['BURSARY_LETTER'] : []),
        ];
        const complete = chance(0.55);
        const attached = complete
            ? required
            : shuffled(required).slice(0, Math.max(2, required.length - (1 + rand(2))));
        let status;
        if (opts.forceStatus) {
            status = opts.forceStatus;
        }
        else if (!complete) {
            status = chance(0.72) ? 'INFO_REQUESTED' : 'SUBMITTED';
        }
        else {
            const roll = Math.random();
            status =
                roll < 0.2
                    ? 'SUBMITTED'
                    : roll < 0.36
                        ? 'UNDER_REVIEW'
                        : roll < 0.46
                            ? 'WAITLISTED'
                            : roll < 0.68
                                ? 'OFFERED'
                                : roll < 0.78
                                    ? 'ACCEPTED'
                                    : roll < 0.92
                                        ? 'REJECTED'
                                        : 'WITHDRAWN';
        }
        const id = (0, crypto_1.randomUUID)();
        appRows.push({
            id,
            intakeId: intake.id,
            reference,
            status,
            firstName: child.first,
            lastName: child.last,
            dateOfBirth: dob,
            gender,
            nationality: 'Rwandan',
            province: area.province,
            district: area.district,
            sector: sample(area.sectors),
            cell: sample(CELLS),
            village: sample(VILLAGES),
            previousSchool: entryPoint === 'SENIOR_ONE' ? sample(PRIMARY_SCHOOLS) : sample(SECONDARY_SCHOOLS),
            examMark: entryPoint === 'TRANSFER' ? null : examMark(),
            examTotal: entryPoint === 'TRANSFER' ? null : 100,
            tradeId: entryPoint === 'ADVANCED_LEVEL' ? sample(trades).id : null,
            secondChoiceTradeId: entryPoint === 'ADVANCED_LEVEL' && chance(0.7) ? sample(trades).id : null,
            isBoarder,
            funding: money?.funding ?? 'FAMILY',
            fundingDetail: money?.detail ?? null,
            bloodType: chance(0.4) ? sample(['A+', 'B+', 'O+', 'AB+', 'O-']) : null,
            allergies: chance(0.12) ? sample(['Peanuts', 'Dust', 'Penicillin']) : null,
            medicalConditions: chance(0.08) ? sample(['Asthma', 'Sickle cell trait']) : null,
            disability: chance(0.03) ? sample(['Low vision', 'Hearing impairment']) : null,
            insuranceNumber: chance(0.7) ? `MUT-${100000 + rand(899999)}` : null,
            religion: sample(['Catholic', 'Protestant', 'Adventist', 'Muslim', null]),
            guardianName: `${guardian.first} ${guardian.last}`,
            guardianPhone: opts.twinOf?.guardianPhone ?? `+2507${sample(['8', '2'])}${1000000 + rand(8999999)}`,
            guardianEmail: chance(0.45)
                ? `${guardian.first.toLowerCase()}.${guardian.last.toLowerCase()}@gmail.com`
                : null,
            guardianNationalId: chance(0.8) ? makeNid(guardianGender, 1985 + rand(15)) : null,
            guardianRelation: sample(GUARDIAN_RELATIONS),
            note: chance(0.18)
                ? sample([
                    'The child has a sibling already at the school.',
                    'We would like the boarding option if a place is available.',
                    'The father works abroad; please call the mother.',
                    'We are applying to two schools and will confirm quickly.',
                ])
                : null,
            submittedAt,
            decidedAt: ['REJECTED', 'WITHDRAWN', 'ENROLLED'].includes(status)
                ? addDays(submittedAt, 3 + rand(10))
                : null,
        });
        for (const kind of attached) {
            docRows.push({
                applicationId: id,
                kind,
                fileUrl: `/uploads/admissions/${id}-${kind.toLowerCase()}.pdf`,
                fileName: `${kind.toLowerCase().replace(/_/g, '-')}.pdf`,
                verifiedAt: chance(0.7) ? addDays(submittedAt, 1 + rand(4)) : null,
                verifiedByUserId: chance(0.7) ? admin.id : null,
                uploadedAt: submittedAt,
            });
        }
        eventRows.push({
            applicationId: id,
            fromStatus: null,
            toStatus: 'SUBMITTED',
            reason: 'Received from the admissions site',
            createdAt: submittedAt,
        });
        const step = (from, to, reason, day) => eventRows.push({
            applicationId: id,
            fromStatus: from,
            toStatus: to,
            reason,
            actorUserId: admin.id,
            createdAt: addDays(submittedAt, day),
        });
        if (status === 'INFO_REQUESTED') {
            const missing = required.filter((k) => !attached.includes(k));
            step('SUBMITTED', 'UNDER_REVIEW', null, 1 + rand(3));
            step('UNDER_REVIEW', 'INFO_REQUESTED', `Asked for: ${missing.join(', ').toLowerCase().replace(/_/g, ' ')}`, 2 + rand(4));
        }
        else if (status !== 'SUBMITTED') {
            step('SUBMITTED', 'UNDER_REVIEW', null, 1 + rand(3));
            if (status === 'WAITLISTED') {
                step('UNDER_REVIEW', 'WAITLISTED', 'Strong application, no place left in this intake', 4 + rand(4));
            }
            else if (status === 'REJECTED') {
                step('UNDER_REVIEW', 'REJECTED', sample(REJECTION_REASONS), 4 + rand(6));
            }
            else if (status === 'WITHDRAWN') {
                step('UNDER_REVIEW', 'WITHDRAWN', 'The family took a place elsewhere', 5 + rand(8));
            }
            else if (status === 'OFFERED' || status === 'ACCEPTED') {
                const sections = sectionMetas.filter((m) => m.level.id === intake.classLevelId);
                const section = sections.length ? sample(sections).section : null;
                if (section) {
                    const expiresAt = addDays(today, status === 'OFFERED' ? 2 + rand(12) : -(1 + rand(4)));
                    offerRows.push({
                        applicationId: id,
                        classSectionId: section.id,
                        isBoarder,
                        termFee: isBoarder ? 195000 + rand(60) * 500 : 120000 + rand(40) * 500,
                        conditions: chance(0.2) ? 'Subject to the original results slip being produced' : null,
                        expiresAt,
                        offeredByUserId: admin.id,
                        offeredAt: addDays(submittedAt, 5 + rand(5)),
                        acceptedAt: status === 'ACCEPTED' ? addDays(submittedAt, 8 + rand(5)) : null,
                    });
                    step('UNDER_REVIEW', 'OFFERED', `Place offered in ${section.name}`, 5 + rand(5));
                    if (status === 'ACCEPTED') {
                        eventRows.push({
                            applicationId: id,
                            fromStatus: 'OFFERED',
                            toStatus: 'ACCEPTED',
                            reason: 'Place accepted by the family',
                            createdAt: addDays(submittedAt, 8 + rand(5)),
                        });
                    }
                }
            }
        }
        if (chance(0.22)) {
            noteRows.push({
                applicationId: id,
                body: sample([
                    'Spoke to the mother; the results slip is in the post.',
                    'Sibling already here, in Senior 3. Worth keeping together.',
                    'Phone rings out. Tried twice this week.',
                    'Marks look strong for the trade they picked.',
                    'Family asked whether the boarding fee can be paid in two parts.',
                ]),
                authorUserId: admin.id,
                createdAt: addDays(submittedAt, 2 + rand(6)),
            });
        }
        return appRows[appRows.length - 1];
    };
    for (const [i, row] of intakeRows.entries()) {
        for (let n = 0; n < row.count; n++) {
            buildApplication(intakes[i], row.entryPoint);
        }
    }
    const twinSource = appRows[2];
    if (twinSource) {
        buildApplication(intakes[0], 'SENIOR_ONE', { twinOf: twinSource, forceStatus: 'SUBMITTED' });
        buildApplication(intakes[0], 'SENIOR_ONE', {
            twinOf: { ...appRows[5], firstName: appRows[5].firstName, dateOfBirth: undefined },
            forceStatus: 'SUBMITTED',
        });
        buildApplication(intakes[0], 'SENIOR_ONE', { twinOf: twinSource, forceStatus: 'UNDER_REVIEW' });
    }
    await prisma.application.createMany({ data: appRows });
    for (let i = 0; i < docRows.length; i += 2000) {
        await prisma.applicationDocument.createMany({ data: docRows.slice(i, i + 2000) });
    }
    for (let i = 0; i < eventRows.length; i += 2000) {
        await prisma.applicationEvent.createMany({ data: eventRows.slice(i, i + 2000) });
    }
    if (noteRows.length)
        await prisma.applicationNote.createMany({ data: noteRows });
    if (offerRows.length)
        await prisma.admissionOffer.createMany({ data: offerRows });
    console.log(`  ✅ Admissions seeded: ${intakes.length} intakes, ${appRows.length} applications, ${docRows.length} documents, ${offerRows.length} offers`);
    const FEE_LINES = [
        { name: 'Tuition', appliesTo: client_1.FeeAppliesTo.ALL, base: 82000, step: 6000 },
        { name: 'Boarding', appliesTo: client_1.FeeAppliesTo.BOARDER, base: 58000, step: 2000 },
        { name: 'Meals', appliesTo: client_1.FeeAppliesTo.BOARDER, base: 44000, step: 1500 },
        { name: 'Transport', appliesTo: client_1.FeeAppliesTo.DAY, base: 24000, step: 0 },
        { name: 'Materials and practicals', appliesTo: client_1.FeeAppliesTo.ALL, base: 12000, step: 2500 },
        { name: 'Examinations', appliesTo: client_1.FeeAppliesTo.ALL, base: 5000, step: 500 },
    ];
    const feeItemRows = [];
    const billedTerms = [...allYears[1].terms, ...allYears[2].terms].filter((t) => t.startDate <= today);
    for (const term of billedTerms) {
        for (const level of classLevels) {
            FEE_LINES.forEach((line, position) => {
                feeItemRows.push({
                    termId: term.id,
                    classLevelId: level.id,
                    name: line.name,
                    amount: Math.round((line.base + line.step * (level.order - 1)) / 500) * 500,
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
    const itemsByTermLevel = new Map();
    for (const item of feeItems) {
        const key = `${item.termId}::${item.classLevelId}`;
        if (!itemsByTermLevel.has(key))
            itemsByTermLevel.set(key, []);
        itemsByTermLevel.get(key).push(item);
    }
    const payerOf = new Map();
    for (const st of students) {
        payerOf.set(st.id, chance(0.04)
            ? 'SPONSORED'
            : chance(0.46)
                ? 'PROMPT'
                : chance(0.5)
                    ? 'STEADY'
                    : chance(0.55)
                        ? 'LATE'
                        : 'STRUGGLING');
    }
    const demoStudent = enrolled.find((e) => e.user.email === 'student1@markova.edu');
    if (demoStudent)
        payerOf.set(demoStudent.student.id, 'STRUGGLING');
    const levelBySection = new Map(sectionMetas.map((m) => [m.section.id, m.level]));
    const invoiceRows = [];
    for (const term of billedTerms) {
        for (const st of students) {
            const level = levelBySection.get(st.classSectionId);
            if (!level)
                continue;
            const items = itemsByTermLevel.get(`${term.id}::${level.id}`) ?? [];
            if (items.length === 0)
                continue;
            const charges = (0, fees_1.chargesFor)(items, st.isBoarder);
            invoiceRows.push({
                studentId: st.id,
                termId: term.id,
                total: (0, fees_1.invoiceTotal)(charges),
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
    const invoiceIdBy = new Map(invoices.map((inv) => [`${inv.studentId}::${inv.termId}`, inv.id]));
    const lineRows = [];
    for (const row of invoiceRows) {
        const id = invoiceIdBy.get(`${row.studentId}::${row.termId}`);
        if (!id)
            continue;
        row.lines.forEach((line, position) => {
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
    const PAY_METHODS = [
        client_1.PaymentMethod.BANK_DEPOSIT,
        client_1.PaymentMethod.BANK_DEPOSIT,
        client_1.PaymentMethod.BANK_DEPOSIT,
        client_1.PaymentMethod.MOBILE_MONEY,
        client_1.PaymentMethod.MOBILE_MONEY,
        client_1.PaymentMethod.CASH,
        client_1.PaymentMethod.BANK_TRANSFER,
        client_1.PaymentMethod.CHEQUE,
    ];
    const referenceFor = (method, when) => {
        const stamp = `${String(when.getFullYear()).slice(2)}${String(when.getMonth() + 1).padStart(2, '0')}${String(when.getDate()).padStart(2, '0')}`;
        switch (method) {
            case client_1.PaymentMethod.MOBILE_MONEY:
                return `MP${stamp}.${1000 + rand(9000)}.A${10000 + rand(89999)}`;
            case client_1.PaymentMethod.BANK_DEPOSIT:
            case client_1.PaymentMethod.BANK_TRANSFER:
                return `BK/${stamp}/${100000 + rand(899999)}`;
            case client_1.PaymentMethod.CHEQUE:
                return `CHQ ${100000 + rand(899999)}`;
            default:
                return null;
        }
    };
    const settledShare = (kind, isPastTerm) => {
        if (kind === 'SPONSORED')
            return 0;
        if (isPastTerm) {
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
                return chance(0.4) ? 0 : Math.random() * 0.35;
        }
    };
    const paymentRows = [];
    const waiverRows = [];
    let receipt = null;
    const currentTermId = currentTerm.id;
    const WAIVERS = [
        { kind: client_1.WaiverKind.BURSARY, reason: 'School bursary, means-tested by the committee' },
        { kind: client_1.WaiverKind.SCHOLARSHIP, reason: 'Merit scholarship, top of the year group' },
        { kind: client_1.WaiverKind.SPONSORSHIP, reason: 'District bursary, confirmed by the sector office' },
        { kind: client_1.WaiverKind.HARDSHIP, reason: 'Remission after a bereavement in the family' },
        { kind: client_1.WaiverKind.STAFF_CHILD, reason: 'Staff child, half of tuition remitted' },
    ];
    for (const inv of invoices) {
        const kind = payerOf.get(inv.studentId) ?? 'STEADY';
        const isPastTerm = inv.termId !== currentTermId;
        const term = billedTerms.find((t) => t.id === inv.termId);
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
        const isDemoAccount = !!demoStudent && inv.studentId === demoStudent.student.id;
        let owedAfterWaiver = inv.total;
        if (!isDemoAccount && chance(0.05)) {
            const part = Math.round((inv.total * (0.25 + Math.random() * 0.35)) / 500) * 500;
            waiverRows.push({
                invoiceId: inv.id,
                kind: client_1.WaiverKind.STAFF_CHILD,
                amount: part,
                reason: WAIVERS[4].reason,
                grantedByUserId: bursarUser?.id ?? admin.id,
                createdAt: addDays(opened, 3 + rand(12)),
            });
            owedAfterWaiver -= part;
        }
        const share = isDemoAccount
            ? isPastTerm
                ? 1
                : 0.4
            : settledShare(kind, isPastTerm);
        let target = Math.round((owedAfterWaiver * share) / 500) * 500;
        if (target <= 0)
            continue;
        const instalments = share >= 1 ? 1 + rand(2) : 1 + rand(2);
        let paidSoFar = 0;
        for (let n = 0; n < instalments && paidSoFar < target; n++) {
            const last = n === instalments - 1;
            const amount = last
                ? target - paidSoFar
                : Math.round((target / instalments) / 500) * 500;
            if (amount <= 0)
                continue;
            const when = addDays(opened, 2 + n * (12 + rand(20)) + rand(8));
            const paidAt = when > today ? today : when;
            const method = sample(PAY_METHODS);
            receipt = (0, fees_1.nextReceiptNumber)(receipt, paidAt.getFullYear());
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
    const duplicates = shuffled(paymentRows).slice(0, 6);
    for (const original of duplicates) {
        receipt = (0, fees_1.nextReceiptNumber)(receipt, original.paidAt.getFullYear());
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
    console.log(`  ✅ Fees seeded: ${feeItemRows.length} price lines, ${invoices.length} invoices, ${paymentRows.length} receipts, ${waiverRows.length} waivers`);
    const boarders = students.filter((_, i) => i % 3 !== 2).slice(0, 240);
    const pmAccounts = [];
    for (const st of boarders) {
        pmAccounts.push({
            studentId: st.id,
            dailyLimit: sample([null, null, 1000, 2000, 2000, 5000]),
            lowBalanceAlert: sample([null, 1000, 2000]),
        });
    }
    await prisma.pocketMoneyAccount.createMany({ data: pmAccounts });
    const createdAccounts = await prisma.pocketMoneyAccount.findMany({
        select: { id: true, studentId: true },
    });
    const pmRows = [];
    const counterStaff = [admin.id, ...teacherUsers.slice(0, 2).map((t) => t.id)];
    for (const acct of createdAccounts) {
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
        const trips = rand(9);
        for (let w = 0; w < trips; w++) {
            const amount = sample([200, 300, 500, 500, 800, 1000, 1500]);
            if (amount > running)
                break;
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
    console.log(`  ✅ ${createdAccounts.length} pocket money accounts + ${pmRows.length} entries seeded`);
    const activityStaff = [admin.id, ...teacherUsers.slice(0, 4).map((t) => t.id)];
    const sectionLevelId = new Map(sectionMetas.map((m) => [m.section.id, m.level.id]));
    const oLevels = classLevels.filter((l) => l.stage === client_1.EducationStage.O_LEVEL);
    const aLevels = classLevels.filter((l) => l.stage === client_1.EducationStage.A_LEVEL);
    const dayAt = (offset, hour, minute = 0) => {
        const d = addDays(today, offset);
        d.setHours(hour, minute, 0, 0);
        return d;
    };
    const activityPlan = [
        { kind: client_1.ActivityKind.ASSEMBLY, title: 'Monday assembly', description: 'Flag raising, notices and the week ahead.', location: 'Assembly ground', offset: 3, hour: 7, hours: 1, audience: client_1.ActivityAudience.WHOLE_SCHOOL },
        { kind: client_1.ActivityKind.CLUB, title: 'Debate club', description: 'Weekly motion practice ahead of the inter-school debate.', location: 'Room 4', offset: 2, hour: 15, hours: 2, audience: client_1.ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true, capacity: 40 },
        { kind: client_1.ActivityKind.CLUB, title: 'Anti-AIDS club', description: 'Peer education session with the school nurse.', location: 'Room 7', offset: 5, hour: 15, hours: 1, audience: client_1.ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
        { kind: client_1.ActivityKind.CLUB, title: 'Umuganda club', description: 'Community work in the school garden and the road outside.', location: 'School garden', offset: 9, hour: 8, hours: 3, audience: client_1.ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
        { kind: client_1.ActivityKind.CLUB, title: 'ICT club', description: 'Robotics and web projects in the computer lab.', location: 'Computer lab', offset: 4, hour: 15, hours: 2, audience: client_1.ActivityAudience.LEVELS, levels: aLevels, tracksAttendance: true, capacity: 30 },
        { kind: client_1.ActivityKind.SPORT, title: 'Football against Groupe Scolaire Kacyiru', description: 'Home match, senior boys and girls.', location: 'School field', offset: 6, hour: 15, hours: 2, audience: client_1.ActivityAudience.WHOLE_SCHOOL },
        { kind: client_1.ActivityKind.SPORT, title: 'Inter-class volleyball', description: 'Class against class, all week.', location: 'Volleyball court', offset: 12, hour: 15, hours: 2, audience: client_1.ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
        { kind: client_1.ActivityKind.VISITING_DAY, title: 'Visiting day', description: 'Families may visit boarders between 10:00 and 16:00. Pocket money can be handed in at the office.', location: 'School grounds', offset: 10, hour: 10, hours: 6, audience: client_1.ActivityAudience.WHOLE_SCHOOL },
        { kind: client_1.ActivityKind.TRIP, title: 'Nyungwe forest trip', description: 'Senior 2 biology field trip. Depart 06:00, return by 19:00.', location: 'Nyungwe National Park', offset: 18, hour: 6, hours: 13, audience: client_1.ActivityAudience.LEVELS, levels: oLevels.slice(1, 2), requiresConsent: true, tracksAttendance: true, capacity: 45 },
        { kind: client_1.ActivityKind.TRIP, title: 'Kigali Genocide Memorial visit', description: 'Senior 3 history visit to Gisozi.', location: 'Kigali Genocide Memorial', offset: 24, hour: 8, hours: 5, audience: client_1.ActivityAudience.LEVELS, levels: oLevels.slice(2, 3), requiresConsent: true, tracksAttendance: true, capacity: 60 },
        { kind: client_1.ActivityKind.SCHOOL_EVENT, title: 'Parents meeting, Senior 1', description: 'First term progress and boarding arrangements.', location: 'School hall', offset: 15, hour: 14, hours: 2, audience: client_1.ActivityAudience.LEVELS, levels: oLevels.slice(0, 1) },
        { kind: client_1.ActivityKind.SCHOOL_EVENT, title: 'Career day', description: 'Alumni and employers talk to the TVET levels.', location: 'School hall', offset: 21, hour: 9, hours: 4, audience: client_1.ActivityAudience.LEVELS, levels: aLevels },
        { kind: client_1.ActivityKind.SPORT, title: 'Swimming gala', description: 'Inter-house gala at the Kigali pool.', location: 'Amahoro pool', offset: 8, hour: 9, hours: 4, audience: client_1.ActivityAudience.WHOLE_SCHOOL, requiresConsent: true, cancelled: 'The pool is closed for repairs. A new date will be announced.' },
        { kind: client_1.ActivityKind.ASSEMBLY, title: 'Term opening assembly', description: 'Welcome back and the term calendar.', location: 'Assembly ground', offset: -30, hour: 7, hours: 1, audience: client_1.ActivityAudience.WHOLE_SCHOOL },
        { kind: client_1.ActivityKind.SPORT, title: 'Cross country', description: 'Whole school run through Kimironko.', location: 'Kimironko', offset: -14, hour: 7, hours: 3, audience: client_1.ActivityAudience.WHOLE_SCHOOL, tracksAttendance: true },
        { kind: client_1.ActivityKind.VISITING_DAY, title: 'Visiting day (last month)', description: 'Families visited boarders.', location: 'School grounds', offset: -21, hour: 10, hours: 6, audience: client_1.ActivityAudience.WHOLE_SCHOOL },
    ];
    const createdActivities = [];
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
                        create: a.levels.map((l) => ({ classLevelId: l.id })),
                    },
                }),
            },
        });
        createdActivities.push({ ...activity, plan: a });
    }
    const activityParticipants = [];
    for (const activity of createdActivities) {
        const plan = activity.plan;
        if (!plan.tracksAttendance && !plan.requiresConsent)
            continue;
        if (activity.isCancelled)
            continue;
        const pool = plan.levels?.length
            ? students.filter((st) => plan.levels.some((l) => sectionLevelId.get(st.classSectionId) === l.id))
            : students;
        const size = Math.min(plan.capacity ?? 35, pool.length, 35);
        const chosen = shuffled(pool).slice(0, size);
        const past = plan.offset < 0;
        for (const st of chosen) {
            const consent = plan.requiresConsent
                ? sample([
                    client_1.ConsentState.GIVEN,
                    client_1.ConsentState.GIVEN,
                    client_1.ConsentState.GIVEN,
                    client_1.ConsentState.PENDING,
                    client_1.ConsentState.PENDING,
                    client_1.ConsentState.REFUSED,
                ])
                : client_1.ConsentState.PENDING;
            activityParticipants.push({
                activityId: activity.id,
                studentId: st.id,
                consent,
                consentByUserId: consent === client_1.ConsentState.PENDING ? null : sample(activityStaff),
                consentAt: consent === client_1.ConsentState.PENDING
                    ? null
                    : addDays(today, -(1 + rand(10))),
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
    console.log(`  ✅ ${createdActivities.length} activities + ${activityParticipants.length} sign-ups seeded`);
    const clinicalStaff = [admin.id, ...teacherUsers.slice(0, 2).map((t) => t.id)];
    const COMPLAINTS = [
        { complaint: 'Headache since morning assembly', findings: 'No fever. Slept badly.', treatment: 'Rest and water', severity: client_1.ClinicSeverity.MINOR, medicine: 'Paracetamol', dose: '500mg' },
        { complaint: 'Stomach ache after breakfast', findings: 'Tender, no fever', treatment: 'Rest, plain food', severity: client_1.ClinicSeverity.MINOR },
        { complaint: 'Toothache on the left side', findings: 'Swollen gum', treatment: 'Pain relief, dentist advised', severity: client_1.ClinicSeverity.MODERATE, medicine: 'Paracetamol', dose: '500mg' },
        { complaint: 'Cough and blocked nose for three days', findings: 'Mild fever, chest clear', treatment: 'Fluids and rest', severity: client_1.ClinicSeverity.MINOR },
        { complaint: 'Fever since last night', findings: '38.4 degrees', treatment: 'Antipyretic, kept in the sick bay', severity: client_1.ClinicSeverity.MODERATE, medicine: 'Paracetamol', dose: '500mg' },
        { complaint: 'Cut on the knee from the football pitch', findings: 'Superficial graze', treatment: 'Cleaned and dressed', severity: client_1.ClinicSeverity.MINOR },
        { complaint: 'Twisted ankle during the match', findings: 'Swelling, weight bearing painful', treatment: 'Cold compress, referred', severity: client_1.ClinicSeverity.SERIOUS },
        { complaint: 'Period pains', findings: 'No fever', treatment: 'Rest and pain relief', severity: client_1.ClinicSeverity.MINOR, medicine: 'Ibuprofen', dose: '200mg' },
        { complaint: 'Dizzy at assembly', findings: 'Skipped breakfast, low blood pressure', treatment: 'Sugar water, rest', severity: client_1.ClinicSeverity.MODERATE },
        { complaint: 'Rash on both arms', findings: 'Contact rash, no fever', treatment: 'Cream applied, watched', severity: client_1.ClinicSeverity.MINOR },
        { complaint: 'Malaria symptoms, chills and headache', findings: 'Temperature 38.9', treatment: 'Referred for a test', severity: client_1.ClinicSeverity.SERIOUS },
        { complaint: 'Eye redness and itching', findings: 'Conjunctivitis, both eyes', treatment: 'Drops, kept away from class', severity: client_1.ClinicSeverity.MODERATE },
    ];
    const HEALTH_CENTRES = [
        'Kacyiru Health Centre',
        'Kimironko Health Centre',
        'King Faisal Hospital',
        'Kibagabaga Hospital',
    ];
    const clinicPool = shuffled(students).slice(0, 150);
    const visitRows = [];
    const repeatOffenders = clinicPool.slice(0, 4);
    for (const st of clinicPool) {
        const visits = repeatOffenders.includes(st) ? 4 + rand(3) : rand(3);
        for (let v = 0; v < visits; v++) {
            const c = sample(COMPLAINTS);
            const daysAgo = rand(60);
            const outcome = c.severity === client_1.ClinicSeverity.SERIOUS
                ? sample([
                    client_1.ClinicVisitOutcome.REFERRED_OUT,
                    client_1.ClinicVisitOutcome.REFERRED_OUT,
                    client_1.ClinicVisitOutcome.SENT_HOME,
                ])
                : c.severity === client_1.ClinicSeverity.MODERATE
                    ? sample([
                        client_1.ClinicVisitOutcome.RESTING_IN_SICK_BAY,
                        client_1.ClinicVisitOutcome.RETURNED_TO_CLASS,
                    ])
                    : client_1.ClinicVisitOutcome.RETURNED_TO_CLASS;
            visitRows.push({
                studentId: st.id,
                complaint: c.complaint,
                findings: c.findings,
                treatment: c.treatment,
                severity: c.severity,
                outcome,
                temperature: c.severity === client_1.ClinicSeverity.MINOR
                    ? null
                    : Number((36.5 + Math.random() * 2.4).toFixed(1)),
                referredTo: outcome === client_1.ClinicVisitOutcome.REFERRED_OUT
                    ? sample(HEALTH_CENTRES)
                    : null,
                seenByUserId: sample(clinicalStaff),
                visitedAt: addDays(today, -daysAgo),
                dischargedAt: outcome === client_1.ClinicVisitOutcome.RESTING_IN_SICK_BAY && daysAgo > 0
                    ? addDays(today, -daysAgo)
                    : null,
                parentNotifiedAt: c.severity === client_1.ClinicSeverity.MINOR
                    ? null
                    : addDays(today, -daysAgo),
                updatedAt: addDays(today, -daysAgo),
                medicine: c.medicine,
                dose: c.dose,
            });
        }
    }
    for (const st of clinicPool.slice(4, 7)) {
        const c = COMPLAINTS.find((x) => x.severity === client_1.ClinicSeverity.MODERATE);
        visitRows.push({
            studentId: st.id,
            complaint: c.complaint,
            findings: c.findings,
            treatment: c.treatment,
            severity: c.severity,
            outcome: client_1.ClinicVisitOutcome.RESTING_IN_SICK_BAY,
            temperature: Number((37.8 + Math.random()).toFixed(1)),
            referredTo: null,
            seenByUserId: sample(clinicalStaff),
            visitedAt: addDays(today, 0),
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
    const CONDITIONS = [
        { chronicConditions: 'Asthma', regularMedication: 'Blue inhaler as needed', emergencyPlan: 'Inhaler is kept in the dormitory locker. If breathing does not settle in ten minutes, go to Kacyiru Health Centre.' },
        { chronicConditions: 'Sickle cell', regularMedication: 'Folic acid daily', emergencyPlan: 'Keep warm and hydrated. Any severe pain is an emergency, go straight to King Faisal.' },
        { chronicConditions: 'Epilepsy', regularMedication: 'Carbamazepine, morning and evening', emergencyPlan: 'Turn onto the side, do not restrain, time the seizure. Over five minutes, call an ambulance.' },
        { chronicConditions: 'Type 1 diabetes', regularMedication: 'Insulin before meals', emergencyPlan: 'Sugar and a snack if shaky or confused. Glucometer is with the nurse.' },
        { chronicConditions: 'Severe peanut allergy', allergyNotes: 'Peanuts and groundnut sauce', emergencyPlan: 'Adrenaline pen is in the sick bay fridge. Use it and call an ambulance.' },
    ];
    const healthRecordRows = [];
    const cardStudents = shuffled(students).slice(0, 60);
    for (const [i, st] of cardStudents.entries()) {
        const condition = i < 15 ? CONDITIONS[i % CONDITIONS.length] : {};
        healthRecordRows.push({
            studentId: st.id,
            ...condition,
            emergencyContactName: (() => {
                const n = adultName(sample([client_1.Gender.MALE, client_1.Gender.FEMALE]));
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
    console.log(`  ✅ ${visitRows.length} clinic visits + ${healthRecordRows.length} emergency cards seeded`);
    const MERITS = [
        { category: client_1.MeritCategory.HELPING_OTHERS, description: 'Stayed behind to help clear the science lab', points: 5 },
        { category: client_1.MeritCategory.HELPING_OTHERS, description: 'Walked a younger student to the sick bay and waited with her', points: 5 },
        { category: client_1.MeritCategory.ACADEMIC_EFFORT, description: 'Kept working at maths through the whole term despite a hard start', points: 8 },
        { category: client_1.MeritCategory.ACADEMIC_EFFORT, description: 'Best improvement in physics this term', points: 10 },
        { category: client_1.MeritCategory.LEADERSHIP, description: 'Led the Senior 2 debate team to the district final', points: 10 },
        { category: client_1.MeritCategory.LEADERSHIP, description: 'Ran the dormitory as head girl without a single complaint', points: 10 },
        { category: client_1.MeritCategory.SPORT, description: 'Scored the winning goal against Groupe Scolaire Kacyiru', points: 5 },
        { category: client_1.MeritCategory.SPORT, description: 'Captained the volleyball team all season', points: 8 },
        { category: client_1.MeritCategory.ARTS, description: 'Painted the mural in the school hall', points: 8 },
        { category: client_1.MeritCategory.ARTS, description: 'Wrote and directed the Liberation Day drama', points: 10 },
        { category: client_1.MeritCategory.SERVICE, description: 'Worked every umuganda in the school garden this term', points: 8 },
        { category: client_1.MeritCategory.SERVICE, description: 'Kept the library shelves in order without being asked', points: 5 },
        { category: client_1.MeritCategory.HONESTY, description: 'Handed in a wallet found on the football pitch', points: 10 },
        { category: client_1.MeritCategory.HONESTY, description: 'Owned up to breaking a lab flask nobody had seen', points: 8 },
        { category: client_1.MeritCategory.IMPROVEMENT, description: 'Turned around a difficult first term. No incidents since March.', points: 12 },
        { category: client_1.MeritCategory.IMPROVEMENT, description: 'Went from constant lateness to first in the classroom every day', points: 12 },
    ];
    const meritDays = schoolDaysByTerm.get(currentTerm.id) ?? [];
    const meritRows = [];
    const merited = shuffled(students).slice(0, 25);
    const award = (st) => {
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
    for (const st of merited)
        award(st);
    for (const st of merited.slice(0, 6)) {
        for (let m = 0; m < 1 + rand(2); m++)
            award(st);
    }
    await prisma.meritAward.createMany({ data: meritRows });
    const meritTotals = new Map();
    for (const row of meritRows) {
        meritTotals.set(row.studentId, (meritTotals.get(row.studentId) ?? 0) + row.points);
    }
    for (const [studentId, earned] of meritTotals) {
        const st = await prisma.student.findUnique({
            where: { id: studentId },
            select: { disciplinePoints: true },
        });
        if (!st)
            continue;
        await prisma.student.update({
            where: { id: studentId },
            data: {
                disciplinePoints: Math.min(conduct_1.TERM_CONDUCT_MARK, st.disciplinePoints + earned),
            },
        });
    }
    console.log(`  ✅ ${meritRows.length} merits seeded`);
    await prisma.faqArticle.createMany({
        data: [
            { title: 'How to reset my password?', content: 'Contact the school administrator to reset your password. You will receive an OTP on your registered phone number.', category: 'Account', displayOrder: 1 },
            { title: "How to check my child's marks?", content: 'Log in to the parent portal, navigate to the Marks section, and select the relevant term.', category: 'Marks', displayOrder: 2 },
            { title: 'How to report an absence?', content: 'Parents can report an absence through the mobile app or by contacting the class teacher directly.', category: 'Attendance', displayOrder: 3 },
        ],
    });
    console.log('  ✅ FAQ articles seeded');
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
    const timetableRows = [];
    const busyTeachers = new Map();
    const busyAt = (day, slot) => {
        const key = `${day}-${slot}`;
        if (!busyTeachers.has(key))
            busyTeachers.set(key, new Set());
        return busyTeachers.get(key);
    };
    let demandTotal = 0;
    for (let si = 0; si < sectionMetas.length; si++) {
        const meta = sectionMetas[si];
        const subjectsById = new Map(subjectsForSection(meta).map((s) => [s.id, s]));
        const remaining = new Map(planBySection.get(meta.section.id));
        for (const v of remaining.values())
            demandTotal += v;
        const roomFor = (subject) => subject.scope === client_1.SubjectScope.A_SPECIFIC
            ? TRADE_ROOMS[meta.trade.code]
            : sectionRoom(si);
        for (const day of [1, 2, 3, 4, 5]) {
            const todayCount = new Map();
            const occupied = new Set();
            const place = (subjectId, atSlot) => {
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
                    room: roomFor(subjectsById.get(subjectId)),
                });
                remaining.set(subjectId, remaining.get(subjectId) - 1);
                todayCount.set(subjectId, (todayCount.get(subjectId) ?? 0) + 1);
            };
            for (let slot = 0; slot < timeSlots.length; slot++) {
                if (occupied.has(slot))
                    continue;
                const taken = busyAt(day, slot);
                let chosen = null;
                let asDouble = false;
                const canDouble = slot !== 4 && slot + 1 < timeSlots.length && !occupied.has(slot + 1);
                if (canDouble) {
                    for (const [sid, left] of remaining) {
                        if (left < 2)
                            continue;
                        if (subjectsById.get(sid).scope !== client_1.SubjectScope.A_SPECIFIC)
                            continue;
                        if ((todayCount.get(sid) ?? 0) > 0)
                            continue;
                        const tid = teacherOf(meta.section.id, sid).id;
                        if (taken.has(tid) || busyAt(day, slot + 1).has(tid))
                            continue;
                        chosen = sid;
                        asDouble = true;
                        break;
                    }
                }
                if (!chosen) {
                    for (const pass of [0, 1]) {
                        let bestLeft = 0;
                        for (const [sid, left] of remaining) {
                            if (left <= 0)
                                continue;
                            if ((todayCount.get(sid) ?? 0) > pass)
                                continue;
                            if (taken.has(teacherOf(meta.section.id, sid).id))
                                continue;
                            if (left > bestLeft) {
                                bestLeft = left;
                                chosen = sid;
                            }
                        }
                        if (chosen)
                            break;
                    }
                }
                if (!chosen)
                    continue;
                place(chosen, slot);
                if (asDouble)
                    place(chosen, slot + 1);
            }
        }
    }
    await prisma.timetable.createMany({ data: timetableRows });
    console.log(`  ✅ ${timetableRows.length}/${demandTotal} weighted timetable periods placed across ${sectionMetas.length} classes`);
    const AVATAR_PALETTES = [
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
    const avatarsDir = (0, path_1.join)(uploadsDir, 'avatars');
    (0, fs_1.rmSync)(avatarsDir, { recursive: true, force: true });
    (0, fs_1.mkdirSync)(avatarsDir, { recursive: true });
    const avatarSvg = (first, last, key) => {
        const [a, b] = AVATAR_PALETTES[key % AVATAR_PALETTES.length];
        const initials = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
        return (`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">` +
            `<rect width="160" height="160" fill="${a}"/>` +
            `<path d="M0 160 L160 0 L160 160 Z" fill="${b}" opacity="0.85"/>` +
            `<text x="80" y="80" dy="0.36em" text-anchor="middle" ` +
            `font-family="Arial, Helvetica, sans-serif" font-size="62" ` +
            `font-weight="700" fill="#FFFFFF">${initials}</text></svg>`);
    };
    const hashOf = (s) => {
        let h = 0;
        for (const ch of s)
            h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return h;
    };
    const photoRows = [];
    const giveAvatar = (user, always = false, prob = 1) => {
        if (!always && !chance(prob))
            return;
        const file = `${user.id}.svg`;
        (0, fs_1.writeFileSync)((0, path_1.join)(avatarsDir, file), avatarSvg(user.firstName, user.lastName, hashOf(user.id)));
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
        await prisma.$executeRawUnsafe(`UPDATE users u SET photo_url = v.p FROM (VALUES ${values}) AS v(id, p) WHERE u.id = v.id`);
    }
    console.log(`  ✅ ${photoRows.length} profile avatars generated and linked`);
    const signaturesDir = (0, path_1.join)(uploadsDir, 'signatures');
    (0, fs_1.rmSync)(signaturesDir, { recursive: true, force: true });
    (0, fs_1.mkdirSync)(signaturesDir, { recursive: true });
    const signatureSvg = (first, last, key) => {
        let n = key >>> 0;
        const next = (spread, base = 0) => {
            n = (n * 1103515245 + 12345) >>> 0;
            return base + ((n >>> 8) % spread);
        };
        const baseline = 84;
        const capital = next(26, 46);
        const body = next(9, 11);
        const letters = 6 + next(5);
        const slant = next(10, -4);
        const capitalKind = key % 4;
        let d = `M20 ${baseline}`;
        let capitalEnd;
        if (capitalKind === 0) {
            d += ` C ${next(8, 4)} ${baseline - capital}, ${next(16, 34)} ${baseline - capital - next(12, 6)}, ${next(10, 44)} ${baseline - Math.floor(capital / 3)}`;
            d += ` S ${next(10, 22)} ${baseline + next(6, 2)}, ${next(12, 54)} ${baseline}`;
            capitalEnd = 20 + next(12, 54);
        }
        else if (capitalKind === 1) {
            d += ` L ${28 + next(6)} ${baseline - capital}`;
            d += ` q ${next(12, 22)} ${next(8, 2)}, ${next(8, 2)} ${Math.floor(capital / 2)}`;
            d += ` q ${next(8, -14)} ${next(6, 6)}, ${next(10, -18)} ${next(6, 2)}`;
            capitalEnd = 20 + next(14, 40);
        }
        else if (capitalKind === 2) {
            d += ` q ${next(6, -6)} ${-capital}, ${next(14, 26)} ${-capital + next(8, 4)}`;
            d += ` q ${next(12, 20)} ${next(8, 6)}, ${next(8, -4)} ${capital - next(10, 4)}`;
            capitalEnd = 20 + next(12, 44);
        }
        else {
            d += ` L ${26 + next(8)} ${baseline - capital}`;
            d += ` L ${38 + next(10)} ${baseline - next(12, 4)}`;
            d += ` L ${52 + next(8)} ${baseline - capital + next(10, 4)}`;
            d += ` L ${62 + next(8)} ${baseline}`;
            capitalEnd = 20 + next(10, 52);
        }
        let x = capitalEnd;
        const step = Math.floor((330 - x) / letters);
        for (let i = 0; i < letters; i++) {
            const rise = body + next(7);
            const dip = next(5);
            const y = baseline + Math.floor((slant * i) / letters);
            d += ` q ${Math.floor(step / 2)} ${-rise}, ${step} ${dip}`;
            x += step;
        }
        if (key % 4 === 0) {
            d += ` q ${next(10, 8)} ${next(14, 18)}, ${next(14, -6)} ${next(10, 6)}`;
        }
        d += ` L ${x + next(30, 34)} ${baseline + slant - next(10, 4)}`;
        const cross = key % 3 !== 0
            ? `<path d="M ${next(40, 44)} ${baseline + next(8, 14)} L ${next(70, 210)} ${baseline + next(8, 6)}" stroke-width="3" opacity="0.85"/>`
            : '';
        const initials = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
        return (`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="130" viewBox="0 0 420 130">` +
            `<title>${initials}</title>` +
            `<g fill="none" stroke="#132b45" stroke-linecap="round" stroke-linejoin="round">` +
            `<path d="${d}" stroke-width="${3.5 + (key % 3) * 0.5}"/>` +
            cross +
            `</g></svg>`);
    };
    const signatureRows = [];
    const giveSignature = (user) => {
        if (!user)
            return;
        const file = `${user.id}.svg`;
        (0, fs_1.writeFileSync)((0, path_1.join)(signaturesDir, file), signatureSvg(user.firstName, user.lastName, hashOf(user.id)));
        signatureRows.push({ id: user.id, url: `/uploads/signatures/${file}` });
    };
    giveSignature(admin);
    giveSignature(headTeacherUser);
    teacherUsers.forEach((u) => giveSignature(u));
    for (let i = 0; i < signatureRows.length; i += 500) {
        const values = signatureRows
            .slice(i, i + 500)
            .map((r) => `('${r.id}'::text, '${r.url}'::text)`)
            .join(',');
        await prisma.$executeRawUnsafe(`UPDATE users u SET signature_url = v.p FROM (VALUES ${values}) AS v(id, p) WHERE u.id = v.id`);
    }
    console.log(`  ✅ ${signatureRows.length} signatures generated for the people who sign`);
    const adoption = addDays(allYears[1].year.startDate, -7);
    const maxDate = (a, b) => (a > b ? a : b);
    const withTime = (d, hUtc) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hUtc, rand(60)));
    const recentLogin = (daysBack) => {
        let d = addDays(today, -rand(daysBack + 1));
        const dow = d.getUTCDay();
        if (dow === 0)
            d = addDays(d, -2);
        if (dow === 6)
            d = addDays(d, -1);
        return withTime(d, 4 + rand(14));
    };
    const lifeRows = [];
    const life = (id, created, login) => {
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
        const login = i === 0
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
        const created = addDays(maxDate(adoption, allYears[joinIdx].year.startDate), 3 + rand(21));
        const r = Math.random();
        const login = i === 0
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
        const login = pu.id === demoParent.id
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
        await prisma.$executeRawUnsafe(`UPDATE users u SET created_at = v.c, ` +
            `updated_at = GREATEST(v.c, COALESCE(v.l, v.c)), ` +
            `last_login_at = v.l, last_seen_at = v.s ` +
            `FROM (VALUES ${values}) AS v(id, c, l, s) WHERE u.id = v.id`);
    }
    const neverActivated = lifeRows.filter((r) => !r.login).length;
    console.log(`  ✅ Signs of life: ${lifeRows.length} accounts carry real created/login dates (${neverActivated} never activated)`);
    const oClasses = sectionMetas.filter((m) => !m.trade).length;
    const aClasses = sectionMetas.length - oClasses;
    console.log('\n🎉 Seed completed successfully!');
    console.log(`   ${teachers.length} teachers · ${students.length} students · ${parentUsers.length} parents`);
    console.log(`   ${oClasses} O-Level classes (Senior 1-3, streams A-B) + ${aClasses} A-Level classes (Level 3-5 × SWD/NIT/TOR/AUT)`);
    console.log(`   3 academic years of records · ${alumni.length} former students filling the past classes`);
    console.log(`   ${families.filter((f) => f.studentIds.length > 0).length} lineage families (${inheritedKids} students carry an inherited name)`);
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
//# sourceMappingURL=seed.js.map