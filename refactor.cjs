const fs = require('fs');
let code = fs.readFileSync('src/pages/RecurringCharges.tsx', 'utf8');

// Replace buildOccurrences
code = code.replace(
  /function buildOccurrences\(r: RecurringCharge\): Occurrence\[\] \{[\s\S]*?return list;\n\}/,
  `function buildOccurrences(r: RecurringCharge): Occurrence[] {
  const now = new Date();
  const start = r.startDate ? new Date(r.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = (r.chargeType === 'periodic' && r.endDate) 
    ? new Date(r.endDate) 
    : new Date(now.getFullYear(), now.getMonth(), 1);

  const list: Occurrence[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear(), m = cur.getMonth() + 1;
    const key = \`\${y}-\${String(m).padStart(2, '0')}\`;
    list.push({
      key, year: y, month: m,
      isPast: new Date(y, m - 1, r.dayOfMonth) < now,
      isDismissed: !!(r.occurrenceOverrides?.[key]?.dismissed),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return list.sort((a, b) => b.key.localeCompare(a.key));
}`
);

// We want to extract the rendering of the Card from `periodic.map(...)` into a reusable `RecurringRow` function.
// Let's replace the whole component `PermanentRow` and the mapping sections.
// It's probably easier if I write a small script to inject the new component and update the mappings.
// Let's just output the whole file logic or use a robust script.
