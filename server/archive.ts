import Database from "better-sqlite3";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

type ArchiveDatabase = Database.Database;
type CountRow = { count: number };
type GradeRow = { grade: string; count: number };
type TrackRow = { track: string; count: number };
type ProvinceRow = {
  documentId: number;
  slug: string;
  name: string;
  pageCount: number;
  candidateCount: number;
  centerCount: number;
  schoolCount: number;
  scienceCount: number;
  socialScienceCount: number;
  pdfUrl: string;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeE: number;
};

const archiveRoot = resolve(process.env.BACII_ARCHIVE_ROOT || "data");
const databases = new Map<string, ArchiveDatabase>();
const centerLabelCaches = new Map<string, { modifiedAt: number; labels: Map<string, string> }>();
const summaryCaches = new Map<string, { modifiedAt: number; summary: Record<string, unknown> }>();
const schoolCaches = new Map<string, { modifiedAt: number; schools: SchoolAnalysis[] }>();

type CenterLabelsFile = {
  centers?: Record<string, { label?: unknown }>;
};

const TRACK_SQL = `CASE
  WHEN p.text_raw LIKE '%សីល-ពល%' OR p.text_raw LIKE '%ែផនដី%' THEN 'social-science'
  WHEN p.text_raw LIKE '%គីមី%' OR p.text_raw LIKE '%ជីវ%' THEN 'science'
  ELSE 'unknown'
END`;

function centerFromPageText(value: unknown) {
  const text = String(value || "");
  const marker = "មណƋ លƙបឡង";
  const markerAt = text.indexOf(marker);
  if (markerAt < 0) return "";
  const valueAt = text.indexOf(":", markerAt + marker.length);
  if (valueAt < 0) return "";
  const classAt = text.indexOf("ǃƒ ក់", valueAt + 1);
  const lineAt = text.indexOf("\n", valueAt + 1);
  const endAt = classAt >= 0 ? classAt : lineAt >= 0 ? lineAt : text.length;
  const center = text.slice(valueAt + 1, endAt).replace(/\s+/g, " ").trim();
  // Province summary/footer pages place a candidate total in the same text
  // stream position; never expose that total as an exam center.
  if (/^\d/.test(center) || center.includes("នាក់")) return "";
  return center;
}

function assertYear(value: string) {
  if (!/^20\d{2}$/.test(value)) throw new Error("Invalid archive year.");
  return value;
}

function archiveDirectory(year: string) {
  const validYear = assertYear(year);
  const candidates = [
    resolve(archiveRoot, validYear),
    resolve(archiveRoot, `bacii-${validYear}`),
  ];
  if (basename(archiveRoot).toLowerCase() === `bacii-${validYear}`) candidates.unshift(archiveRoot);
  return candidates.find((directory) => existsSync(resolve(directory, `bacii-${validYear}.sqlite`)));
}

function archiveDatabase(year: string) {
  const validYear = assertYear(year);
  const cached = databases.get(validYear);
  if (cached) return cached;
  const directory = archiveDirectory(validYear);
  if (!directory) throw new Error(`Archive ${validYear} is not available.`);
  const database = new Database(resolve(directory, `bacii-${validYear}.sqlite`), {
    readonly: true,
    fileMustExist: true,
  });
  database.pragma("query_only = ON");
  databases.set(validYear, database);
  return database;
}

function centerLabels(year: string) {
  const directory = archiveDirectory(year);
  if (!directory) return new Map<string, string>();
  const file = resolve(directory, "labels.json");
  if (!existsSync(file)) return new Map<string, string>();
  try {
    const modifiedAt = statSync(file).mtimeMs;
    const cached = centerLabelCaches.get(year);
    if (cached?.modifiedAt === modifiedAt) return cached.labels;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CenterLabelsFile;
    const labels = new Map<string, string>();
    for (const [name, item] of Object.entries(parsed.centers || {})) {
      const label = typeof item?.label === "string" ? item.label.normalize("NFC").trim() : "";
      if (label) labels.set(name, label);
    }
    centerLabelCaches.set(year, { modifiedAt, labels });
    return labels;
  } catch {
    return new Map<string, string>();
  }
}

function provinceId(slug: string, year: string) {
  const suffix = year.slice(-2);
  return slug.endsWith(suffix) ? slug.slice(0, -suffix.length) : slug;
}

function archivePdfFileName(storedPath: string) {
  // Archives may be generated on Windows and later served from Linux.
  // Normalize separators before taking the basename so both platforms resolve
  // the same file under the archive's pdfs directory.
  return basename(storedPath.replace(/\\/g, "/"));
}

export function listArchiveYears() {
  if (!existsSync(archiveRoot)) return [];
  const years = new Set<string>();
  const rootName = basename(archiveRoot);
  const rootMatch = rootName.match(/^bacii-(20\d{2})$/);
  if (rootMatch && archiveDirectory(rootMatch[1])) years.add(rootMatch[1]);
  for (const entry of readdirSync(archiveRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(?:bacii-)?(20\d{2})$/);
    if (match && archiveDirectory(match[1])) years.add(match[1]);
  }
  return [...years].sort((left, right) => right.localeCompare(left));
}

export function getArchiveSummary(year: string) {
  const directory = archiveDirectory(year);
  if (!directory) throw new Error(`Archive ${year} is not available.`);
  const modifiedAt = statSync(resolve(directory, `bacii-${year}.sqlite`)).mtimeMs;
  const cached = summaryCaches.get(year);
  if (cached?.modifiedAt === modifiedAt) return cached.summary;
  const db = archiveDatabase(year);
  const candidateCount = db.prepare("SELECT COUNT(*) AS count FROM students").get() as CountRow;
  const pageCount = db.prepare("SELECT COUNT(*) AS count FROM pages").get() as CountRow;
  const schoolCount = db.prepare("SELECT COUNT(DISTINCT NULLIF(TRIM(school_raw), '')) AS count FROM students").get() as CountRow;
  const grades = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(grade_raw), ''), 'Unknown') AS grade, COUNT(*) AS count
    FROM students GROUP BY grade ORDER BY grade
  `).all() as GradeRow[];
  const tracks = db.prepare(`
    SELECT ${TRACK_SQL} AS track, COUNT(*) AS count
    FROM students s JOIN pages p ON p.id = s.page_id
    GROUP BY track ORDER BY count DESC
  `).all() as TrackRow[];
  const provinces = db.prepare(`
    SELECT d.id AS documentId, d.slug, d.province AS name, d.page_count AS pageCount,
      COUNT(s.id) AS candidateCount, 0 AS centerCount,
      COUNT(DISTINCT NULLIF(TRIM(s.school_raw), '')) AS schoolCount,
      SUM(CASE WHEN ${TRACK_SQL} = 'science' THEN 1 ELSE 0 END) AS scienceCount,
      SUM(CASE WHEN ${TRACK_SQL} = 'social-science' THEN 1 ELSE 0 END) AS socialScienceCount,
      SUM(CASE WHEN s.grade_raw = 'A' THEN 1 ELSE 0 END) AS gradeA,
      SUM(CASE WHEN s.grade_raw = 'B' THEN 1 ELSE 0 END) AS gradeB,
      SUM(CASE WHEN s.grade_raw = 'C' THEN 1 ELSE 0 END) AS gradeC,
      SUM(CASE WHEN s.grade_raw = 'D' THEN 1 ELSE 0 END) AS gradeD,
      SUM(CASE WHEN s.grade_raw = 'E' THEN 1 ELSE 0 END) AS gradeE,
      d.pdf_url AS pdfUrl
    FROM documents d
    LEFT JOIN students s ON s.document_id = d.id
    LEFT JOIN pages p ON p.id = s.page_id
    GROUP BY d.id ORDER BY candidateCount DESC
  `).all() as ProvinceRow[];
  const centerSets = new Map<number, Set<string>>();
  for (const row of db.prepare("SELECT document_id AS documentId, text_raw AS text FROM pages").all() as Array<{ documentId: number; text: string }>) {
    const center = centerFromPageText(row.text);
    if (!center) continue;
    const centers = centerSets.get(row.documentId) || new Set<string>();
    centers.add(center);
    centerSets.set(row.documentId, centers);
  }
  const centersByDocument = new Map([...centerSets].map(([documentId, centers]) => [documentId, centers.size]));
  for (const province of provinces) province.centerCount = centersByDocument.get(province.documentId) || 0;

  const summary = {
    year,
    candidateCount: candidateCount.count,
    pageCount: pageCount.count,
    schoolCount: schoolCount.count,
    provinceCount: provinces.length,
    centerCount: provinces.reduce((sum, province) => sum + province.centerCount, 0),
    grades,
    tracks,
    provinces: provinces.map((province) => {
      const { gradeA, gradeB, gradeC, gradeD, gradeE, ...details } = province;
      return {
        ...details,
        id: provinceId(province.slug, year),
        grades: { A: gradeA, B: gradeB, C: gradeC, D: gradeD, E: gradeE },
      };
    }),
  };
  summaryCaches.set(year, { modifiedAt, summary });
  return summary;
}

export function getArchiveCenters(year: string, province?: string) {
  const db = archiveDatabase(year);
  const labels = centerLabels(year);
  const conditions: string[] = [];
  const values: string[] = [];
  if (province) {
    conditions.push("d.slug = ?");
    values.push(`${province}${year.slice(-2)}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const pages = db.prepare(`
    SELECT p.text_raw AS text, COUNT(s.id) AS count
    FROM students s JOIN pages p ON p.id = s.page_id
    JOIN documents d ON d.id = p.document_id
    ${where} GROUP BY s.page_id ORDER BY s.page_id
  `).all(...values) as Array<{ text: string; count: number }>;
  const centers = new Map<string, number>();
  for (const page of pages) {
    const name = centerFromPageText(page.text);
    if (name) centers.set(name, (centers.get(name) || 0) + page.count);
  }
  return [...centers]
    .map(([name, count]) => ({ name, label: labels.get(name) || name, count }))
    .sort((left, right) => left.label.localeCompare(right.label, "km"));
}

export type SchoolAnalysis = {
  name: string;
  sampleStudentId: number;
  province: string;
  provinceId: string;
  candidateCount: number;
  femaleCount: number;
  scienceCount: number;
  socialCount: number;
  socialScienceCount: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeE: number;
  grades: { A: number; B: number; C: number; D: number; E: number };
  gradeAPercent: number;
  gradeAPercentage: number;
  rank: number;
};

export type GetSchoolsOptions = {
  province?: string;
  search?: string;
  sort?: "candidates" | "gradeA" | "gradeAPercent" | "name";
  limit?: number;
};

export function getArchiveSchools(year: string, options: GetSchoolsOptions = {}) {
  const directory = archiveDirectory(year);
  if (!directory) throw new Error(`Archive ${year} is not available.`);
  const modifiedAt = statSync(resolve(directory, `bacii-${year}.sqlite`)).mtimeMs;
  let allSchools: SchoolAnalysis[];
  const cached = schoolCaches.get(year);
  if (cached?.modifiedAt === modifiedAt) {
    allSchools = cached.schools;
  } else {
    const db = archiveDatabase(year);
    const rows = db.prepare(`
      SELECT
        s.school_raw AS name,
        MIN(s.id) AS sampleStudentId,
        s.province AS province,
        d.slug AS slug,
        COUNT(s.id) AS candidateCount,
        SUM(CASE WHEN s.gender_raw LIKE '%ស%' THEN 1 ELSE 0 END) AS femaleCount,
        SUM(CASE WHEN ${TRACK_SQL} = 'science' THEN 1 ELSE 0 END) AS scienceCount,
        SUM(CASE WHEN ${TRACK_SQL} = 'social-science' THEN 1 ELSE 0 END) AS socialScienceCount,
        SUM(CASE WHEN s.grade_raw = 'A' THEN 1 ELSE 0 END) AS gradeA,
        SUM(CASE WHEN s.grade_raw = 'B' THEN 1 ELSE 0 END) AS gradeB,
        SUM(CASE WHEN s.grade_raw = 'C' THEN 1 ELSE 0 END) AS gradeC,
        SUM(CASE WHEN s.grade_raw = 'D' THEN 1 ELSE 0 END) AS gradeD,
        SUM(CASE WHEN s.grade_raw = 'E' THEN 1 ELSE 0 END) AS gradeE
      FROM students s
      JOIN documents d ON d.id = s.document_id
      JOIN pages p ON p.id = s.page_id
      WHERE TRIM(COALESCE(s.school_raw, '')) != ''
      GROUP BY s.school_raw, s.province, d.slug
      ORDER BY candidateCount DESC
    `).all() as Array<{
      name: string; sampleStudentId: number; province: string; slug: string;
      candidateCount: number; femaleCount: number; scienceCount: number; socialScienceCount: number;
      gradeA: number; gradeB: number; gradeC: number; gradeD: number; gradeE: number;
    }>;

    allSchools = rows.map((row, index) => {
      const candidateCount = Number(row.candidateCount || 0);
      const gradeA = Number(row.gradeA || 0);
      const gradeB = Number(row.gradeB || 0);
      const gradeC = Number(row.gradeC || 0);
      const gradeD = Number(row.gradeD || 0);
      const gradeE = Number(row.gradeE || 0);
      const gradeAPercentage = candidateCount > 0 ? Number(((gradeA / candidateCount) * 100).toFixed(2)) : 0;
      const scienceCount = Number(row.scienceCount || 0);
      const socialScienceCount = Number(row.socialScienceCount || 0);
      return {
        name: String(row.name).trim(),
        sampleStudentId: Number(row.sampleStudentId),
        province: String(row.province),
        provinceId: provinceId(String(row.slug), year),
        candidateCount,
        femaleCount: Number(row.femaleCount || 0),
        scienceCount,
        socialCount: socialScienceCount,
        socialScienceCount,
        gradeA,
        gradeB,
        gradeC,
        gradeD,
        gradeE,
        grades: { A: gradeA, B: gradeB, C: gradeC, D: gradeD, E: gradeE },
        gradeAPercent: gradeAPercentage,
        gradeAPercentage,
        rank: index + 1,
      };
    });
    schoolCaches.set(year, { modifiedAt, schools: allSchools });
  }

  let filtered = allSchools;
  if (options.province) {
    filtered = filtered.filter((s) => s.provinceId === options.province);
  }
  if (options.search) {
    const q = options.search.trim().toLowerCase();
    filtered = filtered.filter((s) => s.name.toLowerCase().includes(q) || s.province.toLowerCase().includes(q));
  }

  const sort = options.sort || "candidates";
  if (sort === "gradeA") {
    filtered = filtered.slice().sort((a, b) => b.gradeA - a.gradeA || b.candidateCount - a.candidateCount);
  } else if (sort === "gradeAPercent") {
    filtered = filtered.slice().sort((a, b) => b.gradeAPercentage - a.gradeAPercentage || b.gradeA - a.gradeA);
  } else if (sort === "name") {
    filtered = filtered.slice().sort((a, b) => a.name.localeCompare(b.name, "km"));
  } else {
    filtered = filtered.slice().sort((a, b) => b.candidateCount - a.candidateCount || b.gradeA - a.gradeA);
  }

  const ranked = filtered.map((s, idx) => ({ ...s, rank: idx + 1 }));
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;
  return limit ? ranked.slice(0, limit) : ranked;
}

export type ArchiveSearch = {
  tableNumber: string;
  province?: string;
  center?: string;
  track?: "science" | "social-science";
};

export function searchArchive(year: string, filters: ArchiveSearch) {
  const db = archiveDatabase(year);
  const labels = centerLabels(year);
  const tableNumber = filters.tableNumber.trim();
  if (!/^\d{1,6}$/.test(tableNumber)) throw new Error("Enter a valid table number.");

  const conditions = ["s.table_number = ?"];
  const values: Array<string | number> = [String(Number(tableNumber))];
  if (filters.province) {
    conditions.push("d.slug = ?");
    values.push(`${filters.province}${year.slice(-2)}`);
  }
  if (filters.center) {
    // Center labels are derived from the authoritative page header after the indexed table-number lookup.
  }
  if (filters.track) {
    conditions.push(`${TRACK_SQL} = ?`);
    values.push(filters.track);
  }

  const rows = db.prepare(`
    SELECT s.id, s.table_number AS tableNumber, s.name_raw AS name,
      s.gender_raw AS gender, s.school_raw AS school,
      p.text_raw AS pageText, s.grade_raw AS grade, s.result_raw AS result,
      s.page_number AS pageNumber, s.subject_headers_json AS subjectHeaders,
      s.subject_1 AS subject1, s.subject_2 AS subject2, s.subject_3 AS subject3,
      s.subject_4 AS subject4, s.subject_5 AS subject5, s.subject_6 AS subject6,
      s.subject_7 AS subject7, d.id AS documentId, d.slug, d.province,
      ${TRACK_SQL} AS track
    FROM students s
    JOIN pages p ON p.id = s.page_id
    JOIN documents d ON d.id = s.document_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY d.ordinal, s.page_number, s.id LIMIT 500
  `).all(...values) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const { pageText, ...student } = row;
    return {
      ...student,
      examCenter: centerFromPageText(pageText),
      examCenterLabel: labels.get(centerFromPageText(pageText)) || centerFromPageText(pageText),
      provinceId: provinceId(String(row.slug), year),
      subjectHeaders: JSON.parse(String(row.subjectHeaders || "[]")),
      subjects: [row.subject1, row.subject2, row.subject3, row.subject4, row.subject5, row.subject6, row.subject7],
    };
  }).filter((row) => !filters.center || row.examCenter === filters.center).slice(0, 100);
}

export function getArchivePdf(year: string, documentId: number) {
  const db = archiveDatabase(year);
  const row = db.prepare("SELECT local_path AS localPath FROM documents WHERE id = ?").get(documentId) as { localPath: string } | undefined;
  if (!row) return undefined;
  const directory = archiveDirectory(year);
  if (!directory) return undefined;
  const fileName = archivePdfFileName(row.localPath);
  const candidate = resolve(directory, "pdfs", fileName);
  return existsSync(candidate) ? candidate : undefined;
}

export function getArchiveNameLocator(year: string, studentId: number) {
  if (!Number.isSafeInteger(studentId) || studentId < 1) return undefined;
  const db = archiveDatabase(year);
  const row = db.prepare(`
    SELECT s.page_number AS pageNumber, s.table_number AS tableNumber, d.local_path AS localPath
    FROM students s JOIN documents d ON d.id = s.document_id WHERE s.id = ?
  `).get(studentId) as { pageNumber: number; tableNumber: string; localPath: string } | undefined;
  if (!row) return undefined;
  const directory = archiveDirectory(year);
  if (!directory) return undefined;
  const pdf = resolve(directory, "pdfs", archivePdfFileName(row.localPath));
  return existsSync(pdf) ? { pdf, pageNumber: row.pageNumber, tableNumber: String(row.tableNumber) } : undefined;
}

export type SubjectKey =
  | "math"
  | "physics"
  | "chemistry"
  | "biology"
  | "khmer"
  | "history"
  | "foreign_language"
  | "earth_science"
  | "geography"
  | "civics";

export type SubjectGrade = "A" | "B" | "C" | "D" | "E" | "F";

export interface SubjectMeta {
  key: SubjectKey;
  nameKm: string;
  nameEn: string;
  tracks: Array<"science" | "social-science">;
}

export const SUBJECT_METAS: SubjectMeta[] = [
  { key: "math", nameKm: "គណិតវិទ្យា", nameEn: "Mathematics", tracks: ["science", "social-science"] },
  { key: "physics", nameKm: "រូបវិទ្យា", nameEn: "Physics", tracks: ["science"] },
  { key: "chemistry", nameKm: "គីមីវិទ្យា", nameEn: "Chemistry", tracks: ["science"] },
  { key: "biology", nameKm: "ជីវវិទ្យា", nameEn: "Biology", tracks: ["science"] },
  { key: "khmer", nameKm: "ភាសាខ្មែរ", nameEn: "Khmer Literature", tracks: ["science", "social-science"] },
  { key: "history", nameKm: "ប្រវត្តិវិទ្យា", nameEn: "History", tracks: ["science", "social-science"] },
  { key: "foreign_language", nameKm: "ភាសាបរទេស", nameEn: "Foreign Language", tracks: ["science", "social-science"] },
  { key: "earth_science", nameKm: "ផែនដីវិទ្យា", nameEn: "Earth Science", tracks: ["social-science"] },
  { key: "geography", nameKm: "ភូមិវិទ្យា", nameEn: "Geography", tracks: ["social-science"] },
  { key: "civics", nameKm: "សីលធម៌-ពលរដ្ឋ", nameEn: "Civics & Morality", tracks: ["social-science"] },
];

export function getSubjectColumn(subject: SubjectKey, track: "science" | "social-science"): string | null {
  if (track === "science") {
    switch (subject) {
      case "khmer": return "subject_1";
      case "math": return "subject_2";
      case "biology": return "subject_3";
      case "history": return "subject_4";
      case "chemistry": return "subject_5";
      case "physics": return "subject_6";
      case "foreign_language": return "subject_7";
      default: return null;
    }
  } else {
    switch (subject) {
      case "khmer": return "subject_1";
      case "math": return "subject_2";
      case "earth_science": return "subject_3";
      case "geography": return "subject_4";
      case "history": return "subject_5";
      case "civics": return "subject_6";
      case "foreign_language": return "subject_7";
      default: return null;
    }
  }
}

export interface SubjectOverviewItem {
  key: SubjectKey;
  nameKm: string;
  nameEn: string;
  track: "science" | "social-science";
  totalCandidates: number;
  grades: Record<SubjectGrade, number>;
  gradeAPercent: number;
  passPercent: number;
  excellencePercent: number;
}

export interface SubjectSchoolItem {
  name: string;
  sampleStudentId: number;
  province: string;
  provinceId: string;
  totalCandidates: number;
  grades: Record<SubjectGrade, number>;
  gradeA: number;
  gradeAPercent: number;
  passPercent: number;
  rank: number;
}

export interface SubjectProvinceItem {
  id: string;
  name: string;
  totalCandidates: number;
  grades: Record<SubjectGrade, number>;
  gradeA: number;
  gradeAPercent: number;
  passPercent: number;
  rank: number;
}

export interface SubjectDetailResponse {
  year: string;
  track: "science" | "social-science";
  subject: SubjectKey;
  subjectMeta: SubjectMeta;
  overview: SubjectOverviewItem;
  otherTrackOverview?: SubjectOverviewItem;
  schools: SubjectSchoolItem[];
  provinces: SubjectProvinceItem[];
}

const subjectOverviewCaches = new Map<string, { modifiedAt: number; items: SubjectOverviewItem[] }>();
const subjectDetailCaches = new Map<string, { modifiedAt: number; map: Map<string, SubjectDetailResponse> }>();

export function getArchiveSubjectOverview(year: string): SubjectOverviewItem[] {
  const directory = archiveDirectory(year);
  if (!directory) throw new Error(`Archive ${year} is not available.`);
  const modifiedAt = statSync(resolve(directory, `bacii-${year}.sqlite`)).mtimeMs;
  const cached = subjectOverviewCaches.get(year);
  if (cached?.modifiedAt === modifiedAt) return cached.items;

  const db = archiveDatabase(year);
  const items: SubjectOverviewItem[] = [];

  const tracks: Array<"science" | "social-science"> = ["science", "social-science"];
  for (const track of tracks) {
    const trackWhere = track === "science"
      ? "(p.text_raw LIKE '%គីមី%' OR p.text_raw LIKE '%ជីវ%')"
      : "(p.text_raw LIKE '%សីល-ពល%' OR p.text_raw LIKE '%ែផនដី%')";

    // Build single query for all 7 subjects in this track
    const selectClauses: string[] = ["COUNT(*) as total"];
    for (let i = 1; i <= 7; i++) {
      for (const grade of ["A", "B", "C", "D", "E", "F"]) {
        selectClauses.push(`SUM(CASE WHEN s.subject_${i} = '${grade}' THEN 1 ELSE 0 END) as s${i}_${grade}`);
      }
    }

    const row = db.prepare(`
      SELECT ${selectClauses.join(", ")}
      FROM students s
      JOIN pages p ON p.id = s.page_id
      WHERE ${trackWhere}
    `).get() as Record<string, number>;

    const total = Number(row.total || 0);

    for (const meta of SUBJECT_METAS) {
      if (!meta.tracks.includes(track)) continue;
      const col = getSubjectColumn(meta.key, track);
      if (!col) continue;
      const num = col.replace("subject_", "");
      const grades: Record<SubjectGrade, number> = {
        A: Number(row[`s${num}_A`] || 0),
        B: Number(row[`s${num}_B`] || 0),
        C: Number(row[`s${num}_C`] || 0),
        D: Number(row[`s${num}_D`] || 0),
        E: Number(row[`s${num}_E`] || 0),
        F: Number(row[`s${num}_F`] || 0),
      };
      const gradeA = grades.A;
      const passing = grades.A + grades.B + grades.C + grades.D + grades.E;
      const excellence = grades.A + grades.B;
      const gradeAPercent = total > 0 ? Number(((gradeA / total) * 100).toFixed(2)) : 0;
      const passPercent = total > 0 ? Number(((passing / total) * 100).toFixed(2)) : 0;
      const excellencePercent = total > 0 ? Number(((excellence / total) * 100).toFixed(2)) : 0;

      items.push({
        key: meta.key,
        nameKm: meta.nameKm,
        nameEn: meta.nameEn,
        track,
        totalCandidates: total,
        grades,
        gradeAPercent,
        passPercent,
        excellencePercent,
      });
    }
  }

  subjectOverviewCaches.set(year, { modifiedAt, items });
  return items;
}

export interface GetSubjectDetailOptions {
  track?: "science" | "social-science";
  subject?: SubjectKey;
  province?: string;
  search?: string;
  sort?: "gradeA" | "gradeAPercent" | "candidates" | "passRate" | "name";
  limit?: number;
}

export function getArchiveSubjectDetail(year: string, options: GetSubjectDetailOptions = {}): SubjectDetailResponse {
  const directory = archiveDirectory(year);
  if (!directory) throw new Error(`Archive ${year} is not available.`);
  const modifiedAt = statSync(resolve(directory, `bacii-${year}.sqlite`)).mtimeMs;

  const track = options.track === "social-science" ? "social-science" : "science";
  const subject: SubjectKey = options.subject || (track === "science" ? "physics" : "math");
  const meta = SUBJECT_METAS.find((m) => m.key === subject) || SUBJECT_METAS[0];
  const col = getSubjectColumn(meta.key, track);
  if (!col) throw new Error(`Subject ${subject} is not available in track ${track}.`);

  let cacheEntry = subjectDetailCaches.get(year);
  if (!cacheEntry || cacheEntry.modifiedAt !== modifiedAt) {
    cacheEntry = { modifiedAt, map: new Map() };
    subjectDetailCaches.set(year, cacheEntry);
  }

  const cacheKey = `${track}:${meta.key}`;
  let baseDetail = cacheEntry.map.get(cacheKey);

  if (!baseDetail) {
    const db = archiveDatabase(year);
    const trackWhere = track === "science"
      ? "(p.text_raw LIKE '%គីមី%' OR p.text_raw LIKE '%ជីវ%')"
      : "(p.text_raw LIKE '%សីល-ពល%' OR p.text_raw LIKE '%ែផនដី%')";

    // 1. Overview items
    const allOverviews = getArchiveSubjectOverview(year);
    const overview = allOverviews.find((o) => o.track === track && o.key === meta.key)!;
    const otherTrack = track === "science" ? "social-science" : "science";
    const otherTrackOverview = allOverviews.find((o) => o.track === otherTrack && o.key === meta.key);

    // 2. High schools query
    const schoolRows = db.prepare(`
      SELECT
        s.school_raw AS name,
        MIN(s.id) AS sampleStudentId,
        s.province AS province,
        d.slug AS slug,
        COUNT(s.id) AS total,
        SUM(CASE WHEN s.${col} = 'A' THEN 1 ELSE 0 END) AS gradeA,
        SUM(CASE WHEN s.${col} = 'B' THEN 1 ELSE 0 END) AS gradeB,
        SUM(CASE WHEN s.${col} = 'C' THEN 1 ELSE 0 END) AS gradeC,
        SUM(CASE WHEN s.${col} = 'D' THEN 1 ELSE 0 END) AS gradeD,
        SUM(CASE WHEN s.${col} = 'E' THEN 1 ELSE 0 END) AS gradeE,
        SUM(CASE WHEN s.${col} = 'F' THEN 1 ELSE 0 END) AS gradeF
      FROM students s
      JOIN pages p ON p.id = s.page_id
      JOIN documents d ON d.id = s.document_id
      WHERE ${trackWhere}
      GROUP BY s.school_raw, s.province, d.slug
    `).all() as Array<{
      name: string; sampleStudentId: number; province: string; slug: string; total: number;
      gradeA: number; gradeB: number; gradeC: number; gradeD: number; gradeE: number; gradeF: number;
    }>;

    const schools: SubjectSchoolItem[] = schoolRows.map((r) => {
      const totalCandidates = Number(r.total || 0);
      const gradeA = Number(r.gradeA || 0);
      const gradeB = Number(r.gradeB || 0);
      const gradeC = Number(r.gradeC || 0);
      const gradeD = Number(r.gradeD || 0);
      const gradeE = Number(r.gradeE || 0);
      const gradeF = Number(r.gradeF || 0);
      const passing = gradeA + gradeB + gradeC + gradeD + gradeE;
      const gradeAPercent = totalCandidates > 0 ? Number(((gradeA / totalCandidates) * 100).toFixed(2)) : 0;
      const passPercent = totalCandidates > 0 ? Number(((passing / totalCandidates) * 100).toFixed(2)) : 0;
      return {
        name: String(r.name).trim(),
        sampleStudentId: Number(r.sampleStudentId),
        province: String(r.province),
        provinceId: provinceId(String(r.slug), year),
        totalCandidates,
        grades: { A: gradeA, B: gradeB, C: gradeC, D: gradeD, E: gradeE, F: gradeF },
        gradeA,
        gradeAPercent,
        passPercent,
        rank: 0,
      };
    });

    // 3. Provinces query
    const provRows = db.prepare(`
      SELECT
        d.slug AS slug,
        s.province AS province,
        COUNT(s.id) AS total,
        SUM(CASE WHEN s.${col} = 'A' THEN 1 ELSE 0 END) AS gradeA,
        SUM(CASE WHEN s.${col} = 'B' THEN 1 ELSE 0 END) AS gradeB,
        SUM(CASE WHEN s.${col} = 'C' THEN 1 ELSE 0 END) AS gradeC,
        SUM(CASE WHEN s.${col} = 'D' THEN 1 ELSE 0 END) AS gradeD,
        SUM(CASE WHEN s.${col} = 'E' THEN 1 ELSE 0 END) AS gradeE,
        SUM(CASE WHEN s.${col} = 'F' THEN 1 ELSE 0 END) AS gradeF
      FROM students s
      JOIN pages p ON p.id = s.page_id
      JOIN documents d ON d.id = s.document_id
      WHERE ${trackWhere}
      GROUP BY d.slug, s.province
      ORDER BY gradeA DESC
    `).all() as Array<{
      slug: string; province: string; total: number;
      gradeA: number; gradeB: number; gradeC: number; gradeD: number; gradeE: number; gradeF: number;
    }>;

    const provinces: SubjectProvinceItem[] = provRows.map((r, idx) => {
      const totalCandidates = Number(r.total || 0);
      const gradeA = Number(r.gradeA || 0);
      const gradeB = Number(r.gradeB || 0);
      const gradeC = Number(r.gradeC || 0);
      const gradeD = Number(r.gradeD || 0);
      const gradeE = Number(r.gradeE || 0);
      const gradeF = Number(r.gradeF || 0);
      const passing = gradeA + gradeB + gradeC + gradeD + gradeE;
      const gradeAPercent = totalCandidates > 0 ? Number(((gradeA / totalCandidates) * 100).toFixed(2)) : 0;
      const passPercent = totalCandidates > 0 ? Number(((passing / totalCandidates) * 100).toFixed(2)) : 0;
      return {
        id: provinceId(String(r.slug), year),
        name: String(r.province),
        totalCandidates,
        grades: { A: gradeA, B: gradeB, C: gradeC, D: gradeD, E: gradeE, F: gradeF },
        gradeA,
        gradeAPercent,
        passPercent,
        rank: idx + 1,
      };
    });

    baseDetail = {
      year,
      track,
      subject: meta.key,
      subjectMeta: meta,
      overview,
      otherTrackOverview,
      schools,
      provinces,
    };
    cacheEntry.map.set(cacheKey, baseDetail);
  }

  // Apply filters and sorting
  let filteredSchools = baseDetail.schools;
  if (options.province && options.province !== "all") {
    filteredSchools = filteredSchools.filter((s) => s.provinceId === options.province || s.province === options.province);
  }
  if (options.search) {
    const q = options.search.trim().toLowerCase();
    filteredSchools = filteredSchools.filter((s) => s.name.toLowerCase().includes(q) || s.province.toLowerCase().includes(q));
  }

  const sort = options.sort || "gradeA";
  filteredSchools = filteredSchools.slice().sort((a, b) => {
    if (sort === "gradeA") return b.gradeA - a.gradeA || b.totalCandidates - a.totalCandidates;
    if (sort === "gradeAPercent") return b.gradeAPercent - a.gradeAPercent || b.gradeA - a.gradeA;
    if (sort === "candidates") return b.totalCandidates - a.totalCandidates || b.gradeA - a.gradeA;
    if (sort === "passRate") return b.passPercent - a.passPercent || b.gradeA - a.gradeA;
    if (sort === "name") return a.name.localeCompare(b.name, "km");
    return 0;
  });

  const rankedSchools = filteredSchools.map((s, idx) => ({ ...s, rank: idx + 1 }));
  const finalSchools = options.limit && options.limit > 0 ? rankedSchools.slice(0, options.limit) : rankedSchools;

  return {
    ...baseDetail,
    schools: finalSchools,
  };
}

