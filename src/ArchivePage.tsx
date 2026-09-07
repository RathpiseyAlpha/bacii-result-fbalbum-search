import { useEffect, useMemo, useState } from "react";
import cambodia from "@svg-maps/cambodia";
import {
  Archive, ArrowLeft, ArrowRight, BarChart3, BookOpen, Calendar, Check, ChevronRight, ExternalLink, GraduationCap,
  Hash, Images, Languages, LoaderCircle, MapPin, Moon, School, Search, Share2, Sun, Users,
} from "lucide-react";
import MobileBottomNav from "./MobileBottomNav";
import ArchiveSearchPanel from "./components/ArchiveSearchPanel";
import SiteFooter from "./components/SiteFooter";

type Theme = "light" | "dark";
type Language = "en" | "km";
type Track = "science" | "social-science";
type Grade = "A" | "B" | "C" | "D" | "E";
type GradeTotals = Record<Grade, number>;
type ArchiveSection = "menu" | "archive-map" | "archive-search" | "archive-insights" | "archive-province-grades";

type ProvinceSummary = {
  id: string; name: string; documentId: number; pageCount: number;
  candidateCount: number; centerCount: number; schoolCount: number;
  scienceCount: number; socialScienceCount: number; pdfUrl: string; grades: GradeTotals;
};
type Summary = {
  year: string; candidateCount: number; pageCount: number; provinceCount: number; centerCount: number; schoolCount: number;
  grades: Array<{ grade: string; count: number }>;
  tracks: Array<{ track: string; count: number }>;
  provinces: ProvinceSummary[];
};
type Center = { name: string; label?: string; count: number };
type Student = {
  id: number; tableNumber: string; name: string; gender: string; school: string;
  examCenter: string; examCenterLabel?: string; grade: string; result: string; pageNumber: number;
  documentId: number; province: string; provinceId: string; track: string;
  subjectHeaders: string[]; subjects: string[];
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const NAME_IMAGE_VERSION = "6";
const SCHOOL_IMAGE_VERSION = "2";
const numberFormat = new Intl.NumberFormat("en-US");
const gradeKeys: Grade[] = ["A", "B", "C", "D", "E"];
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

const mapToArchive: Record<string, string> = {
  "banteay-meanchey": "banteaymeanchey", battambang: "battambang", "tboung-khmum": "tboungkhmum",
  "kampong-cham": "kampongcham", "kampong-chhnang": "kampongchhnang", "kampong-speu": "kampongspeu",
  "kampong-thom": "kampongthom", kampot: "kampot", kandal: "kandal", "koh-kong": "kohkong",
  kratie: "kratie", mondulkiri: "mondulkiri", "phnom-penh": "phnompenh", "preah-vihear": "preahvihear",
  "prey-veng": "preyveng", pursat: "pursat", rattanakkiri: "ratanakiri", "siem-reap": "siemreap",
  "preah-Sihanouk": "preahsihanouk", "stung-treng": "stungtreng", "svay-rieng": "svayrieng",
  takeo: "takeo", "oddar-meanchey": "oddarmeanchey", kep: "kep", pailin: "pailin",
};

const provinceEnglish: Record<string, string> = {
  phnompenh: "Phnom Penh", kandal: "Kandal", pailin: "Pailin", stungtreng: "Stung Treng", kohkong: "Koh Kong",
  oddarmeanchey: "Oddar Meanchey", preahvihear: "Preah Vihear", ratanakiri: "Ratanakiri", preahsihanouk: "Preah Sihanouk",
  kratie: "Kratie", pursat: "Pursat", svayrieng: "Svay Rieng", kampongchhnang: "Kampong Chhnang",
  kampongspeu: "Kampong Speu", kampot: "Kampot", tboungkhmum: "Tboung Khmum", kampongthom: "Kampong Thom",
  banteaymeanchey: "Banteay Meanchey", preyveng: "Prey Veng", kampongcham: "Kampong Cham", battambang: "Battambang",
  takeo: "Takeo", siemreap: "Siem Reap", kep: "Kep", mondulkiri: "Mondulkiri",
};

const copy = {
  en: {
    archive: "Results archive", brandName: "BacII Results Archive", facebookSearch: "Search", insightsMenu: "Insights", eyebrow: "Cambodia BacII data archive",
    title: "Explore BacII results by year and province.", intro: "Search the official published result lists and compare passing-candidate data across Cambodia.",
    year: "Archive year", candidates: "Passing candidates", provinces: "provinces & capital", centers: "exam centers", pages: "official PDF pages",
    mapTitle: "Passing candidates by province", mapHelp: "Select a province on the map to view its complete result dashboard.", allCambodia: "All Cambodia",
    searchTitle: "Find a student result", searchHelp: "For the most precise result, choose the province and exam center before entering the table number.",
    province: "Province / capital", allProvinces: "All provinces", center: "Exam center", allCenters: "All exam centers",
    track: "Track", allTracks: "All tracks", science: "Science", social: "Social science", table: "Table number", tableExample: "e.g. 41",
    search: "Search archive", searching: "Searching…", found: "result(s) found", noResults: "No student was found with these filters.",
    noResultsHelp: "Check the table number, or broaden the province, exam center, and track filters.", begin: "Enter a table number to search the archive.",
    grade: "Grade", school: "School", officialPage: "View official PDF page", page: "Page", subjectGrades: "Subject grades", shareResult: "Share result", shared: "Shared", linkCopied: "Link copied",
    officialName: "Name as printed in the official PDF",
    insights: "Archive insights", gradeDistribution: "Passing candidates by grade", trackDistribution: "Track distribution",
    provinceGrades: "Grades by province / capital", provinceGradesHelp: "Compare the exact number and grade distribution of passing candidates in every province and Phnom Penh.", total: "Total",
    sectionNav: "Archive sections", sectionMap: "Province map", sectionSearch: "Student search", sectionNational: "National insights", sectionProvinceGrades: "Grades by province",
    provinceDetails: "Province data", selectProvince: "Select a province to view its data", highSchools: "high schools", scienceCandidates: "Science candidates", socialCandidates: "Social science candidates", gradeBreakdown: "Grade breakdown", openProvincePdf: "Open official province PDF",
    loading: "Loading archive…", unavailable: "The archive is not available from this server.", sourceNote: "This archive contains candidates published as passing by MOEYS. It cannot be used to calculate pass rates without the full candidate totals.",
    nameNote: "Each name is rendered directly from its official PDF row, avoiding the document's broken Khmer text encoding.", mapCredit: "Cambodia map data",
  },
  km: {
    archive: "បណ្ណសារលទ្ធផល", brandName: "បណ្ណសារលទ្ធផល ប្រឡងសញ្ញាបត្រមធ្យមសិក្សាទុតិយភូមិ", facebookSearch: "ស្វែងរក", insightsMenu: "ទិន្នន័យវិភាគ", eyebrow: "បណ្ណសារទិន្នន័យបាក់ឌុបកម្ពុជា",
    title: "ស្វែងរកលទ្ធផលបាក់ឌុបតាមឆ្នាំ និងរាជធានី ខេត្ត", intro: "ស្វែងរកក្នុងបញ្ជីលទ្ធផលផ្លូវការ និងមើលទិន្នន័យបេក្ខជនជាប់នៅទូទាំងប្រទេសកម្ពុជា។",
    year: "ឆ្នាំលទ្ធផល", candidates: "បេក្ខជនជាប់", provinces: "រាជធានី និងខេត្ត", centers: "មណ្ឌលប្រឡង", pages: "ទំព័រ PDF ផ្លូវការ",
    mapTitle: "បេក្ខជនជាប់តាមរាជធានី ខេត្ត", mapHelp: "ចុចលើរាជធានី ឬខេត្ត ដើម្បីមើលទិន្នន័យលទ្ធផលទាំងអស់។", allCambodia: "កម្ពុជាទាំងមូល",
    searchTitle: "ស្វែងរកលទ្ធផលសិស្ស", searchHelp: "ដើម្បីបានលទ្ធផលត្រឹមត្រូវ សូមជ្រើសរើសរាជធានី ខេត្ត និងមណ្ឌលប្រឡង មុនបញ្ចូលលេខតុ។",
    province: "រាជធានី / ខេត្ត", allProvinces: "រាជធានី ខេត្តទាំងអស់", center: "មណ្ឌលប្រឡង", allCenters: "មណ្ឌលប្រឡងទាំងអស់",
    track: "ថ្នាក់", allTracks: "ថ្នាក់ទាំងអស់", science: "វិទ្យាសាស្ត្រ", social: "វិទ្យាសាស្ត្រសង្គម", table: "លេខតុ", tableExample: "ឧ. 41",
    search: "ស្វែងរក", searching: "កំពុងស្វែងរក…", found: "លទ្ធផល", noResults: "រកមិនឃើញសិស្សតាមលក្ខខណ្ឌនេះទេ។",
    noResultsHelp: "សូមពិនិត្យលេខតុ ឬសាកល្បងដកលក្ខខណ្ឌរាជធានី ខេត្ត មណ្ឌល និងថ្នាក់។", begin: "បញ្ចូលលេខតុដើម្បីស្វែងរកក្នុងបណ្ណសារ។",
    grade: "និទ្ទេស", school: "អាគតដ្ឋាន", officialPage: "មើលទំព័រ PDF ផ្លូវការ", page: "ទំព័រ", subjectGrades: "និទ្ទេសតាមមុខវិជ្ជា", shareResult: "ចែករំលែកលទ្ធផល", shared: "បានចែករំលែក", linkCopied: "បានចម្លងតំណភ្ជាប់",
    officialName: "ឈ្មោះដូចបានបោះពុម្ពក្នុង PDF ផ្លូវការ",
    insights: "ទិន្នន័យសង្ខេប", gradeDistribution: "បេក្ខជនជាប់តាមនិទ្ទេស", trackDistribution: "បេក្ខជនតាមថ្នាក់",
    provinceGrades: "និទ្ទេសតាមរាជធានី / ខេត្ត", provinceGradesHelp: "ប្រៀបធៀបចំនួន និងការបែងចែកនិទ្ទេសរបស់បេក្ខជនជាប់តាមរាជធានី ខេត្តនីមួយៗ។", total: "សរុប",
    sectionNav: "ផ្នែកនៃបណ្ណសារ", sectionMap: "ផែនទីរាជធានី ខេត្ត", sectionSearch: "ស្វែងរកសិស្ស", sectionNational: "ទិន្នន័យទូទាំងប្រទេស", sectionProvinceGrades: "និទ្ទេសតាមខេត្ត",
    provinceDetails: "ទិន្នន័យរាជធានី ខេត្ត", selectProvince: "ជ្រើសរើសរាជធានី ឬខេត្ត ដើម្បីមើលទិន្នន័យ", highSchools: "អាគតដ្ឋាន", scienceCandidates: "បេក្ខជនថ្នាក់វិទ្យាសាស្ត្រ", socialCandidates: "បេក្ខជនថ្នាក់វិទ្យាសាស្ត្រសង្គម", gradeBreakdown: "ចំនួនតាមនិទ្ទេស", openProvincePdf: "បើក PDF ផ្លូវការរបស់ខេត្ត",
    loading: "កំពុងផ្ទុកបណ្ណសារ…", unavailable: "មិនមានបណ្ណសារនៅលើម៉ាស៊ីនមេនេះទេ។", sourceNote: "បណ្ណសារនេះមានតែបេក្ខជនដែលក្រសួងបានប្រកាសថាជាប់។ មិនអាចគណនាអត្រាជាប់បានទេ បើគ្មានចំនួនបេក្ខជនសរុប។",
    nameNote: "ឈ្មោះនីមួយៗត្រូវបានបង្ហាញផ្ទាល់ពីជួរក្នុង PDF ផ្លូវការ ដើម្បីចៀសវាងបញ្ហាកូដអក្សរខ្មែរ។", mapCredit: "ទិន្នន័យផែនទីកម្ពុជា",
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

export default function ArchivePage() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState("");
  const [summary, setSummary] = useState<Summary>();
  const [province, setProvince] = useState("");
  const [center, setCenter] = useState("");
  const [track, setTrack] = useState<"" | Track>("");
  const [tableNumber, setTableNumber] = useState("");
  const [centers, setCenters] = useState<Center[]>([]);
  const [results, setResults] = useState<Student[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  function getInitialArchiveSection(): ArchiveSection {
    if (typeof window === "undefined") return "menu";
    const hash = window.location.hash;
    if (hash.includes("map")) return "archive-map";
    if (hash.includes("archive-search") || hash.includes("archive/search")) return "archive-search";
    if (hash.includes("insights")) return "archive-insights";
    if (hash.includes("grades") || hash.includes("province-grades") || hash.includes("provinces")) return "archive-province-grades";
    return "menu";
  }

  const [activeSection, setActiveSection] = useState<ArchiveSection>(getInitialArchiveSection);

  const selectSection = (sec: ArchiveSection) => {
    setActiveSection(sec);
    if (sec === "archive-map") window.location.hash = "#archive/map";
    else if (sec === "archive-search") window.location.hash = "#archive/search";
    else if (sec === "archive-insights") window.location.hash = "#archive/insights";
    else if (sec === "archive-province-grades") window.location.hash = "#archive/provinces";
    else window.location.hash = "#archive";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [shareFeedback, setShareFeedback] = useState<{ studentId: number; copied: boolean } | null>(null);
  const t = copy[language];

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.includes("map")) {
        setActiveSection("archive-map");
      } else if (hash.includes("archive-search") || hash.includes("archive/search")) {
        setActiveSection("archive-search");
      } else if (hash.includes("insights")) {
        setActiveSection("archive-insights");
      } else if (hash.includes("grades") || hash.includes("province-grades") || hash.includes("provinces")) {
        setActiveSection("archive-province-grades");
      } else if (hash === "#archive" || hash === "#archive/menu" || hash === "") {
        setActiveSection("menu");
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

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
      .then((data: { years: string[] }) => { setYears(data.years); setYear(data.years[0] || ""); })
      .catch(() => setError(t.unavailable));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!year) { setLoading(false); return; }
    setLoading(true); setError(""); setResults(null); setProvince(""); setCenter("");
    fetch(apiUrl(`/api/archive/${year}/summary`))
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data: Summary) => setSummary(data))
      .catch(() => setError(t.unavailable))
      .finally(() => setLoading(false));
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!year) return;
    const query = province ? `?province=${encodeURIComponent(province)}` : "";
    fetch(apiUrl(`/api/archive/${year}/centers${query}`))
      .then((response) => response.json()).then((data: { centers: Center[] }) => setCenters(data.centers || []))
      .catch(() => setCenters([]));
  }, [year, province]);

  const provinceById = useMemo(() => new Map(summary?.provinces.map((item) => [item.id, item]) || []), [summary]);
  const selectedProvince = province ? provinceById.get(province) : undefined;
  const maxProvinceCount = Math.max(1, ...(summary?.provinces.map((item) => item.candidateCount) || [1]));
  const maxGradeCount = Math.max(1, ...(summary?.grades.map((item) => item.count) || [1]));
  const nationalGrades = Object.fromEntries(gradeKeys.map((grade) => [grade, summary?.grades.find((item) => item.grade === grade)?.count || 0])) as GradeTotals;
  const nationalScienceCount = summary?.tracks.find((item) => item.track === "science")?.count || 0;
  const nationalSocialCount = summary?.tracks.find((item) => item.track === "social-science")?.count || 0;

  function provinceLabel(item: ProvinceSummary) {
    return language === "km" ? item.name : provinceEnglish[item.id] || item.name;
  }
  function centerLabel(item: Center) {
    return item.label || item.name;
  }
  function subjectLabel(student: Student, index: number) {
    const labels = student.track === "science" ? subjectLabels[language].science : subjectLabels[language].social;
    return labels[index] || student.subjectHeaders[index] || `${t.subjectGrades} ${index + 1}`;
  }
  function studentPdfUrl(student: Student) {
    return `${new URL(apiUrl(`/api/archive/${year}/documents/${student.documentId}/view?page=${student.pageNumber}`), window.location.origin)}`;
  }
  async function shareStudent(student: Student) {
    const url = studentPdfUrl(student);
    const title = `${t.archive} · #${student.tableNumber}`;
    const text = `${provinceEnglish[student.provinceId] || student.province} · ${t.grade} ${student.grade}`;
    try {
      const copied = !navigator.share;
      if (navigator.share) await navigator.share({ title, text, url }); else await navigator.clipboard.writeText(url);
      setShareFeedback({ studentId: student.id, copied });
      window.setTimeout(() => setShareFeedback((current) => current?.studentId === student.id ? null : current), 2200);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareFeedback({ studentId: student.id, copied: true });
        window.setTimeout(() => setShareFeedback((current) => current?.studentId === student.id ? null : current), 2200);
      } catch { /* The browser does not expose sharing or clipboard access. */ }
    }
  }
  function chooseProvince(id: string) {
    setProvince((current) => current === id ? "" : id); setCenter(""); setResults(null);
  }
  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!tableNumber.trim() || !year) return;
    setSearching(true); setError("");
    const params = new URLSearchParams({ tableNumber: tableNumber.trim() });
    if (province) params.set("province", province);
    if (center) params.set("center", center);
    if (track) params.set("track", track);
    try {
      const response = await fetch(apiUrl(`/api/archive/${year}/search?${params}`));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      setResults(data.results || []);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed.");
    } finally { setSearching(false); }
  }

  return (
    <main className="archive-page">
      <nav className="nav site-header shell">
        <a className="brand" href="#archive">
          <span className="brand-mark"><GraduationCap size={24} strokeWidth={2.3} /></span>
          <span className="brand-text">
            <span className="brand-title">{language === "km" ? "បណ្ណសារលទ្ធផល" : "BacII Results"}</span>
            <span className="brand-subtitle">{language === "km" ? "ប្រឡងសញ្ញាបត្រមធ្យមសិក្សាទុតិយភូមិ" : "National Examination Archive"}</span>
          </span>
        </a>
        <div className="site-header-right">
          <div className="primary-nav">
            <a href="#top" aria-label={t.facebookSearch}><Search size={18} /><span>{t.facebookSearch}</span></a>
            <a className="active" href="#archive" aria-current="page" aria-label={t.archive}><Archive size={18} /><span>{t.archive}</span></a>
            <a href="#insights" aria-label={t.insightsMenu}><BarChart3 size={18} /><span>{t.insightsMenu}</span></a>
          </div>
          <div className="header-actions">
          <button type="button" className="language-toggle" onClick={() => setLanguage(language === "en" ? "km" : "en")}><Languages size={15} /> {language === "en" ? "ខ្មែរ" : "EN"}</button>
          <button type="button" className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </div>
      </nav>

      {loading ? (
        <div className="archive-state shell"><LoaderCircle className="spin" /> {t.loading}</div>
      ) : error && !summary ? (
        <div className="archive-state error-banner shell">{error}</div>
      ) : summary && (
        <>
          {activeSection === "menu" ? (
            <section className="search-hub-landing shell" id="top">
              <div className="search-hub-intro">
                <h1>{t.title}</h1>
                <p>{t.intro}</p>
              </div>

              <div className="search-menu-cards-grid" style={{ maxWidth: 960, margin: "0 auto" }}>
                <button type="button" className="search-menu-card" onClick={() => selectSection("archive-map")}>
                  <div className="search-menu-card-icon" style={{ background: "rgba(14, 165, 233, 0.12)", color: "#0284c7" }}>
                    <MapPin size={26} />
                  </div>
                  <div className="search-menu-card-body">
                    <div className="search-menu-card-header">
                      <h3>{t.sectionMap}</h3>
                      <span className="search-menu-badge">{language === "km" ? "ផែនទីអន្តរកម្ម" : "Interactive Map"}</span>
                    </div>
                    <p>{language === "km" ? "មើលចំនួនបេក្ខជនជាប់ និងស្ថិតិតាមរាជធានី-ខេត្តទាំង ២៥ លើផែនទីប្រទេសកម្ពុជា។" : "Interactive map to inspect candidate pass counts and breakdown across all provinces."}</p>
                    <div className="search-menu-action-row" style={{ color: "#0284c7" }}>
                      <span>{language === "km" ? "បើកផែនទី" : "Open map"}</span>
                      <div className="search-menu-arrow"><ArrowRight size={16} /></div>
                    </div>
                  </div>
                </button>

                <button type="button" className="search-menu-card" onClick={() => selectSection("archive-search")}>
                  <div className="search-menu-card-icon" style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--green)" }}>
                    <Search size={26} />
                  </div>
                  <div className="search-menu-card-body">
                    <div className="search-menu-card-header">
                      <h3>{t.sectionSearch}</h3>
                      <span className="search-menu-badge">{language === "km" ? "ស្វែងរកសិស្ស" : "Student Search"}</span>
                    </div>
                    <p>{language === "km" ? "ស្វែងរកតាមលេខតុ ឈ្មោះ ថ្នាក់ និងរាជធានី-ខេត្ត រួមជាមួយការបើកមើលទំព័រ PDF ផ្លូវការ។" : "Filter by table number, student name, province, exam center, and view official PDF rows."}</p>
                    <div className="search-menu-action-row">
                      <span>{language === "km" ? "បើកការស្វែងរក" : "Open search"}</span>
                      <div className="search-menu-arrow"><ArrowRight size={16} /></div>
                    </div>
                  </div>
                </button>

                <button type="button" className="search-menu-card" onClick={() => selectSection("archive-insights")}>
                  <div className="search-menu-card-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#d97706" }}>
                    <BarChart3 size={26} />
                  </div>
                  <div className="search-menu-card-body">
                    <div className="search-menu-card-header">
                      <h3>{t.sectionNational}</h3>
                      <span className="search-menu-badge">{language === "km" ? "និទ្ទេសទូទាំងប្រទេស" : "National Insights"}</span>
                    </div>
                    <p>{language === "km" ? "ស្ថិតិបែងចែកនិទ្ទេស A–E និងការប្រៀបធៀបរវាងថ្នាក់វិទ្យាសាស្ត្រ និងវិទ្យាសាស្ត្រសង្គម។" : "National grade distribution (A to E) and comparison between Science and Social tracks."}</p>
                    <div className="search-menu-action-row" style={{ color: "#d97706" }}>
                      <span>{language === "km" ? "មើលទិន្នន័យ" : "View insights"}</span>
                      <div className="search-menu-arrow"><ArrowRight size={16} /></div>
                    </div>
                  </div>
                </button>

                <button type="button" className="search-menu-card" onClick={() => selectSection("archive-province-grades")}>
                  <div className="search-menu-card-icon" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#7c3aed" }}>
                    <GraduationCap size={26} />
                  </div>
                  <div className="search-menu-card-body">
                    <div className="search-menu-card-header">
                      <h3>{t.sectionProvinceGrades}</h3>
                      <span className="search-menu-badge">{language === "km" ? "តារាងតាមខេត្ត" : "By Province"}</span>
                    </div>
                    <p>{language === "km" ? "ប្រៀបធៀបចំនួនសិស្សជាប់ និងការបែងចែកនិទ្ទេស A ដល់ E តាមរាជធានី-ខេត្តនីមួយៗ។" : "Detailed comparison table showing candidate counts and grade breakdown per province."}</p>
                    <div className="search-menu-action-row" style={{ color: "#7c3aed" }}>
                      <span>{language === "km" ? "មើលតារាង" : "View table"}</span>
                      <div className="search-menu-arrow"><ArrowRight size={16} /></div>
                    </div>
                  </div>
                </button>
              </div>
            </section>
          ) : (
            <div className="tool-full-view shell" id="top">
              <nav className="text-breadcrumb-nav" aria-label="Breadcrumb">
                <div className="breadcrumb-trail">
                  <button
                    type="button"
                    className="breadcrumb-item-link"
                    onClick={() => selectSection("menu")}
                  >
                    <Archive size={14} />
                    <span>{t.archive}</span>
                  </button>

                  <span className="breadcrumb-arrow">
                    <ChevronRight size={14} />
                  </span>

                  <span className="breadcrumb-item-current">
                    {activeSection === "archive-map" ? t.sectionMap
                      : activeSection === "archive-search" ? t.sectionSearch
                      : activeSection === "archive-insights" ? t.sectionNational
                      : t.sectionProvinceGrades}
                  </span>
                </div>

                <div className="breadcrumb-year-badge">
                  <Calendar size={13} />
                  <span>{t.year}:</span>
                  <select
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                    aria-label={t.year}
                  >
                    {years.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </nav>

              {activeSection === "archive-map" && (
                <div className="archive-tab-panel" role="tabpanel">
        <section className="archive-stats shell" aria-label="Archive summary">
          <article><Users /><strong>{numberFormat.format(summary.candidateCount)}</strong><span>{t.candidates}</span></article>
          <article><MapPin /><strong>{summary.provinceCount}</strong><span>{t.provinces}</span></article>
          <article><GraduationCap /><strong>{numberFormat.format(summary.centerCount)}</strong><span>{t.centers}</span></article>
          <article><BookOpen /><strong>{numberFormat.format(summary.pageCount)}</strong><span>{t.pages}</span></article>
        </section>

        <section id="archive-map" className="archive-map-section shell">
          <div className="archive-section-head"><div><span className="section-kicker">{year} · {t.insights}</span><h2>{t.mapTitle}</h2><p>{t.mapHelp}</p></div><button type="button" onClick={() => chooseProvince("")} className={!province ? "active" : ""}>{t.allCambodia}</button></div>
          <div className="map-layout">
            <div className="cambodia-map-wrap">
              <svg className="cambodia-map" viewBox={cambodia.viewBox} role="img" aria-label={t.mapTitle}>
                {cambodia.locations.map((location: { id: string; name: string; path: string }) => {
                  const archiveId = mapToArchive[location.id];
                  const item = provinceById.get(archiveId);
                  const intensity = item ? .16 + (item.candidateCount / maxProvinceCount) * .84 : .08;
                  return <path key={location.id} d={location.path} className={province === archiveId ? "selected" : ""} style={{ "--map-intensity": intensity } as React.CSSProperties}
                    tabIndex={0} role="button" aria-label={`${item ? provinceLabel(item) : location.name}: ${numberFormat.format(item?.candidateCount || 0)}`}
                    onClick={() => archiveId && chooseProvince(archiveId)} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && archiveId) chooseProvince(archiveId); }}>
                    <title>{item ? `${provinceLabel(item)} — ${numberFormat.format(item.candidateCount)}` : location.name}</title>
                  </path>;
                })}
              </svg>
              <div className="map-legend"><span>0</span><i /><span>{numberFormat.format(maxProvinceCount)}</span></div>
            </div>
            <div className="province-panel" aria-live="polite">
              <div className="province-highlight">
                <span>{selectedProvince ? t.provinceDetails : t.selectProvince}</span>
                <h3>{selectedProvince ? provinceLabel(selectedProvince) : t.allCambodia}</h3>
                <strong>{numberFormat.format(selectedProvince?.candidateCount ?? summary.candidateCount)}</strong>
                <small>{t.candidates}</small>
              </div>
              <div className="province-metric-grid">
                <div><GraduationCap /><span>{t.centers}</span><strong>{numberFormat.format(selectedProvince?.centerCount ?? summary.centerCount)}</strong></div>
                <div><School /><span>{t.highSchools}</span><strong>{numberFormat.format(selectedProvince?.schoolCount ?? summary.schoolCount)}</strong></div>
                <div><Users /><span>{t.scienceCandidates}</span><strong>{numberFormat.format(selectedProvince?.scienceCount ?? nationalScienceCount)}</strong></div>
                <div><Users /><span>{t.socialCandidates}</span><strong>{numberFormat.format(selectedProvince?.socialScienceCount ?? nationalSocialCount)}</strong></div>
                <div><BookOpen /><span>{t.pages}</span><strong>{numberFormat.format(selectedProvince?.pageCount ?? summary.pageCount)}</strong></div>
              </div>
              <div className="province-grade-summary">
                <span>{t.gradeBreakdown}</span>
                <div>{gradeKeys.map((grade) => {
                  const count = (selectedProvince?.grades ?? nationalGrades)[grade];
                  const total = selectedProvince?.candidateCount ?? summary.candidateCount;
                  return <div key={grade} className={`grade-${grade.toLowerCase()}`}><b>{grade}</b><strong>{numberFormat.format(count)}</strong><small>{total ? ((count / total) * 100).toFixed(1) : "0.0"}%</small></div>;
                })}</div>
              </div>
              {selectedProvince && <a className="province-pdf-link" href={apiUrl(`/api/archive/${year}/documents/${selectedProvince.documentId}/view?page=1`)} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {t.openProvincePdf}</a>}
            </div>
          </div>
        </section>
        </div>)}

        {activeSection === "archive-search" && (
          <section id="archive-search" className="archive-search archive-tab-panel shell" role="tabpanel">
            <ArchiveSearchPanel language={language} initialYear={year} onYearChange={setYear} showHeader={true} />
          </section>
        )}

        {activeSection === "archive-insights" && <section id="archive-insights" className="archive-insights archive-tab-panel shell" role="tabpanel">
          <article><div className="insight-title"><BarChart3 /><div><span className="section-kicker">{t.insights}</span><h2>{t.gradeDistribution}</h2></div></div><div className="bar-chart">{summary.grades.filter((item) => item.grade !== "Unknown").map((item) => <div key={item.grade}><b>{item.grade}</b><span><i style={{ width: `${(item.count / maxGradeCount) * 100}%` }} /></span><strong>{numberFormat.format(item.count)}</strong></div>)}</div></article>
          <article><div className="insight-title"><GraduationCap /><div><span className="section-kicker">{year}</span><h2>{t.trackDistribution}</h2></div></div><div className="track-insights">{summary.tracks.filter((item) => item.track !== "unknown").map((item) => <div key={item.track}><span>{item.track === "science" ? t.science : t.social}</span><strong>{numberFormat.format(item.count)}</strong></div>)}</div></article>
        </section>}

        {activeSection === "archive-province-grades" && <section id="archive-province-grades" className="province-grades archive-tab-panel shell" role="tabpanel">
          <div className="archive-section-head"><div><span className="section-kicker">{year} · {t.insights}</span><h2>{t.provinceGrades}</h2><p>{t.provinceGradesHelp}</p></div></div>
          <div className="province-grade-legend" aria-label="Grade legend">{gradeKeys.map((grade) => <span key={grade} className={`grade-${grade.toLowerCase()}`}><i /> {grade}</span>)}</div>
          <div className="province-grade-scroll">
            <div className="province-grade-table" role="table" aria-label={t.provinceGrades}>
              <div className="province-grade-row province-grade-head" role="row">
                <span role="columnheader">{t.province}</span><span role="columnheader">{t.gradeDistribution}</span>
                {gradeKeys.map((grade) => <b key={grade} role="columnheader">{grade}</b>)}<b role="columnheader">{t.total}</b>
              </div>
              {summary.provinces.map((item) => (
                <div className="province-grade-row" role="row" key={item.id}>
                  <strong role="cell">{provinceLabel(item)}</strong>
                  <span className="province-grade-stack" role="cell" aria-label={`${provinceLabel(item)} grade distribution`}>
                    {gradeKeys.map((grade) => <i key={grade} className={`grade-${grade.toLowerCase()}`} style={{ width: `${item.candidateCount ? (item.grades[grade] / item.candidateCount) * 100 : 0}%` }} title={`${grade}: ${numberFormat.format(item.grades[grade])}`} />)}
                  </span>
                  {gradeKeys.map((grade) => <span className="province-grade-value" role="cell" key={grade}>{numberFormat.format(item.grades[grade])}</span>)}
                  <b className="province-grade-total" role="cell">{numberFormat.format(item.candidateCount)}</b>
                </div>
              ))}
            </div>
          </div>
        </section>}
      </div>
    )}

        <SiteFooter language={language} />
      </>)}
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav currentRoute="archive" language={language} />
    </main>
  );
}
