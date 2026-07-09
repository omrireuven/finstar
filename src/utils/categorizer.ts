import type { Category } from '../types';

const KEYWORD_MAP: Record<Category, string[]> = {
  'מזון וסופרמרקט': ['שופרסל', 'רמי לוי', 'ויקטורי', 'מגה', 'חצי חינם', 'יינות ביתן', 'סופר', 'מאפה', 'מינימרקט', 'ברצלונה'],
  'מסעדות וקפה': ['קפה', 'japanika', 'יפניקה', 'פיצה', 'מקדונלד', 'קפטן', 'סושי', 'אנדלוסי', 'ברגר', 'מסעדה', 'בר ', 'גריל', 'noodle', 'דלוניס'],
  'תחבורה': ['דלק', 'חבר', 'תחנת', 'פארקינג', 'רב-קו', 'רב קו', 'סונול', 'פז ', 'ten', 'אוטובוס', 'רכבת', 'blue&me', 'אם.וי.אם', 'מוניות'],
  'דיור': ['שכר דירה', 'שכירות', 'משכנתא', 'דמי שכירות', 'שוכר', 'בעל דירה', 'סוכנות נדלן', 'תיווך', 'דירה'],
  'שירותים': ['חשמל', 'מים', 'גז', 'ועד בית', 'ארנונה', 'עיריית', 'עירית', 'ביוב', 'חברת חשמל'],
  'תקשורת': ['פרטנר', 'הוט', 'כוורת', 'סלקום', '012', 'bezeq', 'בזק', 'HOT', 'cellcom', 'סלקום', 'גולן טלקום'],
  'מנויים ובידור': ['netflix', 'spotify', 'apple', 'google', 'youtube', 'amazon', 'disney', 'הבו', 'yes', 'canva', 'adobe', 'microsoft', 'dropbox', 'icloud'],
  'בריאות': ['סופרפארם', 'מכבי', 'רוקח', 'רופא', 'כללית', 'לאומית', 'בית חולים', 'אפותיקרים', 'optika', 'אופטיקה'],
  'קניות': ['זארה', 'zara', 'h&m', 'אמזון', 'ikea', 'aliexpress', 'fox', 'שופינג', 'renuar', 'castro', 'golf', 'אדידס', 'nike', 'adidas', 'termination'],
  'ביטוח': ['מגדל', 'הראל', 'כלל ביטוח', 'מנורה', 'ביטוח', 'הפניקס', 'שירביט'],
  'חינוך': ['סטימצקי', 'udemy', 'בית ספר', 'אוניברסיטה', 'קורס', 'coursera', 'לומדים', 'ספריה'],
  'ממשלתי': ['ארנונה', 'כביש אגרה', 'דואר ישראל', 'נתיבי איילון', 'קנס', 'מס הכנסה', 'ביטוח לאומי'],
  'אחר': [],
};

const LEARNED_MAP: Record<string, Category> = {};

export function categorize(business: string): { category: Category; isAI: boolean } {
  const lower = business.toLowerCase();

  if (LEARNED_MAP[business]) {
    return { category: LEARNED_MAP[business], isAI: false };
  }

  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    if (cat === 'אחר') continue;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { category: cat as Category, isAI: true };
      }
    }
  }

  return { category: 'אחר', isAI: true };
}

export function learnCategory(business: string, category: Category) {
  LEARNED_MAP[business] = category;
  try {
    const stored = JSON.parse(localStorage.getItem('finstar_learned_cats') || '{}');
    stored[business] = category;
    localStorage.setItem('finstar_learned_cats', JSON.stringify(stored));
  } catch (e) {}
}

export function loadLearnedCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem('finstar_learned_cats') || '{}');
    Object.assign(LEARNED_MAP, stored);
  } catch (e) {}
}
