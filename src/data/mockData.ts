import type { Transaction, RecurringCharge, PortfolioLot, SavingsAccount, GemelFund, PensionFund, IncomeEntry, Goal, JournalEntry } from '../types';

const id = (n: number) => `mock-${n}`;

export const mockTransactions: Transaction[] = [
  { id: id(1), date: '2026-05-03', business: 'שופרסל דיל', amount: 487, currency: 'ILS', category: 'מזון וסופרמרקט', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(2), date: '2026-05-05', business: 'Wolt', amount: 89, currency: 'ILS', category: 'מסעדות וקפה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(3), date: '2026-05-05', business: 'Netflix', amount: 54, currency: 'ILS', category: 'מנויים ובידור', isRecurring: true, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(4), date: '2026-05-06', business: 'פז דלק', amount: 250, currency: 'ILS', category: 'תחבורה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(5), date: '2026-05-07', business: 'מכבי שירותי בריאות', amount: 120, currency: 'ILS', category: 'בריאות', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(6), date: '2026-05-08', business: 'Spotify', amount: 22, currency: 'ILS', category: 'מנויים ובידור', isRecurring: true, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(7), date: '2026-05-10', business: 'חברת חשמל', amount: 380, currency: 'ILS', category: 'שירותים', isRecurring: true, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(8), date: '2026-05-11', business: 'הוט נט', amount: 199, currency: 'ILS', category: 'תקשורת', isRecurring: true, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(9), date: '2026-05-12', business: 'רמי לוי', amount: 341, currency: 'ILS', category: 'מזון וסופרמרקט', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(10), date: '2026-05-13', business: 'Apple iCloud', amount: 9, currency: 'ILS', category: 'מנויים ובידור', isRecurring: true, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(11), date: '2026-05-14', business: 'ZARA', amount: 350, currency: 'ILS', category: 'קניות', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(12), date: '2026-05-15', business: 'קפה גרג', amount: 62, currency: 'ILS', category: 'מסעדות וקפה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(13), date: '2026-05-16', business: 'סלקום', amount: 149, currency: 'ILS', category: 'תקשורת', isRecurring: true, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(14), date: '2026-05-18', business: 'ועד בית', amount: 280, currency: 'ILS', category: 'שירותים', isRecurring: true, source: 'העברה', notes: '', pending: false, aiCategorized: true },
  { id: id(15), date: '2026-05-19', business: 'Wolt', amount: 73, currency: 'ILS', category: 'מסעדות וקפה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(16), date: '2026-05-20', business: 'סופרפארם', amount: 185, currency: 'ILS', category: 'בריאות', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(17), date: '2026-05-20', business: 'חניון עזריאלי', amount: 35, currency: 'ILS', category: 'תחבורה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(18), date: '2026-05-21', business: 'Amazon', amount: 156, currency: 'USD', category: 'קניות', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(19), date: '2026-05-22', business: 'Udemy', amount: 49, currency: 'USD', category: 'חינוך', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(20), date: '2026-05-23', business: 'מגדל ביטוח', amount: 420, currency: 'ILS', category: 'ביטוח', isRecurring: true, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(21), date: '2026-05-24', business: 'שופרסל אקספרס', amount: 215, currency: 'ILS', category: 'מזון וסופרמרקט', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(22), date: '2026-05-25', business: 'יפניקה', amount: 112, currency: 'ILS', category: 'מסעדות וקפה', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(23), date: '2026-05-01', business: 'ארנונה עיריית תל אביב', amount: 620, currency: 'ILS', category: 'ממשלתי', isRecurring: true, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(24), date: '2026-05-02', business: 'Google One', amount: 19, currency: 'ILS', category: 'מנויים ובידור', isRecurring: true, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(25), date: '2026-04-02', business: 'שופרסל דיל', amount: 512, currency: 'ILS', category: 'מזון וסופרמרקט', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(26), date: '2026-04-05', business: 'Wolt', amount: 95, currency: 'ILS', category: 'מסעדות וקפה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(27), date: '2026-04-08', business: 'חברת חשמל', amount: 360, currency: 'ILS', category: 'שירותים', isRecurring: true, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(28), date: '2026-04-10', business: 'פז דלק', amount: 220, currency: 'ILS', category: 'תחבורה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(29), date: '2026-04-15', business: 'IKEA', amount: 890, currency: 'ILS', category: 'קניות', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(30), date: '2026-04-18', business: 'Netflix', amount: 54, currency: 'ILS', category: 'מנויים ובידור', isRecurring: true, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(31), date: '2026-04-20', business: 'מכבי שירותי בריאות', amount: 80, currency: 'ILS', category: 'בריאות', isRecurring: false, source: 'מסטרקארד', notes: '', pending: false, aiCategorized: true },
  { id: id(32), date: '2026-04-22', business: 'רמי לוי', amount: 378, currency: 'ILS', category: 'מזון וסופרמרקט', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(33), date: '2026-03-03', business: 'שופרסל דיל', amount: 465, currency: 'ILS', category: 'מזון וסופרמרקט', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(34), date: '2026-03-10', business: 'תיקון מזגן - סביון שירות', amount: 1200, currency: 'ILS', category: 'אחר', isRecurring: false, source: 'מסטרקארד', notes: 'תיקון חירום', pending: false, aiCategorized: false },
  { id: id(35), date: '2026-03-15', business: 'פז דלק', amount: 240, currency: 'ILS', category: 'תחבורה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(36), date: '2026-03-20', business: 'חברת חשמל', amount: 410, currency: 'ILS', category: 'שירותים', isRecurring: true, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
  { id: id(37), date: '2026-03-25', business: 'Wolt', amount: 110, currency: 'ILS', category: 'מסעדות וקפה', isRecurring: false, source: 'ויזה כאל', notes: '', pending: false, aiCategorized: true },
];

export const mockRecurring: RecurringCharge[] = [
  { id: id(100), name: 'Netflix', category: 'מנויים ובידור', amount: 54, dayOfMonth: 5, card: 'מסטרקארד', active: true, cancelUrl: 'https://netflix.com' },
  { id: id(101), name: 'Spotify', category: 'מנויים ובידור', amount: 22, dayOfMonth: 8, card: 'מסטרקארד', active: true, cancelUrl: 'https://spotify.com' },
  { id: id(102), name: 'Apple iCloud', category: 'מנויים ובידור', amount: 9, dayOfMonth: 13, card: 'מסטרקארד', active: true },
  { id: id(103), name: 'Google One', category: 'מנויים ובידור', amount: 19, dayOfMonth: 2, card: 'מסטרקארד', active: true },
  { id: id(104), name: 'הוט נט', category: 'תקשורת', amount: 199, dayOfMonth: 10, card: 'ויזה כאל', active: true },
  { id: id(105), name: 'סלקום', category: 'תקשורת', amount: 149, dayOfMonth: 16, card: 'ויזה כאל', active: true },
  { id: id(106), name: 'מגדל ביטוח חיים', category: 'ביטוח', amount: 420, dayOfMonth: 20, card: 'ויזה כאל', active: true },
  { id: id(107), name: 'ועד בית', category: 'שירותים', amount: 280, dayOfMonth: 1, card: 'העברה', active: true },
  { id: id(108), name: 'ארנונה', category: 'ממשלתי', amount: 620, dayOfMonth: 1, card: 'ויזה כאל', active: true },
  { id: id(109), name: 'Disney+', category: 'מנויים ובידור', amount: 39, dayOfMonth: 15, card: 'מסטרקארד', active: false },
];

export const mockLots: PortfolioLot[] = [
  { id: id(200), ticker: 'AAPL', name: 'Apple Inc.', sector: 'טכנולוגיה', buyDate: '2023-04-10', quantity: 10, buyPrice: 165.2, commission: 8, currency: 'USD' },
  { id: id(201), ticker: 'AAPL', name: 'Apple Inc.', sector: 'טכנולוגיה', buyDate: '2024-01-15', quantity: 5, buyPrice: 185.5, commission: 8, currency: 'USD' },
  { id: id(202), ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'טכנולוגיה', buyDate: '2023-06-20', quantity: 8, buyPrice: 310.0, commission: 8, currency: 'USD' },
  { id: id(203), ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'טכנולוגיה', buyDate: '2024-03-05', quantity: 3, buyPrice: 750.0, commission: 8, currency: 'USD' },
  { id: id(204), ticker: 'VOO', name: 'Vanguard S&P 500 ETF', sector: 'ETF', buyDate: '2022-11-01', quantity: 15, buyPrice: 350.0, commission: 5, currency: 'USD' },
  { id: id(205), ticker: 'TSLA', name: 'Tesla Inc.', sector: 'תחבורה', buyDate: '2023-09-12', quantity: 6, buyPrice: 245.0, commission: 8, currency: 'USD' },
  { id: id(206), ticker: 'TLV.TA', name: 'תל אביב 125', sector: 'ETF מקומי', buyDate: '2023-01-10', quantity: 50, buyPrice: 1520.0, commission: 15, currency: 'ILS' },
];

export const mockPrices: Record<string, number> = {
  AAPL: 213.5,
  MSFT: 415.2,
  NVDA: 1180.0,
  VOO: 530.0,
  TSLA: 185.0,
  'TLV.TA': 1680.0,
};

export const USD_ILS = 3.72;

export const mockSavings: SavingsAccount[] = [
  { id: id(300), bank: 'בנק הפועלים', name: 'פיקדון 12 חודש', amount: 50000, interestRate: 4.5, maturityDate: '2026-09-01', openDate: '2025-09-01', open: true },
  { id: id(301), bank: 'בנק לאומי', name: 'פיקדון 6 חודש', amount: 30000, interestRate: 4.0, maturityDate: '2026-06-15', openDate: '2025-12-15', open: true },
  { id: id(302), bank: 'מזרחי-טפחות', name: 'חיסכון ל-3 שנים', amount: 80000, interestRate: 5.2, maturityDate: '2027-03-01', openDate: '2024-03-01', open: true },
];

export const mockGemel: GemelFund[] = [
  { id: id(400), name: 'גמל אג"ח שקלי', company: 'מיטב', balance: 45000, track: 'אג"ח שקלי', managementFee: 0.3, annualReturn: 3.8, totalReturn: 12.5 },
  { id: id(401), name: 'גמל מניות', company: 'הפניקס', balance: 28000, track: 'מניות', managementFee: 0.5, annualReturn: 14.2, totalReturn: 38.7 },
];

export const mockPension: PensionFund[] = [
  {
    id: id(500),
    name: 'מיטב גמישה',
    company: 'מיטב',
    balance: 185000,
    track: 'מסלול כללי',
    managementFee: 0.5,
    employeeContribution: 6,
    employerContribution: 6.5,
    compensationContribution: 8.33,
    retirementAge: 67,
    birthYear: 1991,
    salary: 22000,
    expectedReturn: 6,
  },
];

export const mockIncome: IncomeEntry[] = [
  { id: id(600), date: '2026-05-10', source: 'מעסיק - ABC Tech', type: 'משכורת', grossAmount: 22000, netAmount: 15800, recurring: true },
  { id: id(601), date: '2026-05-01', source: 'שכר דירה - דירה ברחובות', type: 'שכ"ד', netAmount: 3200, recurring: true },
  { id: id(602), date: '2026-04-10', source: 'מעסיק - ABC Tech', type: 'משכורת', grossAmount: 22000, netAmount: 15800, recurring: true },
  { id: id(603), date: '2026-04-01', source: 'שכר דירה - דירה ברחובות', type: 'שכ"ד', netAmount: 3200, recurring: true },
  { id: id(604), date: '2026-05-20', source: 'פרויקט פרילנס', type: 'פרילנס', netAmount: 2500, recurring: false },
  { id: id(605), date: '2026-03-10', source: 'מעסיק - ABC Tech', type: 'משכורת', grossAmount: 22000, netAmount: 15800, recurring: true },
  { id: id(606), date: '2026-03-01', source: 'שכר דירה', type: 'שכ"ד', netAmount: 3200, recurring: true },
];

export const mockGoals: Goal[] = [
  { id: id(700), category: 'מזון וסופרמרקט', targetAmount: 1500 },
  { id: id(701), category: 'מסעדות וקפה', targetAmount: 500 },
  { id: id(702), category: 'תחבורה', targetAmount: 600 },
  { id: id(703), category: 'דיור', targetAmount: 5000 },
  { id: id(704), category: 'שירותים', targetAmount: 800 },
  { id: id(705), category: 'תקשורת', targetAmount: 400 },
  { id: id(706), category: 'מנויים ובידור', targetAmount: 150 },
  { id: id(707), category: 'בריאות', targetAmount: 400 },
  { id: id(708), category: 'קניות', targetAmount: 700 },
];

export const mockJournal: JournalEntry[] = [
  { id: id(800), year: 2026, month: 3, score: 72, narrative: 'מרץ היה חודש מאתגר — תיקון מזגן בלתי צפוי של ₪1,200 זינק את ההוצאות מעל הממוצע. למרות זאת, שמרת על כל יעדי הקניות והתקשורת.', totalExpenses: 0, totalIncome: 0, saved: 0, goalsAchieved: 0, totalGoals: 0 },
  { id: id(801), year: 2026, month: 4, score: 85, narrative: 'אפריל מצוין! עמדת ב-7 מתוך 8 יעדים. הוצאות מסעדות ירדו ב-18% לעומת מרץ, וחסכת ₪13,400 — שיא של 3 חודשים.', totalExpenses: 0, totalIncome: 0, saved: 0, goalsAchieved: 0, totalGoals: 0 },
];
