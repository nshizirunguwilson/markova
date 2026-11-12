import { Role } from '@prisma/client';

/**
 * The questions a school starts with.
 *
 * Help used to be three questions shown to everybody, so the nurse, the
 * bursar and a teacher were all told how to check "my child's marks". Each
 * question now says who it is for: an empty `audience` is everyone, and
 * anything else is shown only to those roles. The school can change or add
 * to these under Help & Support.
 *
 * Every answer names the menu the reader actually has, which is why they are
 * written per role rather than once.
 */
export interface StarterFaq {
  title: string;
  content: string;
  category: string;
  audience: Role[];
}

const STAFF_WITH_OWN_COMPUTER: Role[] = [
  Role.ADMIN,
  Role.HEAD_TEACHER,
  Role.TEACHER,
  Role.LIBRARIAN,
  Role.PATRON,
  Role.MATRON,
  Role.BURSAR,
  Role.NURSE,
  Role.PARENT,
];

export const STARTER_FAQS: StarterFaq[] = [
  // ─── Everyone ──────────────────────────────────────────────────────────────
  {
    title: 'I forgot my password. What do I do?',
    content:
      'On the sign in page choose "Forgot password?" and give the email or phone you sign in with. A code is sent to it, and with that code you choose a new password. If you no longer have that email or phone, ask the school office to reset your login.',
    category: 'Account',
    audience: [],
  },
  {
    title: 'How do I change my password, email or phone?',
    content:
      'Open your profile from your name at the top of the page. You can change your password there, and the email or phone you sign in with. A change of email or phone is confirmed with a code sent to the new one.',
    category: 'Account',
    audience: [],
  },
  {
    title: 'How do I send a message?',
    content:
      "Open Messages and start a new conversation. You are shown only the people you are allowed to write to. A chat between a member of staff and a student is always watched over by one of the school's safeguarding staff, and everyone in it is told so.",
    category: 'Messages',
    audience: [],
  },
  {
    title: 'I am on a computer other people use. Is that safe?',
    content:
      'Tick "This is a shared computer" when you sign in. You are then signed out after ten minutes of doing nothing, and nothing of yours is kept in the browser. If you forgot to sign out somewhere, open your profile and choose to sign out everywhere.',
    category: 'Account',
    audience: STAFF_WITH_OWN_COMPUTER,
  },

  // ─── Parents ───────────────────────────────────────────────────────────────
  {
    title: "How do I check my child's marks?",
    content:
      'Open Marks, choose the child if you have more than one at the school, then the term. Marks appear once the school has published them. The full report card is under Report Cards.',
    category: 'Marks',
    audience: [Role.PARENT],
  },
  {
    title: 'My child will be away from school. Who do I tell?',
    content:
      'Write to the class teacher from Messages, or call the school, before the day if you can. The teacher marks the register; you can see every day your child was present, late or absent under Attendance.',
    category: 'Attendance',
    audience: [Role.PARENT],
  },
  {
    title: 'How do I see what I owe in school fees?',
    content:
      'Open School Fees. It shows what was billed for the term, what has been paid, and what is still owed, with a receipt for every payment. Payments are made at the school and recorded by the bursar; they appear here as soon as they are.',
    category: 'Fees',
    audience: [Role.PARENT],
  },
  {
    title: "How do I follow my child's pocket money?",
    content:
      'Open Pocket Money. It lists everything paid in and everything given out, and the balance the school is holding. Money is handed to the patron or matron, who records it in front of you.',
    category: 'Boarding',
    audience: [Role.PARENT],
  },

  // ─── Students ──────────────────────────────────────────────────────────────
  {
    title: 'Where do I see my marks and my report card?',
    content:
      'Marks are under My Marks, by term, once your teachers have published them. Your report card is under Report Card once the school has issued it.',
    category: 'Marks',
    audience: [Role.STUDENT],
  },
  {
    title: 'How do I hand in my work?',
    content:
      "Open My Work. Each piece shows the subject, what is asked and the day it is due. Hand it in from there before that day; your teacher's mark and comment appear in the same place.",
    category: 'Homework',
    audience: [Role.STUDENT],
  },
  {
    title: 'Which library books do I have, and when are they due?',
    content:
      'Open Library. It lists the books you are holding with the day each is due back, and the ones you have returned.',
    category: 'Library',
    audience: [Role.STUDENT],
  },

  // ─── Teachers ──────────────────────────────────────────────────────────────
  {
    title: 'How do I enter marks?',
    content:
      'Open Marks Entry, choose the class, the subject and the assessment, type the marks and save. You can enter marks only for the classes and subjects you teach. If the connection drops, the marks are kept on your computer and sent when it returns.',
    category: 'Marks',
    audience: [Role.TEACHER],
  },
  {
    title: 'How do I mark the register?',
    content:
      'Open Attendance, choose the class and the day, mark each student and press Save. The register can be marked again on the same day to correct it.',
    category: 'Attendance',
    audience: [Role.TEACHER],
  },
  {
    title: 'How do I set homework or a test?',
    content:
      'Open Assessments and add a new one for a class you teach: what it is, the subject, the day it is due and the marks it is out of. Students see it under My Work, and what they hand in comes back to the same page for you to mark.',
    category: 'Homework',
    audience: [Role.TEACHER],
  },

  // ─── Head teacher (Director of Studies) ────────────────────────────────────
  {
    title: 'How do I issue report cards?',
    content:
      'Open Report cards. For each class it shows whether the marks are complete, worked out and published. Work out the results for the term, check them, then issue the cards: families and students see them from that moment.',
    category: 'Report cards',
    audience: [Role.HEAD_TEACHER],
  },
  {
    title: 'How do I see who is absent too often?',
    content:
      "Open Students. The attendance page lists today's register by class and the students whose attendance has fallen below the school's threshold, and lets you alert their families.",
    category: 'Attendance',
    audience: [Role.HEAD_TEACHER],
  },
  {
    title: 'How do I name a class teacher or a head of department?',
    content:
      'Open Teachers and choose the teacher. Their duties are listed on their page, where you can add or end one. A class has one class teacher at a time, so naming a new one hands the class over.',
    category: 'Staff',
    audience: [Role.HEAD_TEACHER, Role.ADMIN],
  },

  // ─── Principal ─────────────────────────────────────────────────────────────
  {
    title: 'How do I add a student or a member of staff?',
    content:
      'Open Users and add them one at a time, or use Bulk Import for a whole list. Each person is given a temporary password and must choose their own the first time they sign in.',
    category: 'People',
    audience: [Role.ADMIN],
  },
  {
    title: 'How do I open a new term or a new school year?',
    content:
      'Open Settings, then Academic. Add the year with its dates, add its terms inside those dates, and mark the one that is running as current. Marks, attendance and fees are all filed under the current term.',
    category: 'Settings',
    audience: [Role.ADMIN],
  },
  {
    title: 'Why can I not open marks, attendance or report cards?',
    content:
      'Those belong to the Director of Studies, who signs in as the head teacher. The principal runs the school and the Director of Studies runs its teaching, so the mark book is kept by one person.',
    category: 'Marks',
    audience: [Role.ADMIN],
  },

  // ─── Bursar ────────────────────────────────────────────────────────────────
  {
    title: 'How do I record a payment?',
    content:
      'Open Fee register, find the student and open their account, then choose "Record a payment". The receipt is numbered and can be printed at once. A payment recorded by mistake is voided, never deleted, so the account always shows what happened.',
    category: 'Fees',
    audience: [Role.BURSAR],
  },
  {
    title: 'How do I set what a term costs?',
    content:
      "Open Fee structure and set the amounts for each level and for boarders and day students. Raising the term's invoices from it bills every student on the roll.",
    category: 'Fees',
    audience: [Role.BURSAR],
  },

  // ─── Librarian ─────────────────────────────────────────────────────────────
  {
    title: 'How do I lend a book and take it back?',
    content:
      'Open Books, find the title and lend it to the student, with the day it is due. When it comes back, return it from the same page or from Borrowed books, which also lists everything that is overdue.',
    category: 'Library',
    audience: [Role.LIBRARIAN],
  },

  // ─── Patron and matron ─────────────────────────────────────────────────────
  {
    title: 'How do I record pocket money?',
    content:
      'Open Pocket Money and choose the student. Record money paid in by the family and money given out to the student; each entry is kept and the balance is worked out from them. An entry made by mistake is reversed, not deleted.',
    category: 'Boarding',
    audience: [Role.PATRON, Role.MATRON],
  },
  {
    title: 'A student in my care is unwell. What do I record?',
    content:
      'Open Health and record the visit to the clinic. The nurse adds what was found and any medicine given, and the family is told unless the student is an adult who has chosen to keep it private.',
    category: 'Health',
    audience: [Role.PATRON, Role.MATRON],
  },

  // ─── Nurse ─────────────────────────────────────────────────────────────────
  {
    title: 'How do I record a clinic visit?',
    content:
      'Open Health and choose "New visit". Record the complaint, what you found, any medicine and dose, and whether the student went back to class, to the dormitory or home. The student\'s allergies and conditions are shown as you write.',
    category: 'Health',
    audience: [Role.NURSE],
  },
  {
    title: 'Where are the support plans?',
    content:
      "Open Support plans. Each plan holds a student's needs, the arrangements for exams and the day it is next reviewed. Teachers see only the arrangements, and only for classes they teach.",
    category: 'Health',
    audience: [Role.NURSE, Role.HEAD_TEACHER],
  },
];

/** The starter questions as rows to create, in the order written above. */
export function starterFaqRows() {
  return STARTER_FAQS.map((faq, i) => ({ ...faq, displayOrder: i + 1 }));
}
