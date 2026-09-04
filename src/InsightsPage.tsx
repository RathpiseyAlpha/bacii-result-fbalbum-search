import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Atom,
  Award,
  BarChart3,
  BookOpen,
  Calculator,
  Compass,
  Dna,
  FlaskConical,
  Globe,
  GraduationCap,
  History,
  Images,
  Languages,
  MapPin,
  Moon,
  Scale,
  School,
  Search,
  Sparkles,
  Sun,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

type Theme = "light" | "dark";
type Language = "en" | "km";
type Grade = "A" | "B" | "C" | "D" | "E";
type SubjectGrade = "A" | "B" | "C" | "D" | "E" | "F";
type Metric = "candidates" | "A" | "B" | "C" | "D" | "E" | "centers" | "schools" | "pages";
type GradeTotals = Record<Grade, number>;
type TabMode = "overview" | "subjects";

type SubjectKey =
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

type ProvinceSummary = {
  id: string;
  name: string;
  candidateCount: number;
  centerCount: number;
  schoolCount: number;
  pageCount: number;
  grades: GradeTotals;
};

type Summary = {
  year: string;
  candidateCount: number;
  pageCount: number;
  provinceCount: number;
  centerCount: number;
  schoolCount: number;
  grades: Array<{ grade: string; count: number }>;
  provinces: ProvinceSummary[];
};

type SchoolAnalysis = {
  name: string;
  province: string;
  provinceId?: string;
  candidateCount: number;
  femaleCount: number;
  scienceCount: number;
  socialCount: number;
  grades: Record<Grade, number>;
  gradeAPercent: number;
  sampleStudentId: number;
  rank?: number;
};

type SubjectOverviewItem = {
  key: SubjectKey;
  nameKm: string;
  nameEn: string;
  track: "science" | "social-science";
  totalCandidates: number;
  grades: Record<SubjectGrade, number>;
  gradeAPercent: number;
  passPercent: number;
  excellencePercent: number;
};

type SubjectSchoolItem = {
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
};

type SubjectProvinceItem = {
  id: string;
  name: string;
  totalCandidates: number;
  grades: Record<SubjectGrade, number>;
  gradeA: number;
  gradeAPercent: number;
  passPercent: number;
  rank: number;
};

type SubjectDetailResponse = {
  year: string;
  track: "science" | "social-science";
  subject: SubjectKey;
  subjectMeta: {
    key: SubjectKey;
    nameKm: string;
    nameEn: string;
    tracks: Array<"science" | "social-science">;
  };
  overview: SubjectOverviewItem;
  otherTrackOverview?: SubjectOverviewItem;
  schools: SubjectSchoolItem[];
  provinces: SubjectProvinceItem[];
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const numberFormat = new Intl.NumberFormat("en-US");
const grades: Grade[] = ["A", "B", "C", "D", "E"];
const subjectGrades: SubjectGrade[] = ["A", "B", "C", "D", "E", "F"];
const SCHOOL_IMAGE_VERSION = "2";

const provinceEnglish: Record<string, string> = {
  phnompenh: "Phnom Penh", kandal: "Kandal", pailin: "Pailin", stungtreng: "Stung Treng", kohkong: "Koh Kong",
  oddarmeanchey: "Oddar Meanchey", preahvihear: "Preah Vihear", ratanakiri: "Ratanakiri", preahsihanouk: "Preah Sihanouk",
  kratie: "Kratie", pursat: "Pursat", svayrieng: "Svay Rieng", kampongchhnang: "Kampong Chhnang", kampongspeu: "Kampong Speu",
  kampot: "Kampot", tboungkhmum: "Tboung Khmum", kampongthom: "Kampong Thom", banteaymeanchey: "Banteay Meanchey",
  preyveng: "Prey Veng", kampongcham: "Kampong Cham", battambang: "Battambang", takeo: "Takeo", siemreap: "Siem Reap",
  kep: "Kep", mondulkiri: "Mondulkiri",
};

const SCIENCE_SUBJECTS: SubjectKey[] = [
  "math",
  "physics",
  "chemistry",
  "biology",
  "khmer",
  "history",
  "foreign_language",
];

const SOCIAL_SUBJECTS: SubjectKey[] = [
  "math",
  "khmer",
  "earth_science",
  "geography",
  "history",
  "civics",
  "foreign_language",
];

const copy = {
  en: {
    brand: "BacII Result Search Engine", facebook: "Facebook search", archive: "Results archive", insights: "Insights",
    eyebrow: "BacII intelligence dashboard", title: "See the story behind the results.",
    intro: "Explore grade patterns, compare provinces, and follow national result trends as each new archive year is added.",
    tabOverview: "Overview & High Schools",
    tabSubjects: "Subject Analysis",
    newBadge: "New",
    year: "Data year", metric: "Trend metric", candidates: "Passing candidates", centers: "Exam centers", schools: "High schools", pages: "Official pages", provinces: "provinces & capital",
    nationalSnapshot: "National snapshot", gradeMix: "National grade composition", annualTrend: "Year-over-year trend",
    provinceRanking: "Province / capital ranking", rankHelp: "Ranked using the selected trend metric for the chosen year.",
    schoolAnalysis: "High school analysis",
    schoolAnalysisSubtitle: "Passing candidates, gender representation, and grade distributions across high schools.",
    gradeAChampions: "Grade A Champions",
    gradeAChampionsHelp: "High schools with the highest number of Grade A passing candidates.",
    allSchoolsExplorer: "High school performance & grade mix",
    searchSchoolPlaceholder: "Search high school name…",
    allProvinces: "All provinces / capital",
    sortBy: "Sort by",
    sortGradeA: "Most Grade A",
    sortGradeAPercent: "Highest Grade A %",
    sortCandidates: "Most candidates",
    sortPassRate: "Highest Pass Rate (A–E)",
    sortName: "School name (A–Z)",
    candidatesUnit: "candidates",
    femalePercent: "female",
    scienceTrack: "Science Track",
    socialTrack: "Social Science Track",
    noSchoolsFound: "No high schools found matching your search.",
    showMore: "Show more schools",
    showAll: "Show all",
    showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} high schools`,
    oneYear: "Add another yearly archive to reveal a multi-year trend. The chart is already structured to update automatically.",
    loading: "Building insights…", unavailable: "Insights are not available from this server.",
    source: "Figures represent candidates published as passing by MOEYS; they are not pass rates because total registered-candidate counts are not included.",
    // Subject Analysis Strings
    subjectAnalysisTitle: "Subject Intelligence & Breakdown",
    subjectAnalysisSubtitle: "Detailed numbers, percentages, and grade distributions (A–F) for Maths, Physics, Chemistry, and more across high schools and provinces.",
    chooseTrack: "Track",
    chooseSubject: "Subject",
    subjectTotalAssessed: "Total candidates assessed",
    gradeACount: "Grade A count",
    subjectPassRate: "Subject Pass Rate (A–E)",
    excellenceRate: "Excellence Rate (A & B)",
    subjectChampionsTitle: "High School Champions in this Subject",
    subjectChampionsHelp: "High schools with the most Grade A achievements in this specific subject.",
    subjectSchoolsTitle: "High School Leaderboard for this Subject",
    subjectProvincesTitle: "Province Performance for this Subject",
    trackComparisonTitle: "Track Comparison: Science vs. Social Science",
    trackComparisonHelp: "Side-by-side performance for subjects taken by both tracks.",
    gradeFNote: "Note: Grade F in an individual subject does not mean the candidate failed BacII, as overall passing is determined by aggregate scores.",
  },
  km: {
    brand: "ប្រព័ន្ធស្វែងរកលទ្ធផលបាក់ឌុប", facebook: "ស្វែងរកតាម Facebook", archive: "បណ្ណសារលទ្ធផល", insights: "ទិន្នន័យវិភាគ",
    eyebrow: "ផ្ទាំងវិភាគទិន្នន័យបាក់ឌុប", title: "ស្វែងយល់ពីទិន្នន័យនៅពីក្រោយលទ្ធផល",
    intro: "មើលទម្រង់និទ្ទេស ប្រៀបធៀបរាជធានី ខេត្ត និងតាមដាននិន្នាការទូទាំងប្រទេស នៅពេលបន្ថែមទិន្នន័យឆ្នាំថ្មី។",
    tabOverview: "ទិដ្ឋភាពទូទៅ និងអាគតដ្ឋាន",
    tabSubjects: "វិភាគតាមមុខវិជ្ជា",
    newBadge: "ថ្មី",
    year: "ឆ្នាំទិន្នន័យ", metric: "ទិន្នន័យសម្រាប់និន្នាការ", candidates: "បេក្ខជនជាប់", centers: "មណ្ឌលប្រឡង", schools: "អាគតដ្ឋាន", pages: "ទំព័រផ្លូវការ", provinces: "រាជធានី និងខេត្ត",
    nationalSnapshot: "ទិន្នន័យសង្ខេបទូទាំងប្រទេស", gradeMix: "សមាមាត្រនិទ្ទេសទូទាំងប្រទេស", annualTrend: "និន្នាការពីមួយឆ្នាំទៅមួយឆ្នាំ",
    provinceRanking: "ចំណាត់ថ្នាក់រាជធានី ខេត្ត", rankHelp: "រៀបតាមទិន្នន័យដែលបានជ្រើសរើស សម្រាប់ឆ្នាំដែលបានជ្រើសរើស។",
    schoolAnalysis: "វិភាគតាមអាគតដ្ឋាន",
    schoolAnalysisSubtitle: "ស្ថិតិបេក្ខជនជាប់ ភេទ និងការបែងចែកនិទ្ទេសតាមអាគតដ្ឋាននីមួយៗ",
    gradeAChampions: "អាគតដ្ឋានឆ្នើម (និទ្ទេស A ច្រើនបំផុត)",
    gradeAChampionsHelp: "អាគតដ្ឋានដែលមានបេក្ខជនទទួលបាននិទ្ទេស A ច្រើនជាងគេទូទាំងប្រទេស។",
    allSchoolsExplorer: "តារាងចំណាត់ថ្នាក់ និងសមាមាត្រនិទ្ទេសតាមអាគតដ្ឋាន",
    searchSchoolPlaceholder: "ស្វែងរកឈ្មោះអាគតដ្ឋាន…",
    allProvinces: "រាជធានី ខេត្តទាំងអស់",
    sortBy: "តម្រៀបតាម",
    sortGradeA: "និទ្ទេស A ច្រើនបំផុត",
    sortGradeAPercent: "ភាគរយនិទ្ទេស A (%)",
    sortCandidates: "ចំនួនបេក្ខជនជាប់ច្រើនបំផុត",
    sortPassRate: "អត្រាជាប់មុខវិជ្ជាខ្ពស់បំផុត (A–E)",
    sortName: "ឈ្មោះអាគតដ្ឋាន",
    candidatesUnit: "នាក់",
    femalePercent: "នារី",
    scienceTrack: "ថ្នាក់វិទ្យាសាស្ត្រ",
    socialTrack: "ថ្នាក់វិទ្យាសាស្ត្រសង្គម",
    noSchoolsFound: "រកមិនឃើញអាគតដ្ឋានដែលត្រូវនឹងលក្ខខណ្ឌស្វែងរកទេ។",
    showMore: "បង្ហាញបន្ថែម",
    showAll: "បង្ហាញទាំងអស់",
    showingCount: (shown: number, total: number) => `បង្ហាញ ${shown} នៃ ${total} អាគតដ្ឋាន`,
    oneYear: "បន្ថែមបណ្ណសារឆ្នាំផ្សេងទៀត ដើម្បីបង្ហាញនិន្នាការច្រើនឆ្នាំ។ ក្រាហ្វនឹងធ្វើបច្ចុប្បន្នភាពដោយស្វ័យប្រវត្តិ។",
    loading: "កំពុងរៀបចំទិន្នន័យវិភាគ…", unavailable: "មិនអាចទាញយកទិន្នន័យវិភាគពីម៉ាស៊ីនមេបានទេ។",
    source: "តួលេខទាំងនេះតំណាងឱ្យបេក្ខជនដែលក្រសួងបានប្រកាសថាជាប់ មិនមែនជាអត្រាជាប់ទេ ព្រោះមិនមានចំនួនបេក្ខជនចុះឈ្មោះសរុប។",
    // Subject Analysis Strings
    subjectAnalysisTitle: "ការវិភាគលម្អិតតាមមុខវិជ្ជា",
    subjectAnalysisSubtitle: "ស្វែងយល់ពីចំនួន និងភាគរយនិទ្ទេសមុខវិជ្ជានីមួយៗ (គណិតវិទ្យា រូបវិទ្យា គីមីវិទ្យា...) តាមអាគតដ្ឋាន រាជធានី ខេត្ត និងថ្នាក់",
    chooseTrack: "ថ្នាក់",
    chooseSubject: "មុខវិជ្ជា",
    subjectTotalAssessed: "ចំនួនបេក្ខជនសរុបក្នុងមុខវិជ្ជានេះ",
    gradeACount: "ចំនួននិទ្ទេស A",
    subjectPassRate: "អត្រាជាប់មុខវិជ្ជា (A–E)",
    excellenceRate: "អត្រាលេចធ្លោ (A & B)",
    subjectChampionsTitle: "អាគតដ្ឋានឆ្នើមក្នុងមុខវិជ្ជានេះ (និទ្ទេស A ច្រើនបំផុត)",
    subjectChampionsHelp: "អាគតដ្ឋានដែលមានបេក្ខជនទទួលបាននិទ្ទេស A ច្រើនជាងគេក្នុងមុខវិជ្ជាដែលបានជ្រើសរើស។",
    subjectSchoolsTitle: "ចំណាត់ថ្នាក់អាគតដ្ឋានក្នុងមុខវិជ្ជានេះ",
    subjectProvincesTitle: "ការប្រៀបធៀបតាមរាជធានី ខេត្ត ក្នុងមុខវិជ្ជានេះ",
    trackComparisonTitle: "ការប្រៀបធៀបរវាងថ្នាក់វិទ្យាសាស្ត្រ និងវិទ្យាសាស្ត្រសង្គម",
    trackComparisonHelp: "ការប្រៀបធៀបនិទ្ទេសសម្រាប់មុខវិជ្ជាដែលមានទាំងពីរថ្នាក់ (ដូចជា គណិតវិទ្យា ភាសាខ្មែរ ប្រវត្តិវិទ្យា ភាសាបរទេស)។",
    gradeFNote: "សម្គាល់៖ និទ្ទេស F ក្នុងមុខវិជ្ជាជាក់លាក់មួយ មិនមែនមានន័យថាធ្លាក់បាក់ឌុបនោះទេ ព្រោះលទ្ធផលជាប់សរុបគិតលើពិន្ទុសរុបគ្រប់មុខវិជ្ជា។",
  },
} as const;

function initialTheme(): Theme {
  const saved = localStorage.getItem("album-packer-theme");
  return saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialLanguage(): Language {
  const saved = localStorage.getItem("album-packer-language");
  return saved === "en" || saved === "km" ? saved : navigator.language.toLowerCase().startsWith("km") ? "km" : "en";
}

function initialTab(): TabMode {
  return window.location.hash.includes("subjects") ? "subjects" : "overview";
}

function renderSubjectIcon(key: SubjectKey) {
  switch (key) {
    case "math": return <Calculator size={15} />;
    case "physics": return <Atom size={15} />;
    case "chemistry": return <FlaskConical size={15} />;
    case "biology": return <Dna size={15} />;
    case "khmer": return <BookOpen size={15} />;
    case "history": return <History size={15} />;
    case "foreign_language": return <Globe size={15} />;
    case "earth_science": return <Compass size={15} />;
    case "geography": return <Compass size={15} />;
    case "civics": return <Scale size={15} />;
    default: return <BookOpen size={15} />;
  }
}

function OfficialSchoolImage({
  year,
  studentId,
  fallback,
}: {
  year: string;
  studentId: number;
  fallback: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return <span className="official-school-text">{fallback || "—"}</span>;
  }

  return (
    <span className="official-school-img-wrap">
      <img
        src={apiUrl(`/api/archive/${year}/students/${studentId}/school-image?v=${SCHOOL_IMAGE_VERSION}`)}
        alt={fallback || "Official school name"}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    </span>
  );
}

function SchoolStackedGradeBar({
  grades: g,
  total,
}: {
  grades: Record<Grade, number>;
  total: number;
}) {
  if (total <= 0) return null;
  return (
    <div className="school-stacked-grade-bar" title={`A: ${g.A}, B: ${g.B}, C: ${g.C}, D: ${g.D}, E: ${g.E}`}>
      {grades.map((grade) => {
        const count = g[grade] || 0;
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={grade}
            className={`school-stacked-segment grade-segment-${grade.toLowerCase()}`}
            style={{ width: `${pct}%` }}
            title={`${grade}: ${count} (${pct.toFixed(1)}%)`}
          >
            {pct >= 12 && <span className="segment-label">{grade} {count}</span>}
          </div>
        );
      })}
    </div>
  );
}

function SubjectStackedGradeBar({
  grades: g,
  total,
}: {
  grades: Record<SubjectGrade, number>;
  total: number;
}) {
  if (total <= 0) return null;
  return (
    <div className="school-stacked-grade-bar subject-bar" aria-label="Subject grade breakdown bar">
      {subjectGrades.map((grade) => {
        const count = g[grade] || 0;
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={grade}
            className={`school-stacked-segment grade-segment-${grade.toLowerCase()}`}
            style={{ width: `${pct}%` }}
            title={`${grade}: ${numberFormat.format(count)} (${pct.toFixed(1)}%)`}
          >
            {pct >= 9 && <span className="segment-label">{grade} {numberFormat.format(count)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function InsightsPage() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [activeTab, setActiveTab] = useState<TabMode>(initialTab);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [metric, setMetric] = useState<Metric>("candidates");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // High School (អាគតដ្ឋាន) Explorer state
  const [schools, setSchools] = useState<SchoolAnalysis[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolProvince, setSchoolProvince] = useState("all");
  const [schoolSort, setSchoolSort] = useState<"gradeA" | "gradeAPercent" | "candidates" | "name">("gradeA");
  const [schoolDisplayLimit, setSchoolDisplayLimit] = useState(20);

  // Subject Analysis state
  const [selectedTrack, setSelectedTrack] = useState<"science" | "social-science">("science");
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>("math");
  const [subjectOverviews, setSubjectOverviews] = useState<SubjectOverviewItem[]>([]);
  const [subjectDetail, setSubjectDetail] = useState<SubjectDetailResponse | null>(null);
  const [loadingSubjectDetail, setLoadingSubjectDetail] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectProvince, setSubjectProvince] = useState("all");
  const [subjectSort, setSubjectSort] = useState<"gradeA" | "gradeAPercent" | "candidates" | "passRate" | "name">("gradeA");
  const [subjectDisplayLimit, setSubjectDisplayLimit] = useState(20);

  const t = copy[language];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("album-packer-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    localStorage.setItem("album-packer-language", language);
  }, [language]);

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash.includes("subjects")) {
        setActiveTab("subjects");
      } else if (window.location.hash.startsWith("#insights")) {
        setActiveTab("overview");
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/archive/years"))
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(async (data: { years: string[] }) =>
        Promise.all(
          data.years.map(async (year) => {
            const response = await fetch(apiUrl(`/api/archive/${year}/summary`));
            if (!response.ok) throw new Error();
            return response.json() as Promise<Summary>;
          })
        )
      )
      .then((items) => {
        const ordered = items.sort((left, right) => left.year.localeCompare(right.year));
        setSummaries(ordered);
        setSelectedYear(ordered.at(-1)?.year || "");
      })
      .catch(() => setError(t.unavailable))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch High Schools for selected year
  useEffect(() => {
    if (!selectedYear) return;
    setLoadingSchools(true);
    setSchoolDisplayLimit(20);
    fetch(apiUrl(`/api/archive/${selectedYear}/schools`))
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ schools: SchoolAnalysis[] }>;
      })
      .then((data) => setSchools(data.schools || []))
      .catch(() => setSchools([]))
      .finally(() => setLoadingSchools(false));
  }, [selectedYear]);

  // Fetch Subject Overviews for selected year
  useEffect(() => {
    if (!selectedYear) return;
    fetch(apiUrl(`/api/archive/${selectedYear}/subjects/overview`))
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ overview: SubjectOverviewItem[] }>;
      })
      .then((data) => setSubjectOverviews(data.overview || []))
      .catch(() => setSubjectOverviews([]));
  }, [selectedYear]);

  // Fetch Subject Detail when year, track, or subject changes
  useEffect(() => {
    if (!selectedYear) return;
    setLoadingSubjectDetail(true);
    setSubjectDisplayLimit(20);
    fetch(apiUrl(`/api/archive/${selectedYear}/subjects/detail?track=${selectedTrack}&subject=${selectedSubject}`))
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<SubjectDetailResponse>;
      })
      .then((data) => setSubjectDetail(data))
      .catch(() => setSubjectDetail(null))
      .finally(() => setLoadingSubjectDetail(false));
  }, [selectedYear, selectedTrack, selectedSubject]);

  const selected = summaries.find((item) => item.year === selectedYear) || summaries.at(-1);
  const metricLabel =
    metric === "candidates"
      ? t.candidates
      : metric === "centers"
      ? t.centers
      : metric === "schools"
      ? t.schools
      : metric === "pages"
      ? t.pages
      : `${language === "km" ? "និទ្ទេស" : "Grade"} ${metric}`;

  function gradeCount(summary: Summary, grade: Grade) {
    return summary.grades.find((item) => item.grade === grade)?.count || 0;
  }

  function summaryMetric(summary: Summary) {
    if (metric === "candidates") return summary.candidateCount;
    if (metric === "centers") return summary.centerCount;
    if (metric === "schools") return summary.schoolCount;
    if (metric === "pages") return summary.pageCount;
    return gradeCount(summary, metric);
  }

  function provinceMetric(item: ProvinceSummary) {
    if (metric === "candidates") return item.candidateCount;
    if (metric === "centers") return item.centerCount;
    if (metric === "schools") return item.schoolCount;
    if (metric === "pages") return item.pageCount;
    return item.grades[metric];
  }

  const trendMax = Math.max(1, ...summaries.map(summaryMetric));
  const ranking = useMemo(
    () => selected?.provinces.slice().sort((a, b) => provinceMetric(b) - provinceMetric(a)).slice(0, 10) || [],
    [selected, metric] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rankingMax = Math.max(1, ...ranking.map(provinceMetric));
  const selectedGrades = Object.fromEntries(
    grades.map((grade) => [grade, selected ? gradeCount(selected, grade) : 0])
  ) as GradeTotals;

  let angle = 0;
  const gradeStops = grades
    .map((grade) => {
      const start = angle;
      angle += selected?.candidateCount ? (selectedGrades[grade] / selected.candidateCount) * 360 : 0;
      return `var(--grade-${grade.toLowerCase()}) ${start}deg ${angle}deg`;
    })
    .join(", ");

  const champions = useMemo(() => {
    return [...schools]
      .filter((s) => s.grades.A > 0)
      .sort((a, b) => b.grades.A - a.grades.A || b.candidateCount - a.candidateCount)
      .slice(0, 3);
  }, [schools]);

  const filteredSchools = useMemo(() => {
    const term = schoolSearch.trim().toLowerCase();
    let list = schools;
    if (schoolProvince !== "all") {
      list = list.filter((s) => s.provinceId === schoolProvince || s.province === schoolProvince);
    }
    if (term) {
      list = list.filter((s) => {
        const engProv = provinceEnglish[s.provinceId || s.province]?.toLowerCase() || "";
        return s.name.toLowerCase().includes(term) || s.province.toLowerCase().includes(term) || engProv.includes(term);
      });
    }
    return list.slice().sort((a, b) => {
      if (schoolSort === "gradeA") return b.grades.A - a.grades.A || b.candidateCount - a.candidateCount;
      if (schoolSort === "gradeAPercent") return b.gradeAPercent - a.gradeAPercent || b.grades.A - a.grades.A;
      if (schoolSort === "candidates") return b.candidateCount - a.candidateCount || b.grades.A - a.grades.A;
      if (schoolSort === "name") return a.name.localeCompare(b.name, "km");
      return 0;
    });
  }, [schools, schoolSearch, schoolProvince, schoolSort]);

  const visibleSchools = useMemo(() => {
    return filteredSchools.slice(0, schoolDisplayLimit);
  }, [filteredSchools, schoolDisplayLimit]);

  // Subject filtering & champions
  const availableSubjectKeys = selectedTrack === "science" ? SCIENCE_SUBJECTS : SOCIAL_SUBJECTS;

  const subjectChampions = useMemo(() => {
    if (!subjectDetail) return [];
    return [...subjectDetail.schools]
      .filter((s) => s.gradeA > 0)
      .sort((a, b) => b.gradeA - a.gradeA || b.totalCandidates - a.totalCandidates)
      .slice(0, 3);
  }, [subjectDetail]);

  const filteredSubjectSchools = useMemo(() => {
    if (!subjectDetail) return [];
    const term = subjectSearch.trim().toLowerCase();
    let list = subjectDetail.schools;
    if (subjectProvince !== "all") {
      list = list.filter((s) => s.provinceId === subjectProvince || s.province === subjectProvince);
    }
    if (term) {
      list = list.filter((s) => {
        const engProv = provinceEnglish[s.provinceId || s.province]?.toLowerCase() || "";
        return s.name.toLowerCase().includes(term) || s.province.toLowerCase().includes(term) || engProv.includes(term);
      });
    }
    return list.slice().sort((a, b) => {
      if (subjectSort === "gradeA") return b.gradeA - a.gradeA || b.totalCandidates - a.totalCandidates;
      if (subjectSort === "gradeAPercent") return b.gradeAPercent - a.gradeAPercent || b.gradeA - a.gradeA;
      if (subjectSort === "candidates") return b.totalCandidates - a.totalCandidates || b.gradeA - a.gradeA;
      if (subjectSort === "passRate") return b.passPercent - a.passPercent || b.gradeA - a.gradeA;
      if (subjectSort === "name") return a.name.localeCompare(b.name, "km");
      return 0;
    });
  }, [subjectDetail, subjectSearch, subjectProvince, subjectSort]);

  const visibleSubjectSchools = useMemo(() => {
    return filteredSubjectSchools.slice(0, subjectDisplayLimit);
  }, [filteredSubjectSchools, subjectDisplayLimit]);

  return (
    <main className="insights-page">
      <nav className="nav site-header shell">
        <a className="brand" href="#insights">
          <span className="brand-mark"><Images size={20} /></span>
          <span>{t.brand}</span>
        </a>
        <div className="site-header-right">
          <div className="primary-nav">
            <a href="#top" aria-label={t.facebook}><Images size={15} /><span>{t.facebook}</span></a>
            <a href="#archive" aria-label={t.archive}><Archive size={15} /><span>{t.archive}</span></a>
            <a className="active" href="#insights" aria-current="page" aria-label={t.insights}><BarChart3 size={15} /><span>{t.insights}</span></a>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="language-toggle"
              onClick={() => setLanguage(language === "en" ? "km" : "en")}
            >
              <Languages size={15} /> {language === "en" ? "ខ្មែរ" : "EN"}
            </button>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </nav>

      <header className="insights-hero shell">
        <div>
          <span className="eyebrow"><TrendingUp size={14} /> {t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="insight-controls">
          <label>
            <span>{t.year}</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
              {summaries.map((item) => (
                <option key={item.year}>{item.year}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.metric}</span>
            <select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>
              <option value="candidates">{t.candidates}</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>{language === "km" ? "និទ្ទេស" : "Grade"} {grade}</option>
              ))}
              <option value="centers">{t.centers}</option>
              <option value="schools">{t.schools}</option>
              <option value="pages">{t.pages}</option>
            </select>
          </label>
        </div>
      </header>

      {/* Primary Insights Tabs */}
      <div className="insights-tab-nav shell" role="tablist" aria-label="Insights tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          className={`tab-pill-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("overview");
            window.location.hash = "#insights";
          }}
        >
          <BarChart3 size={15} />
          <span>{t.tabOverview}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "subjects"}
          className={`tab-pill-btn ${activeTab === "subjects" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("subjects");
            window.location.hash = "#insights-subjects";
          }}
        >
          <BookOpen size={15} />
          <span>{t.tabSubjects}</span>
          <span className="tab-pill-badge">{t.newBadge}</span>
        </button>
      </div>

      {loading ? (
        <div className="archive-state shell">{t.loading}</div>
      ) : error || !selected ? (
        <div className="archive-state error-banner shell">{error || t.unavailable}</div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW & HIGH SCHOOLS (អាគតដ្ឋាន) */}
          {activeTab === "overview" && (
            <div className="tab-pane">
              <section className="insight-kpis shell" aria-label={t.nationalSnapshot}>
                <article>
                  <Users />
                  <span>{t.candidates}</span>
                  <strong>{numberFormat.format(selected.candidateCount)}</strong>
                  <small>{selected.year}</small>
                </article>
                <article>
                  <GraduationCap />
                  <span>{t.centers}</span>
                  <strong>{numberFormat.format(selected.centerCount)}</strong>
                  <small>{selected.provinceCount} {t.provinces}</small>
                </article>
                <article>
                  <School />
                  <span>{t.schools}</span>
                  <strong>{numberFormat.format(selected.schoolCount)}</strong>
                  <small>{selected.year}</small>
                </article>
                <article>
                  <BookOpen />
                  <span>{t.pages}</span>
                  <strong>{numberFormat.format(selected.pageCount)}</strong>
                  <small>PDF</small>
                </article>
              </section>

              <section className="insight-dashboard shell">
                <article className="insight-card trend-card">
                  <div className="dashboard-card-head">
                    <div><span>{metricLabel}</span><h2>{t.annualTrend}</h2></div>
                    <TrendingUp />
                  </div>
                  <div className="year-trend-chart">
                    {summaries.map((item) => (
                      <div key={item.year}>
                        <strong>{numberFormat.format(summaryMetric(item))}</strong>
                        <span>
                          <i style={{ height: `${Math.max(8, (summaryMetric(item) / trendMax) * 100)}%` }} />
                        </span>
                        <b>{item.year}</b>
                      </div>
                    ))}
                  </div>
                  {summaries.length < 2 && <p className="trend-empty-note">{t.oneYear}</p>}
                </article>

                <article className="insight-card grade-mix-card">
                  <div className="dashboard-card-head">
                    <div><span>{selected.year}</span><h2>{t.gradeMix}</h2></div>
                    <GraduationCap />
                  </div>
                  <div className="grade-donut-layout">
                    <div className="grade-donut" style={{ background: `conic-gradient(${gradeStops})` }}>
                      <div>
                        <strong>{numberFormat.format(selected.candidateCount)}</strong>
                        <span>{t.candidates}</span>
                      </div>
                    </div>
                    <div className="grade-donut-legend">
                      {grades.map((grade) => (
                        <div key={grade} className={`grade-${grade.toLowerCase()}`}>
                          <i />
                          <b>{grade}</b>
                          <span>{numberFormat.format(selectedGrades[grade])}</span>
                          <small>{((selectedGrades[grade] / selected.candidateCount) * 100).toFixed(1)}%</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <article className="insight-card province-ranking-card">
                  <div className="dashboard-card-head">
                    <div>
                      <span>{selected.year} · {metricLabel}</span>
                      <h2>{t.provinceRanking}</h2>
                      <p>{t.rankHelp}</p>
                    </div>
                    <MapPin />
                  </div>
                  <div className="dashboard-ranking">
                    {ranking.map((item, index) => (
                      <div key={item.id}>
                        <b>{String(index + 1).padStart(2, "0")}</b>
                        <span>
                          {language === "km" ? item.name : provinceEnglish[item.id] || item.name}
                          <i style={{ width: `${(provinceMetric(item) / rankingMax) * 100}%` }} />
                        </span>
                        <strong>{numberFormat.format(provinceMetric(item))}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              {/* High School (អាគតដ្ឋាន) Analysis Section */}
              <section className="school-analysis-section shell" aria-label={t.schoolAnalysis}>
                <div className="school-section-header">
                  <div className="school-section-title-wrap">
                    <span className="eyebrow"><Sparkles size={14} /> {t.schoolAnalysis} ({selected.year})</span>
                    <h2>{t.allSchoolsExplorer}</h2>
                    <p>{t.schoolAnalysisSubtitle}</p>
                  </div>
                </div>

                {/* Champions Showcase (Top 3 Grade A Schools) */}
                {champions.length > 0 && (
                  <div className="school-champions-block">
                    <div className="champions-header">
                      <Trophy size={18} className="champions-trophy-icon" />
                      <div>
                        <h3>{t.gradeAChampions}</h3>
                        <p>{t.gradeAChampionsHelp}</p>
                      </div>
                    </div>

                    <div className="school-champions-grid">
                      {champions.map((champion, idx) => {
                        const medalClass = idx === 0 ? "gold" : idx === 1 ? "silver" : "bronze";
                        const femalePct =
                          champion.candidateCount > 0
                            ? Math.round((champion.femaleCount / champion.candidateCount) * 100)
                            : 0;
                        const provObj = selected.provinces.find(
                          (p) => p.id === champion.provinceId || p.id === champion.province || p.name === champion.province
                        );
                        const provLabel =
                          language === "km"
                            ? provObj?.name || champion.province
                            : provinceEnglish[champion.provinceId || champion.province] || champion.province;

                        return (
                          <article key={`${champion.province}-${champion.name}`} className={`school-champion-card medal-${medalClass}`}>
                            <div className="champion-card-top">
                              <span className={`champion-rank-badge rank-${idx + 1}`}>
                                <Award size={14} />
                                #{idx + 1}
                              </span>
                              <span className="province-chip">
                                <MapPin size={11} /> {provLabel}
                              </span>
                            </div>

                            <div className="champion-school-name-box">
                              <OfficialSchoolImage
                                year={selected.year}
                                studentId={champion.sampleStudentId}
                                fallback={champion.name}
                              />
                            </div>

                            <div className="champion-stat-hero">
                              <div className="champion-stat-main">
                                <strong>{numberFormat.format(champion.grades.A)}</strong>
                                <span>{language === "km" ? "និទ្ទេស A" : "Grade A"}</span>
                              </div>
                              <div className="champion-stat-sub">
                                <b>{champion.gradeAPercent.toFixed(1)}%</b>
                                <small>{language === "km" ? "នៃបេក្ខជនសរុប" : "of candidates"}</small>
                              </div>
                            </div>

                            <SchoolStackedGradeBar grades={champion.grades} total={champion.candidateCount} />

                            <div className="champion-footer-stats">
                              <span>{numberFormat.format(champion.candidateCount)} {t.candidatesUnit}</span>
                              <span className="gender-dot">♀ {femalePct}% {t.femalePercent}</span>
                            </div>

                            <div className="champion-pills">
                              {grades.map((g) => (
                                <span key={g} className={`pill-mini pill-${g.toLowerCase()}`}>
                                  <b>{g}</b> {numberFormat.format(champion.grades[g] || 0)}
                                </span>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* School Explorer Filters & Controls */}
                <div className="school-explorer-toolbar">
                  <div className="school-search-box">
                    <Search size={16} />
                    <input
                      type="search"
                      placeholder={t.searchSchoolPlaceholder}
                      value={schoolSearch}
                      onChange={(e) => setSchoolSearch(e.target.value)}
                    />
                  </div>

                  <div className="school-filter-selects">
                    <label className="school-filter-item">
                      <select
                        value={schoolProvince}
                        onChange={(e) => setSchoolProvince(e.target.value)}
                      >
                        <option value="all">{t.allProvinces}</option>
                        {selected.provinces.map((p) => (
                          <option key={p.id} value={p.id}>
                            {language === "km" ? p.name : provinceEnglish[p.id] || p.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="school-filter-item">
                      <select
                        value={schoolSort}
                        onChange={(e) => setSchoolSort(e.target.value as any)}
                      >
                        <option value="gradeA">{t.sortGradeA}</option>
                        <option value="gradeAPercent">{t.sortGradeAPercent}</option>
                        <option value="candidates">{t.sortCandidates}</option>
                        <option value="name">{t.sortName}</option>
                      </select>
                    </label>
                  </div>

                  <div className="school-count-chip">
                    {t.showingCount(Math.min(visibleSchools.length, filteredSchools.length), filteredSchools.length)}
                  </div>
                </div>

                {/* High School Cards / Leaderboard */}
                {loadingSchools ? (
                  <div className="archive-state">{t.loading}</div>
                ) : filteredSchools.length === 0 ? (
                  <div className="archive-empty">
                    <School size={32} />
                    <h3>{t.noSchoolsFound}</h3>
                  </div>
                ) : (
                  <div className="school-list-grid">
                    {visibleSchools.map((school, index) => {
                      const femalePct =
                        school.candidateCount > 0
                          ? Math.round((school.femaleCount / school.candidateCount) * 100)
                          : 0;
                      const provObj = selected.provinces.find(
                        (p) => p.id === school.provinceId || p.id === school.province || p.name === school.province
                      );
                      const provLabel =
                        language === "km"
                          ? provObj?.name || school.province
                          : provinceEnglish[school.provinceId || school.province] || school.province;

                      return (
                        <article key={`${school.province}-${school.name}`} className="school-row-card">
                          <div className="school-row-left">
                            <span className="school-rank-num">{String(index + 1).padStart(2, "0")}</span>
                            <div className="school-row-details">
                              <div className="school-image-container">
                                <OfficialSchoolImage
                                  year={selected.year}
                                  studentId={school.sampleStudentId}
                                  fallback={school.name}
                                />
                              </div>
                              <div className="school-tags-row">
                                <span className="province-chip">
                                  <MapPin size={11} /> {provLabel}
                                </span>
                                <span className="tag-chip gender-tag">
                                  ♀ {femalePct}% {t.femalePercent}
                                </span>
                                {(school.scienceCount > 0 || school.socialCount > 0) && (
                                  <span className="tag-chip track-tag">
                                    {t.scienceTrack}: {numberFormat.format(school.scienceCount)} · {t.socialTrack}: {numberFormat.format(school.socialCount)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="school-row-right">
                            <div className="school-row-key-metrics">
                              <div className="school-metric-box">
                                <span className="metric-label">{t.candidates}</span>
                                <strong>{numberFormat.format(school.candidateCount)}</strong>
                              </div>
                              <div className="school-metric-box grade-a-metric">
                                <span className="metric-label">{language === "km" ? "និទ្ទេស A" : "Grade A"}</span>
                                <strong>
                                  {numberFormat.format(school.grades.A)}
                                  <small> ({school.gradeAPercent.toFixed(1)}%)</small>
                                </strong>
                              </div>
                            </div>

                            <SchoolStackedGradeBar grades={school.grades} total={school.candidateCount} />

                            <div className="school-row-pills">
                              {grades.map((g) => (
                                <span key={g} className={`pill-mini pill-${g.toLowerCase()}`}>
                                  <b>{g}</b> {numberFormat.format(school.grades[g] || 0)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {filteredSchools.length > schoolDisplayLimit && (
                  <div className="school-pagination-wrap">
                    <button
                      type="button"
                      className="school-more-button"
                      onClick={() => setSchoolDisplayLimit((prev) => prev + 25)}
                    >
                      {t.showMore}
                    </button>
                    <button
                      type="button"
                      className="school-all-button"
                      onClick={() => setSchoolDisplayLimit(filteredSchools.length)}
                    >
                      {t.showAll} ({filteredSchools.length})
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: SUBJECT LEVEL ANALYSIS (វិភាគតាមមុខវិជ្ជា) */}
          {activeTab === "subjects" && (
            <div className="tab-pane subject-tab-pane">
              <section className="subject-section shell" aria-label={t.subjectAnalysisTitle}>
                <div className="subject-section-head">
                  <div>
                    <span className="eyebrow"><Sparkles size={14} /> {t.subjectAnalysisTitle} ({selected.year})</span>
                    <h2>{t.subjectAnalysisTitle}</h2>
                    <p>{t.subjectAnalysisSubtitle}</p>
                  </div>

                  {/* Track Segmented Switcher */}
                  <div className="subject-track-switch" role="group" aria-label={t.chooseTrack}>
                    <button
                      type="button"
                      className={`track-switch-btn ${selectedTrack === "science" ? "active" : ""}`}
                      onClick={() => {
                        setSelectedTrack("science");
                        if (!SCIENCE_SUBJECTS.includes(selectedSubject)) {
                          setSelectedSubject("math");
                        }
                      }}
                    >
                      <Atom size={15} />
                      <span>{t.scienceTrack}</span>
                    </button>
                    <button
                      type="button"
                      className={`track-switch-btn ${selectedTrack === "social-science" ? "active" : ""}`}
                      onClick={() => {
                        setSelectedTrack("social-science");
                        if (!SOCIAL_SUBJECTS.includes(selectedSubject)) {
                          setSelectedSubject("math");
                        }
                      }}
                    >
                      <Compass size={15} />
                      <span>{t.socialTrack}</span>
                    </button>
                  </div>
                </div>

                {/* Subject Pills Row */}
                <div className="subject-pills-row" role="tablist" aria-label={t.chooseSubject}>
                  {availableSubjectKeys.map((subjKey) => {
                    const overviewItem = subjectOverviews.find(
                      (item) => item.track === selectedTrack && item.key === subjKey
                    );
                    const label = language === "km" ? overviewItem?.nameKm || subjKey : overviewItem?.nameEn || subjKey;
                    const isCurrent = selectedSubject === subjKey;

                    return (
                      <button
                        key={subjKey}
                        type="button"
                        className={`subject-chip-btn ${isCurrent ? "active" : ""}`}
                        onClick={() => setSelectedSubject(subjKey)}
                      >
                        {renderSubjectIcon(subjKey)}
                        <span>{label}</span>
                        {overviewItem && (
                          <span className="subject-chip-badge">
                            {overviewItem.gradeAPercent.toFixed(1)}% A
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Subject Overview Card */}
                {loadingSubjectDetail ? (
                  <div className="archive-state">{t.loading}</div>
                ) : !subjectDetail ? (
                  <div className="archive-state error-banner">{t.unavailable}</div>
                ) : (
                  <>
                    <article className="subject-hero-card">
                      <div className="subject-hero-top">
                        <div className="subject-hero-title-group">
                          <div className="subject-icon-large">
                            {renderSubjectIcon(selectedSubject)}
                          </div>
                          <div>
                            <span className="track-badge">
                              {selectedTrack === "science" ? t.scienceTrack : t.socialTrack}
                            </span>
                            <h3>
                              {language === "km" ? subjectDetail.subjectMeta.nameKm : subjectDetail.subjectMeta.nameEn}
                            </h3>
                            <small>
                              {language === "km" ? subjectDetail.subjectMeta.nameEn : subjectDetail.subjectMeta.nameKm}
                            </small>
                          </div>
                        </div>

                        <div className="subject-kpi-row">
                          <div className="subject-kpi-item">
                            <span>{t.subjectTotalAssessed}</span>
                            <strong>{numberFormat.format(subjectDetail.overview.totalCandidates)}</strong>
                          </div>
                          <div className="subject-kpi-item grade-a-kpi">
                            <span>{t.gradeACount}</span>
                            <strong>
                              {numberFormat.format(subjectDetail.overview.grades.A)}
                              <small> ({subjectDetail.overview.gradeAPercent.toFixed(1)}%)</small>
                            </strong>
                          </div>
                          <div className="subject-kpi-item">
                            <span>{t.subjectPassRate}</span>
                            <strong>{subjectDetail.overview.passPercent.toFixed(1)}%</strong>
                          </div>
                          <div className="subject-kpi-item">
                            <span>{t.excellenceRate}</span>
                            <strong>{subjectDetail.overview.excellencePercent.toFixed(1)}%</strong>
                          </div>
                        </div>
                      </div>

                      {/* Stacked Grade Bar (A through F) */}
                      <div className="subject-hero-bar-block">
                        <SubjectStackedGradeBar
                          grades={subjectDetail.overview.grades}
                          total={subjectDetail.overview.totalCandidates}
                        />

                        <div className="subject-pills-legend">
                          {subjectGrades.map((g) => {
                            const count = subjectDetail.overview.grades[g] || 0;
                            const pct =
                              subjectDetail.overview.totalCandidates > 0
                                ? ((count / subjectDetail.overview.totalCandidates) * 100).toFixed(1)
                                : "0.0";
                            return (
                              <div key={g} className={`subject-legend-pill pill-${g.toLowerCase()}`}>
                                <b>{g}</b>
                                <span>{numberFormat.format(count)}</span>
                                <small>({pct}%)</small>
                              </div>
                            );
                          })}
                        </div>
                        <p className="subject-f-note">{t.gradeFNote}</p>
                      </div>
                    </article>

                    {/* Track Comparison for Common Subjects */}
                    {subjectDetail.otherTrackOverview && (
                      <article className="track-comparison-card">
                        <div className="track-comparison-head">
                          <div>
                            <h4>{t.trackComparisonTitle}</h4>
                            <p>{t.trackComparisonHelp}</p>
                          </div>
                        </div>

                        <div className="track-comparison-grid">
                          <div className="track-comp-box">
                            <div className="track-comp-label">
                              <strong>{t.scienceTrack}</strong>
                              <span>
                                {selectedTrack === "science"
                                  ? `${numberFormat.format(subjectDetail.overview.totalCandidates)} ${t.candidatesUnit}`
                                  : `${numberFormat.format(subjectDetail.otherTrackOverview.totalCandidates)} ${t.candidatesUnit}`}
                              </span>
                            </div>
                            <SubjectStackedGradeBar
                              grades={selectedTrack === "science" ? subjectDetail.overview.grades : subjectDetail.otherTrackOverview.grades}
                              total={selectedTrack === "science" ? subjectDetail.overview.totalCandidates : subjectDetail.otherTrackOverview.totalCandidates}
                            />
                            <div className="track-comp-stat-row">
                              <span>
                                Grade A: <b>{selectedTrack === "science" ? subjectDetail.overview.gradeAPercent.toFixed(1) : subjectDetail.otherTrackOverview.gradeAPercent.toFixed(1)}%</b>
                              </span>
                              <span>
                                Pass: <b>{selectedTrack === "science" ? subjectDetail.overview.passPercent.toFixed(1) : subjectDetail.otherTrackOverview.passPercent.toFixed(1)}%</b>
                              </span>
                            </div>
                          </div>

                          <div className="track-comp-box">
                            <div className="track-comp-label">
                              <strong>{t.socialTrack}</strong>
                              <span>
                                {selectedTrack === "social-science"
                                  ? `${numberFormat.format(subjectDetail.overview.totalCandidates)} ${t.candidatesUnit}`
                                  : `${numberFormat.format(subjectDetail.otherTrackOverview.totalCandidates)} ${t.candidatesUnit}`}
                              </span>
                            </div>
                            <SubjectStackedGradeBar
                              grades={selectedTrack === "social-science" ? subjectDetail.overview.grades : subjectDetail.otherTrackOverview.grades}
                              total={selectedTrack === "social-science" ? subjectDetail.overview.totalCandidates : subjectDetail.otherTrackOverview.totalCandidates}
                            />
                            <div className="track-comp-stat-row">
                              <span>
                                Grade A: <b>{selectedTrack === "social-science" ? subjectDetail.overview.gradeAPercent.toFixed(1) : subjectDetail.otherTrackOverview.gradeAPercent.toFixed(1)}%</b>
                              </span>
                              <span>
                                Pass: <b>{selectedTrack === "social-science" ? subjectDetail.overview.passPercent.toFixed(1) : subjectDetail.otherTrackOverview.passPercent.toFixed(1)}%</b>
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    )}

                    {/* Top 3 អាគតដ្ឋាន Champions in this Subject */}
                    {subjectChampions.length > 0 && (
                      <div className="school-champions-block">
                        <div className="champions-header">
                          <Trophy size={18} className="champions-trophy-icon" />
                          <div>
                            <h3>{t.subjectChampionsTitle}</h3>
                            <p>{t.subjectChampionsHelp}</p>
                          </div>
                        </div>

                        <div className="school-champions-grid">
                          {subjectChampions.map((champion, idx) => {
                            const medalClass = idx === 0 ? "gold" : idx === 1 ? "silver" : "bronze";
                            const provObj = selected.provinces.find(
                              (p) => p.id === champion.provinceId || p.id === champion.province || p.name === champion.province
                            );
                            const provLabel =
                              language === "km"
                                ? provObj?.name || champion.province
                                : provinceEnglish[champion.provinceId || champion.province] || champion.province;

                            return (
                              <article key={`${champion.province}-${champion.name}`} className={`school-champion-card medal-${medalClass}`}>
                                <div className="champion-card-top">
                                  <span className={`champion-rank-badge rank-${idx + 1}`}>
                                    <Award size={14} />
                                    #{idx + 1}
                                  </span>
                                  <span className="province-chip">
                                    <MapPin size={11} /> {provLabel}
                                  </span>
                                </div>

                                <div className="champion-school-name-box">
                                  <OfficialSchoolImage
                                    year={selected.year}
                                    studentId={champion.sampleStudentId}
                                    fallback={champion.name}
                                  />
                                </div>

                                <div className="champion-stat-hero">
                                  <div className="champion-stat-main">
                                    <strong>{numberFormat.format(champion.gradeA)}</strong>
                                    <span>{language === "km" ? "និទ្ទេស A" : "Grade A"}</span>
                                  </div>
                                  <div className="champion-stat-sub">
                                    <b>{champion.gradeAPercent.toFixed(1)}%</b>
                                    <small>{language === "km" ? "នៃបេក្ខជនក្នុងមុខវិជ្ជា" : "in this subject"}</small>
                                  </div>
                                </div>

                                <SubjectStackedGradeBar grades={champion.grades} total={champion.totalCandidates} />

                                <div className="champion-footer-stats">
                                  <span>{numberFormat.format(champion.totalCandidates)} {t.candidatesUnit}</span>
                                  <span className="gender-dot">{t.subjectPassRate}: {champion.passPercent.toFixed(1)}%</span>
                                </div>

                                <div className="champion-pills">
                                  {subjectGrades.map((g) => (
                                    <span key={g} className={`pill-mini pill-${g.toLowerCase()}`}>
                                      <b>{g}</b> {numberFormat.format(champion.grades[g] || 0)}
                                    </span>
                                  ))}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Interactive អាគតដ្ឋាន Leaderboard for this Subject */}
                    <div className="school-section-header" style={{ marginTop: "36px" }}>
                      <div className="school-section-title-wrap">
                        <h3>{t.subjectSchoolsTitle}</h3>
                      </div>
                    </div>

                    <div className="school-explorer-toolbar">
                      <div className="school-search-box">
                        <Search size={16} />
                        <input
                          type="search"
                          placeholder={t.searchSchoolPlaceholder}
                          value={subjectSearch}
                          onChange={(e) => setSubjectSearch(e.target.value)}
                        />
                      </div>

                      <div className="school-filter-selects">
                        <label className="school-filter-item">
                          <select
                            value={subjectProvince}
                            onChange={(e) => setSubjectProvince(e.target.value)}
                          >
                            <option value="all">{t.allProvinces}</option>
                            {selected.provinces.map((p) => (
                              <option key={p.id} value={p.id}>
                                {language === "km" ? p.name : provinceEnglish[p.id] || p.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="school-filter-item">
                          <select
                            value={subjectSort}
                            onChange={(e) => setSubjectSort(e.target.value as any)}
                          >
                            <option value="gradeA">{t.sortGradeA}</option>
                            <option value="gradeAPercent">{t.sortGradeAPercent}</option>
                            <option value="passRate">{t.sortPassRate}</option>
                            <option value="candidates">{t.sortCandidates}</option>
                            <option value="name">{t.sortName}</option>
                          </select>
                        </label>
                      </div>

                      <div className="school-count-chip">
                        {t.showingCount(Math.min(visibleSubjectSchools.length, filteredSubjectSchools.length), filteredSubjectSchools.length)}
                      </div>
                    </div>

                    {filteredSubjectSchools.length === 0 ? (
                      <div className="archive-empty">
                        <School size={32} />
                        <h3>{t.noSchoolsFound}</h3>
                      </div>
                    ) : (
                      <div className="school-list-grid">
                        {visibleSubjectSchools.map((school, index) => {
                          const provObj = selected.provinces.find(
                            (p) => p.id === school.provinceId || p.id === school.province || p.name === school.province
                          );
                          const provLabel =
                            language === "km"
                              ? provObj?.name || school.province
                              : provinceEnglish[school.provinceId || school.province] || school.province;

                          return (
                            <article key={`${school.province}-${school.name}`} className="school-row-card">
                              <div className="school-row-left">
                                <span className="school-rank-num">{String(index + 1).padStart(2, "0")}</span>
                                <div className="school-row-details">
                                  <div className="school-image-container">
                                    <OfficialSchoolImage
                                      year={selected.year}
                                      studentId={school.sampleStudentId}
                                      fallback={school.name}
                                    />
                                  </div>
                                  <div className="school-tags-row">
                                    <span className="province-chip">
                                      <MapPin size={11} /> {provLabel}
                                    </span>
                                    <span className="tag-chip">
                                      {t.subjectPassRate}: <b>{school.passPercent.toFixed(1)}%</b>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="school-row-right">
                                <div className="school-row-key-metrics">
                                  <div className="school-metric-box">
                                    <span className="metric-label">{t.candidates}</span>
                                    <strong>{numberFormat.format(school.totalCandidates)}</strong>
                                  </div>
                                  <div className="school-metric-box grade-a-metric">
                                    <span className="metric-label">{language === "km" ? "និទ្ទេស A" : "Grade A"}</span>
                                    <strong>
                                      {numberFormat.format(school.gradeA)}
                                      <small> ({school.gradeAPercent.toFixed(1)}%)</small>
                                    </strong>
                                  </div>
                                </div>

                                <SubjectStackedGradeBar grades={school.grades} total={school.totalCandidates} />

                                <div className="school-row-pills">
                                  {subjectGrades.map((g) => (
                                    <span key={g} className={`pill-mini pill-${g.toLowerCase()}`}>
                                      <b>{g}</b> {numberFormat.format(school.grades[g] || 0)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {filteredSubjectSchools.length > subjectDisplayLimit && (
                      <div className="school-pagination-wrap">
                        <button
                          type="button"
                          className="school-more-button"
                          onClick={() => setSubjectDisplayLimit((prev) => prev + 25)}
                        >
                          {t.showMore}
                        </button>
                        <button
                          type="button"
                          className="school-all-button"
                          onClick={() => setSubjectDisplayLimit(filteredSubjectSchools.length)}
                        >
                          {t.showAll} ({filteredSubjectSchools.length})
                        </button>
                      </div>
                    )}

                    {/* Province Performance for this Subject */}
                    <article className="insight-card province-ranking-card" style={{ marginTop: "36px" }}>
                      <div className="dashboard-card-head">
                        <div>
                          <span>{selected.year} · {language === "km" ? subjectDetail.subjectMeta.nameKm : subjectDetail.subjectMeta.nameEn}</span>
                          <h2>{t.subjectProvincesTitle}</h2>
                        </div>
                        <MapPin />
                      </div>
                      <div className="dashboard-ranking">
                        {subjectDetail.provinces.slice(0, 10).map((prov, index) => {
                          const maxA = Math.max(1, ...subjectDetail.provinces.map((p) => p.gradeA));
                          return (
                            <div key={prov.id}>
                              <b>{String(index + 1).padStart(2, "0")}</b>
                              <span>
                                {language === "km" ? prov.name : provinceEnglish[prov.id] || prov.name}
                                <i style={{ width: `${(prov.gradeA / maxA) * 100}%` }} />
                              </span>
                              <strong>
                                {numberFormat.format(prov.gradeA)} A <small>({prov.gradeAPercent.toFixed(1)}%)</small>
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  </>
                )}
              </section>
            </div>
          )}

          <footer className="insights-footer shell">{t.source}</footer>
        </>
      )}
    </main>
  );
}
