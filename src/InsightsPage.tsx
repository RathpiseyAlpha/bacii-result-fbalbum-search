import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Award,
  BarChart3,
  BookOpen,
  GraduationCap,
  Images,
  Languages,
  MapPin,
  Moon,
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
type Metric = "candidates" | "A" | "B" | "C" | "D" | "E" | "centers" | "schools" | "pages";
type GradeTotals = Record<Grade, number>;

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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const numberFormat = new Intl.NumberFormat("en-US");
const grades: Grade[] = ["A", "B", "C", "D", "E"];
const SCHOOL_IMAGE_VERSION = "2";

const provinceEnglish: Record<string, string> = {
  phnompenh: "Phnom Penh", kandal: "Kandal", pailin: "Pailin", stungtreng: "Stung Treng", kohkong: "Koh Kong",
  oddarmeanchey: "Oddar Meanchey", preahvihear: "Preah Vihear", ratanakiri: "Ratanakiri", preahsihanouk: "Preah Sihanouk",
  kratie: "Kratie", pursat: "Pursat", svayrieng: "Svay Rieng", kampongchhnang: "Kampong Chhnang", kampongspeu: "Kampong Speu",
  kampot: "Kampot", tboungkhmum: "Tboung Khmum", kampongthom: "Kampong Thom", banteaymeanchey: "Banteay Meanchey",
  preyveng: "Prey Veng", kampongcham: "Kampong Cham", battambang: "Battambang", takeo: "Takeo", siemreap: "Siem Reap",
  kep: "Kep", mondulkiri: "Mondulkiri",
};

const copy = {
  en: {
    brand: "BacII Result Search Engine", facebook: "Facebook search", archive: "Results archive", insights: "Insights",
    eyebrow: "BacII intelligence dashboard", title: "See the story behind the results.",
    intro: "Explore grade patterns, compare provinces, and follow national result trends as each new archive year is added.",
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
    sortName: "School name (A–Z)",
    candidatesUnit: "candidates",
    femalePercent: "female",
    scienceTrack: "Science",
    socialTrack: "Social",
    noSchoolsFound: "No high schools found matching your search.",
    showMore: "Show more schools",
    showAll: "Show all",
    showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} high schools`,
    oneYear: "Add another yearly archive to reveal a multi-year trend. The chart is already structured to update automatically.",
    loading: "Building insights…", unavailable: "Insights are not available from this server.",
    source: "Figures represent candidates published as passing by MOEYS; they are not pass rates because total registered-candidate counts are not included.",
  },
  km: {
    brand: "ប្រព័ន្ធស្វែងរកលទ្ធផលបាក់ឌុប", facebook: "ស្វែងរកតាម Facebook", archive: "បណ្ណសារលទ្ធផល", insights: "ទិន្នន័យវិភាគ",
    eyebrow: "ផ្ទាំងវិភាគទិន្នន័យបាក់ឌុប", title: "ស្វែងយល់ពីទិន្នន័យនៅពីក្រោយលទ្ធផល",
    intro: "មើលទម្រង់និទ្ទេស ប្រៀបធៀបរាជធានី ខេត្ត និងតាមដាននិន្នាការទូទាំងប្រទេស នៅពេលបន្ថែមទិន្នន័យឆ្នាំថ្មី។",
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
    sortName: "ឈ្មោះអាគតដ្ឋាន",
    candidatesUnit: "នាក់",
    femalePercent: "នារី",
    scienceTrack: "វិទ្យាសាស្ត្រ",
    socialTrack: "វិទ្យាសាស្ត្រសង្គម",
    noSchoolsFound: "រកមិនឃើញអាគតដ្ឋានដែលត្រូវនឹងលក្ខខណ្ឌស្វែងរកទេ។",
    showMore: "បង្ហាញបន្ថែម",
    showAll: "បង្ហាញទាំងអស់",
    showingCount: (shown: number, total: number) => `បង្ហាញ ${shown} នៃ ${total} អាគតដ្ឋាន`,
    oneYear: "បន្ថែមបណ្ណសារឆ្នាំផ្សេងទៀត ដើម្បីបង្ហាញនិន្នាការច្រើនឆ្នាំ។ ក្រាហ្វនឹងធ្វើបច្ចុប្បន្នភាពដោយស្វ័យប្រវត្តិ។",
    loading: "កំពុងរៀបចំទិន្នន័យវិភាគ…", unavailable: "មិនអាចទាញយកទិន្នន័យវិភាគពីម៉ាស៊ីនមេបានទេ។",
    source: "តួលេខទាំងនេះតំណាងឱ្យបេក្ខជនដែលក្រសួងបានប្រកាសថាជាប់ មិនមែនជាអត្រាជាប់ទេ ព្រោះមិនមានចំនួនបេក្ខជនចុះឈ្មោះសរុប។",
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

export default function InsightsPage() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [metric, setMetric] = useState<Metric>("candidates");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [schools, setSchools] = useState<SchoolAnalysis[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolProvince, setSchoolProvince] = useState("all");
  const [schoolSort, setSchoolSort] = useState<"gradeA" | "gradeAPercent" | "candidates" | "name">("gradeA");
  const [schoolDisplayLimit, setSchoolDisplayLimit] = useState(20);

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

      {loading ? (
        <div className="archive-state shell">{t.loading}</div>
      ) : error || !selected ? (
        <div className="archive-state error-banner shell">{error || t.unavailable}</div>
      ) : (
        <>
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

          <footer className="insights-footer shell">{t.source}</footer>
        </>
      )}
    </main>
  );
}
