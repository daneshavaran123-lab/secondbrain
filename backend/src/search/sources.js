// What the unified search looks in (data-model.md). Table sources are queried with `t` as the
// table alias and `$1` as the signed-in person; collection sources are the person's lists kept as
// one JSON document in user_collections. `path` builds the page the item opens on (research R8).

const hl = (base, id) => `${base}${base.includes('?') ? '&' : '?'}highlight=${encodeURIComponent(id)}`;

const MEETING_PAGES = {
  Professional: '/meetings',
  KhadimEKhalgh: '/organizational/khadim-e-khalgh/meeting-minutes',
  Varid: '/organizations/varid/meeting-minutes',
  Chamber: '/organizations/chamber/meeting-minutes',
  Frangaran: '/organizations/frangaran/meeting-minutes',
  Association: '/organizations/association/meeting-minutes',
};
const RISK_PAGES = {
  'ورید هلث': '/organizations/varid/risk-assessment',
  'اتاق بازرگانی': '/organizations/chamber/risk-assessment',
  'فرانگران': '/organizations/frangaran/risk-assessment',
  'انجمن تولیدکنندگان': '/organizations/association/risk-assessment',
};
const JOURNAL = "'دل‌نوشته'";

export const TABLE_SOURCES = [
  { type: 'task', label: 'کار', table: 'personal_planning', owner: 't.user_id = $1',
    title: 't.title', body: ['t.description'], date: 't.created_at', status: 't.status::text',
    path: (r) => hl('/tasks', r.id) },
  { type: 'delegated', label: 'کار واگذارشده', table: 'delegation_tasks', owner: 't.delegator_id = $1',
    title: 't.title', body: ['t.description', 't.delegatee_name'], date: 't.created_at', status: 't.status',
    path: () => '/delegation' },
  { type: 'event', label: 'رویداد تقویم', table: 'calendar_events', owner: 't.user_id = $1',
    title: 't.title', body: ['t.description', 't.notes', 't.location', 't.venue_address'], date: 't.start_date',
    path: () => '/calendar' },
  { type: 'meeting', label: 'جلسه', table: 'meetings', owner: 't.user_id = $1',
    title: 't.title', body: ['t.description', 't.agenda', 't.summary', 't.notes'],
    date: 'COALESCE(t.meeting_date, t.start_time, t.created_at)', status: 't.status',
    path: () => '/meetings' },
  { type: 'note', label: 'یادداشت و دانش', table: 'knowledge_base', owner: 't.author_id = $1',
    where: `t.category IS DISTINCT FROM ${JOURNAL}`,
    title: 't.title', body: ['t.content'], date: 't.created_at', status: 't.category',
    path: () => '/knowledge' },
  { type: 'journal', label: 'دل‌نوشته', table: 'knowledge_base', owner: 't.author_id = $1',
    where: `t.category = ${JOURNAL}`,
    title: 't.title', body: ['t.content'], date: 't.created_at',
    path: () => '/personal-journal' },
  { type: 'saved', label: 'ذخیره‌شده', table: 'knowledge_items', owner: 't.user_id = $1', palette: false,
    title: 't.title', body: ['t.content'], date: 't.created_at', status: 't.category',
    path: () => '/knowledge' },
  { type: 'idea', label: 'ایده', table: 'ideas', owner: 't.user_id = $1',
    title: 't.title', body: ['t.description'], date: 't.created_at', status: 't.status',
    path: () => '/ideas' },
  { type: 'contact', label: 'مخاطب', table: 'personal_contacts', owner: 't.user_id = $1',
    title: 't.full_name', body: ['t.organization', 't.role', 't.email', 't.phone', 't.notes'], date: 't.created_at', status: 't.organization',
    path: (r) => hl('/contacts', r.id) },
  { type: 'company_contact', label: 'مخاطب شرکت', table: 'company_contacts',
    owner: 'EXISTS (SELECT 1 FROM business_companies c WHERE c.id = t.company_id AND c.user_id = $1)',
    title: 't.name', body: ['t.organization', 't.role', 't.email', 't.phone', 't.notes'], date: 't.created_at', status: 't.organization',
    extra: { company_id: 't.company_id::text' },
    path: (r) => `/company/${r.company_id}` },
  { type: 'project', label: 'پروژه', table: 'projects', owner: 't.user_id = $1',
    title: 't.name', body: ['t.description'], date: 't.created_at', status: 't.status',
    path: () => '/projects' },
  { type: 'legal', label: 'پرونده حقوقی', table: 'legal_cases', owner: 't.user_id = $1',
    title: 't.title', body: ['t.description', 't.court', 't.opponent', 't.opposing_party', 't.lawyer', 't.case_number'], date: 't.created_at', status: 't.status',
    path: () => '/legal' },
  { type: 'letter', label: 'نامه و بخشنامه', table: 'organizational_letters', owner: 't.user_id = $1',
    title: 't.subject', body: ['t.summary', 'COALESCE(t.clean_text, t.ocr_text)', 't.sender', 't.organization_name', 't.letter_number'],
    date: 't.created_at', status: 't.status',
    path: () => '/organizational-letters' },
  { type: 'cultural', label: 'محتوای فرهنگی', table: 'cultural_content', owner: 't.user_id = $1',
    title: 't.title', body: ['t.content', 't.reference'], date: 't.created_at', status: 't.content_type',
    path: () => '/cultural-content' },
  { type: 'gratitude', label: 'شکرگزاری', table: 'gratitude_entries', owner: 't.user_id = $1',
    title: 'NULL::text', body: ['t.content', 't.gratitude_item_1', 't.gratitude_item_2', 't.gratitude_item_3'],
    date: 'COALESCE(t.date::timestamptz, t.created_at)',
    path: () => '/gratitude-journal' },
  { type: 'csr', label: 'مسئولیت اجتماعی', table: 'csr_projects', owner: 't.user_id = $1',
    title: 't.title', body: ['t.description'], date: 't.created_at', status: 't.status',
    path: (r) => `/csr-project/${r.id}` },
  { type: 'company', label: 'شرکت', table: 'business_companies', owner: 't.user_id = $1',
    title: 't.company_name', body: ['t.industry', 't.description', 't.notes'], date: 't.created_at',
    path: (r) => `/company/${r.id}` },
  // the organizations the person owns or is a member of (spec Clarifications Q1)
  { type: 'organization', label: 'سازمان', table: 'organizations',
    owner: '(t.user_id = $1 OR EXISTS (SELECT 1 FROM user_organizations m WHERE m.organization_id = t.id AND m.user_id = $1))',
    title: 't.name', body: ['t.description'], date: 't.created_at', status: 't.type',
    path: (r) => `/organizations/${r.id}` },
];

const asArray = (data) => (Array.isArray(data) ? data : []);

export const COLLECTION_SOURCES = [
  { type: 'minutes', label: 'جلسه و صورت‌جلسه', collection: 'meetings_v3', items: asArray,
    title: 'title', body: ['summary', 'minutes_text', 'transcript', 'meeting_type', (m) => m.location?.address], date: ['date'],
    status: 'minutes_status',
    path: (m) => MEETING_PAGES[m.organization] ?? '/meetings' },
  { type: 'legal', label: 'پرونده حقوقی', collection: (userId) => `legal_${userId}_cases`, items: asArray,
    sameAs: { table: 'legal_cases', owner: 'user_id' },
    title: 'title', body: ['description', 'court', 'opponent', 'lawyer'], date: ['createdAt'], status: 'status',
    path: () => '/legal' },
  { type: 'gratitude', label: 'شکرگزاری', collection: 'enhanced_gratitude_entries', items: asArray,
    sameAs: { table: 'gratitude_entries', owner: 'user_id' },
    title: null, body: ['content'], date: ['date', 'created_at'],
    path: () => '/gratitude-journal' },
  { type: 'need', label: 'نیاز اجتماعی', collection: 'khk_social_needs', items: asArray,
    title: 'title', body: ['description', 'area', 'category', 'notes'], date: ['created_at', 'requestDate'], status: 'status',
    path: (n) => hl('/organizational/khadim-e-khalgh/needs', n.id) },
  { type: 'partner', label: 'شریک و همکار', collection: 'partners', items: asArray,
    title: 'name', body: ['organization', 'contactPerson', 'category', 'notes', 'email', 'phone', (p) => (Array.isArray(p.expertise) ? p.expertise.join(' ') : '')],
    date: ['created_at', 'lastContact'], status: 'status',
    path: (p) => hl('/organizational/khadim-e-khalgh/partners', p.id) },
  { type: 'service', label: 'اقدام خدمت‌رسانی', collection: 'khk_service_projects', items: asArray,
    title: 'title', body: ['description', 'location', 'category'], date: ['created_at', 'startDate'], status: 'status',
    path: (s) => hl('/organizational/khadim-e-khalgh/projects', s.id) },
  { type: 'program', label: 'برنامه', collection: 'roadmap-programs', items: asArray,
    title: 'title', body: ['description'], date: ['created_at', 'startDate'], status: 'status',
    path: (p) => hl('/organizational/khadim-e-khalgh/roadmap', p.id) },
  { type: 'risk', label: 'ریسک', collection: 'risk-assessments',
    // { «ورید هلث»: [risk, …], … }
    items: (data) => (data && typeof data === 'object' && !Array.isArray(data)
      ? Object.entries(data).flatMap(([org, list]) => asArray(list).map((r) => ({ ...r, organizationName: r.organizationName || org })))
      : []),
    title: 'title', body: ['description', 'category', 'mitigationStrategy', 'contingencyPlan', 'responsiblePerson'], date: ['createdAt'], status: 'status',
    path: (r) => RISK_PAGES[r.organizationName] ?? '/my-organizations' },
];

// Groups with equally good results keep this order (spec FR-002), so it does not shift between searches
export const SOURCE_TYPES = [
  'task', 'delegated', 'event', 'meeting', 'minutes', 'note', 'journal', 'saved', 'idea', 'contact', 'company_contact',
  'project', 'legal', 'letter', 'cultural', 'gratitude', 'need', 'partner', 'service', 'program', 'risk', 'csr', 'company', 'organization',
];
export const PALETTE_TYPES = SOURCE_TYPES.filter((t) => !TABLE_SOURCES.some((s) => s.type === t && s.palette === false));
export const LABELS = Object.fromEntries([...TABLE_SOURCES, ...COLLECTION_SOURCES].map((s) => [s.type, s.label]));
