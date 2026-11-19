// Every word the host app shows, in English and Kuwaiti Arabic.
// Keep both languages in step: TypeScript errors if a key is missing in Arabic.
//
// Layout:
//   t.<key>        app words (sign in, events list, settings, delete account) — the partner's first keys, kept
//   t.host.<key>   the web host page's words (host.html T), e.g. t.host.K.yes, t.host.nSendB(3)
//   t.door.<key>   the web door page's words (door.html T), e.g. t.door.checkInN(2, 3)
//   t.menu.<key>   the web Menu: Language · Colours · Help · Log out (core.js ML + DEFAULT_HELP)
//   t.login.<key>  the web login card (core.js LT), for the code sign-in
// Words: the hosts = «أهل المناسبة» (lib/words hostWord); guest = one invitation, person = one head.
// Coming «بيحضرون» · Can't come «اعتذروا» · No reply «ما ردوا» · Arrived «وصلوا».
import { doorAr, doorEn } from './door';
import { hostAr, hostEn } from './host';
import { BRAND, type Lang } from '../lib/words';
import type { Widen } from './widen';

export type { Lang };

const menuEn = {
  menu: 'Menu', close: 'Close', language: 'Language', colours: 'Colours', help: 'Help', cur: 'English', other: 'العربية',
  theme: { cream: 'Cream', light: 'Light', dark: 'Dark', auto: 'Phone' },
  logOut: 'Log out', undo: 'Undo',
  helpItems: [
    ['Something looks out of date?', 'Pull the page down to refresh it. When you’re online, changes from the rest of the team show up on their own.'],
    ['Language and colours', 'Change them here in the Menu. Your choice stays on this phone.'],
    ['Need a hand?', 'Message the person who set up your event.'],
  ] as [string, string][],
};
type MenuStrings = Widen<typeof menuEn>;
const menuAr: MenuStrings = {
  menu: 'القائمة', close: 'إغلاق', language: 'اللغة', colours: 'الألوان', help: 'مساعدة', cur: 'العربية', other: 'English',
  theme: { cream: 'كريمي', light: 'فاتح', dark: 'داكن', auto: 'مثل التلفون' },
  logOut: 'تسجيل خروج', undo: 'تراجع',
  helpItems: [
    ['فيه شي مو محدّث؟', 'اسحبوا الصفحة لتحت عشان تتحدث. وإذا النت شغال، تعديلات الباقين توصلكم بروحها.'],
    ['اللغة والألوان', 'تقدرون تغيرونها من هالقائمة، واختياركم ينحفظ على هالتلفون.'],
    ['تحتاجون مساعدة؟', 'كلموا الشخص اللي رتّب لكم المناسبة.'],
  ],
};

// The web login card (core.js LT). The app signs in with the 6-digit code only.
const loginEn = {
  kick: 'Welcome back', h: 'Log in', sub: 'Type your email and we’ll send you a 6-digit code.', email: 'Email', send: 'Send my code',
  kick2: 'Check your inbox', h2: 'Check your email', sent: (e: string) => `We sent a code to ${e}. Type it here.`,
  code: 'Code', verify: 'Log in', back: 'Use a different email', bad: 'Please enter a valid email', fail: 'Couldn’t send the email. Try again in a minute.',
  wrong: 'That code is wrong or has expired', cfgH: 'Almost there', cfgP: 'Add the Supabase details to app/.env first.',
};
type LoginStrings = Widen<typeof loginEn>;
const loginAr: LoginStrings = {
  kick: 'هلا والله', h: 'تسجيل الدخول', sub: 'اكتبوا إيميلكم ونرسل لكم رمز من 6 أرقام.', email: 'الإيميل', send: 'أرسلوا لي الرمز',
  kick2: 'شيّكوا الإيميل', h2: 'وصلكم إيميل', sent: (e) => `أرسلنا الرمز إلى ${e}. اكتبوه هني.`,
  code: 'الرمز', verify: 'دخول', back: 'استخدام إيميل ثاني', bad: 'اكتبوا إيميل صحيح', fail: 'ما قدرنا نرسل الإيميل. جربوا بعد دقيقة.',
  wrong: 'الرمز غلط أو انتهت صلاحيته', cfgH: 'باقي شوي', cfgP: 'أضيفوا بيانات Supabase في app/.env أول.',
};

const en = {
  appName: BRAND.en,
  // sign in (S1, S2) — same words as t.login
  signInTitle: 'Log in',
  signInSub: 'Type your email and we’ll send you a 6-digit code.',
  email: 'Email',
  emailPlaceholder: 'you@example.com',
  sendCode: 'Send my code',
  checkEmailTitle: 'Check your email',
  checkEmailSub: 'We sent a code to {email}. Type it here.',
  code: 'Code',
  logIn: 'Log in',
  useDifferentEmail: 'Use a different email',
  invalidEmail: 'Please enter a valid email',
  wrongCode: 'That code is wrong or has expired',
  couldNotSend: 'We couldn’t send the email. Try again in a minute.',
  // events (S3, H1)
  yourEvents: 'Your events',
  noEventsTitle: 'We’re preparing your event',
  noEventsSub: 'There’s no event linked to this email yet. Message us on WhatsApp and we’ll add it.',
  messageUs: 'Message us',
  coming: 'Coming',
  noReply: 'No reply',
  declined: 'Can’t come',
  arrived: 'Arrived',
  people: 'people',
  invitesUsed: '{used} of {limit} people invited',
  openDoor: 'Open the door screen',
  noDate: 'No date yet',
  couldNotLoad: 'Couldn’t load. Pull down to try again.',
  // door (D1) — legacy keys; the door screen uses t.door
  doorTitle: 'Door check-in',
  searchGuests: 'Find a guest by name or phone',
  markArrived: 'Check in',
  arrivedAt: 'Arrived {time}',
  seats: '{n} people',
  seat: '1 person',
  notComing: 'Can’t come',
  noMatches: 'Not on the list. Check with the hosts.',
  arrivedCount: '{n} of {total} people in',
  checkInFailed: 'Couldn’t do that. Check your connection and try again.',
  // settings
  settings: 'Settings',
  language: 'Language',
  english: 'English',
  arabic: 'العربية',
  colours: 'Colours',
  languageRestart: 'The app restarts to switch direction.',
  help: 'Help',
  support: 'Support',
  privacy: 'Privacy policy',
  signOut: 'Log out',
  signedInAs: 'Logged in as {email}',
  deleteAccount: 'Delete account',
  // delete account
  deleteTitle: 'Delete your account',
  deleteIntro: 'This deletes your login and your access to every event. It can’t be undone.',
  deleteEvents: 'These events have no other host, so they’ll be deleted with their guest lists:',
  deleteNoEvents: 'No events will be deleted: any event you’re part of has another host or is managed by us.',
  deleteGuests: '{n} guests',
  deleteAdmin: 'Admin accounts can’t be deleted from the app.',
  deleteTypeToConfirm: 'Type DELETE to confirm',
  deleteConfirm: 'Delete my account',
  deleteDone: 'Your account has been deleted.',
  deleteFailed: 'Couldn’t delete your account. Try again, or message us.',
  cancel: 'Cancel',
  back: 'Back',
  close: 'Close',
  // namespaces from the web pages
  host: hostEn,
  door: doorEn,
  menu: menuEn,
  login: loginEn,
};

export type Strings = Widen<typeof en>;

const ar: Strings = {
  appName: BRAND.ar,
  signInTitle: 'تسجيل الدخول',
  signInSub: 'اكتبوا إيميلكم ونرسل لكم رمز من 6 أرقام.',
  email: 'الإيميل',
  emailPlaceholder: 'you@example.com',
  sendCode: 'أرسلوا لي الرمز',
  checkEmailTitle: 'وصلكم إيميل',
  checkEmailSub: 'أرسلنا الرمز إلى {email}. اكتبوه هني.',
  code: 'الرمز',
  logIn: 'دخول',
  useDifferentEmail: 'استخدام إيميل ثاني',
  invalidEmail: 'اكتبوا إيميل صحيح',
  wrongCode: 'الرمز غلط أو انتهت صلاحيته',
  couldNotSend: 'ما قدرنا نرسل الإيميل. جربوا بعد دقيقة.',
  yourEvents: 'مناسباتكم',
  noEventsTitle: 'قاعدين نجهّز مناسبتكم',
  noEventsSub: 'هذا الإيميل مو مربوط بأي مناسبة للحين. راسلونا على الواتساب ونضيفها لكم.',
  messageUs: 'راسلونا',
  coming: 'بيحضرون',
  noReply: 'ما ردوا',
  declined: 'اعتذروا',
  arrived: 'وصلوا',
  people: 'أشخاص',
  invitesUsed: 'عزمتوا {used} من {limit}',
  openDoor: 'افتحوا شاشة الباب',
  noDate: 'ما في تاريخ للحين',
  couldNotLoad: 'ما قدرنا نحمّل. اسحبوا لتحت وجربوا مرة ثانية.',
  doorTitle: 'شاشة الباب',
  searchGuests: 'دوّروا بالاسم أو الرقم',
  markArrived: 'سجّلوا الوصول',
  arrivedAt: 'وصلوا {time}',
  seats: '{n} أشخاص',
  seat: 'شخص واحد',
  notComing: 'اعتذروا',
  noMatches: 'مو بالقائمة. اسألوا أهل المناسبة.',
  arrivedCount: 'وصل {n} من أصل {total}',
  checkInFailed: 'ما مشى. شيكوا على النت وحاولوا مرة ثانية.',
  settings: 'الإعدادات',
  language: 'اللغة',
  english: 'English',
  arabic: 'العربية',
  colours: 'الألوان',
  languageRestart: 'التطبيق يعيد التشغيل عشان يتغير الاتجاه.',
  help: 'مساعدة',
  support: 'الدعم',
  privacy: 'سياسة الخصوصية',
  signOut: 'تسجيل خروج',
  signedInAs: 'داخلين بإيميل {email}',
  deleteAccount: 'حذف الحساب',
  deleteTitle: 'حذف حسابكم',
  deleteIntro: 'هذا يحذف دخولكم وصلاحياتكم على كل المناسبات، وما يمديكم تتراجعون عنه.',
  deleteEvents: 'هالمناسبات ما لها أحد ثاني من أهل المناسبة، فبتنحذف مع قوائم ضيوفها:',
  deleteNoEvents: 'ما بتنحذف أي مناسبة: كل مناسبة أنتم فيها فيها أحد ثاني من أهل المناسبة أو نديرها احنا.',
  deleteGuests: '{n} ضيف',
  deleteAdmin: 'حسابات الإدارة ما تنحذف من التطبيق.',
  deleteTypeToConfirm: 'اكتبوا DELETE للتأكيد',
  deleteConfirm: 'احذفوا حسابي',
  deleteDone: 'انحذف حسابكم.',
  deleteFailed: 'ما قدرنا نحذف حسابكم. جربوا مرة ثانية أو راسلونا.',
  cancel: 'إلغاء',
  back: 'رجوع',
  close: 'إغلاق',
  host: hostAr,
  door: doorAr,
  menu: menuAr,
  login: loginAr,
};

export const strings: Record<Lang, Strings> = { en, ar };

/** fill('{n} of {total}', { n: 2, total: 5 }) */
export function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
