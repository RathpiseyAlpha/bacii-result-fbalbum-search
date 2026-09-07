import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { database } from "./database.ts";
import {
  archiveDatabase,
  archiveDirectory,
  archivePdfFileName,
  centerLabels,
  getArchiveNameLocator,
  getArchiveSchools,
  listArchiveYears,
  resolveSchoolBranch,
} from "./archive.ts";

database.exec(`
  CREATE TABLE IF NOT EXISTS student_name_ocr (
    year TEXT NOT NULL,
    student_id INTEGER NOT NULL,
    table_number TEXT NOT NULL,
    province TEXT NOT NULL,
    ocr_name TEXT NOT NULL,
    raw_name TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (year, student_id)
  );
  CREATE INDEX IF NOT EXISTS idx_student_name_ocr_search ON student_name_ocr(year, ocr_name);
  CREATE INDEX IF NOT EXISTS idx_student_name_ocr_table ON student_name_ocr(year, table_number);
`);

function pythonExecutable(): string {
  if (process.env.OCR_PYTHON) return process.env.OCR_PYTHON;
  const local = process.platform === "win32"
    ? resolve(".venv", "Scripts", "python.exe")
    : resolve(".venv", "bin", "python");
  return existsSync(local) ? local : "python";
}

/**
 * Generates SQL LIKE search patterns from a Khmer query by handling
 * legacy font subscript glyphs and pre-consonant vowel shifts (េ, ែ, ៃ).
 */
export function buildKhmerSearchVariants(query: string): string[] {
  const q = query.trim();
  if (!q) return [];

  const variants = new Set<string>();
  variants.add(q);

  // Vowel reordering variants for េ (U+17C1), ែ (U+17C2), ៃ (U+17C3)
  // Standard Unicode: Consonant + Vowel (e.g. ម + ៉ + េ + ង)
  // Legacy font: Vowel + Consonant (e.g. េ + ម + ៉ + ង)
  const vowelSwapped = q.replace(/([\u1780-\u17A2][\u17C9\u17CA]?)([\u17C1\u17C2\u17C3])/g, "$2$1");
  if (vowelSwapped !== q) variants.add(vowelSwapped);

  // Subscript / ligature replacements
  let transformed = vowelSwapped;
  const glyphMap: Array<[RegExp, string]> = [
    [/្ឍ/g, "ƌ"],
    [/្ត/g, "Ǝ"],
    [/្ឌ/g, "ƍ"],
    [/្ធ/g, "Ƒ"],
    [/្ច/g, "ƃ"],
    [/ត្រ/g, "ƙ"],
    [/ស្រ/g, "ȯស"],
    [/សារ៉ា/g, "ǒǍ៉"],
    [/សារា/g, "ǒǍ"],
    [/សារ/g, "ǒǍ"],
    [/សា/g, "ǒ"],
    [/នា/g, "ǆ"],
    [/ធា/g, "ǅ"],
    [/តា/g, "ǂ"],
    [/បញ្ញា/g, "បȦƈ"],
    [/ញ្ញា/g, "Ȧƈ"],
    [/ញ្ញ/g, "Ȧ"],
    [/រ៉ា/g, "Ǎ៉"],
    [/រ/g, "Ǎ"],
  ];

  for (const [regex, replacement] of glyphMap) {
    if (regex.test(transformed)) {
      transformed = transformed.replace(regex, replacement);
      variants.add(transformed);
    }
  }

  // Also strip coeng signs to catch base consonant matches
  const baseOnly = q.replace(/\u17D2[\u1780-\u17A2]/g, "");
  if (baseOnly.length >= 2 && baseOnly !== q) {
    variants.add(baseOnly);
  }

  return [...variants];
}

export type AdminStudentSearchResult = {
  id: number;
  tableNumber: string;
  ocrName: string;
  rawName: string;
  isVerified: boolean;
  gender: string;
  province: string;
  examCenter: string;
  examCenterLabel: string;
  school: string;
  schoolClean: string;
  schoolRaw: string;
  grade: string;
  result: string;
  pageNumber: number;
  documentId: number;
  subjects: Array<{ name: string; score: string }>;
  nameImageUrl: string;
};

export type AdminSchoolSearchResult = {
  name: string;
  branch?: string;
  schoolType: "public" | "private";
  sampleStudentId: number;
  province: string;
  provinceId: string;
  candidateCount: number;
  femaleCount: number;
  scienceCount: number;
  socialScienceCount: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeE: number;
  grades: { A: number; B: number; C: number; D: number; E: number };
  gradeAPercent: number;
  passRate: number;
  rank: number;
  schoolImageUrl: string;
};

type RawStudentRow = {
  id: number;
  document_id: number;
  page_id: number;
  page_number: number;
  province: string;
  exam_center_raw: string | null;
  table_number: number;
  name_raw: string;
  gender_raw: string;
  school_raw: string;
  grade_raw: string;
  result_raw: string;
  subject_headers_json: string;
  subject_1: string | null;
  subject_2: string | null;
  subject_3: string | null;
  subject_4: string | null;
  subject_5: string | null;
  subject_6: string | null;
  subject_7: string | null;
  local_path: string;
};

/**
 * Runs batch OCR on candidate items using scripts/ocr_student_name.py
 */
async function runBatchOcr(
  year: string,
  items: Array<{ id: number; tableNumber: string; page: number; pdf: string; rawName: string; province: string }>,
): Promise<Map<number, string>> {
  if (items.length === 0) return new Map();

  const manifestPath = join(tmpdir(), `bacii-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const manifestData = items.map((item) => ({
    id: item.id,
    tableNumber: item.tableNumber,
    page: item.page,
    pdf: item.pdf,
  }));

  const resultMap = new Map<number, string>();

  try {
    await writeFile(manifestPath, JSON.stringify(manifestData), "utf-8");

    const stdout = await new Promise<string>((resolvePromise, reject) => {
      const child = spawn(
        pythonExecutable(),
        [resolve("scripts", "ocr_student_name.py"), "--manifest", manifestPath, "--scale", "3.0", "--beam-width", "2"],
        { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );

      let out = "";
      let err = "";
      child.stdout.setEncoding("utf-8");
      child.stdout.on("data", (c: string) => { out += c; });
      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (c: string) => { err += c; });

      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) resolvePromise(out);
        else reject(new Error(err.trim() || `OCR batch process exited with code ${code}`));
      });
    });

    // Parse JSON result: { results: [{ id, tableNumber, ocrName, status }] }
    const jsonMatch = stdout.match(/\{"results":[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { results: Array<{ id: number; ocrName: string; status: string }> };
      const now = Date.now();
      const insertStmt = database.prepare(`
        INSERT INTO student_name_ocr (year, student_id, table_number, province, ocr_name, raw_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(year, student_id) DO UPDATE SET ocr_name = excluded.ocr_name, updated_at = excluded.updated_at
      `);

      const itemMap = new Map(items.map((i) => [i.id, i]));

      for (const res of parsed.results) {
        if (res.ocrName && res.status === "ok") {
          resultMap.set(res.id, res.ocrName);
          const orig = itemMap.get(res.id);
          if (orig) {
            try {
              insertStmt.run(year, orig.id, orig.tableNumber, orig.province, res.ocrName, orig.rawName, now);
            } catch {
              // Ignore insert error
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Batch OCR error:", err);
  } finally {
    try { await unlink(manifestPath); } catch {}
  }

  return resultMap;
}

const schoolFilterCache = new Map<string, Array<{ school_raw: string; exam_center_raw: string | null; province: string }>>();

function getDistinctSchoolRows(db: any, year: string) {
  let cached = schoolFilterCache.get(year);
  if (!cached) {
    cached = db.prepare(`
      SELECT DISTINCT school_raw, exam_center_raw, province
      FROM students
      WHERE TRIM(COALESCE(school_raw, '')) != ''
    `).all() as Array<{ school_raw: string; exam_center_raw: string | null; province: string }>;
    schoolFilterCache.set(year, cached);
  }
  return cached;
}

export function getSchoolRawValuesForFilter(db: any, year: string, filter: string): string[] {
  const clean = filter.trim().toLowerCase();
  if (!clean) return [];

  const rows = getDistinctSchoolRows(db, year);
  const matched = new Set<string>();

  for (const r of rows) {
    const resolved = resolveSchoolBranch(r.school_raw || "", r.exam_center_raw || "", r.province || "");
    const baseMatch = resolved.baseName.toLowerCase().includes(clean);
    const branchMatch = resolved.branch ? resolved.branch.toLowerCase().includes(clean) : false;
    const fullMatch = `${resolved.baseName} ${resolved.branch || ""}`.toLowerCase().includes(clean);
    if (baseMatch || branchMatch || fullMatch) {
      matched.add(r.school_raw);
    }
  }

  // Fallback to legacy font variants if no direct match found
  if (matched.size === 0) {
    const variants = buildKhmerSearchVariants(filter);
    for (const r of rows) {
      for (const v of variants) {
        if (r.school_raw && r.school_raw.includes(v)) {
          matched.add(r.school_raw);
          break;
        }
      }
    }
  }

  return [...matched];
}

/**
 * Searches high schools in an annual BacII archive with aggregated metrics.
 */
export function searchSchoolsAdmin(params: {
  year: string;
  query?: string;
  province?: string;
  schoolType?: string;
  limit?: number;
}): AdminSchoolSearchResult[] {
  const year = params.year || "2026";
  const schools = getArchiveSchools(year, {
    province: params.province && params.province !== "all" ? params.province : undefined,
    schoolType: params.schoolType && params.schoolType !== "all" ? (params.schoolType as "public" | "private") : undefined,
    search: params.query?.trim() || undefined,
    groupByBrand: false,
  });

  const limit = Math.max(1, Math.min(params.limit || 30, 100));
  return schools.slice(0, limit).map((s) => ({
    name: s.name,
    branch: s.branch,
    schoolType: s.schoolType,
    sampleStudentId: s.sampleStudentId,
    province: s.province,
    provinceId: s.provinceId,
    candidateCount: s.candidateCount,
    femaleCount: s.femaleCount,
    scienceCount: s.scienceCount,
    socialScienceCount: s.socialScienceCount,
    gradeA: s.gradeA,
    gradeB: s.gradeB,
    gradeC: s.gradeC,
    gradeD: s.gradeD,
    gradeE: s.gradeE,
    grades: s.grades,
    gradeAPercent: s.gradeAPercentage,
    passRate: s.passRate,
    rank: s.rank,
    schoolImageUrl: `/api/archive/${year}/students/${s.sampleStudentId}/school-image`,
  }));
}

/**
 * Searches students in an annual BacII archive by Khmer name, table number, or school name,
 * forming accurate Unicode Khmer names with the deep learning OCR model.
 */
export async function searchStudentsAdmin(params: {
  year: string;
  query?: string;
  school?: string;
  province?: string;
  grade?: string;
  limit?: number;
}): Promise<AdminStudentSearchResult[]> {
  const year = params.year || "2026";
  const query = (params.query || "").trim();
  const schoolFilter = (params.school || "").trim();
  const limit = Math.max(1, Math.min(params.limit || 25, 50));

  if (!query && !schoolFilter) {
    return [];
  }

  const years = listArchiveYears();
  if (!years.includes(year)) {
    throw new Error(`Archive year ${year} is not available.`);
  }

  const db = archiveDatabase(year);
  const labels = centerLabels(year);
  const directory = archiveDirectory(year) || "";

  // 1. Check if query matches table number directly
  const isTableNumber = /^\d{1,6}$/.test(query);

  // 2. Fetch any already-cached OCR records matching the query
  const cachedOcrMatches = new Map<number, string>();
  if (query && !isTableNumber && query.length >= 2) {
    try {
      const ocrRows = database.prepare(`
        SELECT student_id, ocr_name FROM student_name_ocr
        WHERE year = ? AND ocr_name LIKE ?
        LIMIT ?
      `).all(year, `%${query}%`, limit * 2) as Array<{ student_id: number; ocr_name: string }>;
      for (const r of ocrRows) {
        cachedOcrMatches.set(r.student_id, r.ocr_name);
      }
    } catch {
      // Table might not exist yet or empty
    }
  }

  // 3. Build query for students table
  const whereClauses: string[] = [];
  const queryArgs: Array<string | number> = [];

  if (query) {
    if (isTableNumber) {
      whereClauses.push("s.table_number = ?");
      queryArgs.push(Number(query));
    } else {
      // Generate font variants
      const variants = buildKhmerSearchVariants(query);
      const orClauses: string[] = [];

      // Also include any cached student IDs
      if (cachedOcrMatches.size > 0) {
        const ids = [...cachedOcrMatches.keys()].slice(0, 50);
        orClauses.push(`s.id IN (${ids.map(() => "?").join(",")})`);
        queryArgs.push(...ids);
      }

      for (const v of variants.slice(0, 6)) {
        orClauses.push("s.name_raw LIKE ?");
        queryArgs.push(`%${v}%`);
      }

      whereClauses.push(`(${orClauses.join(" OR ")})`);
    }
  }

  if (schoolFilter) {
    const matchedRaws = getSchoolRawValuesForFilter(db, year, schoolFilter);
    if (matchedRaws.length > 0) {
      whereClauses.push(`s.school_raw IN (${matchedRaws.map(() => "?").join(",")})`);
      queryArgs.push(...matchedRaws);
    } else {
      whereClauses.push("s.school_raw LIKE ?");
      queryArgs.push(`%${schoolFilter}%`);
    }
  }

  if (params.province) {
    whereClauses.push("s.province = ?");
    queryArgs.push(params.province);
  }

  if (params.grade && ["A", "B", "C", "D", "E"].includes(params.grade.toUpperCase())) {
    whereClauses.push("s.grade_raw = ?");
    queryArgs.push(params.grade.toUpperCase());
  }

  const sql = `
    SELECT
      s.id, s.document_id, s.page_id, s.page_number, s.province,
      s.exam_center_raw, s.table_number, s.name_raw, s.gender_raw,
      s.school_raw, s.grade_raw, s.result_raw, s.subject_headers_json,
      s.subject_1, s.subject_2, s.subject_3, s.subject_4, s.subject_5,
      s.subject_6, s.subject_7, d.local_path
    FROM students s
    JOIN documents d ON d.id = s.document_id
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY s.id ASC
    LIMIT ?
  `;
  queryArgs.push(limit);

  const rawRows = db.prepare(sql).all(...queryArgs) as RawStudentRow[];

  // 4. Identify rows that need OCR
  const needsOcr: Array<{
    id: number;
    tableNumber: string;
    page: number;
    pdf: string;
    rawName: string;
    province: string;
  }> = [];

  for (const row of rawRows) {
    if (!cachedOcrMatches.has(row.id)) {
      // Check if in database table
      const cached = database.prepare(
        "SELECT ocr_name FROM student_name_ocr WHERE year = ? AND student_id = ?",
      ).get(year, row.id) as { ocr_name: string } | undefined;

      if (cached?.ocr_name) {
        cachedOcrMatches.set(row.id, cached.ocr_name);
      } else {
        const pdfFileName = archivePdfFileName(row.local_path);
        const fullPdfPath = resolve(directory, "pdfs", pdfFileName);
        if (existsSync(fullPdfPath)) {
          needsOcr.push({
            id: row.id,
            tableNumber: String(row.table_number),
            page: row.page_number,
            pdf: fullPdfPath,
            rawName: row.name_raw,
            province: row.province,
          });
        }
      }
    }
  }

  // 5. Run batch OCR for uncached candidates (capped to 15 to keep response fast)
  if (needsOcr.length > 0) {
    const ocrBatchResults = await runBatchOcr(year, needsOcr.slice(0, 15));
    for (const [id, ocrName] of ocrBatchResults) {
      cachedOcrMatches.set(id, ocrName);
    }
  }

  // 6. Assemble final student objects
  return rawRows.map((row) => {
    const ocrName = cachedOcrMatches.get(row.id) || row.name_raw;
    const isVerified = cachedOcrMatches.has(row.id);
    const centerRaw = row.exam_center_raw || "";
    const examCenterLabel = labels.get(centerRaw) || centerRaw;

    let headers: string[] = [];
    try {
      headers = JSON.parse(row.subject_headers_json || "[]");
    } catch {
      headers = ["មុខវិជ្ជាទី១", "មុខវិជ្ជាទី២", "មុខវិជ្ជាទី៣", "មុខវិជ្ជាទី៤", "មុខវិជ្ជាទី៥", "មុខវិជ្ជាទី៦", "មុខវិជ្ជាទី៧"];
    }

    const cleanSubjectName = (raw: string): string => {
      if (!raw) return "មុខវិជ្ជា";
      if (raw.includes("ែខ") || raw.includes("ខ្មែរ")) return "ភាសាខ្មែរ";
      if (raw.includes("គណិត")) return "គណិតវិទ្យា";
      if (raw.includes("រូប")) return "រូបវិទ្យា";
      if (raw.includes("គីមី")) return "គីមីវិទ្យា";
      if (raw.includes("ជីវ")) return "ជីវវិទ្យា";
      if (raw.includes("ែផន") || raw.includes("ផែនដី")) return "ផែនដីវិទ្យា";
      if (raw.includes("ភូមិ")) return "ភូមិវិទ្យា";
      if (raw.includes("ƙបវ") || raw.includes("ប្រវត្តិ")) return "ប្រវត្តិវិទ្យា";
      if (raw.includes("សីល")) return "សីលធម៌-ពលរដ្ឋ";
      if (raw.includes("Ǌ") || raw.includes("បរទេស") || raw.includes("អង់គ្លេស")) return "ភាសាបរទេស";
      return raw;
    };

    const rawSubjects = [
      row.subject_1, row.subject_2, row.subject_3,
      row.subject_4, row.subject_5, row.subject_6, row.subject_7,
    ];

    const subjects = rawSubjects
      .map((score, idx) => ({ name: cleanSubjectName(headers[idx] || `មុខវិជ្ជា ${idx + 1}`), score: score || "-" }))
      .filter((s) => s.score !== "-");

    const resolvedSchool = resolveSchoolBranch(row.school_raw || "", centerRaw, row.province);
    const cleanSchoolName = resolvedSchool.baseName
      ? (resolvedSchool.branch ? `${resolvedSchool.baseName} (${resolvedSchool.branch})` : resolvedSchool.baseName)
      : (row.school_raw || "");

    return {
      id: row.id,
      tableNumber: String(row.table_number),
      ocrName,
      rawName: row.name_raw,
      isVerified,
      gender: row.gender_raw === "ស" ? "ស្រី (Female)" : "ប្រុស (Male)",
      province: row.province,
      examCenter: centerRaw,
      examCenterLabel,
      school: cleanSchoolName || "វិទ្យាល័យចំណេះទូទៅ",
      schoolClean: cleanSchoolName || "",
      schoolRaw: row.school_raw || "",
      grade: row.grade_raw || "-",
      result: row.result_raw || "ជាប់",
      pageNumber: row.page_number,
      documentId: row.document_id,
      subjects,
      nameImageUrl: `/api/archive/${year}/students/${row.id}/name-image`,
    };
  });
}

/**
 * Runs deep learning OCR specifically on a single student's name crop on demand.
 */
export async function ocrSingleStudentName(year: string, studentId: number): Promise<{ ocrName: string; studentId: number }> {
  const locator = getArchiveNameLocator(year, studentId);
  if (!locator) {
    throw new Error("Student PDF location not found.");
  }

  const stdout = await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(
      pythonExecutable(),
      [
        resolve("scripts", "ocr_student_name.py"),
        "--pdf", locator.pdf,
        "--page", String(locator.pageNumber),
        "--table-number", locator.tableNumber,
        "--scale", "3.0",
        "--beam-width", "3", // Higher beam width for single-student verification
      ],
      { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    let out = "";
    let err = "";
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (c: string) => { out += c; });
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (c: string) => { err += c; });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise(out);
      else reject(new Error(err.trim() || `OCR process failed with code ${code}`));
    });
  });

  const match = stdout.match(/\{"tableNumber":[\s\S]*\}/);
  if (!match) {
    throw new Error("Invalid OCR response from python worker.");
  }

  const parsed = JSON.parse(match[0]) as { ocrName: string };
  const ocrName = parsed.ocrName.trim();

  // Save to database
  if (ocrName) {
    try {
      const db = archiveDatabase(year);
      const row = db.prepare("SELECT name_raw, province FROM students WHERE id = ?").get(studentId) as { name_raw: string; province: string } | undefined;
      database.prepare(`
        INSERT INTO student_name_ocr (year, student_id, table_number, province, ocr_name, raw_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(year, student_id) DO UPDATE SET ocr_name = excluded.ocr_name, updated_at = excluded.updated_at
      `).run(year, studentId, locator.tableNumber, row?.province || "", ocrName, row?.name_raw || "", Date.now());
    } catch (e) {
      console.error("Error saving OCR result:", e);
    }
  }

  return { ocrName, studentId };
}
