/**
 * Practice topic slugs the app knows (theround-client lib/practice/catalog.ts).
 * Each maps to a catalog category by its `slug` column.
 */
export const PRACTICE_SLUGS = [
  'anatomy',
  'physiology',
  'pharmacology',
  'fon',
  'antenatal',
  'labour',
  'postnatal',
  'newborn',
  'family-planning',
  'medical',
  'emergency',
  'surgical',
  'mental-health',
] as const;
export type PracticeSlug = (typeof PRACTICE_SLUGS)[number];

/** Home-screen chips per course (also the pool for "Surprise me"). */
export const MIDWIFERY_TOPICS: PracticeSlug[] = [
  'anatomy',
  'physiology',
  'pharmacology',
  'fon',
  'antenatal',
  'labour',
  'postnatal',
  'newborn',
];
export const NURSING_TOPICS: PracticeSlug[] = [
  'anatomy',
  'physiology',
  'pharmacology',
  'fon',
  'medical',
  'emergency',
  'surgical',
  'mental-health',
];

export function topicsFor(course: string | null): PracticeSlug[] {
  return course && /nurs/i.test(course) && !/midwi/i.test(course)
    ? NURSING_TOPICS
    : MIDWIFERY_TOPICS;
}

/** Category name → slug for existing catalogs (backfilled by migration and on boot). */
export const SLUG_BY_NAME: Record<string, string> = {
  Anatomy: 'anatomy',
  Physiology: 'physiology',
  Pharmacology: 'pharmacology',
  'Foundations of Nursing': 'fon',
  'Antenatal Care': 'antenatal',
  'Labour & Delivery': 'labour',
  'Postnatal Care': 'postnatal',
  'Newborn Care': 'newborn',
  'Family Planning': 'family-planning',
  'Medical Nursing': 'medical',
  'Emergency Care': 'emergency',
  'Surgical Care': 'surgical',
  'Mental Health': 'mental-health',
  'High-Risk Pregnancy': 'high-risk-pregnancy',
  'Clinical Ethics': 'clinical-ethics',
  'Public Health': 'public-health',
};

/** Lowercase phrase for "Let's practise …". */
export function phrase(slug: string, name: string) {
  return slug === 'fon'
    ? 'foundations of nursing'
    : name.toLowerCase().replace(' & ', ' and ');
}

/** Short name shown in the app ("FON" rather than the full category name). */
export function displayName(slug: string, name: string) {
  return slug === 'fon' ? 'FON' : name;
}
