import React, { useState, useEffect } from "react";
import {
  Search,
  Hash,
  LoaderCircle,
  ExternalLink,
  Share2,
  Check,
  Calendar,
} from "lucide-react";
import { StudentNameDisplay } from "./StudentNameDisplay";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const NAME_IMAGE_VERSION = "6";
const SCHOOL_IMAGE_VERSION = "2";
const numberFormat = new Intl.NumberFormat("en-US");

type Track = "science" | "social-science";

type Center = {
  name: string;
  label?: string;
  count: number;
};

type ProvinceSummary = {
  id: string;
  name: string;
  candidateCount: number;
};

type Student = {
  id: number;
  tableNumber: string;
  name?: string;
  school: string;
  examCenter: string;
  examCenterLabel?: string;
  grade: string;
  result: string;
  pageNumber: number;
  documentId: number;
  province: string;
  provinceId: string;
  track: string;
  subjectHeaders: string[];
  subjects: string[];
};

const provinceEnglish: Record<string, string> = {
  phnompenh: "Phnom Penh",
  kandal: "Kandal",
  pailin: "Pailin",
  stungtreng: "Stung Treng",
  kohkong: "Koh Kong",
  kampongspeu: "Kampong Speu",
  kampongchhnang: "Kampong Chhnang",
  pursat: "Pursat",
  battambang: "Battambang",
  banteaymeanchey: "Banteay Meanchey",
  siemreap: "Siem Reap",
  kampongthom: "Kampong Thom",
  preahvihear: "Preah Vihear",
  oddarmeanchey: "Oddar Meanchey",
  kratie: "Kratie",
  tboungkhmum: "Tboung Khmum",
  kampongcham: "Kampong Cham",
  preyveng: "Prey Veng",
  svayrieng: "Svay Rieng",
  takeo: "Takeo",
  kampot: "Kampot",
  kep: "Kep",
  preahsihanouk: "Preah Sihanouk",
  ratanakiri: "Ratanakiri",
  mondulkiri: "Mondulkiri",
};

const subjectLabels = {
  en: {
    science: ["Khmer", "Mathematics", "Biology", "History", "Chemistry", "Physics", "Foreign language"],
    social: ["Khmer", "Mathematics", "Earth science", "Geography", "History", "Civics & morality", "Foreign language"],
  },
  km: {
    science: ["ភាសាខ្មែរ", "គណិតវិទ្យា", "ជីវវិទ្យា", "ប្រវត្តិវិទ្យា", "គីមីវិទ្យា", "រូបវិទ្យា", "ភាសាបរទេស"],
    social: ["ភាសាខ្មែរ", "គណិតវិទ្យា", "ផែនដីវិទ្យា", "ភូមិវិទ្យា", "ប្រវត្តិវិទ្យា", "សីលធម៌-ពលរដ្ឋ", "ភាសាបរទេស"],
  },
} as const;

function OfficialSchool({ year, student, fallback }: { year: string; student: Student; fallback: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) return <>{fallback || "—"}</>;

  return (
    <span className="official-school">
      <img
        src={apiUrl(`/api/archive/${year}/students/${student.id}/school-image?v=${SCHOOL_IMAGE_VERSION}`)}
        alt={fallback || "School name as printed in the official PDF"}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    </span>
  );
}

export type ArchiveSearchPanelProps = {
  language: "en" | "km";
  initialYear?: string;
  initialTableNumber?: string;
  initialProvince?: string;
  initialCenter?: string;
  initialTrack?: "" | Track;
  showHeader?: boolean;
  onYearChange?: (year: string) => void;
};

export function ArchiveSearchPanel({
  language,
  initialYear,
  initialTableNumber = "",
  initialProvince = "",
  initialCenter = "",
  initialTrack = "",
  showHeader = true,
  onYearChange,
}: ArchiveSearchPanelProps) {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(initialYear || "2026");
  const [province, setProvince] = useState(initialProvince);
  const [center, setCenter] = useState(initialCenter);
  const [track, setTrack] = useState<"" | Track>(initialTrack);
  const [tableNumber, setTableNumber] = useState(initialTableNumber);
  const [provinces, setProvinces] = useState<ProvinceSummary[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Student[] | null>(null);
  const [error, setError] = useState("");
  const [shareFeedback, setShareFeedback] = useState<{ studentId: number; copied: boolean } | null>(null);

  const isKm = language === "km";

  // Load available years
  useEffect(() => {
    fetch(apiUrl("/api/archive/years"))
      .then((res) => res.json())
      .then((data: { years: string[] }) => {
        if (data.years && data.years.length > 0) {
          setAvailableYears(data.years);
          if (!initialYear) {
            setSelectedYear(data.years[0]);
          }
        }
      })
      .catch(() => {
        setAvailableYears(["2026", "2025", "2024"]);
      });
  }, [initialYear]);

  // Sync initial year prop if provided
  useEffect(() => {
    if (initialYear && initialYear !== selectedYear) {
      setSelectedYear(initialYear);
    }
  }, [initialYear]);

  // Load provinces for current year
  useEffect(() => {
    if (!selectedYear) return;
    fetch(apiUrl(`/api/archive/${selectedYear}/summary`))
      .then((res) => res.json())
      .then((data) => {
        if (data && data.provinces) {
          setProvinces(data.provinces);
        }
      })
      .catch(() => setProvinces([]));
  }, [selectedYear]);

  // Load centers for current year & province
  useEffect(() => {
    if (!selectedYear) return;
    const query = province ? `?province=${encodeURIComponent(province)}` : "";
    fetch(apiUrl(`/api/archive/${selectedYear}/centers${query}`))
      .then((res) => res.json())
      .then((data: { centers: Center[] }) => setCenters(data.centers || []))
      .catch(() => setCenters([]));
  }, [selectedYear, province]);

  const provinceLabel = (item: ProvinceSummary) => {
    return isKm ? item.name : provinceEnglish[item.id] || item.name;
  };

  const centerLabel = (item: Center) => {
    return item.label || item.name;
  };

  const subjectLabel = (student: Student, index: number) => {
    const labels = student.track === "science" ? subjectLabels[language].science : subjectLabels[language].social;
    return labels[index] || student.subjectHeaders[index] || (isKm ? `មុខវិជ្ជា ${index + 1}` : `Subject ${index + 1}`);
  };

  const studentPdfUrl = (student: Student) => {
    return apiUrl(`/api/archive/${selectedYear}/documents/${student.documentId}/view?page=${student.pageNumber}`);
  };

  const shareStudent = async (student: Student) => {
    const url = `${window.location.origin}${window.location.pathname}#archive?year=${selectedYear}&tableNumber=${student.tableNumber}`;
    const title = `${selectedYear} BacII · #${student.tableNumber}`;
    const text = `${provinceEnglish[student.provinceId] || student.province} · Grade ${student.grade}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        setShareFeedback({ studentId: student.id, copied: false });
      } else {
        await navigator.clipboard.writeText(url);
        setShareFeedback({ studentId: student.id, copied: true });
      }
      window.setTimeout(() => setShareFeedback((curr) => curr?.studentId === student.id ? null : curr), 2200);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareFeedback({ studentId: student.id, copied: true });
        window.setTimeout(() => setShareFeedback((curr) => curr?.studentId === student.id ? null : curr), 2200);
      } catch {
        // clipboard unavailable
      }
    }
  };

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tableNumber.trim() || !selectedYear) return;
    setSearching(true);
    setError("");
    const params = new URLSearchParams({ tableNumber: tableNumber.trim() });
    if (province) params.set("province", province);
    if (center) params.set("center", center);
    if (track) params.set("track", track);

    try {
      const response = await fetch(apiUrl(`/api/archive/${selectedYear}/search?${params}`));
      if (!response.ok) throw new Error(isKm ? "ការស្វែងរកមិនបានសម្រេច" : "Search failed");
      const data: { results: Student[] } = await response.json();
      setResults(data.results || []);
    } catch {
      setError(isKm ? "មានបញ្ហាក្នុងការទាញយកទិន្នន័យពីម៉ាស៊ីនមេ" : "Could not fetch search results from server.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="archive-search-embedded-panel">
      {showHeader && (
        <div className="archive-section-head">
          <div>
            <span className="section-kicker">
              {isKm ? "បណ្ណសារលទ្ធផលផ្លូវការ" : "Official Results Archive"}
            </span>
            <h2>{isKm ? "ស្វែងរកលទ្ធផលសិស្សផ្លូវការ" : "Find a Student Result"}</h2>
            <p>
              {isKm
                ? "ជ្រើសរើសឆ្នាំ រាជធានី-ខេត្ត មណ្ឌលប្រឡង និងបញ្ចូលលេខតុ ដើម្បីស្វែងរកទិន្នន័យផ្លូវការរបស់ក្រសួងអប់រំ។"
                : "Select year, province, exam center, and enter table number to search official MOEYS published results."}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={submitSearch} className="archive-search-form">
        {availableYears.length > 1 && (
          <label className="archive-year-field">
            <span>
              <Calendar size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
              {isKm ? "ឆ្នាំលទ្ធផល" : "Archive Year"}
            </span>
            <select
              value={selectedYear}
              onChange={(e) => {
                const newYear = e.target.value;
                setSelectedYear(newYear);
                setResults(null);
                onYearChange?.(newYear);
              }}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {isKm ? `ឆ្នាំ ${y}` : `Year ${y}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span>{isKm ? "រាជធានី / ខេត្ត" : "Province / Capital"}</span>
          <select
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              setCenter("");
              setResults(null);
            }}
          >
            <option value="">{isKm ? "រាជធានី ខេត្តទាំងអស់" : "All provinces"}</option>
            {provinces
              .slice()
              .sort((a, b) => provinceLabel(a).localeCompare(provinceLabel(b)))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {provinceLabel(item)}
                </option>
              ))}
          </select>
        </label>

        <label>
          <span>{isKm ? "មណ្ឌលប្រឡង" : "Exam Center"}</span>
          <select
            value={center}
            onChange={(e) => {
              setCenter(e.target.value);
              setResults(null);
            }}
          >
            <option value="">{isKm ? "មណ្ឌលប្រឡងទាំងអស់" : "All exam centers"}</option>
            {centers.map((item) => (
              <option key={item.name} value={item.name}>
                {centerLabel(item)} ({numberFormat.format(item.count)})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{isKm ? "ថ្នាក់" : "Track"}</span>
          <select
            value={track}
            onChange={(e) => {
              setTrack(e.target.value as "" | Track);
              setResults(null);
            }}
          >
            <option value="">{isKm ? "ថ្នាក់ទាំងអស់" : "All tracks"}</option>
            <option value="science">{isKm ? "វិទ្យាសាស្ត្រ" : "Science"}</option>
            <option value="social-science">{isKm ? "វិទ្យាសាស្ត្រសង្គម" : "Social science"}</option>
          </select>
        </label>

        <label className="archive-table-field">
          <span>{isKm ? "លេខតុ" : "Table Number"}</span>
          <div>
            <Hash size={18} />
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={tableNumber}
              onChange={(e) => {
                setTableNumber(e.target.value.replace(/\D/g, ""));
                setResults(null);
              }}
              placeholder={isKm ? "ឧ. 41" : "e.g. 41"}
            />
          </div>
        </label>

        <button className="archive-search-button" disabled={!tableNumber || searching} type="submit">
          {searching ? <LoaderCircle className="spin" /> : <Search />}
          {searching ? (isKm ? "កំពុងស្វែងរក…" : "Searching…") : isKm ? "ស្វែងរក" : "Search"}
        </button>
      </form>

      <div className="archive-results" aria-live="polite">
        {error && <div className="error-banner">{error}</div>}

        {results === null ? (
          <div className="archive-empty">
            <Hash />
            <p>{isKm ? "បញ្ចូលលេខតុដើម្បីស្វែងរកក្នុងបណ្ណសារផ្លូវការ។" : "Enter a table number to search the archive."}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="archive-empty">
            <Search />
            <h3>{isKm ? "រកមិនឃើញសិស្សតាមលក្ខខណ្ឌនេះទេ" : "No student was found with these filters"}</h3>
            <p>
              {isKm
                ? "សូមពិនិត្យលេខតុ ឬសាកល្បងដកលក្ខខណ្ឌរាជធានី ខេត្ត មណ្ឌល និងថ្នាក់។"
                : "Check the table number, or broaden the province, exam center, and track filters."}
            </p>
          </div>
        ) : (
          <>
            <div className="result-count">
              <strong>{results.length}</strong> {isKm ? "លទ្ធផលត្រូវបានរកឃើញ" : "result(s) found"}
            </div>
            <div className="student-grid">
              {results.map((student) => (
                <article className="student-card" key={student.id}>
                  <div className="student-card-head">
                    <div>
                      <span>#{student.tableNumber}</span>
                      <div className="official-name">
                        <small>{isKm ? "ឈ្មោះដូចបានបោះពុម្ពក្នុង PDF ផ្លូវការ" : "Name as printed in official PDF"}</small>
                        <StudentNameDisplay
                          cropUrl={`/api/archive/${selectedYear}/students/${student.id}/name-image?v=${NAME_IMAGE_VERSION}`}
                          tableNumber={student.tableNumber}
                          language={language}
                          height={44}
                        />
                      </div>
                    </div>
                    <div className="student-overall-grade">
                      <small>{isKm ? "និទ្ទេស" : "Grade"}</small>
                      <strong className={`grade-${student.grade.toLowerCase()}`}>{student.grade}</strong>
                    </div>
                  </div>

                  <div className="student-card-content">
                    <dl>
                      <div>
                        <dt>{isKm ? "រាជធានី / ខេត្ត" : "Province"}</dt>
                        <dd>{isKm ? student.province : provinceEnglish[student.provinceId] || student.province}</dd>
                      </div>
                      <div>
                        <dt>{isKm ? "មណ្ឌលប្រឡង" : "Exam Center"}</dt>
                        <dd>{student.examCenterLabel || student.examCenter}</dd>
                      </div>
                      <div>
                        <dt>{isKm ? "ថ្នាក់" : "Track"}</dt>
                        <dd>
                          {student.track === "science"
                            ? isKm ? "វិទ្យាសាស្ត្រ" : "Science"
                            : student.track === "social-science"
                            ? isKm ? "វិទ្យាសាស្ត្រសង្គម" : "Social science"
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>{isKm ? "អាគតដ្ឋាន" : "High School"}</dt>
                        <dd>
                          <OfficialSchool year={selectedYear} student={student} fallback={student.school} />
                        </dd>
                      </div>
                    </dl>
                    <div className="student-subjects">
                      <h4>{isKm ? "និទ្ទេសតាមមុខវិជ្ជា" : "Subject Grades"}</h4>
                      <div>
                        {student.subjects.map(
                          (subjectGrade, index) =>
                            subjectGrade && (
                              <div key={`${student.id}-${index}`}>
                                <span>{subjectLabel(student, index)}</span>
                                <strong className={`grade-${subjectGrade.toLowerCase()}`}>{subjectGrade}</strong>
                              </div>
                            )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="student-card-actions">
                    <a target="_blank" rel="noreferrer" href={studentPdfUrl(student)}>
                      <ExternalLink size={15} />
                      {isKm ? `មើលលទ្ធផលផ្លូវការ (ទំព័រ ${student.pageNumber})` : `Official PDF (Page ${student.pageNumber})`}
                    </a>
                    <button type="button" onClick={() => void shareStudent(student)}>
                      {shareFeedback?.studentId === student.id ? <Check size={15} /> : <Share2 size={15} />}
                      {shareFeedback?.studentId === student.id
                        ? shareFeedback.copied
                          ? isKm ? "បានចម្លងតំណភ្ជាប់" : "Link copied"
                          : isKm ? "បានចែករំលែក" : "Shared"
                        : isKm ? "ចែករំលែកលទ្ធផល" : "Share result"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <p className="archive-name-note">
              {isKm
                ? "ឈ្មោះនិស្សិតត្រូវបានការពារឯកជនភាពដោយបិទបាំងពាក់កណ្តាលដើម (ត្រកូល)។ អ្នកអាចចុចប៊ូតុងបង្ហាញ ដើម្បីផ្ទៀងផ្ទាត់ឈ្មោះពេញ។"
                : "Student privacy is protected by masking the first half (family name). You can click reveal to verify the full name."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default ArchiveSearchPanel;
