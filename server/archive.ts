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
  gradeAScience: number;
  gradeASocial: number;
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
      SUM(CASE WHEN s.grade_raw = 'A' AND ${TRACK_SQL} = 'science' THEN 1 ELSE 0 END) AS gradeAScience,
      SUM(CASE WHEN s.grade_raw = 'A' AND ${TRACK_SQL} = 'social-science' THEN 1 ELSE 0 END) AS gradeASocial,
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

  const gradesByTrack = db.prepare(`
    SELECT ${TRACK_SQL} AS track, s.grade_raw AS grade, COUNT(*) AS count
    FROM students s JOIN pages p ON p.id = s.page_id
    WHERE s.grade_raw IN ('A', 'B', 'C', 'D', 'E')
    GROUP BY track, grade
  `).all() as Array<{ track: string; grade: string; count: number }>;

  const gradeTrackBreakdown: Record<string, { science: number; social: number; total: number }> = {
    A: { science: 0, social: 0, total: 0 },
    B: { science: 0, social: 0, total: 0 },
    C: { science: 0, social: 0, total: 0 },
    D: { science: 0, social: 0, total: 0 },
    E: { science: 0, social: 0, total: 0 },
  };
  for (const row of gradesByTrack) {
    const g = row.grade;
    if (gradeTrackBreakdown[g]) {
      if (row.track === "science") gradeTrackBreakdown[g].science += row.count;
      else gradeTrackBreakdown[g].social += row.count;
      gradeTrackBreakdown[g].total += row.count;
    }
  }

  const summary = {
    year,
    candidateCount: candidateCount.count,
    pageCount: pageCount.count,
    schoolCount: schoolCount.count,
    provinceCount: provinces.length,
    centerCount: provinces.reduce((sum, province) => sum + province.centerCount, 0),
    grades,
    tracks,
    gradeTrackBreakdown,
    provinces: provinces.map((province) => {
      const { gradeA, gradeAScience, gradeASocial, gradeB, gradeC, gradeD, gradeE, ...details } = province;
      return {
        ...details,
        id: provinceId(province.slug, year),
        gradeA,
        gradeAScience,
        gradeASocial,
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

export function normalizeSchoolRaw(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/[\u200b\u00a0]/g, " ").trim();
  // Strip trailing room / table numbers (e.g. ០១, ០២, ..., ៣០, or latin digits 01, 02)
  // which frequently leak from the adjacent column into school_raw
  s = s.replace(/[\s\-_/]*[០-៩0-9]{1,3}[\s\-_/]*$/, "");
  // Strip trailing unclosed brackets or punctuation caused by column clipping (e.g. '... (' or '... -')
  s = s.replace(/[\s\(\[\{\-\.\,\_\/\:\;]+$/, "");
  // Normalize internal whitespace sequences
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function cleanLimonBranch(rawBranch: string): string {
  let b = (rawBranch || "").trim();
  b = b.replace(/^[\(\[\{\s]+|[\)\]\}\s]+$/g, "").trim();

  // Known branch translations from Limon / OCR
  if (/ភ[ƒ្ន]+ំ[េែ]*ពញ[ថ\s]*[Ɨឺី]*/i.test(b) || b.includes("ភƒំ") || b.includes("ភ្នំពេញថ្មី") || b.includes("ភ្នំពេញ")) {
    return "សាខាភ្នំពេញថ្មី";
  }
  if (b.includes("បឹងƙតែបក") || b.includes("បឹងត្របែក")) return "សាខាបឹងត្របែក";
  if (b.includes("ចǙរអំេǺ") || b.includes("ច្បារអំពៅ")) return "សាខាច្បារអំពៅ";
  if (b.includes("ចំƳរដូង") || b.includes("ចំការដូង")) return "សាខាចំការដូង";
  if (b.includes("ទួលǒƛ") || b.includes("ទួលស្វាយព្រៃ")) return "សាខាទួលស្វាយព្រៃ";
  if (b.includes("ទួលសែង") || b.includes("ទួលសង្កែ")) return "សាខាទួលសង្កែ";
  if (b.includes("ទួលពƙង") || b.includes("ទួលពង្រ")) return "សាខាទួលពង្រ";
  if (b.includes("សនƑរម៉ុក") || b.includes("សន្ធរម៉ុក")) return "សាខាសន្ធរម៉ុក";
  if (b.includes("េƙƺយចƷƛ") || b.includes("ជ្រោយចង្វារ")) return "សាខាជ្រោយចង្វារ";
  if (b.includes("Ƹក់អែƙង") || b.includes("ចាក់អង្រែ")) return "សាខាចាក់អង្រែ";
  if (b.includes("េƸមេǩ") || b.includes("ចោមចៅ")) return "សាខាចោមចៅ";
  if (b.includes("េសȢមǍប") || b.includes("សៀមរាប")) return "សាខាសៀមរាប";
  if (b.includes("ǂែកវ") || b.includes("តាកែវ")) return "សាខាតាកែវ";
  if (b.includes("ទួលទំពូង")) return "សាខាទួលទំពូង";
  if (b.includes("ែƙពកេល") || b.includes("ែពកេល") || b.includes("ព្រែកលៀប")) return "សាខាព្រែកលៀប";
  if (b.includes("ផǒរថី") || b.includes("ផរថី") || b.includes("ផ្សារថ្មី")) return "សាខាផ្សារថ្មី";

  // If already starts with សាខា
  if (!b.startsWith("សាខា")) {
    b = `សាខា${b}`;
  }

  // Remove any remaining Limon Latin transliteration corrupt characters
  b = b.replace(/[\u0180-\u024F\uF100-\uF1FF]/g, "").trim();
  return b;
}

export function classifySchoolType(name: string, raw?: string): "public" | "private" {
  const text = `${name} ${raw || ""}`.toLowerCase();

  // Explicit Public overrides (state schools that contain friendship countries or geography)
  if (
    text.includes("មិត្តភាពខ្មែរ-ជប៉ុន") ||
    text.includes("ខ្មែរ-ជប៉ុន") ||
    text.includes("កោះចិន") ||
    text.includes("គរុកោសល្យ") ||
    text.includes("មជƆ.គរុ") ||
    text.includes("ពុទ្ធិក") ||
    text.includes("ព្រះសុរាម្រឹត")
  ) {
    return "public";
  }

  // Known Private identifiers (networks, international schools, private institutions)
  const privateKeywords = [
    "អន្តរជាតិ", "អនƎរƺតិ", "អនƎរ", "international",
    "ប៊ែលធី", "ប៊លធី", "ែប៊លធី", "beltei",
    "សុវណ្ណភូមិ", "សុវណƍភូមិ", "sovannaphumi",
    "អន្តរទ្វីប", "american intercon", " ais ", "ais",
    "វេស្តើន", "េវេស", "េវ៉ស", "វេសថឺន", "វេសធើន", "western", "westland",
    "បញ្ញាសាស្ត្រ", "psic", "psis",
    "ទួនហ្វា", "ទួនǓƛ", "tuan hoa",
    "ចុងហ្វា", "ប៉េកាំង", "ដួងហ្វា",
    "អាមេរិកាំង", "american", "us ", "usa", "យូ េអស េអ",
    "អារីហ្សូន", "arizona",
    "រ៉ូយ៉ាល់", "royal",
    "ខូលីងវូដ", "collingwood",
    "ឌូវី", "dewey",
    "ញូវយ៉ក", "new york",
    "ប្រាយស្តារ", "brightstar",
    "ហ្គោលដិន", "golden",
    "គ្លូប៊ល", "global",
    "សន្តហ្វ្រង់ស័រ", "saint", "សន្ត", "សេន ",
    "ញូវវើលដ៍", "new world",
    "ǖយឃƘូ", "ǕយឃƘូ", "iq ",
    "ភƘូឆឺរ", "future bright",
    "សឹង្ហបុរី", "សិង្ហបុរី", "singapore",
    "កាណាដា", "canadian", "canadia",
    "អូស្ត្រាលី", "australian",
    "ខេមប៊្រីដ", "cambridge",
    "ហ្សាម៉ាន់", "zaman", "paragon",
    "ស៊ី អាយ អេ", "cia",
    "ណ័រប្រ៊ីជ", "northbridge",
    "ឡាយហ្វ", "life school",
    "ចេនឡា", "ប៊្លូស្កាយ", "ហ្វូតព្រីន",
    "វិ.សាលា", "សាលារៀនឯកជន", "ឯកជន",
    "អាស៊ី អឺរ៉ុប", "បូស្តុន", "boston",
    "សំបូរណ៍វិជ្ជា", "និវត្តន៍", "ប៊ែលវីដៀ",
    "ខេមអេដ", "camed", "សហរដ្ឋ",
    "ចរិយាវត្ត", "មេគង្គ", "mekong",
    "ហុងកុង", "hong kong", "ភាសាបរទេស",
  ];

  for (const kw of privateKeywords) {
    if (text.includes(kw)) {
      return "private";
    }
  }

  return "public";
}

export interface ResolvedSchoolBranch {
  baseName: string;
  branch?: string;
  groupKey: string;
}

export function resolveSchoolBranch(
  rawSchool: string,
  examCenters: string = "",
  province: string = ""
): ResolvedSchoolBranch {
  const raw = (rawSchool || "").replace(/[\u200b\u00a0]/g, " ").trim();
  const centers = examCenters || "";

  // 0. Separate school in Preah Sihanouk: វិ.អន្តរទ្វីប (Intercon High School - not a branch of AIS)
  if (
    (raw.includes("អនƎរទƛីប") || raw.includes("អន្តរទ្វីប")) &&
    (province.includes("ព្រះសីហនុ") || (!raw.includes("ǕេមរិƳំង") && !raw.includes("អាមេរិកាំង")))
  ) {
    return {
      baseName: "វិ.អន្តរទ្វីប",
      groupKey: "វិ.អន្តរទ្វីប",
    };
  }

  // 1. AIS (American Intercon School / អន្តរទ្វីប អាមេរិកាំង)
  if (raw.includes("អនƎរទƛីប") || raw.includes("អន្តរទ្វីប")) {
    const baseName = "វិ.សាលារៀន អន្តរទ្វីប អាមេរិកាំង";
    let branch: string | undefined;

    if (raw.includes("េǼ៉េសទុង") || raw.includes("ម៉ៅសេទុង")) {
      branch = "សាខាម៉ៅសេទុង";
    } else if (raw.includes("ទួលេƵក") || raw.includes("ទួលគោក")) {
      branch = "សាខាទួលគោក";
    } else if (raw.includes("េƙƺយចƷƛ") || raw.includes("ជ្រោយចង្វារ")) {
      branch = "សាខាជ្រោយចង្វារ";
    } else if (raw.includes("Ƹក់អែƙង") || raw.includes("ចាក់អង្រែ")) {
      branch = "សាខាចាក់អង្រែ";
    } else if (raw.includes("េƸមេǩ") || raw.includes("ចោមចៅ")) {
      branch = "សាខាចោមចៅ";
    } else if (raw.includes("ចǙរអំេǺ") || raw.includes("ច្បារអំពៅ")) {
      branch = "សាខាច្បារអំពៅ";
    } else if (raw.includes("ចំƳរដូង") || raw.includes("ចំការដូង")) {
      branch = "សាខាចំការដូង";
    } else if (raw.includes("ទួលសែងž") || raw.includes("ទួលសង្កែ")) {
      branch = "សាខាទួលសង្កែ";
    } else if (raw.includes("ǂែកវ") || raw.includes("តាកែវ") || province.includes("តាកែវ")) {
      branch = "សាខាតាកែវ";
    } else if (province.includes("សៀមរាប")) {
      branch = "សាខាសៀមរាប";
    } else {
      // Check exam centers for truncated records (e.g. ending in '(' or 'ែ...')
      if (
        centers.includes("សុីសុវត") ||
        centers.includes("វត្តភ្នំ") ||
        centers.includes("វតƎភƒំ") ||
        centers.includes("ចតុមុខ") ||
        centers.includes("Ǉក់ទូក") ||
        centers.includes("បាក់ទូក") ||
        centers.includes("ែƙពកេល") ||
        centers.includes("ព្រែកលៀប")
      ) {
        branch = "សាខាជ្រោយចង្វារ";
      } else if (
        centers.includes("ចំការដូង") ||
        centers.includes("ចំƳរដូង") ||
        centers.includes("ចាក់អង្រែ") ||
        centers.includes("Ƹក់អែƙង")
      ) {
        branch = "សាខាចំការដូង";
      } else {
        branch = "សាខាចោមចៅ";
      }
    }

    return {
      baseName,
      branch,
      groupKey: `${baseName}:::${branch || ""}`,
    };
  }

  // 2. Beltei International School (សាលាប៊ែលធីអន្តរជាតិ)
  if (raw.includes("ប៊លធី") || raw.includes("ែប៊លធី") || raw.includes("ប៊ែលធី")) {
    const baseName = "វិ.សាលាប៊ែលធីអន្តរជាតិ";
    const numMatch = raw.match(/ទី\s*([០-៩0-9]+)/);
    let branch: string | undefined;
    if (numMatch) {
      branch = `សាខាទី ${numMatch[1]}`;
    } else {
      const paren = raw.match(/\(([^)]+)\)?/);
      if (paren) branch = cleanLimonBranch(paren[1]);
    }
    return {
      baseName,
      branch,
      groupKey: `${baseName}:::${branch || ""}`,
    };
  }

  // 3. Sovannaphumi School (សាលារៀនសុវណ្ណភូមិ)
  if (raw.includes("សុវណƍភូមិ") || raw.includes("សុវណ្ណភូមិ")) {
    const baseName = "វិ.សាលារៀនសុវណ្ណភូមិ";
    const numMatch = raw.match(/ទី\s*([០-៩0-9]+)/);
    const branch = numMatch ? `សាខាទី ${numMatch[1]}` : undefined;
    return {
      baseName,
      branch,
      groupKey: `${baseName}:::${branch || ""}`,
    };
  }

  // 4. Western International School (សាលាវេស្តើនអន្តរជាតិ)
  if (
    raw.includes("េវេស") ||
    raw.includes("េវ៉ស") ||
    raw.includes("វេសថឺន") ||
    raw.includes("វេសធើន") ||
    raw.includes("វេស្តើន") ||
    raw.toLowerCase().includes("western")
  ) {
    const baseName = "វិ.សាលាវេស្តើនអន្តរជាតិ";
    let branch: string | undefined;
    if (raw.includes("ភƒំ") || raw.includes("ភ្នំពេញ")) {
      branch = "សាខាភ្នំពេញថ្មី";
    } else if (raw.includes("ចǙរអំេǺ") || raw.includes("ច្បារអំពៅ")) {
      branch = "សាខាច្បារអំពៅ";
    } else if (raw.includes("សនƑរម៉ុក") || raw.includes("សន្ធរម៉ុក")) {
      branch = "សាខាសន្ធរម៉ុក";
    } else if (raw.includes("ចំƳរដូង") || raw.includes("ចំការដូង")) {
      branch = "សាខាចំការដូង";
    } else if (raw.includes("បឹងƙតែបក") || raw.includes("បឹងត្របែក")) {
      branch = "សាខាបឹងត្របែក";
    } else if (raw.includes("ទួលǒƛ") || raw.includes("ទួលស្វាយព្រៃ")) {
      branch = "សាខាទួលស្វាយព្រៃ";
    } else if (raw.includes("ទួលទំពូង")) {
      branch = "សាខាទួលទំពូង";
    } else if (raw.includes("េសȢមǍប") || raw.includes("សៀមរាប")) {
      branch = "សាខាសៀមរាប";
    } else if (raw.includes("ǂែកវ") || raw.includes("តាកែវ")) {
      branch = "សាខាតាកែវ";
    } else if (raw.includes("ទួលសែង") || raw.includes("ទួលសង្កែ")) {
      branch = "សាខាទួលសង្កែ";
    } else {
      const paren = raw.match(/\(([^)]+)\)?$/);
      if (paren) {
        branch = cleanLimonBranch(paren[1]);
      }
    }
    return {
      baseName,
      branch,
      groupKey: `${baseName}:::${branch || ""}`,
    };
  }

  // 5. Tuan Hoa (វិ.សាលារៀនទួនហ្វា)
  if (raw.includes("ទួនǓƛ") || raw.includes("ទួនហ្វា") || raw.includes("ទួនǊ")) {
    const baseName = "វិ.សាលារៀនទួនហ្វា";
    const branch = raw.includes("ទួលពƙង") || raw.includes("ទួលពង្រ") ? "សាខាទួលពង្រ" : "សាខាទី ១ (អូឡាំពិក)";
    return {
      baseName,
      branch,
      groupKey: `${baseName}:::${branch}`,
    };
  }

  // 6. USA International School (វិ.សាលាអន្តរជាតិ យូ អេស អេ)
  if (
    raw.includes("យូ េអស េអ") ||
    raw.includes("យូ អេស អេ") ||
    raw.includes("យូ.អេស.អេ") ||
    raw.toLowerCase().includes("usa")
  ) {
    const baseName = "វិ.សាលាអន្តរជាតិ យូ អេស អេ";
    let branch: string | undefined;
    if (raw.includes("ផǜរេដមគរ") || raw.includes("ផ្សារដើមគរ")) {
      branch = "សាខាផ្សារដើមគរ";
    } else if (raw.includes("ចǙរអំេǺ") || raw.includes("ច្បារអំពៅ")) {
      branch = "សាខាច្បារអំពៅ";
    } else if (raw.includes("បន្ទាយមានជ័យ") || province.includes("បន្ទាយមានជ័យ")) {
      branch = "សាខាបន្ទាយមានជ័យ";
    } else if (raw.includes("សៀមរាប") || province.includes("សៀមរាប")) {
      branch = "សាខាសៀមរាប";
    }
    return {
      baseName,
      branch,
      groupKey: `${baseName}:::${branch || ""}`,
    };
  }

  // 7. Dewey International School (វិ.សាលាអន្តរជាតិ ឌូវី)
  if (raw.includes("ឌូវី") || raw.toLowerCase().includes("dewey")) {
    const baseName = "វិ.សាលាអន្តរជាតិ ឌូវី";
    let branch: string | undefined;
    if (raw.includes("បǆƐ យǋនជ័យ") || raw.includes("បន្ទាយមានជ័យ") || province.includes("បន្ទាយមានជ័យ")) {
      branch = "សាខាបន្ទាយមានជ័យ";
    } else if (province.includes("បាត់ដំបង")) {
      branch = "សាខាបាត់ដំបង";
    }
    return {
      baseName,
      branch,
      groupKey: `${baseName}:::${branch || ""}`,
    };
  }

  // 8. Westline International School (វិ.សាលាអន្តរជាតិ វេសឡាញន៍)
  if (
    raw.includes("េវសƐែលន") ||
    raw.includes("វេសឡាញ") ||
    raw.toLowerCase().includes("westline")
  ) {
    const baseName = "វិ.សាលាអន្តរជាតិ វេសឡាញន៍";
    return {
      baseName,
      branch: undefined,
      groupKey: baseName,
    };
  }

  // 6. Generic parenthetical branch or province codes
  if (raw.includes("ជ័យវរƗ័ន") || raw.includes("ជ័យវរ្ម័ន")) {
    return {
      baseName: raw,
      branch: undefined,
      groupKey: raw,
    };
  }

  const provMap: Record<string, string> = {
    "(កច)": "សាខាកំពង់ចាម",
    "(បប)": "សាខាបាត់ដំបង",
    "(សរ)": "សាខាសៀមរាប",
    "(បជ)": "សាខាបន្ទាយមានជ័យ",
    "(តឃ)": "សាខាត្បូងឃ្មុំ",
    "(ររ)": "សាខារតនគិរី",
  };
  for (const [code, label] of Object.entries(provMap)) {
    if (raw.includes(code)) {
      const base = raw.replace(code, "").trim();
      return {
        baseName: base,
        branch: label,
        groupKey: `${base}:::${label}`,
      };
    }
  }

  // Generic (Campus) if enclosed or trailing parenthesis
  const parenMatch = raw.match(/\(([^)]+)\)?$/);
  if (parenMatch) {
    const brText = cleanLimonBranch(parenMatch[1]);
    let base = raw.replace(/\(([^)]+)\)?$/, "").trim();
    base = normalizeSchoolRaw(base);
    return {
      baseName: base,
      branch: brText || undefined,
      groupKey: `${base}:::${brText || ""}`,
    };
  }

  // Generic numbered campus like "ទី២", "ទី៩"
  const genericNum = raw.match(/[\s\-_/]+ទី\s*([០-៩0-9]+)$/);
  if (genericNum) {
    const base = raw.replace(/[\s\-_/]+ទី\s*([០-៩0-9]+)$/, "").trim();
    return {
      baseName: base,
      branch: `សាខាទី ${genericNum[1]}`,
      groupKey: `${base}:::សាខាទី ${genericNum[1]}`,
    };
  }

  // Fallback cleanup: strip unclosed paren at the end if any
  let cleaned = raw;
  const unclosedParen = cleaned.match(/\(([^\)]*)$/);
  let fallbackBranch: string | undefined;
  if (unclosedParen && unclosedParen[1].trim()) {
    fallbackBranch = cleanLimonBranch(unclosedParen[1]);
    cleaned = cleaned.replace(/\(([^\)]*)$/, "").trim();
  }

  cleaned = normalizeSchoolRaw(cleaned);

  return {
    baseName: cleaned,
    branch: fallbackBranch,
    groupKey: `${cleaned}:::${fallbackBranch || ""}`,
  };
}

export interface KhanInfo {
  id: string;
  nameKm: string;
  nameEn: string;
}

export const PHNOM_PENH_KHANS: KhanInfo[] = [
  { id: "daun-penh", nameKm: "ដូនពេញ", nameEn: "Daun Penh" },
  { id: "chamkar-mon", nameKm: "ចំការមន", nameEn: "Chamkar Mon" },
  { id: "prampir-meakkakra", nameKm: "៧មករា", nameEn: "Prampir Meakkakra" },
  { id: "tuol-kouk", nameKm: "ទួលគោក", nameEn: "Tuol Kouk" },
  { id: "boeng-keng-kang", nameKm: "បឹងកេងកង", nameEn: "Boeng Keng Kang" },
  { id: "russey-keo", nameKm: "ឫស្សីកែវ", nameEn: "Russey Keo" },
  { id: "sen-sok", nameKm: "សែនសុខ", nameEn: "Sen Sok" },
  { id: "chroy-changvar", nameKm: "ជ្រោយចង្វារ", nameEn: "Chroy Changvar" },
  { id: "pur-senchey", nameKm: "ពោធិ៍សែនជ័យ", nameEn: "Pur Senchey" },
  { id: "mean-chey", nameKm: "មានជ័យ", nameEn: "Mean Chey" },
  { id: "dangkao", nameKm: "ដង្កោ", nameEn: "Dangkao" },
  { id: "chbar-ampov", nameKm: "ច្បារអំពៅ", nameEn: "Chbar Ampov" },
  { id: "prek-pnov", nameKm: "ព្រែកព្នៅ", nameEn: "Prek Pnov" },
  { id: "kamboul", nameKm: "កំបូល", nameEn: "Kamboul" },
];

export function detectPhnomPenhKhan(
  name: string,
  branch?: string,
  sampleRaw?: string,
  examCenters?: string
): KhanInfo {
  const text = `${name} ${branch || ""} ${sampleRaw || ""} ${examCenters || ""}`.toLowerCase();

  // 1. Chbar Ampov (ច្បារអំពៅ)
  if (
    text.includes("ច្បារអំពៅ") ||
    text.includes("ចǙរអំេǺ") ||
    text.includes("ព្រែកឯង") ||
    text.includes("ែƙពកឯង") ||
    text.includes("និរោធ") ||
    text.includes("ក្បាលកោះ") ||
    text.includes("ព្រែកថ្មី") ||
    text.includes("ទី១៥") ||
    text.includes("ទី 15") ||
    text.includes("ទី២៣")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "chbar-ampov")!;
  }

  // 2. Chroy Changvar (ជ្រោយចង្វារ)
  if (
    text.includes("ជ្រោយចង្វារ") ||
    text.includes("េƙƺយចƷƛ") ||
    text.includes("ព្រែកលៀប") ||
    text.includes("ែƙពកេល") ||
    text.includes("កោះដាច់") ||
    text.includes("ទី១៨") ||
    text.includes("ទី 18") ||
    text.includes("ទី២១")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "chroy-changvar")!;
  }

  // 3. Prek Pnov (ព្រែកព្នៅ)
  if (
    text.includes("ព្រែកព្នៅ") ||
    text.includes("ែƙពកពƒៅ") ||
    text.includes("សំរោង") ||
    text.includes("ពញាពន់") ||
    text.includes("ទី១៤") ||
    text.includes("ទី 14")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "prek-pnov")!;
  }

  // 4. Russey Keo (ឫស្សីកែវ)
  if (
    text.includes("ឫស្សីកែវ") ||
    text.includes("ឫសƞីែកវ") ||
    text.includes("ទួលសង្កែ") ||
    text.includes("ច្រាំងចំរេះ") ||
    text.includes("គីឡូម៉ែត្រ") ||
    text.includes("ទី១៧") ||
    text.includes("ទី 17")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "russey-keo")!;
  }

  // 5. Sen Sok (សែនសុខ)
  if (
    text.includes("សែនសុខ") ||
    text.includes("ភ្នំពេញថ្មី") ||
    text.includes("ភƒំេពញថƗី") ||
    text.includes("ទួលប្រាសាទ") ||
    text.includes("បឹងឈូក") ||
    text.includes("ដីហុយ") ||
    text.includes("ទី១២") ||
    text.includes("ទី 12") ||
    text.includes("ទី១៩")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "sen-sok")!;
  }

  // 6. Kamboul (កំបូល)
  if (
    text.includes("កំបូល") ||
    text.includes("កន្ទោក") ||
    text.includes("ស្នោ") ||
    text.includes("បឹងធំ") ||
    text.includes("ឱឡោក") ||
    text.includes("ភ្លើងឆេះរទេះ") ||
    text.includes("ទី២៥")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "kamboul")!;
  }

  // 7. Pur Senchey (ពោធិ៍សែនជ័យ)
  if (
    text.includes("ពោធិ៍សែនជ័យ") ||
    text.includes("ពោធិ៍ចិនតុង") ||
    text.includes("េǉធȨចិនតុង") ||
    text.includes("ចោមចៅ") ||
    text.includes("េƸមេǩ") ||
    text.includes("ជំពូវ័ន") ||
    text.includes("ជមƕូវ័ន") ||
    text.includes("ត្រពាំងក្រសាំង") ||
    text.includes("កាកាប") ||
    text.includes("ទី ៨") ||
    text.includes("ទី៨") ||
    text.includes("ទី១០") ||
    text.includes("ទី 10") ||
    text.includes("ទី១៦") ||
    text.includes("ទី២០")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "pur-senchey")!;
  }

  // 8. Dangkao (ដង្កោ)
  if (
    text.includes("ដង្កោ") ||
    text.includes("ចំការដូង") ||
    text.includes("ចំƳរដូង") ||
    text.includes("ពងទឹក") ||
    text.includes("ព្រៃវែង") ||
    text.includes("ព្រៃស") ||
    text.includes("គោកបញ្ជាន់") ||
    text.includes("ទី១៣") ||
    text.includes("ទី 13") ||
    text.includes("ទី២២") ||
    text.includes("ទី២៤") ||
    text.includes("ទី២៦")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "dangkao")!;
  }

  // 9. Mean Chey (មានជ័យ)
  if (
    text.includes("មានជ័យ") ||
    text.includes("ចាក់អង្រែ") ||
    text.includes("Ƹក់អែƙង") ||
    text.includes("ស្ទឹងមានជ័យ") ||
    text.includes("បឹងទំពុន") ||
    text.includes("ទី ២") ||
    text.includes("ទី២") ||
    text.includes("ទី ៩") ||
    text.includes("ទី៩")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "mean-chey")!;
  }

  // 10. Chamkar Mon (ចំការមន)
  if (
    text.includes("ចំការមន") ||
    text.includes("បឹងត្របែក") ||
    text.includes("បឹងƙតែបក") ||
    text.includes("ផ្សារដើមថ្កូវ") ||
    text.includes("ផǜរេដមថžូវ") ||
    text.includes("ទួលទំពូង") ||
    text.includes("ទី ៤") ||
    text.includes("ទី៤") ||
    text.includes("ទី ៥") ||
    text.includes("ទី៥")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "chamkar-mon")!;
  }

  // 11. Boeng Keng Kang (បឹងកេងកង)
  if (
    text.includes("បឹងកេងកង") ||
    text.includes("ទួលស្វាយព្រៃ") ||
    text.includes("ទួលǒƛ យៃƙព") ||
    text.includes("ម៉ៅសេទុង") ||
    text.includes("េǼ៉េសទុង") ||
    text.includes("ទី១១") ||
    text.includes("ទី 11")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "boeng-keng-kang")!;
  }

  // 12. Tuol Kouk (ទួលគោក)
  if (
    text.includes("ទួលគោក") ||
    text.includes("ទួលេƵក") ||
    text.includes("សន្ធរម៉ុក") ||
    text.includes("សនƑរម៉ុក") ||
    text.includes("ទឹកល្អក់") ||
    text.includes("ទឹកលơក់") ||
    text.includes("ឥន្ទ្រទេវី") ||
    text.includes("ឥȜនƐេទវី") ||
    text.includes("ទី ៣") ||
    text.includes("ទី៣") ||
    text.includes("ទី ៧") ||
    text.includes("ទី៧")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "tuol-kouk")!;
  }

  // 13. Prampir Meakkakra (៧មករា)
  if (
    text.includes("៧មករា") ||
    text.includes("បាក់ទូក") ||
    text.includes("Ǉក់ទូក") ||
    text.includes("យុគន្ធរ") ||
    text.includes("ដួងហ្វា") ||
    text.includes("ចុងហ្វា") ||
    text.includes("ទី ១") ||
    text.includes("ទី១")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "prampir-meakkakra")!;
  }

  // 14. Daun Penh (ដូនពេញ)
  if (
    text.includes("ដូនពេញ") ||
    text.includes("ស៊ីសុវត្ថិ") ||
    text.includes("សុីសុវត") ||
    text.includes("វត្តកោះ") ||
    text.includes("វតƎេƳះ") ||
    text.includes("ចតុមុខ") ||
    text.includes("វត្តភ្នំ") ||
    text.includes("វតƎភƒំ") ||
    text.includes("នរោត្តម") ||
    text.includes("ទី ៦") ||
    text.includes("ទី៦")
  ) {
    return PHNOM_PENH_KHANS.find((k) => k.id === "daun-penh")!;
  }

  // Heuristic center fallbacks
  if (examCenters) {
    if (examCenters.includes("Ǉក់ទូក") || examCenters.includes("បាក់ទូក")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "prampir-meakkakra")!;
    }
    if (examCenters.includes("សុីសុវត") || examCenters.includes("វត្តភ្នំ") || examCenters.includes("ចតុមុខ")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "daun-penh")!;
    }
    if (examCenters.includes("សនƑរម៉ុក") || examCenters.includes("ទឹកលơក់")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "tuol-kouk")!;
    }
    if (examCenters.includes("ភƒំេពញថƗី") || examCenters.includes("ទួលƙǇǒទែសនសុខ")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "sen-sok")!;
    }
    if (examCenters.includes("ជមƕូវ័ន") || examCenters.includes("េǉធȨចិនតុង")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "pur-senchey")!;
    }
    if (examCenters.includes("ឫសƞីែកវ") || examCenters.includes("ែƙពកេល")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "russey-keo")!;
    }
    if (examCenters.includes("ចំƳរដូង")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "dangkao")!;
    }
    if (examCenters.includes("Ƹក់អែƙង")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "mean-chey")!;
    }
    if (examCenters.includes("ចǙរអំេǺ")) {
      return PHNOM_PENH_KHANS.find((k) => k.id === "chbar-ampov")!;
    }
  }

  return PHNOM_PENH_KHANS.find((k) => k.id === "daun-penh")!;
}

export interface PhnomPenhDistrictStats {
  id: string;
  nameKm: string;
  nameEn: string;
  schoolsCount: number;
  candidateCount: number;
  gradeA: number;
  gradeAScience: number;
  gradeASocial: number;
  gradeAPercent: number;
  femaleCount: number;
  femalePercent: number;
  scienceCount: number;
  socialCount: number;
  publicCount: number;
  privateCount: number;
  topSchools: Array<{
    name: string;
    branch?: string;
    sampleStudentId?: number;
    candidateCount: number;
    gradeA: number;
    gradeAScience?: number;
    gradeASocial?: number;
    gradeAPercent: number;
    schoolType: "public" | "private";
  }>;
}

export type SchoolBranchItem = {
  name: string;
  branch?: string;
  schoolType: "public" | "private";
  khan?: string;
  khanId?: string;
  sampleStudentId: number;
  province: string;
  provinceId: string;
  candidateCount: number;
  femaleCount: number;
  scienceCount: number;
  socialCount: number;
  socialScienceCount: number;
  gradeA: number;
  gradeAScience: number;
  gradeASocial: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeE: number;
  grades: { A: number; B: number; C: number; D: number; E: number };
  gradeAPercent: number;
  passRate: number;
};

export type SchoolAnalysis = {
  name: string;
  branch?: string;
  branchCount?: number;
  branches?: SchoolBranchItem[];
  schoolType: "public" | "private";
  khan?: string;
  khanId?: string;
  sampleStudentId: number;
  province: string;
  provinceId: string;
  candidateCount: number;
  femaleCount: number;
  scienceCount: number;
  socialCount: number;
  socialScienceCount: number;
  gradeA: number;
  gradeAScience: number;
  gradeASocial: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeE: number;
  grades: { A: number; B: number; C: number; D: number; E: number };
  gradeAPercent: number;
  gradeAPercentage: number;
  passRate: number;
  rank: number;
};

export type GetSchoolsOptions = {
  province?: string;
  schoolType?: "all" | "public" | "private";
  khan?: string;
  search?: string;
  sort?: "candidates" | "gradeA" | "gradeAPercent" | "name";
  limit?: number;
  groupByBrand?: boolean;
};

export function consolidateSchools(schools: SchoolAnalysis[]): SchoolAnalysis[] {
  const publicList: SchoolAnalysis[] = [];
  const privateGroupMap = new Map<string, SchoolAnalysis[]>();

  for (const s of schools) {
    const totalPass = s.grades.A + s.grades.B + s.grades.C + s.grades.D + s.grades.E;
    const passRate = s.candidateCount > 0 ? Number(((totalPass / s.candidateCount) * 100).toFixed(1)) : 0;
    if (s.schoolType !== "private") {
      publicList.push({
        ...s,
        branchCount: 1,
        passRate,
      });
    } else {
      const group = privateGroupMap.get(s.name) || [];
      group.push({ ...s, passRate });
      privateGroupMap.set(s.name, group);
    }
  }

  const consolidatedPrivate: SchoolAnalysis[] = [];
  for (const [brandName, branchList] of privateGroupMap.entries()) {
    const sortedBranches = branchList.slice().sort((a, b) => b.gradeA - a.gradeA || b.candidateCount - a.candidateCount);
    const branchItems: SchoolBranchItem[] = sortedBranches.map((b) => ({
      name: b.name,
      branch: b.branch,
      schoolType: b.schoolType,
      khan: b.khan,
      khanId: b.khanId,
      sampleStudentId: b.sampleStudentId,
      province: b.province,
      provinceId: b.provinceId,
      candidateCount: b.candidateCount,
      femaleCount: b.femaleCount,
      scienceCount: b.scienceCount,
      socialCount: b.socialCount,
      socialScienceCount: b.socialScienceCount,
      gradeA: b.gradeA,
      gradeAScience: b.gradeAScience,
      gradeASocial: b.gradeASocial,
      gradeB: b.gradeB,
      gradeC: b.gradeC,
      gradeD: b.gradeD,
      gradeE: b.gradeE,
      grades: b.grades,
      gradeAPercent: b.gradeAPercent,
      passRate: b.passRate,
    }));

    if (sortedBranches.length === 1) {
      const single = sortedBranches[0];
      consolidatedPrivate.push({
        ...single,
        branchCount: 1,
        branches: branchItems,
      });
      continue;
    }

    const candidateCount = sortedBranches.reduce((acc, b) => acc + b.candidateCount, 0);
    const femaleCount = sortedBranches.reduce((acc, b) => acc + b.femaleCount, 0);
    const scienceCount = sortedBranches.reduce((acc, b) => acc + b.scienceCount, 0);
    const socialCount = sortedBranches.reduce((acc, b) => acc + b.socialCount, 0);
    const socialScienceCount = sortedBranches.reduce((acc, b) => acc + (b.socialScienceCount || 0), 0);
    const gradeA = sortedBranches.reduce((acc, b) => acc + b.gradeA, 0);
    const gradeAScience = sortedBranches.reduce((acc, b) => acc + (b.gradeAScience || 0), 0);
    const gradeASocial = sortedBranches.reduce((acc, b) => acc + (b.gradeASocial || 0), 0);
    const gradeB = sortedBranches.reduce((acc, b) => acc + b.gradeB, 0);
    const gradeC = sortedBranches.reduce((acc, b) => acc + b.gradeC, 0);
    const gradeD = sortedBranches.reduce((acc, b) => acc + b.gradeD, 0);
    const gradeE = sortedBranches.reduce((acc, b) => acc + b.gradeE, 0);
    const grades = { A: gradeA, B: gradeB, C: gradeC, D: gradeD, E: gradeE };
    const totalPass = gradeA + gradeB + gradeC + gradeD + gradeE;
    const gradeAPercentage = candidateCount > 0 ? Number(((gradeA / candidateCount) * 100).toFixed(2)) : 0;
    const passRate = candidateCount > 0 ? Number(((totalPass / candidateCount) * 100).toFixed(1)) : 0;

    const provSet = new Set(sortedBranches.map((b) => b.province));
    const provLabel = provSet.size === 1 ? sortedBranches[0].province : "ទូទាំងប្រទេស";
    const provId = provSet.size === 1 ? sortedBranches[0].provinceId : "nationwide";

    consolidatedPrivate.push({
      name: brandName,
      branch: undefined,
      branchCount: sortedBranches.length,
      branches: branchItems,
      schoolType: "private",
      sampleStudentId: sortedBranches[0].sampleStudentId,
      province: provLabel,
      provinceId: provId,
      candidateCount,
      femaleCount,
      scienceCount,
      socialCount,
      socialScienceCount,
      gradeA,
      gradeAScience,
      gradeASocial,
      gradeB,
      gradeC,
      gradeD,
      gradeE,
      grades,
      gradeAPercent: gradeAPercentage,
      gradeAPercentage,
      passRate,
      rank: 0,
    });
  }

  return [...publicList, ...consolidatedPrivate];
}

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
        GROUP_CONCAT(DISTINCT s.exam_center_raw) AS examCenters,
        COUNT(s.id) AS candidateCount,
        SUM(CASE WHEN s.gender_raw LIKE '%ស%' THEN 1 ELSE 0 END) AS femaleCount,
        SUM(CASE WHEN ${TRACK_SQL} = 'science' THEN 1 ELSE 0 END) AS scienceCount,
        SUM(CASE WHEN ${TRACK_SQL} = 'social-science' THEN 1 ELSE 0 END) AS socialScienceCount,
        SUM(CASE WHEN s.grade_raw = 'A' THEN 1 ELSE 0 END) AS gradeA,
        SUM(CASE WHEN s.grade_raw = 'A' AND ${TRACK_SQL} = 'science' THEN 1 ELSE 0 END) AS gradeAScience,
        SUM(CASE WHEN s.grade_raw = 'A' AND ${TRACK_SQL} = 'social-science' THEN 1 ELSE 0 END) AS gradeASocial,
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
      name: string; sampleStudentId: number; province: string; slug: string; examCenters?: string;
      candidateCount: number; femaleCount: number; scienceCount: number; socialScienceCount: number;
      gradeA: number; gradeAScience: number; gradeASocial: number;
      gradeB: number; gradeC: number; gradeD: number; gradeE: number;
    }>;

    const schoolMap = new Map<string, {
      name: string;
      branch?: string;
      schoolType: "public" | "private";
      sampleStudentId: number;
      sampleRaw: string;
      examCenters?: string;
      province: string;
      provinceId: string;
      candidateCount: number;
      femaleCount: number;
      scienceCount: number;
      socialCount: number;
      socialScienceCount: number;
      gradeA: number;
      gradeAScience: number;
      gradeASocial: number;
      gradeB: number;
      gradeC: number;
      gradeD: number;
      gradeE: number;
    }>();

    for (const row of rows) {
      const resolved = resolveSchoolBranch(String(row.name), row.examCenters || "", String(row.province || ""));
      if (!resolved.baseName) continue;
      const pId = provinceId(String(row.slug), year);
      const key = `${pId}:::${resolved.groupKey}`;

      const existing = schoolMap.get(key);
      if (!existing) {
        schoolMap.set(key, {
          name: resolved.baseName,
          branch: resolved.branch,
          schoolType: classifySchoolType(resolved.baseName, String(row.name || "")),
          sampleStudentId: Number(row.sampleStudentId),
          sampleRaw: String(row.name || ""),
          examCenters: String(row.examCenters || ""),
          province: String(row.province),
          provinceId: pId,
          candidateCount: Number(row.candidateCount || 0),
          femaleCount: Number(row.femaleCount || 0),
          scienceCount: Number(row.scienceCount || 0),
          socialCount: Number(row.socialScienceCount || 0),
          socialScienceCount: Number(row.socialScienceCount || 0),
          gradeA: Number(row.gradeA || 0),
          gradeAScience: Number(row.gradeAScience || 0),
          gradeASocial: Number(row.gradeASocial || 0),
          gradeB: Number(row.gradeB || 0),
          gradeC: Number(row.gradeC || 0),
          gradeD: Number(row.gradeD || 0),
          gradeE: Number(row.gradeE || 0),
        });
      } else {
        const candidateRaw = String(row.name || "");
        const existingRaw = existing.sampleRaw || "";
        const cTrun = candidateRaw.trim().endsWith("(") || candidateRaw.trim().endsWith("ែ");
        const eTrun = existingRaw.trim().endsWith("(") || existingRaw.trim().endsWith("ែ");
        if ((eTrun && !cTrun) || (!eTrun && !cTrun && candidateRaw.length > existingRaw.length)) {
          existing.sampleStudentId = Number(row.sampleStudentId);
          existing.sampleRaw = candidateRaw;
        }
        if (row.examCenters) {
          existing.examCenters = `${existing.examCenters || ""} ${row.examCenters}`.trim();
        }
        existing.candidateCount += Number(row.candidateCount || 0);
        existing.femaleCount += Number(row.femaleCount || 0);
        existing.scienceCount += Number(row.scienceCount || 0);
        existing.socialCount += Number(row.socialScienceCount || 0);
        existing.socialScienceCount += Number(row.socialScienceCount || 0);
        existing.gradeA += Number(row.gradeA || 0);
        existing.gradeAScience += Number(row.gradeAScience || 0);
        existing.gradeASocial += Number(row.gradeASocial || 0);
        existing.gradeB += Number(row.gradeB || 0);
        existing.gradeC += Number(row.gradeC || 0);
        existing.gradeD += Number(row.gradeD || 0);
        existing.gradeE += Number(row.gradeE || 0);
      }
    }

    allSchools = [...schoolMap.values()].map((s, index) => {
      const candidateCount = s.candidateCount;
      const gradeA = s.gradeA;
      const gradeAPercentage = candidateCount > 0 ? Number(((gradeA / candidateCount) * 100).toFixed(2)) : 0;
      const khan = s.provinceId === "phnompenh"
        ? detectPhnomPenhKhan(s.name, s.branch, s.sampleRaw, (s as any).examCenters)
        : undefined;

      return {
        name: s.name,
        branch: s.branch,
        schoolType: s.schoolType,
        khan: khan?.nameKm,
        khanId: khan?.id,
        sampleStudentId: s.sampleStudentId,
        province: s.province,
        provinceId: s.provinceId,
        candidateCount: s.candidateCount,
        femaleCount: s.femaleCount,
        scienceCount: s.scienceCount,
        socialCount: s.socialCount,
        socialScienceCount: s.socialScienceCount,
        gradeA: s.gradeA,
        gradeAScience: s.gradeAScience,
        gradeASocial: s.gradeASocial,
        gradeB: s.gradeB,
        gradeC: s.gradeC,
        gradeD: s.gradeD,
        gradeE: s.gradeE,
        grades: { A: s.gradeA, B: s.gradeB, C: s.gradeC, D: s.gradeD, E: s.gradeE },
        gradeAPercent: gradeAPercentage,
        gradeAPercentage,
        passRate: candidateCount > 0
          ? Number((((s.gradeA + s.gradeB + s.gradeC + s.gradeD + s.gradeE) / candidateCount) * 100).toFixed(1))
          : 0,
        rank: index + 1,
      };
    });
    schoolCaches.set(year, { modifiedAt, schools: allSchools });
  }

  let filtered = allSchools;
  if (options.province) {
    filtered = filtered.filter((s) => s.provinceId === options.province);
  }
  if (options.khan && options.khan !== "all") {
    filtered = filtered.filter((s) => s.khanId === options.khan);
  }
  if (options.schoolType && options.schoolType !== "all") {
    filtered = filtered.filter((s) => s.schoolType === options.schoolType);
  }
  if (options.search) {
    const q = options.search.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.branch && s.branch.toLowerCase().includes(q)) ||
        (s.khan && s.khan.toLowerCase().includes(q)) ||
        s.province.toLowerCase().includes(q)
    );
  }

  let processed = filtered;
  if (options.groupByBrand !== false) {
    processed = consolidateSchools(filtered);
  }

  const sort = options.sort || "candidates";
  if (sort === "gradeA") {
    processed = processed.slice().sort((a, b) => b.gradeA - a.gradeA || b.candidateCount - a.candidateCount);
  } else if (sort === "gradeAPercent") {
    processed = processed.slice().sort((a, b) => b.gradeAPercentage - a.gradeAPercentage || b.gradeA - a.gradeA);
  } else if (sort === "name") {
    processed = processed.slice().sort((a, b) => a.name.localeCompare(b.name, "km"));
  } else {
    processed = processed.slice().sort((a, b) => b.candidateCount - a.candidateCount || b.gradeA - a.gradeA);
  }

  const ranked = processed.map((s, idx) => ({ ...s, rank: idx + 1 }));
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;
  return limit ? ranked.slice(0, limit) : ranked;
}

export function getPhnomPenhDistrictStats(year: string): PhnomPenhDistrictStats[] {
  const ppSchools = getArchiveSchools(year, { province: "phnompenh", groupByBrand: false });

  return PHNOM_PENH_KHANS.map((khan) => {
    const schoolsInKhan = ppSchools.filter((s) => s.khanId === khan.id);
    const candidateCount = schoolsInKhan.reduce((acc, s) => acc + s.candidateCount, 0);
    const gradeA = schoolsInKhan.reduce((acc, s) => acc + s.gradeA, 0);
    const gradeAScience = schoolsInKhan.reduce((acc, s) => acc + (s.gradeAScience || 0), 0);
    const gradeASocial = schoolsInKhan.reduce((acc, s) => acc + (s.gradeASocial || 0), 0);
    const femaleCount = schoolsInKhan.reduce((acc, s) => acc + s.femaleCount, 0);
    const scienceCount = schoolsInKhan.reduce((acc, s) => acc + s.scienceCount, 0);
    const socialCount = schoolsInKhan.reduce((acc, s) => acc + s.socialCount, 0);
    const publicCount = schoolsInKhan.filter((s) => s.schoolType === "public").length;
    const privateCount = schoolsInKhan.filter((s) => s.schoolType === "private").length;
    const gradeAPercent = candidateCount > 0 ? Number(((gradeA / candidateCount) * 100).toFixed(2)) : 0;
    const femalePercent = candidateCount > 0 ? Number(((femaleCount / candidateCount) * 100).toFixed(1)) : 0;

    const topSchools = schoolsInKhan
      .slice()
      .sort((a, b) => b.gradeA - a.gradeA || b.candidateCount - a.candidateCount)
      .slice(0, 5)
      .map((s) => ({
        name: s.name,
        branch: s.branch,
        sampleStudentId: s.sampleStudentId,
        candidateCount: s.candidateCount,
        gradeA: s.gradeA,
        gradeAScience: s.gradeAScience,
        gradeASocial: s.gradeASocial,
        gradeAPercent: s.gradeAPercent,
        schoolType: s.schoolType,
      }));

    return {
      id: khan.id,
      nameKm: khan.nameKm,
      nameEn: khan.nameEn,
      schoolsCount: schoolsInKhan.length,
      candidateCount,
      gradeA,
      gradeAScience,
      gradeASocial,
      gradeAPercent,
      femaleCount,
      femalePercent,
      scienceCount,
      socialCount,
      publicCount,
      privateCount,
      topSchools,
    };
  });
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
  branch?: string;
  schoolType: "public" | "private";
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
  schoolType?: "all" | "public" | "private";
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
        GROUP_CONCAT(DISTINCT s.exam_center_raw) AS examCenters,
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
      name: string; sampleStudentId: number; province: string; slug: string; examCenters?: string; total: number;
      gradeA: number; gradeB: number; gradeC: number; gradeD: number; gradeE: number; gradeF: number;
    }>;

    const schoolMap = new Map<string, SubjectSchoolItem & { sampleRaw?: string }>();
    for (const r of schoolRows) {
      const resolved = resolveSchoolBranch(String(r.name), r.examCenters || "", String(r.province || ""));
      if (!resolved.baseName) continue;
      const provId = provinceId(String(r.slug), year);
      const groupKey = `${provId}:::${resolved.groupKey}`;

      const totalCandidates = Number(r.total || 0);
      const gradeA = Number(r.gradeA || 0);
      const gradeB = Number(r.gradeB || 0);
      const gradeC = Number(r.gradeC || 0);
      const gradeD = Number(r.gradeD || 0);
      const gradeE = Number(r.gradeE || 0);
      const gradeF = Number(r.gradeF || 0);

      const existing = schoolMap.get(groupKey);
      if (existing) {
        existing.totalCandidates += totalCandidates;
        existing.grades.A += gradeA;
        existing.grades.B += gradeB;
        existing.grades.C += gradeC;
        existing.grades.D += gradeD;
        existing.grades.E += gradeE;
        existing.grades.F += gradeF;
        existing.gradeA += gradeA;
        const candidateRaw = String(r.name || "");
        const existingRaw = existing.sampleRaw || "";
        const cTrun = candidateRaw.trim().endsWith("(") || candidateRaw.trim().endsWith("ែ");
        const eTrun = existingRaw.trim().endsWith("(") || existingRaw.trim().endsWith("ែ");
        if ((eTrun && !cTrun) || (!eTrun && !cTrun && candidateRaw.length > existingRaw.length)) {
          existing.sampleStudentId = Number(r.sampleStudentId);
          existing.sampleRaw = candidateRaw;
        }
      } else {
        schoolMap.set(groupKey, {
          name: resolved.baseName,
          branch: resolved.branch,
          schoolType: classifySchoolType(resolved.baseName, String(r.name || "")),
          sampleStudentId: Number(r.sampleStudentId),
          sampleRaw: String(r.name || ""),
          province: String(r.province),
          provinceId: provId,
          totalCandidates,
          grades: { A: gradeA, B: gradeB, C: gradeC, D: gradeD, E: gradeE, F: gradeF },
          gradeA,
          gradeAPercent: 0,
          passPercent: 0,
          rank: 0,
        });
      }
    }

    const schools: SubjectSchoolItem[] = Array.from(schoolMap.values()).map((s) => {
      const passing = s.grades.A + s.grades.B + s.grades.C + s.grades.D + s.grades.E;
      s.gradeAPercent = s.totalCandidates > 0 ? Number(((s.gradeA / s.totalCandidates) * 100).toFixed(2)) : 0;
      s.passPercent = s.totalCandidates > 0 ? Number(((passing / s.totalCandidates) * 100).toFixed(2)) : 0;
      return s;
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
  if (options.schoolType && options.schoolType !== "all") {
    filteredSchools = filteredSchools.filter((s) => s.schoolType === options.schoolType);
  }
  if (options.search) {
    const q = options.search.trim().toLowerCase();
    filteredSchools = filteredSchools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.branch && s.branch.toLowerCase().includes(q)) ||
        s.province.toLowerCase().includes(q)
    );
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

