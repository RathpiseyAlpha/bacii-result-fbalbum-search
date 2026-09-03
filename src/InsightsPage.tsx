import { useEffect, useMemo, useState } from "react";
import {
  Archive, BarChart3, BookOpen, GraduationCap, Images, Languages,
  MapPin, Moon, School, Sun, TrendingUp, Users,
} from "lucide-react";

type Theme = "light" | "dark";
type Language = "en" | "km";
type Grade = "A" | "B" | "C" | "D" | "E";
type Metric = "candidates" | "A" | "B" | "C" | "D" | "E" | "centers" | "schools" | "pages";
type GradeTotals = Record<Grade, number>;

type ProvinceSummary = {
  id: string; name: string; candidateCount: number; centerCount: number;
  schoolCount: number; pageCount: number; grades: GradeTotals;
};
type Summary = {
  year: string; candidateCount: number; pageCount: number; provinceCount: number;
  centerCount: number; schoolCount: number; grades: Array<{ grade: string; count: number }>;
  provinces: ProvinceSummary[];
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const numberFormat = new Intl.NumberFormat("en-US");
const grades: Grade[] = ["A", "B", "C", "D", "E"];
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
    oneYear: "Add another yearly archive to reveal a multi-year trend. The chart is already structured to update automatically.",
    loading: "Building insights…", unavailable: "Insights are not available from this server.",
    source: "Figures represent candidates published as passing by MOEYS; they are not pass rates because total registered-candidate counts are not included.",
  },
  km: {
    brand: "ប្រព័ន្ធស្វែងរកលទ្ធផលបាក់ឌុប", facebook: "ស្វែងរកតាម Facebook", archive: "បណ្ណសារលទ្ធផល", insights: "ទិន្នន័យវិភាគ",
    eyebrow: "ផ្ទាំងវិភាគទិន្នន័យបាក់ឌុប", title: "ស្វែងយល់ពីទិន្នន័យនៅពីក្រោយលទ្ធផល",
    intro: "មើលទម្រង់និទ្ទេស ប្រៀបធៀបរាជធានី ខេត្ត និងតាមដាននិន្នាការទូទាំងប្រទេស នៅពេលបន្ថែមទិន្នន័យឆ្នាំថ្មី។",
    year: "ឆ្នាំទិន្នន័យ", metric: "ទិន្នន័យសម្រាប់និន្នាការ", candidates: "បេក្ខជនជាប់", centers: "មណ្ឌលប្រឡង", schools: "វិទ្យាល័យ", pages: "ទំព័រផ្លូវការ", provinces: "រាជធានី និងខេត្ត",
    nationalSnapshot: "ទិន្នន័យសង្ខេបទូទាំងប្រទេស", gradeMix: "សមាមាត្រនិទ្ទេសទូទាំងប្រទេស", annualTrend: "និន្នាការពីមួយឆ្នាំទៅមួយឆ្នាំ",
    provinceRanking: "ចំណាត់ថ្នាក់រាជធានី ខេត្ត", rankHelp: "រៀបតាមទិន្នន័យដែលបានជ្រើសរើស សម្រាប់ឆ្នាំដែលបានជ្រើសរើស។",
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

export default function InsightsPage() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [metric, setMetric] = useState<Metric>("candidates");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then(async (data: { years: string[] }) => Promise.all(data.years.map(async (year) => {
        const response = await fetch(apiUrl(`/api/archive/${year}/summary`));
        if (!response.ok) throw new Error();
        return response.json() as Promise<Summary>;
      })))
      .then((items) => {
        const ordered = items.sort((left, right) => left.year.localeCompare(right.year));
        setSummaries(ordered);
        setSelectedYear(ordered.at(-1)?.year || "");
      })
      .catch(() => setError(t.unavailable))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = summaries.find((item) => item.year === selectedYear) || summaries.at(-1);
  const metricLabel = metric === "candidates" ? t.candidates : metric === "centers" ? t.centers : metric === "schools" ? t.schools : metric === "pages" ? t.pages : `${language === "km" ? "និទ្ទេស" : "Grade"} ${metric}`;
  function gradeCount(summary: Summary, grade: Grade) { return summary.grades.find((item) => item.grade === grade)?.count || 0; }
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
  const ranking = useMemo(() => selected?.provinces.slice().sort((a, b) => provinceMetric(b) - provinceMetric(a)).slice(0, 10) || [], [selected, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const rankingMax = Math.max(1, ...ranking.map(provinceMetric));
  const selectedGrades = Object.fromEntries(grades.map((grade) => [grade, selected ? gradeCount(selected, grade) : 0])) as GradeTotals;
  let angle = 0;
  const gradeStops = grades.map((grade) => {
    const start = angle;
    angle += selected?.candidateCount ? (selectedGrades[grade] / selected.candidateCount) * 360 : 0;
    return `var(--grade-${grade.toLowerCase()}) ${start}deg ${angle}deg`;
  }).join(", ");

  return (
    <main className="insights-page">
      <nav className="nav site-header shell">
        <a className="brand" href="#insights"><span className="brand-mark"><Images size={20} /></span><span>{t.brand}</span></a>
        <div className="site-header-right">
          <div className="primary-nav">
            <a href="#top" aria-label={t.facebook}><Images size={15} /><span>{t.facebook}</span></a>
            <a href="#archive" aria-label={t.archive}><Archive size={15} /><span>{t.archive}</span></a>
            <a className="active" href="#insights" aria-current="page" aria-label={t.insights}><BarChart3 size={15} /><span>{t.insights}</span></a>
          </div>
          <div className="header-actions">
            <button type="button" className="language-toggle" onClick={() => setLanguage(language === "en" ? "km" : "en")}><Languages size={15} /> {language === "en" ? "ខ្មែរ" : "EN"}</button>
            <button type="button" className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </div>
      </nav>

      <header className="insights-hero shell">
        <div><span className="eyebrow"><TrendingUp size={14} /> {t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></div>
        <div className="insight-controls">
          <label><span>{t.year}</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>{summaries.map((item) => <option key={item.year}>{item.year}</option>)}</select></label>
          <label><span>{t.metric}</span><select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}><option value="candidates">{t.candidates}</option>{grades.map((grade) => <option key={grade} value={grade}>{language === "km" ? "និទ្ទេស" : "Grade"} {grade}</option>)}<option value="centers">{t.centers}</option><option value="schools">{t.schools}</option><option value="pages">{t.pages}</option></select></label>
        </div>
      </header>

      {loading ? <div className="archive-state shell">{t.loading}</div> : error || !selected ? <div className="archive-state error-banner shell">{error || t.unavailable}</div> : <>
        <section className="insight-kpis shell" aria-label={t.nationalSnapshot}>
          <article><Users /><span>{t.candidates}</span><strong>{numberFormat.format(selected.candidateCount)}</strong><small>{selected.year}</small></article>
          <article><GraduationCap /><span>{t.centers}</span><strong>{numberFormat.format(selected.centerCount)}</strong><small>{selected.provinceCount} {t.provinces}</small></article>
          <article><School /><span>{t.schools}</span><strong>{numberFormat.format(selected.schoolCount)}</strong><small>{selected.year}</small></article>
          <article><BookOpen /><span>{t.pages}</span><strong>{numberFormat.format(selected.pageCount)}</strong><small>PDF</small></article>
        </section>

        <section className="insight-dashboard shell">
          <article className="insight-card trend-card">
            <div className="dashboard-card-head"><div><span>{metricLabel}</span><h2>{t.annualTrend}</h2></div><TrendingUp /></div>
            <div className="year-trend-chart">{summaries.map((item) => <div key={item.year}><strong>{numberFormat.format(summaryMetric(item))}</strong><span><i style={{ height: `${Math.max(8, (summaryMetric(item) / trendMax) * 100)}%` }} /></span><b>{item.year}</b></div>)}</div>
            {summaries.length < 2 && <p className="trend-empty-note">{t.oneYear}</p>}
          </article>

          <article className="insight-card grade-mix-card">
            <div className="dashboard-card-head"><div><span>{selected.year}</span><h2>{t.gradeMix}</h2></div><GraduationCap /></div>
            <div className="grade-donut-layout">
              <div className="grade-donut" style={{ background: `conic-gradient(${gradeStops})` }}><div><strong>{numberFormat.format(selected.candidateCount)}</strong><span>{t.candidates}</span></div></div>
              <div className="grade-donut-legend">{grades.map((grade) => <div key={grade} className={`grade-${grade.toLowerCase()}`}><i /><b>{grade}</b><span>{numberFormat.format(selectedGrades[grade])}</span><small>{((selectedGrades[grade] / selected.candidateCount) * 100).toFixed(1)}%</small></div>)}</div>
            </div>
          </article>

          <article className="insight-card province-ranking-card">
            <div className="dashboard-card-head"><div><span>{selected.year} · {metricLabel}</span><h2>{t.provinceRanking}</h2><p>{t.rankHelp}</p></div><MapPin /></div>
            <div className="dashboard-ranking">{ranking.map((item, index) => <div key={item.id}><b>{String(index + 1).padStart(2, "0")}</b><span>{language === "km" ? item.name : provinceEnglish[item.id] || item.name}<i style={{ width: `${(provinceMetric(item) / rankingMax) * 100}%` }} /></span><strong>{numberFormat.format(provinceMetric(item))}</strong></div>)}</div>
          </article>
        </section>
        <footer className="insights-footer shell">{t.source}</footer>
      </>}
    </main>
  );
}
