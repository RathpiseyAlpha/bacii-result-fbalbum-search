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
  const fileName = basename(row.localPath);
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
  const pdf = resolve(directory, "pdfs", basename(row.localPath));
  return existsSync(pdf) ? { pdf, pageNumber: row.pageNumber, tableNumber: String(row.tableNumber) } : undefined;
}
