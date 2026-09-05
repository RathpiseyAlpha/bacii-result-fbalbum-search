import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import cambodia from "@svg-maps/cambodia";
import phnomPenhSvg from "./data/phnomPenhSvg.json";
import {
  Archive,
  Atom,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  Calendar,
  ChevronDown,
  ChevronUp,
  Compass,
  Dna,
  ExternalLink,
  FileText,
  Flame,
  FlaskConical,
  Globe,
  GraduationCap,
  History,
  Images,
  Languages,
  LayoutGrid,
  MapPin,
  Moon,
  Scale,
  School,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Table as TableIcon,
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
type TabMode = "overview" | "schools" | "heatmap" | "subjects" | "students";

type StudentSubjectGrade = {
  key: string;
  nameKm: string;
  grade: string;
};

type ArchiveStudentItem = {
  id: number;
  tableNumber: number;
  name: string;
  nameImage: string;
  gender: string;
  genderLabel: string;
  school: string;
  schoolBaseName: string;
  schoolBranch?: string;
  schoolType: "public" | "private";
  schoolImage: string;
  province: string;
  provinceId: string;
  examCenter: string;
  track: "science" | "social-science";
  trackLabel: string;
  grade: string;
  aCount: number;
  subjects: StudentSubjectGrade[];
  pageNumber: number;
  documentId: number;
  pdfFileName: string;
};

type StudentStats = {
  totalCandidates: number;
  passedCount: number;
  passRate: number;
  gradeACount: number;
  straightACount: number;
  femaleTotal: number;
  femalePercent: number;
  maleTotal: number;
  malePercent: number;
  femaleStraightA: number;
  maleStraightA: number;
  femaleGradeA: number;
  maleGradeA: number;
  scienceCandidates: number;
  socialCandidates: number;
  scienceGradeA: number;
  socialGradeA: number;
  scienceStraightA: number;
  socialStraightA: number;
  aCountDistribution: Array<{ aCount: number; count: number; scienceCount: number; socialCount: number }>;
  gradeDistribution: Array<{ grade: string; count: number }>;
  topStraightAProvinces: Array<{ id: string; name: string; count: number }>;
  topStraightASchools: Array<{ name: string; schoolType: "public" | "private"; province: string; count: number }>;
  publicVsPrivateStraightA: { public: number; private: number };
};

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
  scienceCount: number;
  socialScienceCount: number;
  gradeA: number;
  gradeAScience?: number;
  gradeASocial?: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeE: number;
  grades: Record<Grade, number>;
};

type Summary = {
  year: string;
  candidateCount: number;
  provinceCount: number;
  centerCount: number;
  schoolCount: number;
  pageCount: number;
  grades: Array<{ grade: string; count: number }>;
  gradeTrackBreakdown?: Record<string, { science: number; social: number; total: number }>;
  provinces: ProvinceSummary[];
};

type PhnomPenhDistrictStats = {
  id: string;
  nameKm: string;
  nameEn: string;
  schoolsCount: number;
  candidateCount: number;
  gradeA: number;
  gradeAScience?: number;
  gradeASocial?: number;
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
};

const KHAN_SVG_DATA = phnomPenhSvg.locations.map((loc) => ({
  id: loc.id,
  nameKm: loc.nameKm,
  nameEn: loc.nameEn,
  path: loc.path,
  cx: loc.center[0],
  cy: loc.center[1],
}));

type SchoolBranchItem = {
  name: string;
  branch?: string;
  schoolType?: "public" | "private";
  khan?: string;
  khanId?: string;
  sampleStudentId: number;
  province: string;
  provinceId?: string;
  candidateCount: number;
  femaleCount: number;
  scienceCount?: number;
  socialCount?: number;
  gradeA: number;
  gradeAScience?: number;
  gradeASocial?: number;
  gradeB?: number;
  gradeC?: number;
  gradeD?: number;
  gradeE?: number;
  grades: Record<Grade, number>;
  gradeAPercent: number;
  passRate: number;
};

type SchoolAnalysis = {
  name: string;
  branch?: string;
  branchCount?: number;
  branches?: SchoolBranchItem[];
  schoolType?: "public" | "private";
  khan?: string;
  khanId?: string;
  province: string;
  provinceId?: string;
  candidateCount: number;
  femaleCount: number;
  scienceCount: number;
  socialCount: number;
  gradeA?: number;
  gradeAScience?: number;
  gradeASocial?: number;
  grades: Record<Grade, number>;
  gradeAPercent: number;
  passRate?: number;
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
  branch?: string;
  schoolType?: "public" | "private";
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
    tabOverview: "National Overview",
    tabSchools: "High Schools",
    tabHeatmap: "Geo-Heatmap",
    tabSubjects: "Subject Analysis",
    capitalMapTitle: "Phnom Penh Capital & Nationwide Geo-Heatmap",
    capitalMapSubtitle: "Interactive geographic distribution of high schools across Phnom Penh's 14 modern Khans and all 25 provinces.",
    viewPhnomPenh: "Phnom Penh (14 Khans)",
    viewProvinces: "Nationwide (25 Provinces)",
    heatmapMetric: "Heatmap Metric",
    heatGradeA: "Overall Grade A",
    heatCandidates: "Candidate Density",
    heatScienceRatio: "Science Share",
    heatSchools: "School Count",
    filterByKhan: "Filter high schools by this Khan",
    clearKhanFilter: "All Khans",
    allKhans: "All Khans",
    selectKhan: "Select Khan",
    scienceTrackShort: "Science",
    socialTrackShort: "Social",
    newBadge: "New",
    year: "Data year", metric: "Trend metric", candidates: "Passing candidates", centers: "Exam centers", schools: "High schools", pages: "Official pages", provinces: "provinces & capital",
    nationalSnapshot: "National results snapshot", gradeMix: "National Overall BacII Grade Distribution (A, B, C, D, E)", annualTrend: "Year-over-year trend",
    provinceRanking: "Province / capital ranking", rankHelp: "Ranked using the selected trend metric for the chosen year.",
    schoolAnalysis: "High school analysis",
    schoolAnalysisSubtitle: "Passing candidates, gender representation, and overall grade distributions across high schools.",
    gradeAChampions: "Overall Grade A Champions",
    gradeAChampionsHelp: "High schools with the highest number of candidates passing with Overall Grade A.",
    gradeATrackBreakdown: "Overall Grade A by Study Track",
    gradeATrackBreakdownSub: "Distribution of Grade A candidates between Science and Social tracks",
    overallGradeNotice: "Overall Exam Grade (combines all 7 subjects)",
    allSchoolsExplorer: "High school performance & overall grade mix",
    searchSchoolPlaceholder: "Search high school name…",
    allProvinces: "All provinces / capital",
    sortBy: "Sort by",
    sortGradeA: "Most Overall Grade A",
    sortGradeAPercent: "Highest Overall Grade A %",
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
    // UI Enhancements & Compact Table Strings
    viewMode: "View",
    viewTable: "Compact table",
    viewCards: "Card view",
    togglePodiumHide: "Hide podium",
    togglePodiumShow: "Show podium",
    colRank: "#",
    colSchool: "High School (អាគតដ្ឋាន)",
    colProvince: "Province",
    colCandidates: "Candidates",
    colFemale: "Female",
    colTrack: "Track mix",
    colGradeA: "Overall Grade A",
    colPassRate: "Pass rate",
    colGradeDistribution: "Overall BacII Grades (A–E)",
    colSubjectDistribution: "Subject grades (A–F)",
    subjectDifficultyTitle: "Subject Difficulty Index",
    subjectDifficultySubtitle: "Comparative ranking of subjects by failure rate (Grade F) vs. Grade A yield",
    hardestSubject: "Most Challenging",
    easiestSubject: "Highest Scoring",
    gradeFRate: "Grade F rate",
    gradeAPct: "Grade A rate",
    subjectSelected: "Selected",
    schoolType: "High School Type",
    typeAll: "All High Schools",
    typePublic: "Public High Schools",
    typePrivate: "Private High Schools",
    typePublicShort: "Public",
    typePrivateShort: "Private",
    compareTitle: "Public vs. Private High Schools Comparison",
    compareSubtitle: "Comparative breakdown of candidates, Grade A yield, and gender balance between public and private high schools",
    publicShare: "Public High Schools",
    privateShare: "Private High Schools",
    schoolsCountLabel: "schools",
    candidatesShare: "of candidates",
    gradeAShare: "of national Grade A",
    passRateLabel: "Pass rate (A–E)",
    gradeARateLabel: "Grade A rate",
    femaleRatioLabel: "Female candidates",
    // Student Analysis & Straight A
    tabStudents: "Students & Straight A",
    straightABadgeGeneric: "⭐ Straight A",
    studentAnalysisTitle: "Student Performance & Straight A (7/7 As) Analysis",
    studentAnalysisSubtitle: "In-depth candidate intelligence, gender metrics, and full roster of candidates nationwide who achieved Grade A across all 7 subjects.",
    kpiStraightA: "Straight A Achievers (7/7 A)",
    kpiStraightASub: "All subjects passed with Grade A across Science and Social tracks",
    kpiTotalCandidates: "Total Passing Candidates",
    kpiTotalCandidatesSub: "Official published passing cohort",
    kpiGradeAAll: "Overall Grade A Candidates",
    kpiGradeAAllSub: "National total achieving Grade A overall",
    kpiPublicVsPrivate: "Straight A: Public vs Private",
    kpiPublicVsPrivateSub: "Distribution of straight A achievers between public and private high schools",
    aCountBreakdownTitle: "Grade A Distribution (By Number of As Achieved)",
    aCountBreakdownSub: "Breakdown of candidates by the number of Grade A subjects they earned (from 1 up to all 7)",
    topStraightAProvinces: "Top Provinces for Straight A",
    topStraightASchools: "Top High Schools for Straight A",
    straightAExplorationTitle: "Straight A & Grade A Student Explorer",
    straightAExplorationSub: "Browse official names (PDF crops), desk numbers, schools, and individual subject grades for top candidates",
    filterByACount: "Grade A Count",
    chip7As: "⭐ Straight A (7 As)",
    chip6As: "6 As",
    chip5As: "5 As",
    chip4As: "4 As",
    chip3As: "3 As",
    chip2As: "2 As",
    chip1A: "1 A",
    chipAllA: "All Grade A",
    searchStudentPlaceholder: "Search desk #, school name, exam center, province…",
    allTracks: "All Tracks",
    allGenders: "All Genders",
    genderFemale: "Female",
    genderMale: "Male",
    viewOfficialPdf: "View PDF Result",
    noStudentsFound: "No candidates found matching your criteria.",
    showingStudentsCount: (shown: number, total: number) => `Showing ${shown} of ${total} students`,
    studentCardTableNum: "Desk #",
    studentCardCenter: "Exam Center",
    studentCardSchool: "High School",
    studentCardProvince: "Province",
    studentSubjectsBreakdown: "Subject Grades (7 Subjects)",
    straightARibbon: "⭐ STRAIGHT A (7/7 A)",
  },
  km: {
    brand: "ប្រព័ន្ធស្វែងរកលទ្ធផលបាក់ឌុប", facebook: "ស្វែងរកតាម Facebook", archive: "បណ្ណសារលទ្ធផល", insights: "ទិន្នន័យវិភាគ",
    eyebrow: "ផ្ទាំងវិភាគទិន្នន័យបាក់ឌុប", title: "ស្វែងយល់ពីទិន្នន័យនៅពីក្រោយលទ្ធផល",
    intro: "មើលទម្រង់និទ្ទេស ប្រៀបធៀបរាជធានី ខេត្ត និងតាមដាននិន្នាការទូទាំងប្រទេស នៅពេលបន្ថែមទិន្នន័យឆ្នាំថ្មី។",
    tabOverview: "ទិដ្ឋភាពទូទៅទូទាំងប្រទេស",
    tabSchools: "វិភាគតាមអាគតដ្ឋាន",
    tabHeatmap: "ផែនទីកម្ដៅ",
    tabSubjects: "វិភាគតាមមុខវិជ្ជា",
    capitalMapTitle: "ផែនទីទីតាំង និងកម្តៅទិន្នន័យ (រាជធានីភ្នំពេញ / ទូទាំងប្រទេស)",
    capitalMapSubtitle: "ការបែងចែកភូមិសាស្ត្រនៃអាគតដ្ឋានទូទាំង ១៤ ខណ្ឌ នៃរាជធានីភ្នំពេញ និង ២៥ រាជធានី-ខេត្ត",
    viewPhnomPenh: "រាជធានីភ្នំពេញ (១៤ ខណ្ឌ)",
    viewProvinces: "ទូទាំងប្រទេស (២៥ រាជធានី-ខេត្ត)",
    heatmapMetric: "កម្រិតកម្តៅទិន្នន័យ",
    heatGradeA: "និទ្ទេសរួម A",
    heatCandidates: "ចំនួនបេក្ខជន",
    heatScienceRatio: "សមាមាត្រវិទ្យាសាស្ត្រ",
    heatSchools: "ចំនួនអាគតដ្ឋាន",
    filterByKhan: "ចម្រាញ់យកអាគតដ្ឋានក្នុងខណ្ឌនេះ",
    clearKhanFilter: "ខណ្ឌទាំងអស់",
    allKhans: "ខណ្ឌទាំងអស់",
    selectKhan: "ជ្រើសរើសខណ្ឌ",
    scienceTrackShort: "វិទ្យាសាស្ត្រ",
    socialTrackShort: "សង្គម",
    newBadge: "ថ្មី",
    year: "ឆ្នាំទិន្នន័យ", metric: "ទិន្នន័យសម្រាប់និន្នាការ", candidates: "បេក្ខជនជាប់", centers: "មណ្ឌលប្រឡង", schools: "អាគតដ្ឋាន", pages: "ទំព័រផ្លូវការ", provinces: "រាជធានី និងខេត្ត",
    nationalSnapshot: "ទិន្នន័យសង្ខេបលទ្ធផលទូទាំងប្រទេស", gradeMix: "ការបែងចែកនិទ្ទេសរួមនៃការប្រឡងបាក់ឌុប (A, B, C, D, E)", annualTrend: "និន្នាការពីមួយឆ្នាំទៅមួយឆ្នាំ",
    provinceRanking: "ចំណាត់ថ្នាក់រាជធានី ខេត្ត", rankHelp: "រៀបតាមទិន្នន័យដែលបានជ្រើសរើស សម្រាប់ឆ្នាំដែលបានជ្រើសរើស។",
    schoolAnalysis: "វិភាគតាមអាគតដ្ឋាន",
    schoolAnalysisSubtitle: "ស្ថិតិបេក្ខជនជាប់ ភេទ និងការបែងចែកនិទ្ទេសរួមតាមអាគតដ្ឋាននីមួយៗ",
    gradeAChampions: "អាគតដ្ឋានឆ្នើម (និទ្ទេសរួម A ច្រើនបំផុត)",
    gradeAChampionsHelp: "អាគតដ្ឋានដែលមានបេក្ខជនទទួលបាននិទ្ទេសរួម A ច្រើនជាងគេទូទាំងប្រទេស។",
    gradeATrackBreakdown: "និទ្ទេសរួម A តាមផ្នែកសិក្សា (វិទ្យាសាស្ត្រ vs សង្គម)",
    gradeATrackBreakdownSub: "ការបែងចែកបេក្ខជននិទ្ទេសរួម A រវាងថ្នាក់វិទ្យាសាស្ត្រ និងថ្នាក់វិទ្យាសាស្ត្រសង្គម",
    overallGradeNotice: "និទ្ទេសរួមនៃការប្រឡងបាក់ឌុប (គិតលើពិន្ទុរួមបញ្ចូលគ្នានៃមុខវិជ្ជាទាំង ៧)",
    allSchoolsExplorer: "តារាងចំណាត់ថ្នាក់ និងសមាមាត្រនិទ្ទេសរួមតាមអាគតដ្ឋាន",
    searchSchoolPlaceholder: "ស្វែងរកឈ្មោះអាគតដ្ឋាន…",
    allProvinces: "រាជធានី ខេត្តទាំងអស់",
    sortBy: "តម្រៀបតាម",
    sortGradeA: "និទ្ទេសរួម A ច្រើនបំផុត",
    sortGradeAPercent: "ភាគរយនិទ្ទេសរួម A (%)",
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
    // UI Enhancements & Compact Table Strings
    viewMode: "ទម្រង់បង្ហាញ",
    viewTable: "តារាងសង្ខេប",
    viewCards: "កាតលម្អិត",
    togglePodiumHide: "លាក់ផ្ទាំងឆ្នើម",
    togglePodiumShow: "បង្ហាញផ្ទាំងឆ្នើម",
    colRank: "ល.រ",
    colSchool: "អាគតដ្ឋាន",
    colProvince: "រាជធានី/ខេត្ត",
    colCandidates: "បេក្ខជន",
    colFemale: "នារី",
    colTrack: "សមាមាត្រថ្នាក់",
    colGradeA: "និទ្ទេសរួម A",
    colPassRate: "អត្រាជាប់ (A–E)",
    colGradeDistribution: "និទ្ទេសរួមនៃការប្រឡង (A–E)",
    colSubjectDistribution: "សមាមាត្រនិទ្ទេស (A–F)",
    subjectDifficultyTitle: "សន្ទស្សន៍កម្រិតលំបាកតាមមុខវិជ្ជា",
    subjectDifficultySubtitle: "ការប្រៀបធៀបកម្រិតលំបាកនៃមុខវិជ្ជានីមួយៗ តាមរយៈអត្រានិទ្ទេស F និងនិទ្ទេស A",
    hardestSubject: "មុខវិជ្ជាពិបាកជាងគេ",
    easiestSubject: "មុខវិជ្ជាពិន្ទុខ្ពស់ជាងគេ",
    gradeFRate: "អត្រានិទ្ទេស F",
    gradeAPct: "អត្រានិទ្ទេស A",
    subjectSelected: "បានជ្រើសរើស",
    schoolType: "ប្រភេទអាគតដ្ឋាន",
    typeAll: "អាគតដ្ឋានទាំងអស់",
    typePublic: "អាគតដ្ឋានរដ្ឋ",
    typePrivate: "អាគតដ្ឋានឯកជន",
    typePublicShort: "រដ្ឋ",
    typePrivateShort: "ឯកជន",
    compareTitle: "ការប្រៀបធៀបរវាងអាគតដ្ឋានរដ្ឋ និងអាគតដ្ឋានឯកជន",
    compareSubtitle: "ការប្រៀបធៀបសមាមាត្របេក្ខជន និទ្ទេស A និងសមាមាត្រយេនឌ័រ រវាងអាគតដ្ឋានរដ្ឋ និងអាគតដ្ឋានឯកជន",
    publicShare: "អាគតដ្ឋានរដ្ឋ",
    privateShare: "អាគតដ្ឋានឯកជន",
    schoolsCountLabel: "អាគតដ្ឋាន",
    candidatesShare: "នៃបេក្ខជនសរុប",
    gradeAShare: "នៃនិទ្ទេស A សរុប",
    passRateLabel: "អត្រាជាប់ (A–E)",
    gradeARateLabel: "អត្រានិទ្ទេស A",
    femaleRatioLabel: "សមាមាត្រនារី",
    // Student Analysis & Straight A
    tabStudents: "វិភាគសិស្ស & A គ្រប់មុខ",
    straightABadgeGeneric: "⭐ A គ្រប់មុខ",
    studentAnalysisTitle: "វិភាគទិន្នន័យបេក្ខជន & សិស្សឆ្នើមនិទ្ទេស A គ្រប់មុខ (៧/៧)",
    studentAnalysisSubtitle: "ទិន្នន័យបេក្ខជនសរុប យេនឌ័រ អត្រាជាប់ និងបញ្ជីឈ្មោះសិស្សឆ្នើមពិសេសទូទាំងប្រទេស ដែលទទួលបាននិទ្ទេស A គ្រប់មុខវិជ្ជាទាំង ៧",
    kpiStraightA: "សិស្សឆ្នើម A គ្រប់មុខ (៧/៧ A)",
    kpiStraightASub: "និទ្ទេស A គ្រប់មុខវិជ្ជាទាំង ៧ ទាំងថ្នាក់វិទ្យាសាស្ត្រ និងសង្គម",
    kpiTotalCandidates: "បេក្ខជនជាប់សរុប",
    kpiTotalCandidatesSub: "ចំនួនបេក្ខជនដែលបានប្រកាសថាជាប់ជាផ្លូវការ",
    kpiGradeAAll: "និទ្ទេសរួម A ទូទាំងប្រទេស",
    kpiGradeAAllSub: "បេក្ខជនទទួលបាននិទ្ទេសរួម A ក្នុងការប្រឡងបាក់ឌុប",
    kpiPublicVsPrivate: "A គ្រប់មុខ (សាលារដ្ឋ vs ឯកជន)",
    kpiPublicVsPrivateSub: "ការបែងចែកសិស្សឆ្នើម A គ្រប់មុខ រវាងវិទ្យាល័យរដ្ឋ និងឯកជន",
    aCountBreakdownTitle: "ការបែងចែកតាមចំនួននិទ្ទេស A ទទួលបាន",
    aCountBreakdownSub: "ចំនួនសិស្សដែលទទួលបាននិទ្ទេស A ចំនួន ៧មុខ, ៦មុខ, ៥មុខ រហូតដល់ ១មុខ",
    topStraightAProvinces: "រាជធានី-ខេត្ត មានសិស្ស A គ្រប់មុខច្រើនបំផុត",
    topStraightASchools: "វិទ្យាល័យ មានសិស្ស A គ្រប់មុខច្រើនបំផុត",
    straightAExplorationTitle: "បញ្ជីឈ្មោះសិស្សឆ្នើម A គ្រប់មុខ & បេក្ខជននិទ្ទេស A",
    straightAExplorationSub: "ស្វែងរកឈ្មោះផ្លូវការ (កាត់ចេញពី PDF) លេខតុ វិទ្យាល័យ និងនិទ្ទេសមុខវិជ្ជាទាំង ៧ របស់បេក្ខជនឆ្នើម",
    filterByACount: "ចំនួននិទ្ទេស A",
    chip7As: "⭐ A គ្រប់មុខ ៧ មុខ",
    chip6As: "A ៦ មុខ",
    chip5As: "A ៥ មុខ",
    chip4As: "A ៤ មុខ",
    chip3As: "A ៣ មុខ",
    chip2As: "A ២ មុខ",
    chip1A: "A ១ មុខ",
    chipAllA: "និទ្ទេសរួម A ទាំងអស់",
    searchStudentPlaceholder: "ស្វែងរកលេខតុ ឈ្មោះវិទ្យាល័យ មណ្ឌលប្រឡង រាជធានី-ខេត្ត…",
    allTracks: "គ្រប់ថ្នាក់",
    allGenders: "គ្រប់ភេទ",
    genderFemale: "ស្រី",
    genderMale: "ប្រុស",
    viewOfficialPdf: "មើលតារាងផ្លូវការ (PDF)",
    noStudentsFound: "រកមិនឃើញបេក្ខជនដែលត្រូវនឹងលក្ខខណ្ឌចម្រាញ់ទេ។",
    showingStudentsCount: (shown: number, total: number) => `បង្ហាញ ${shown} នៃ ${total} បេក្ខជន`,
    studentCardTableNum: "លេខតុ",
    studentCardCenter: "មណ្ឌលប្រឡង",
    studentCardSchool: "អាគតដ្ឋាន",
    studentCardProvince: "រាជធានី/ខេត្ត",
    studentSubjectsBreakdown: "និទ្ទេសតាមមុខវិជ្ជាទាំង ៧",
    straightARibbon: "⭐ និទ្ទេស A គ្រប់មុខ (៧/៧ A)",
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
  if (typeof window === "undefined") return "overview";
  if (window.location.hash.includes("students")) return "students";
  if (window.location.hash.includes("subjects")) return "subjects";
  if (window.location.hash.includes("heatmap") || window.location.hash.includes("map")) return "heatmap";
  if (window.location.hash.includes("schools")) return "schools";
  return "overview";
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
  studentId?: number;
  fallback: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  if (!studentId || imageFailed) {
    return <span className="official-school-text">{fallback || "—"}</span>;
  }

  return (
    <span className="official-school-img-wrap" title={fallback}>
      <img
        src={apiUrl(`/api/archive/${year}/students/${studentId}/school-image?v=${SCHOOL_IMAGE_VERSION}&r=${retryCount}`)}
        alt={fallback || "Official school name"}
        title={fallback}
        loading="lazy"
        onError={() => {
          if (retryCount < 2) {
            setTimeout(() => setRetryCount((c) => c + 1), 600);
          } else {
            setImageFailed(true);
          }
        }}
      />
    </span>
  );
}

function OfficialStudentNameImage({
  cropUrl,
  tableNumber,
  nameFallback,
  height = 32,
}: {
  cropUrl: string;
  tableNumber: number | string;
  nameFallback?: string;
  height?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed || !cropUrl) {
    return (
      <span className="official-name-text-fallback" title={nameFallback || `Desk #${tableNumber}`}>
        {nameFallback || `#${tableNumber}`}
      </span>
    );
  }

  return (
    <span className="official-student-name-crop">
      <img
        src={apiUrl(cropUrl)}
        alt={nameFallback || `Student #${tableNumber}`}
        style={{ height: `${height}px`, maxHeight: `${height}px` }}
        onError={() => setImageFailed(true)}
        loading="lazy"
      />
    </span>
  );
}

function YearSelector({
  selectedYear,
  summaries,
  onSelectYear,
  label,
  className = "",
}: {
  selectedYear: string;
  summaries: Summary[];
  onSelectYear: (year: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`tab-year-selector-wrap ${className}`}>
      <span className="tab-year-label">
        <Calendar size={14} className="tab-year-icon" />
        <span className="tab-year-label-text">{label}:</span>
      </span>
      <select
        value={selectedYear}
        onChange={(event) => onSelectYear(event.target.value)}
        className="tab-year-dropdown"
        aria-label={label}
      >
        {summaries.map((item) => (
          <option key={item.year} value={item.year}>
            {item.year}
          </option>
        ))}
      </select>
    </div>
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

function SchoolTrackSplitBar({
  science,
  social,
  language = "km",
}: {
  science: number;
  social: number;
  language?: Language;
}) {
  const total = science + social;
  if (total <= 0) return null;
  const sciPct = Number(((science / total) * 100).toFixed(1));
  const socPct = Number(((social / total) * 100).toFixed(1));

  return (
    <div className="school-track-split-bar" title={`Science: ${numberFormat.format(science)} (${sciPct}%), Social: ${numberFormat.format(social)} (${socPct}%)`}>
      <div className="track-bar-pills">
        <span className="track-pill-science">
          <Atom size={12} />
          <span className="track-pill-label">{language === "km" ? "វិទ្យាសាស្ត្រ" : "Science"}</span>
          <strong className="track-pill-val">{numberFormat.format(science)}</strong>
          <small className="track-pill-pct">({sciPct}%)</small>
        </span>
        <span className="track-pill-social">
          <BookOpen size={12} />
          <span className="track-pill-label">{language === "km" ? "សង្គម" : "Social"}</span>
          <strong className="track-pill-val">{numberFormat.format(social)}</strong>
          <small className="track-pill-pct">({socPct}%)</small>
        </span>
      </div>
      <div className="track-ratio-bar">
        <div className="track-fill-science" style={{ width: `${sciPct}%` }} />
        <div className="track-fill-social" style={{ width: `${socPct}%` }} />
      </div>
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

function getDistrictHeatFill(
  val: number,
  min: number,
  max: number,
  metricKey: string,
  isSelected: boolean,
  isHovered: boolean
) {
  if (isSelected) return "#0ea5e9";
  const ratio = max > min ? Math.max(0, Math.min(1, (val - min) / (max - min))) : 0.35;
  if (metricKey === "gradeA") {
    return isHovered ? "rgba(245, 158, 11, 0.95)" : `rgba(245, 158, 11, ${0.2 + ratio * 0.75})`;
  } else if (metricKey === "candidates") {
    return isHovered ? "rgba(16, 185, 129, 0.95)" : `rgba(16, 185, 129, ${0.2 + ratio * 0.75})`;
  } else if (metricKey === "scienceRatio") {
    return isHovered ? "rgba(6, 182, 212, 0.95)" : `rgba(6, 182, 212, ${0.2 + ratio * 0.75})`;
  } else {
    return isHovered ? "rgba(139, 92, 246, 0.95)" : `rgba(139, 92, 246, ${0.2 + ratio * 0.75})`;
  }
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

  // View mode & UX states
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showOverviewPodium, setShowOverviewPodium] = useState(true);
  const [showSubjectPodium, setShowSubjectPodium] = useState(true);

  // High School (អាគតដ្ឋាន) Explorer state
  const [schools, setSchools] = useState<SchoolAnalysis[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolProvince, setSchoolProvince] = useState("all");
  const [schoolKhan, setSchoolKhan] = useState("all");
  const [schoolTypeFilter, setSchoolTypeFilter] = useState<"all" | "public" | "private">("all");
  const [schoolSort, setSchoolSort] = useState<"gradeA" | "gradeAPercent" | "candidates" | "name">("gradeA");
  const [schoolDisplayLimit, setSchoolDisplayLimit] = useState(25);

  // Capital Heatmap & Map Explorer state
  const [districts, setDistricts] = useState<PhnomPenhDistrictStats[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [mapViewMode, setMapViewMode] = useState<"phnom-penh" | "provinces">("phnom-penh");
  const [heatMetric, setHeatMetric] = useState<"gradeA" | "candidates" | "scienceRatio" | "schools">("gradeA");
  const [selectedKhan, setSelectedKhan] = useState<string | null>(null);
  const [hoveredKhan, setHoveredKhan] = useState<string | null>(null);

  // Subject Analysis state
  const [selectedTrack, setSelectedTrack] = useState<"science" | "social-science">("science");
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>("math");
  const [subjectOverviews, setSubjectOverviews] = useState<SubjectOverviewItem[]>([]);
  const [subjectDetail, setSubjectDetail] = useState<SubjectDetailResponse | null>(null);
  const [loadingSubjectDetail, setLoadingSubjectDetail] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectProvince, setSubjectProvince] = useState("all");
  const [subjectSchoolTypeFilter, setSubjectSchoolTypeFilter] = useState<"all" | "public" | "private">("all");
  const [subjectSort, setSubjectSort] = useState<"gradeA" | "gradeAPercent" | "candidates" | "passRate" | "name">("gradeA");
  const [subjectDisplayLimit, setSubjectDisplayLimit] = useState(25);

  // Student Analysis & Straight A state
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  const [students, setStudents] = useState<ArchiveStudentItem[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentACountFilter, setStudentACountFilter] = useState<number | "all">(7);
  const [studentProvince, setStudentProvince] = useState("all");
  const [studentTrackFilter, setStudentTrackFilter] = useState<"all" | "science" | "social-science">("all");
  const [studentGenderFilter, setStudentGenderFilter] = useState<"all" | "female" | "male">("all");
  const [studentSchoolTypeFilter, setStudentSchoolTypeFilter] = useState<"all" | "public" | "private">("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentViewMode, setStudentViewMode] = useState<"cards" | "table">("cards");
  const [studentDisplayLimit, setStudentDisplayLimit] = useState(36);

  const aCountCountMap = useMemo(() => {
    const map = new Map<number, number>();
    if (studentStats?.aCountDistribution) {
      for (const item of studentStats.aCountDistribution) {
        map.set(item.aCount, item.count);
      }
    }
    return map;
  }, [studentStats]);

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
      if (window.location.hash.includes("students")) {
        setActiveTab("students");
      } else if (window.location.hash.includes("subjects")) {
        setActiveTab("subjects");
      } else if (window.location.hash.includes("heatmap") || window.location.hash.includes("map")) {
        setActiveTab("heatmap");
      } else if (window.location.hash.includes("schools")) {
        setActiveTab("schools");
      } else if (window.location.hash.startsWith("#insights")) {
        setActiveTab("overview");
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const loadedSchoolsYear = useRef<string>("");
  const loadedDistrictsYear = useRef<string>("");
  const loadedSubjectsYear = useRef<string>("");
  const loadedStatsYear = useRef<string>("");

  useEffect(() => {
    fetch(apiUrl("/api/archive/years"))
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(async (data: { years: string[] }) => {
        const sortedYears = (data.years || []).slice().sort((a, b) => a.localeCompare(b));
        const latestYear = sortedYears.at(-1) || "";
        setSelectedYear((prev) => prev || latestYear);

        // Fetch latest year's summary first for immediate KPI render
        if (latestYear) {
          try {
            const latestRes = await fetch(apiUrl(`/api/archive/${latestYear}/summary`));
            if (latestRes.ok) {
              const latestSummary = (await latestRes.json()) as Summary;
              setSummaries([latestSummary]);
              setLoading(false);
            }
          } catch {
            // will fall back in outer catch
          }
        }

        // Fetch remaining summaries in background non-blockingly
        const otherYears = sortedYears.filter((y) => y !== latestYear);
        if (otherYears.length > 0) {
          const others = await Promise.all(
            otherYears.map(async (year) => {
              const res = await fetch(apiUrl(`/api/archive/${year}/summary`));
              return res.ok ? ((await res.json()) as Summary) : null;
            })
          );
          setSummaries((prev) => {
            const map = new Map<string, Summary>();
            for (const s of prev) map.set(s.year, s);
            for (const s of others) if (s) map.set(s.year, s);
            return [...map.values()].sort((a, b) => a.year.localeCompare(b.year));
          });
        }
      })
      .catch(() => setError(t.unavailable))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch High Schools for selected year (needed in "overview", "schools", and "heatmap" tabs)
  useEffect(() => {
    if (!selectedYear) return;
    if (activeTab !== "overview" && activeTab !== "schools" && activeTab !== "heatmap") return;
    if (loadedSchoolsYear.current === selectedYear && schools.length > 0) return;

    setLoadingSchools(true);
    setSchoolDisplayLimit(20);
    fetch(apiUrl(`/api/archive/${selectedYear}/schools`))
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ schools: SchoolAnalysis[] }>;
      })
      .then((data) => {
        setSchools(data.schools || []);
        loadedSchoolsYear.current = selectedYear;
      })
      .catch(() => setSchools([]))
      .finally(() => setLoadingSchools(false));
  }, [selectedYear, activeTab]);

  // Fetch Phnom Penh district stats for selected year (needed in "schools" and "heatmap" tabs)
  useEffect(() => {
    if (!selectedYear) return;
    if (activeTab !== "schools" && activeTab !== "heatmap") return;
    if (loadedDistrictsYear.current === selectedYear && districts.length > 0) return;

    setLoadingDistricts(true);
    fetch(apiUrl(`/api/archive/${selectedYear}/districts/phnom-penh`))
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ districts: PhnomPenhDistrictStats[] }>;
      })
      .then((data) => {
        setDistricts(data.districts || []);
        loadedDistrictsYear.current = selectedYear;
      })
      .catch(() => setDistricts([]))
      .finally(() => setLoadingDistricts(false));
  }, [selectedYear, activeTab]);

  // Fetch Subject Overviews for selected year (only needed in "subjects" tab)
  useEffect(() => {
    if (!selectedYear) return;
    if (activeTab !== "subjects") return;
    if (loadedSubjectsYear.current === selectedYear && subjectOverviews.length > 0) return;

    fetch(apiUrl(`/api/archive/${selectedYear}/subjects/overview`))
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ overview: SubjectOverviewItem[] }>;
      })
      .then((data) => {
        setSubjectOverviews(data.overview || []);
        loadedSubjectsYear.current = selectedYear;
      })
      .catch(() => setSubjectOverviews([]));
  }, [selectedYear, activeTab]);

  // Fetch Subject Detail when year, track, or subject changes (only needed in "subjects" tab)
  useEffect(() => {
    if (!selectedYear) return;
    if (activeTab !== "subjects") return;

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
  }, [selectedYear, selectedTrack, selectedSubject, activeTab]);

  // Fetch Student Stats (needed in "students" tab)
  useEffect(() => {
    if (!selectedYear) return;
    if (activeTab !== "students") return;
    if (loadedStatsYear.current === selectedYear && studentStats) return;

    fetch(apiUrl(`/api/archive/${selectedYear}/students/stats`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setStudentStats(data.stats || data);
          loadedStatsYear.current = selectedYear;
        }
      })
      .catch(() => {});
  }, [selectedYear, activeTab]);

  // Fetch Students candidate list (needed in "students" tab)
  useEffect(() => {
    if (!selectedYear) return;
    if (activeTab !== "students") return;

    setLoadingStudents(true);
    const params = new URLSearchParams();
    if (studentACountFilter !== "all") {
      params.set("aCount", String(studentACountFilter));
    } else {
      params.set("aCount", "all");
    }
    if (studentProvince !== "all") params.set("province", studentProvince);
    if (studentTrackFilter !== "all") params.set("track", studentTrackFilter);
    if (studentGenderFilter !== "all") params.set("gender", studentGenderFilter);
    if (studentSchoolTypeFilter !== "all") params.set("schoolType", studentSchoolTypeFilter);
    if (studentSearch.trim()) params.set("search", studentSearch.trim());
    params.set("limit", String(studentDisplayLimit));

    fetch(apiUrl(`/api/archive/${selectedYear}/students?${params.toString()}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.students)) {
          setStudents(data.students);
          setTotalStudents(data.total || data.students.length);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStudents(false));
  }, [
    selectedYear,
    studentACountFilter,
    studentProvince,
    studentTrackFilter,
    studentGenderFilter,
    studentSchoolTypeFilter,
    studentSearch,
    studentDisplayLimit,
    activeTab,
  ]);

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

  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());
  const toggleExpandSchool = (key: string) => {
    setExpandedSchools((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const champions = useMemo(() => {
    return [...schools]
      .filter((s) => s.grades.A > 0)
      .sort((a, b) => b.grades.A - a.grades.A || b.candidateCount - a.candidateCount)
      .slice(0, 3);
  }, [schools]);

  const publicSchools = useMemo(() => schools.filter((s) => s.schoolType === "public"), [schools]);
  const privateSchools = useMemo(() => schools.filter((s) => s.schoolType === "private"), [schools]);

  const statsPublic = useMemo(() => {
    const schoolCount = publicSchools.length;
    const candidateCount = publicSchools.reduce((acc, s) => acc + s.candidateCount, 0);
    const femaleCount = publicSchools.reduce((acc, s) => acc + s.femaleCount, 0);
    const scienceCount = publicSchools.reduce((acc, s) => acc + (s.scienceCount || 0), 0);
    const socialCount = publicSchools.reduce((acc, s) => acc + (s.socialCount || 0), 0);
    const gradeA = publicSchools.reduce((acc, s) => acc + s.grades.A, 0);
    const gradeB = publicSchools.reduce((acc, s) => acc + s.grades.B, 0);
    const totalPass = publicSchools.reduce((acc, s) => acc + s.grades.A + s.grades.B + s.grades.C + s.grades.D + s.grades.E, 0);
    const femalePercent = candidateCount > 0 ? (femaleCount / candidateCount) * 100 : 0;
    const gradeAPct = candidateCount > 0 ? (gradeA / candidateCount) * 100 : 0;
    const passRate = candidateCount > 0 ? (totalPass / candidateCount) * 100 : 0;
    return { schoolCount, candidateCount, femaleCount, scienceCount, socialCount, gradeA, gradeB, totalPass, femalePercent, gradeAPct, passRate };
  }, [publicSchools]);

  const statsPrivate = useMemo(() => {
    const schoolCount = privateSchools.length;
    const campusCount = privateSchools.reduce((acc, s) => acc + (s.branchCount || 1), 0);
    const candidateCount = privateSchools.reduce((acc, s) => acc + s.candidateCount, 0);
    const femaleCount = privateSchools.reduce((acc, s) => acc + s.femaleCount, 0);
    const scienceCount = privateSchools.reduce((acc, s) => acc + (s.scienceCount || 0), 0);
    const socialCount = privateSchools.reduce((acc, s) => acc + (s.socialCount || 0), 0);
    const gradeA = privateSchools.reduce((acc, s) => acc + s.grades.A, 0);
    const gradeB = privateSchools.reduce((acc, s) => acc + s.grades.B, 0);
    const totalPass = privateSchools.reduce((acc, s) => acc + s.grades.A + s.grades.B + s.grades.C + s.grades.D + s.grades.E, 0);
    const femalePercent = candidateCount > 0 ? (femaleCount / candidateCount) * 100 : 0;
    const gradeAPct = candidateCount > 0 ? (gradeA / candidateCount) * 100 : 0;
    const passRate = candidateCount > 0 ? (totalPass / candidateCount) * 100 : 0;
    return { schoolCount, campusCount, candidateCount, femaleCount, scienceCount, socialCount, gradeA, gradeB, totalPass, femalePercent, gradeAPct, passRate };
  }, [privateSchools]);

  const filteredSchools = useMemo(() => {
    const term = schoolSearch.trim().toLowerCase();
    let list = schools;
    if (schoolProvince !== "all") {
      list = list.filter((s) => s.provinceId === schoolProvince || s.province === schoolProvince);
    }
    if (schoolKhan !== "all") {
      list = list.filter((s) => s.khanId === schoolKhan || s.khan === schoolKhan);
    }
    if (schoolTypeFilter !== "all") {
      list = list.filter((s) => s.schoolType === schoolTypeFilter);
    }
    if (term) {
      list = list.filter((s) => {
        const engProv = provinceEnglish[s.provinceId || s.province]?.toLowerCase() || "";
        const khanName = s.khan?.toLowerCase() || "";
        return (
          s.name.toLowerCase().includes(term) ||
          (s.branch && s.branch.toLowerCase().includes(term)) ||
          s.province.toLowerCase().includes(term) ||
          engProv.includes(term) ||
          khanName.includes(term)
        );
      });
    }
    return list.slice().sort((a, b) => {
      if (schoolSort === "gradeA") return b.grades.A - a.grades.A || b.candidateCount - a.candidateCount;
      if (schoolSort === "gradeAPercent") return b.gradeAPercent - a.gradeAPercent || b.grades.A - a.grades.A;
      if (schoolSort === "candidates") return b.candidateCount - a.candidateCount || b.grades.A - a.grades.A;
      if (schoolSort === "name") return a.name.localeCompare(b.name, "km");
      return 0;
    });
  }, [schools, schoolSearch, schoolProvince, schoolKhan, schoolTypeFilter, schoolSort]);

  // Phnom Penh Khan metric heat calculations
  const khanValues = useMemo(() => {
    const map = new Map<string, number>();
    let min = Infinity;
    let max = -Infinity;
    for (const k of phnomPenhSvg.locations) {
      const d = districts.find((item) => item.id === k.id);
      let val = 0;
      if (d) {
        if (heatMetric === "gradeA") val = d.gradeA;
        else if (heatMetric === "candidates") val = d.candidateCount;
        else if (heatMetric === "scienceRatio") {
          const total = d.scienceCount + d.socialCount;
          val = total > 0 ? (d.scienceCount / total) * 100 : 0;
        } else if (heatMetric === "schools") {
          val = d.publicCount + d.privateCount;
        }
      }
      map.set(k.id, val);
      if (val < min) min = val;
      if (val > max) max = val;
    }
    if (min === Infinity) min = 0;
    if (max === -Infinity || max === min) max = min + 1;
    return { map, min, max };
  }, [districts, heatMetric]);

  function formatMetricSubValue(val: number, metric: "gradeA" | "candidates" | "scienceRatio" | "schools") {
    if (metric === "gradeA") return `${numberFormat.format(val)} A`;
    if (metric === "candidates") return numberFormat.format(val);
    if (metric === "scienceRatio") return `${val.toFixed(1)}%`;
    return `${val}`;
  }

  // Province metric heat calculations for national map view
  const provValues = useMemo(() => {
    const map = new Map<string, number>();
    let min = Infinity;
    let max = -Infinity;
    if (!selected) return { map, min: 0, max: 1 };
    for (const p of selected.provinces) {
      let val = 0;
      if (heatMetric === "gradeA") val = p.grades.A || 0;
      else if (heatMetric === "candidates") val = p.candidateCount;
      else if (heatMetric === "scienceRatio") {
        val = p.candidateCount > 0 ? (p.grades.A / p.candidateCount) * 100 : 0;
      } else if (heatMetric === "schools") {
        val = p.schoolCount || 0;
      }
      map.set(p.id, val);
      if (val < min) min = val;
      if (val > max) max = val;
    }
    if (min === Infinity) min = 0;
    if (max === -Infinity || max === min) max = min + 1;
    return { map, min, max };
  }, [selected, heatMetric]);

  const activeKhanId = hoveredKhan || selectedKhan || "chamkar-mon";
  const activeKhanStats = districts.find((d) => d.id === activeKhanId) || districts[0];

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
    if (subjectSchoolTypeFilter !== "all") {
      list = list.filter((s) => s.schoolType === subjectSchoolTypeFilter);
    }
    if (term) {
      list = list.filter((s) => {
        const engProv = provinceEnglish[s.provinceId || s.province]?.toLowerCase() || "";
        return (
          s.name.toLowerCase().includes(term) ||
          (s.branch && s.branch.toLowerCase().includes(term)) ||
          s.province.toLowerCase().includes(term) ||
          engProv.includes(term)
        );
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
  }, [subjectDetail, subjectSearch, subjectProvince, subjectSchoolTypeFilter, subjectSort]);

  const visibleSubjectSchools = useMemo(() => {
    return filteredSubjectSchools.slice(0, subjectDisplayLimit);
  }, [filteredSubjectSchools, subjectDisplayLimit]);

  const trackSubjectRankings = useMemo(() => {
    const currentTrackOverviews = subjectOverviews.filter((o) => o.track === selectedTrack);
    return currentTrackOverviews.map((item) => {
      const total = item.totalCandidates || 1;
      const gradeFRate = Number(((item.grades.F / total) * 100).toFixed(1));
      const gradeARate = item.gradeAPercent;
      const passRate = item.passPercent;
      return {
        ...item,
        gradeFRate,
        gradeARate,
        passRate,
      };
    }).sort((a, b) => b.gradeFRate - a.gradeFRate); // Ranked by highest failure rate first
  }, [subjectOverviews, selectedTrack]);

  return (
    <main className="insights-page">
      <nav className="nav site-header shell">
        <a className="brand" href="#insights">
          <span className="brand-mark"><GraduationCap size={24} strokeWidth={2.3} /></span>
          <span>{t.brand}</span>
        </a>
        <div className="site-header-right">
          <div className="primary-nav">
            <a href="#top" aria-label={t.facebook}><Search size={18} /><span>{t.facebook}</span></a>
            <a href="#archive" aria-label={t.archive}><Archive size={18} /><span>{t.archive}</span></a>
            <a className="active" href="#insights" aria-current="page" aria-label={t.insights}><BarChart3 size={18} /><span>{t.insights}</span></a>
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
        <div className="insights-hero-text">
          <span className="eyebrow"><TrendingUp size={14} /> {t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
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
          aria-selected={activeTab === "schools"}
          className={`tab-pill-btn ${activeTab === "schools" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("schools");
            window.location.hash = "#insights/schools";
          }}
        >
          <School size={15} />
          <span>{t.tabSchools}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "heatmap"}
          className={`tab-pill-btn ${activeTab === "heatmap" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("heatmap");
            window.location.hash = "#insights/heatmap";
          }}
        >
          <MapPin size={15} />
          <span>{t.tabHeatmap}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "subjects"}
          className={`tab-pill-btn ${activeTab === "subjects" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("subjects");
            window.location.hash = "#insights/subjects";
          }}
        >
          <BookOpen size={15} />
          <span>{t.tabSubjects}</span>
          <span className="tab-pill-badge">{t.newBadge}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "students"}
          className={`tab-pill-btn ${activeTab === "students" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("students");
            window.location.hash = "#insights/students";
          }}
        >
          <Award size={15} />
          <span>{t.tabStudents}</span>
          <span className="tab-pill-badge gold-pill-badge">
            {studentStats?.straightACount != null && studentStats.straightACount > 0
              ? language === "km"
                ? `⭐ ${studentStats.straightACount} A គ្រប់មុខ`
                : `⭐ ${studentStats.straightACount} Straight A`
              : t.straightABadgeGeneric}
          </span>
        </button>
      </div>

      {loading ? (
        <div className="archive-state shell">{t.loading}</div>
      ) : error || !selected ? (
        <div className="archive-state error-banner shell">{error || t.unavailable}</div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="tab-pane">
              <div className="tab-control-bar shell">
                <div className="tab-title-group">
                  <span className="eyebrow"><BarChart3 size={14} /> {t.nationalSnapshot}</span>
                  <h2>{t.tabOverview}</h2>
                </div>
                <div className="tab-controls-right">
                  <YearSelector
                    selectedYear={selectedYear}
                    summaries={summaries}
                    onSelectYear={setSelectedYear}
                    label={t.year}
                  />
                  <div className="tab-metric-selector-wrap">
                    <span className="tab-year-label">
                      <SlidersHorizontal size={13} className="tab-year-icon" />
                      <span className="tab-year-label-text">{t.metric}:</span>
                    </span>
                    <select
                      value={metric}
                      onChange={(event) => setMetric(event.target.value as Metric)}
                      className="tab-year-dropdown"
                      aria-label={t.metric}
                    >
                      <option value="candidates">{t.candidates}</option>
                      {grades.map((grade) => (
                        <option key={grade} value={grade}>
                          {language === "km" ? "និទ្ទេស" : "Grade"} {grade}
                        </option>
                      ))}
                      <option value="centers">{t.centers}</option>
                      <option value="schools">{t.schools}</option>
                      <option value="pages">{t.pages}</option>
                    </select>
                  </div>
                </div>
              </div>

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

                  {/* Overall Grade A Track Breakdown Banner */}
                  {(() => {
                    const gradeABrk = selected.gradeTrackBreakdown?.A || { science: 1766, social: 256, total: 2022 };
                    const scPct = gradeABrk.total > 0 ? ((gradeABrk.science / gradeABrk.total) * 100).toFixed(1) : "87.3";
                    const soPct = gradeABrk.total > 0 ? ((gradeABrk.social / gradeABrk.total) * 100).toFixed(1) : "12.7";
                    return (
                      <div className="grade-a-track-banner">
                        <div className="grade-a-track-head">
                          <div className="grade-a-track-title">
                            <span className="trophy-badge">🏆</span>
                            <div>
                              <h4>{t.gradeATrackBreakdown}</h4>
                              <p>{t.gradeATrackBreakdownSub}</p>
                            </div>
                          </div>
                          <div className="grade-a-total-pill">
                            <strong>{numberFormat.format(gradeABrk.total)}</strong>
                            <span>{t.candidatesUnit}</span>
                          </div>
                        </div>

                        <div className="grade-a-track-split">
                          <div className="track-stat science">
                            <span className="track-dot science-dot" />
                            <span className="track-name">{t.scienceTrack}</span>
                            <strong>{numberFormat.format(gradeABrk.science)}</strong>
                            <small>({scPct}%)</small>
                          </div>
                          <div className="track-stat social">
                            <span className="track-dot social-dot" />
                            <span className="track-name">{t.socialTrack}</span>
                            <strong>{numberFormat.format(gradeABrk.social)}</strong>
                            <small>({soPct}%)</small>
                          </div>
                        </div>

                        <div className="grade-a-progress-bar">
                          <div
                            className="grade-a-prog-science"
                            style={{ width: `${scPct}%` }}
                            title={`${t.scienceTrack}: ${numberFormat.format(gradeABrk.science)} (${scPct}%)`}
                          />
                          <div
                            className="grade-a-prog-social"
                            style={{ width: `${soPct}%` }}
                            title={`${t.socialTrack}: ${numberFormat.format(gradeABrk.social)} (${soPct}%)`}
                          />
                        </div>
                      </div>
                    );
                  })()}
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
            </div>
          )}

          {/* TAB 2: HIGH SCHOOLS (អាគតដ្ឋាន) */}
          {activeTab === "schools" && (
            <div className="tab-pane">
              <section className="school-analysis-section shell" aria-label={t.schoolAnalysis}>
                <div className="school-section-header">
                  <div className="school-section-title-wrap">
                    <span className="eyebrow"><Sparkles size={14} /> {t.schoolAnalysis}</span>
                    <h2>{t.allSchoolsExplorer}</h2>
                    <p>{t.schoolAnalysisSubtitle}</p>
                  </div>
                  <div className="tab-controls-right">
                    <YearSelector
                      selectedYear={selectedYear}
                      summaries={summaries}
                      onSelectYear={setSelectedYear}
                      label={t.year}
                    />
                  </div>
                </div>

                {/* Public vs Private High School Comparison Section */}
                {schools.length > 0 && (
                  <div className="public-private-compare-container">
                    <div className="compare-header">
                      <div className="compare-header-left">
                        <Scale size={20} className="compare-scale-icon" />
                        <div>
                          <h3>{t.compareTitle}</h3>
                          <p>{t.compareSubtitle}</p>
                        </div>
                      </div>

                      <div className="school-type-filter-segmented" role="group" aria-label={t.schoolType}>
                        <button
                          type="button"
                          className={`seg-btn ${schoolTypeFilter === "all" ? "active" : ""}`}
                          onClick={() => setSchoolTypeFilter("all")}
                        >
                          <span>{t.typeAll}</span>
                          <span className="seg-badge">{numberFormat.format(schools.length)}</span>
                        </button>
                        <button
                          type="button"
                          className={`seg-btn public ${schoolTypeFilter === "public" ? "active" : ""}`}
                          onClick={() => setSchoolTypeFilter("public")}
                        >
                          <span>🏛️ {t.typePublic}</span>
                          <span className="seg-badge">{numberFormat.format(statsPublic.schoolCount)}</span>
                        </button>
                        <button
                          type="button"
                          className={`seg-btn private ${schoolTypeFilter === "private" ? "active" : ""}`}
                          onClick={() => setSchoolTypeFilter("private")}
                        >
                          <span>⭐ {t.typePrivate}</span>
                          <span className="seg-badge">{numberFormat.format(statsPrivate.schoolCount)}</span>
                        </button>
                      </div>
                    </div>

                    <div className="public-private-cards-grid">
                      {/* Public High Schools Card */}
                      <div
                        className={`compare-card public ${schoolTypeFilter === "public" ? "active-selected" : ""}`}
                        onClick={() => setSchoolTypeFilter(schoolTypeFilter === "public" ? "all" : "public")}
                        role="button"
                        tabIndex={0}
                        title={language === "km" ? "ចុចដើម្បីចម្រាញ់យកតែអាគតដ្ឋានរដ្ឋ" : "Click to filter to public schools"}
                      >
                        <div className="compare-card-top">
                          <span className="school-type-badge public">
                            🏛️ {t.publicShare}
                          </span>
                          <span className="compare-school-count">
                            {numberFormat.format(statsPublic.schoolCount)} {t.schoolsCountLabel}
                          </span>
                        </div>

                        <div className="compare-metric-row">
                          <div className="compare-metric-item">
                            <span>{t.candidates}</span>
                            <strong>{numberFormat.format(statsPublic.candidateCount)}</strong>
                            <small>{((statsPublic.candidateCount / Math.max(1, selected.candidateCount)) * 100).toFixed(1)}% {t.candidatesShare}</small>
                          </div>
                          <div className="compare-metric-item">
                            <span>{t.colGradeA}</span>
                            <strong style={{ color: "#d97706" }}>{numberFormat.format(statsPublic.gradeA)}</strong>
                            <small>{statsPublic.gradeAPct.toFixed(2)}% {t.gradeARateLabel}</small>
                          </div>
                          <div className="compare-metric-item">
                            <span>{t.femalePercent}</span>
                            <strong style={{ color: "#db2777" }}>♀ {statsPublic.femalePercent.toFixed(1)}%</strong>
                            <small>{numberFormat.format(statsPublic.femaleCount)} {t.candidatesUnit}</small>
                          </div>
                        </div>

                        <div className="compare-ratio-bar" title={`Public Share: ${((statsPublic.candidateCount / Math.max(1, selected.candidateCount)) * 100).toFixed(1)}%`}>
                          <div
                            className="compare-ratio-fill public"
                            style={{ width: `${(statsPublic.candidateCount / Math.max(1, selected.candidateCount)) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Private High Schools Card */}
                      <div
                        className={`compare-card private ${schoolTypeFilter === "private" ? "active-selected" : ""}`}
                        onClick={() => setSchoolTypeFilter(schoolTypeFilter === "private" ? "all" : "private")}
                        role="button"
                        tabIndex={0}
                        title={language === "km" ? "ចុចដើម្បីចម្រាញ់យកតែអាគតដ្ឋានឯកជន" : "Click to filter to private schools"}
                      >
                        <div className="compare-card-top">
                          <span className="school-type-badge private">
                            ⭐ {t.privateShare}
                          </span>
                          <span className="compare-school-count">
                            {numberFormat.format(statsPrivate.schoolCount)} {language === "km" ? "គ្រឹះស្ថាន" : "Networks"}
                            {statsPrivate.campusCount > statsPrivate.schoolCount && (
                              <small style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, marginLeft: 4 }}>
                                ({numberFormat.format(statsPrivate.campusCount)} {language === "km" ? "សាខា" : "Campuses"})
                              </small>
                            )}
                          </span>
                        </div>

                        <div className="compare-metric-row">
                          <div className="compare-metric-item">
                            <span>{t.candidates}</span>
                            <strong>{numberFormat.format(statsPrivate.candidateCount)}</strong>
                            <small>{((statsPrivate.candidateCount / Math.max(1, selected.candidateCount)) * 100).toFixed(1)}% {t.candidatesShare}</small>
                          </div>
                          <div className="compare-metric-item">
                            <span>{t.colGradeA}</span>
                            <strong style={{ color: "#d97706" }}>{numberFormat.format(statsPrivate.gradeA)}</strong>
                            <small>{statsPrivate.gradeAPct.toFixed(2)}% {t.gradeARateLabel}</small>
                          </div>
                          <div className="compare-metric-item">
                            <span>{t.femalePercent}</span>
                            <strong style={{ color: "#db2777" }}>♀ {statsPrivate.femalePercent.toFixed(1)}%</strong>
                            <small>{numberFormat.format(statsPrivate.femaleCount)} {t.candidatesUnit}</small>
                          </div>
                        </div>

                        <div className="compare-ratio-bar" title={`Private Share: ${((statsPrivate.candidateCount / Math.max(1, selected.candidateCount)) * 100).toFixed(1)}%`}>
                          <div
                            className="compare-ratio-fill private"
                            style={{ width: `${(statsPrivate.candidateCount / Math.max(1, selected.candidateCount)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Champions Showcase (Top 3 Grade A Schools) */}
                {champions.length > 0 && (
                  <div className="school-champions-block">
                    <div className="champions-header">
                      <div className="champions-header-left">
                        <Trophy size={18} className="champions-trophy-icon" />
                        <div>
                          <h3>{t.gradeAChampions}</h3>
                          <p>{t.gradeAChampionsHelp}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="podium-toggle-btn"
                        onClick={() => setShowOverviewPodium(!showOverviewPodium)}
                        aria-expanded={showOverviewPodium}
                      >
                        {showOverviewPodium ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>{showOverviewPodium ? t.togglePodiumHide : t.togglePodiumShow}</span>
                      </button>
                    </div>

                    {showOverviewPodium && (
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
                            <article key={`${champion.province}-${champion.name}-${champion.branch || ""}`} className={`school-champion-card medal-${medalClass}`}>
                              <div className="champion-card-top">
                                <span className={`champion-rank-badge rank-${idx + 1}`}>
                                  <Award size={14} />
                                  #{idx + 1}
                                </span>
                                <span className={`school-type-badge ${champion.schoolType || "public"}`}>
                                  {champion.schoolType === "private" ? "⭐ " : "🏛️ "}
                                  {champion.schoolType === "private" ? (language === "km" ? t.typePrivateShort : "Private") : (language === "km" ? t.typePublicShort : "Public")}
                                </span>
                                {champion.branchCount && champion.branchCount > 1 ? (
                                  <span className="school-branch-badge multi-branch">
                                    <Building2 size={11} /> {language === "km" ? `${champion.branchCount} សាខា` : `${champion.branchCount} branches`}
                                  </span>
                                ) : champion.branch ? (
                                  <span className="school-branch-badge">
                                    <Building2 size={11} /> {champion.branch}
                                  </span>
                                ) : null}
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
                                  <span>{language === "km" ? "និទ្ទេសរួម A" : "Overall Grade A"}</span>
                                </div>
                                <div className="champion-stat-sub">
                                  <b>{champion.gradeAPercent.toFixed(1)}%</b>
                                  <small>{language === "km" ? "នៃបេក្ខជនសរុប" : "of candidates"}</small>
                                  {champion.grades.A > 0 && (champion.gradeAScience !== undefined || champion.gradeASocial !== undefined) && (
                                    <span style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 700, marginTop: 2, display: "block" }}>
                                      ⚛ {champion.gradeAScience || 0} Sci · 📖 {champion.gradeASocial || 0} Soc
                                    </span>
                                  )}
                                </div>
                              </div>

                              <SchoolStackedGradeBar grades={champion.grades} total={champion.candidateCount} />
                              <SchoolTrackSplitBar science={champion.scienceCount} social={champion.socialCount} language={language} />

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
                    )}
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
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        aria-label={t.year}
                      >
                        {summaries.map((s) => (
                          <option key={s.year} value={s.year}>
                            {s.year}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="school-filter-item">
                      <select
                        value={schoolTypeFilter}
                        onChange={(e) => setSchoolTypeFilter(e.target.value as any)}
                      >
                        <option value="all">{t.typeAll}</option>
                        <option value="public">🏛️ {t.typePublic} ({numberFormat.format(statsPublic.schoolCount)})</option>
                        <option value="private">⭐ {t.typePrivate} ({numberFormat.format(statsPrivate.schoolCount)})</option>
                      </select>
                    </label>

                    <label className="school-filter-item">
                      <select
                        value={schoolProvince}
                        onChange={(e) => {
                          setSchoolProvince(e.target.value);
                          if (e.target.value !== "phnom-penh" && e.target.value !== "all") {
                            setSchoolKhan("all");
                          }
                        }}
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
                        value={schoolKhan}
                        onChange={(e) => {
                          setSchoolKhan(e.target.value);
                          if (e.target.value !== "all") {
                            setSchoolProvince("phnom-penh");
                          }
                        }}
                      >
                        <option value="all">{t.allKhans}</option>
                        {districts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {language === "km" ? d.nameKm : d.nameEn}
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

                  <div className="view-mode-toggle" role="group" aria-label={t.viewMode}>
                    <button
                      type="button"
                      className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
                      onClick={() => setViewMode("table")}
                      title={t.viewTable}
                      aria-pressed={viewMode === "table"}
                    >
                      <TableIcon size={14} />
                      <span>{t.viewTable}</span>
                    </button>
                    <button
                      type="button"
                      className={`view-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                      onClick={() => setViewMode("cards")}
                      title={t.viewCards}
                      aria-pressed={viewMode === "cards"}
                    >
                      <LayoutGrid size={14} />
                      <span>{t.viewCards}</span>
                    </button>
                  </div>

                  <div className="school-count-chip">
                    {t.showingCount(Math.min(visibleSchools.length, filteredSchools.length), filteredSchools.length)}
                  </div>
                </div>

                {/* High School Table or Cards */}
                {loadingSchools ? (
                  <div className="archive-state">{t.loading}</div>
                ) : filteredSchools.length === 0 ? (
                  <div className="archive-empty">
                    <School size={32} />
                    <h3>{t.noSchoolsFound}</h3>
                  </div>
                ) : viewMode === "table" ? (
                  <div className="compact-table-wrap">
                    <table className="compact-school-table">
                      <thead>
                        <tr>
                          <th className="th-rank">{t.colRank}</th>
                          <th className="th-school">{t.colSchool}</th>
                          <th className="th-province">{t.colProvince}</th>
                          <th className="th-num">{t.colCandidates}</th>
                          <th className="th-female">{t.colFemale}</th>
                          <th className="th-track">{t.colTrack}</th>
                          <th className="th-grade-a">{t.colGradeA}</th>
                          <th className="th-bar">{t.colGradeDistribution}</th>
                        </tr>
                      </thead>
                      <tbody>
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
                          const schoolKey = `${school.provinceId || school.province}-${school.name}-${school.branch || ""}`;
                          const isExpanded = expandedSchools.has(schoolKey);
                          const hasBranches = Boolean(school.branches && school.branches.length > 1);

                          return (
                            <Fragment key={schoolKey}>
                              <tr>
                                <td className="td-rank">#{index + 1}</td>
                                <td className="td-school">
                                  <div className="table-school-cell">
                                    <OfficialSchoolImage
                                      year={selected.year}
                                      studentId={school.sampleStudentId}
                                      fallback={school.name}
                                    />
                                    <div className="table-school-badges-row">
                                      <span className={`school-type-badge ${school.schoolType || "public"}`}>
                                        {school.schoolType === "private" ? "⭐ " : "🏛️ "}
                                        {school.schoolType === "private" ? (language === "km" ? t.typePrivateShort : "Private") : (language === "km" ? t.typePublicShort : "Public")}
                                      </span>
                                      {hasBranches ? (
                                        <button
                                          type="button"
                                          className={`branch-expand-pill-btn ${isExpanded ? "expanded" : ""}`}
                                          onClick={() => toggleExpandSchool(schoolKey)}
                                          title={language === "km" ? "ចុចដើម្បីមើល ឬបិទបញ្ជីសាខា" : "Click to view or collapse branches"}
                                        >
                                          <Building2 size={11} />
                                          <span>{language === "km" ? `${school.branches!.length} សាខា` : `${school.branches!.length} branches`}</span>
                                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                        </button>
                                      ) : school.branch ? (
                                        <span className="school-branch-badge">
                                          <Building2 size={11} /> {school.branch}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="td-province">
                                  <span className="table-prov-chip">{provLabel}</span>
                                </td>
                                <td className="td-num">
                                  <strong>{numberFormat.format(school.candidateCount)}</strong>
                                </td>
                                <td className="td-female">
                                  <span className="female-rate-badge">♀ {femalePct}%</span>
                                </td>
                                <td className="td-track">
                                  <div className="table-track-cell">
                                    <div className="table-track-pills">
                                      <span className="table-track-sci"><Atom size={10} /> {numberFormat.format(school.scienceCount)}</span>
                                      <span className="table-track-soc"><BookOpen size={10} /> {numberFormat.format(school.socialCount)}</span>
                                    </div>
                                    <div className="track-ratio-bar table-ratio-bar">
                                      <div
                                        className="track-fill-science"
                                        style={{ width: `${school.candidateCount > 0 ? (school.scienceCount / school.candidateCount) * 100 : 50}%` }}
                                      />
                                      <div
                                        className="track-fill-social"
                                        style={{ width: `${school.candidateCount > 0 ? (school.socialCount / school.candidateCount) * 100 : 50}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="td-grade-a">
                                  <span className={`grade-a-badge ${school.grades.A > 0 ? "has-a" : "zero-a"}`}>
                                    <strong>{numberFormat.format(school.grades.A)}</strong>
                                    <small>({school.gradeAPercent.toFixed(1)}%)</small>
                                    {school.grades.A > 0 && (school.gradeAScience !== undefined || school.gradeASocial !== undefined) && (
                                      <span style={{ fontSize: 9, color: "var(--muted)", display: "block", marginTop: 1 }}>
                                        ⚛ {school.gradeAScience || 0} Sci · 📖 {school.gradeASocial || 0} Soc
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="td-bar">
                                  <SchoolStackedGradeBar grades={school.grades} total={school.candidateCount} />
                                </td>
                              </tr>

                              {isExpanded && hasBranches && (
                                <tr className="school-branches-tr">
                                  <td colSpan={8}>
                                    <div className="school-branches-drawer">
                                      <div className="branches-drawer-header">
                                        <div className="drawer-title">
                                          <Building2 size={15} />
                                          <span>
                                            {language === "km"
                                              ? `បញ្ជីសាខាទាំង ${school.branches!.length} របស់ ${school.name}`
                                              : `All ${school.branches!.length} branches of ${school.name}`}
                                          </span>
                                        </div>
                                        <span className="drawer-sub">
                                          {language === "km"
                                            ? `សរុប ${numberFormat.format(school.candidateCount)} នាក់ · និទ្ទេសរួម A: ${numberFormat.format(school.gradeA || 0)} នាក់`
                                            : `Total ${numberFormat.format(school.candidateCount)} candidates · Grade A: ${numberFormat.format(school.gradeA || 0)}`}
                                        </span>
                                      </div>

                                      <div className="branches-sub-table-wrapper">
                                        <table className="branches-sub-table">
                                          <thead>
                                            <tr>
                                              <th>#</th>
                                              <th>{language === "km" ? "សាខា (អាគតដ្ឋាន)" : "Branch Campus"}</th>
                                              <th>{language === "km" ? "ទីតាំង" : "Location"}</th>
                                              <th>{t.colCandidates}</th>
                                              <th>{t.colTrack}</th>
                                              <th>{t.colGradeA}</th>
                                              <th>{t.colPassRate}</th>
                                              <th>{t.colGradeDistribution}</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {school.branches!.map((br, bIdx) => (
                                              <tr key={bIdx} className="branch-inner-row">
                                                <td className="td-rank">#{bIdx + 1}</td>
                                                <td>
                                                  <div className="branch-name-item">
                                                    <OfficialSchoolImage
                                                      year={selected.year}
                                                      studentId={br.sampleStudentId}
                                                      fallback={br.branch || br.name}
                                                    />
                                                    {br.branch && (
                                                      <span className="school-branch-badge highlight">
                                                        <Building2 size={10} /> {br.branch}
                                                      </span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td>
                                                  <span className="province-chip">
                                                    <MapPin size={10} /> {br.khan ? `${br.khan}, ` : ""}{br.province}
                                                  </span>
                                                </td>
                                                <td className="td-cand">
                                                  <strong>{numberFormat.format(br.candidateCount)}</strong>
                                                </td>
                                                <td>
                                                  <div className="table-track-pills">
                                                    <span className="table-track-sci"><Atom size={9} /> {numberFormat.format(br.scienceCount || 0)}</span>
                                                    <span className="table-track-soc"><BookOpen size={9} /> {numberFormat.format(br.socialCount || 0)}</span>
                                                  </div>
                                                </td>
                                                <td className="td-grade-a">
                                                  <span className={`grade-a-badge ${br.gradeA > 0 ? "has-a" : "zero-a"}`}>
                                                    <strong>{numberFormat.format(br.gradeA)}</strong>
                                                    <small> ({br.gradeAPercent.toFixed(1)}%)</small>
                                                    {br.gradeA > 0 && (
                                                      <span style={{ fontSize: 9, color: "var(--muted)", display: "block" }}>
                                                        ⚛ {br.gradeAScience || 0} · 📖 {br.gradeASocial || 0}
                                                      </span>
                                                    )}
                                                  </span>
                                                </td>
                                                <td className="td-pass-rate">
                                                  <span className="pass-pill">{br.passRate}%</span>
                                                </td>
                                                <td>
                                                  <SchoolStackedGradeBar grades={br.grades} total={br.candidateCount} />
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
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
                      const schoolKey = `${school.provinceId || school.province}-${school.name}-${school.branch || ""}`;
                      const isExpanded = expandedSchools.has(schoolKey);
                      const hasBranches = Boolean(school.branches && school.branches.length > 1);

                      return (
                        <article key={schoolKey} className="school-row-card">
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
                                <span className={`school-type-badge ${school.schoolType || "public"}`}>
                                  {school.schoolType === "private" ? "⭐ " : "🏛️ "}
                                  {school.schoolType === "private" ? (language === "km" ? t.typePrivate : "Private") : (language === "km" ? t.typePublic : "Public")}
                                </span>
                                {hasBranches ? (
                                  <span className="school-branch-badge multi-branch">
                                    <Building2 size={11} /> {language === "km" ? `${school.branches!.length} សាខា` : `${school.branches!.length} branches`}
                                  </span>
                                ) : school.branch ? (
                                  <span className="school-branch-badge">
                                    <Building2 size={11} /> {school.branch}
                                  </span>
                                ) : null}
                                <span className="province-chip">
                                  <MapPin size={11} /> {provLabel}
                                </span>
                                <span className="tag-chip gender-tag">
                                  ♀ {femalePct}% {t.femalePercent}
                                </span>
                              </div>
                              <SchoolTrackSplitBar
                                science={school.scienceCount}
                                social={school.socialCount}
                                language={language}
                              />

                              {hasBranches && (
                                <div className="card-branch-expand-row">
                                  <button
                                    type="button"
                                    className={`card-branch-toggle-btn ${isExpanded ? "expanded" : ""}`}
                                    onClick={() => toggleExpandSchool(schoolKey)}
                                  >
                                    <Building2 size={13} />
                                    <span>
                                      {isExpanded
                                        ? (language === "km" ? `បង្រួមសាខា (${school.branches!.length})` : `Collapse branches (${school.branches!.length})`)
                                        : (language === "km" ? `មើលសាខាទាំង ${school.branches!.length}` : `View all ${school.branches!.length} branches`)}
                                    </span>
                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </button>
                                </div>
                              )}

                              {isExpanded && hasBranches && (
                                <div className="card-branches-drawer">
                                  {school.branches!.map((br, bIdx) => (
                                    <div key={bIdx} className="card-branch-item">
                                      <div className="branch-left">
                                        <OfficialSchoolImage
                                          year={selected.year}
                                          studentId={br.sampleStudentId}
                                          fallback={br.branch || br.name}
                                        />
                                        {br.branch && (
                                          <span className="school-branch-badge highlight">
                                            <Building2 size={10} /> {br.branch}
                                          </span>
                                        )}
                                        <span className="province-chip">
                                          <MapPin size={10} /> {br.khan ? `${br.khan}, ` : ""}{br.province}
                                        </span>
                                      </div>
                                      <div className="branch-right">
                                        <span className="branch-metric-cand">
                                          <strong>{numberFormat.format(br.candidateCount)}</strong> {t.candidatesUnit}
                                        </span>
                                        <span className={`grade-a-badge ${br.gradeA > 0 ? "has-a" : "zero-a"}`}>
                                          <strong>{numberFormat.format(br.gradeA)} A</strong>
                                        </span>
                                        <span className="pass-pill">{br.passRate}%</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="school-row-right">
                            <div className="school-row-key-metrics">
                              <div className="school-metric-box">
                                <span className="metric-label">{t.candidates}</span>
                                <strong>{numberFormat.format(school.candidateCount)}</strong>
                              </div>
                              <div className="school-metric-box grade-a-metric">
                                <span className="metric-label">{language === "km" ? "និទ្ទេសរួម A" : "Overall Grade A"}</span>
                                <strong>
                                  {numberFormat.format(school.grades.A)}
                                  <small> ({school.gradeAPercent.toFixed(1)}%)</small>
                                </strong>
                                {school.grades.A > 0 && (school.gradeAScience !== undefined || school.gradeASocial !== undefined) && (
                                  <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, display: "block", marginTop: 2 }}>
                                    ⚛ {school.gradeAScience || 0} {t.scienceTrackShort} · 📖 {school.gradeASocial || 0} {t.socialTrackShort}
                                  </span>
                                )}
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

          {/* TAB 3: CAPITAL & PROVINCIAL GEO-HEATMAP (ផែនទីកម្ដៅ) */}
          {activeTab === "heatmap" && (
            <div className="tab-pane">
              <section className="school-analysis-section shell" aria-label={t.tabHeatmap}>
                <div className="school-section-header">
                  <div className="school-section-title-wrap">
                    <span className="eyebrow"><Sparkles size={14} /> {t.tabHeatmap}</span>
                    <h2>{t.capitalMapTitle}</h2>
                    <p>{t.capitalMapSubtitle}</p>
                  </div>
                  <div className="tab-controls-right">
                    <YearSelector
                      selectedYear={selectedYear}
                      summaries={summaries}
                      onSelectYear={setSelectedYear}
                      label={t.year}
                    />
                  </div>
                </div>

                {/* Capital Geo-Heatmap Explorer */}
                <div className="capital-heatmap-container">
                  <div className="heatmap-header">
                    <div className="heatmap-header-left">
                      <MapPin size={22} className="heatmap-map-icon" />
                      <div>
                        <h3>{t.capitalMapTitle}</h3>
                        <p>{t.capitalMapSubtitle}</p>
                      </div>
                    </div>

                    <div className="heatmap-controls-row">
                      {/* Switcher: Phnom Penh (14 Khans) vs Provinces */}
                      <div className="heatmap-view-switcher" role="group">
                        <button
                          type="button"
                          className={`seg-btn ${mapViewMode === "phnom-penh" ? "active" : ""}`}
                          onClick={() => setMapViewMode("phnom-penh")}
                        >
                          <Building2 size={13} />
                          <span>{t.viewPhnomPenh}</span>
                        </button>
                        <button
                          type="button"
                          className={`seg-btn ${mapViewMode === "provinces" ? "active" : ""}`}
                          onClick={() => setMapViewMode("provinces")}
                        >
                          <Compass size={13} />
                          <span>{t.viewProvinces}</span>
                        </button>
                      </div>

                      {/* Heatmap Metric Selector */}
                      <div className="heatmap-metric-selector">
                        <span className="metric-label">{t.heatmapMetric}:</span>
                        <button
                          type="button"
                          className={`heat-pill-btn ${heatMetric === "gradeA" ? "active" : ""}`}
                          onClick={() => setHeatMetric("gradeA")}
                        >
                          🏆 {t.heatGradeA}
                        </button>
                        <button
                          type="button"
                          className={`heat-pill-btn ${heatMetric === "candidates" ? "active" : ""}`}
                          onClick={() => setHeatMetric("candidates")}
                        >
                          👥 {t.heatCandidates}
                        </button>
                        <button
                          type="button"
                          className={`heat-pill-btn ${heatMetric === "scienceRatio" ? "active" : ""}`}
                          onClick={() => setHeatMetric("scienceRatio")}
                        >
                          🔬 {t.heatScienceRatio}
                        </button>
                        <button
                          type="button"
                          className={`heat-pill-btn ${heatMetric === "schools" ? "active" : ""}`}
                          onClick={() => setHeatMetric("schools")}
                        >
                          🏫 {t.heatSchools}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="heatmap-content-grid">
                    <div className="heatmap-svg-wrap">
                      {mapViewMode === "phnom-penh" ? (
                        <svg
                          viewBox={phnomPenhSvg.viewBox}
                          className="phnom-penh-svg-map"
                          role="img"
                          aria-label="Phnom Penh Khans Map"
                        >
                          {phnomPenhSvg.locations.map((loc) => {
                            const val = khanValues.map.get(loc.id) || 0;
                            const isSelected = selectedKhan === loc.id;
                            const isHovered = hoveredKhan === loc.id;
                            const fill = getDistrictHeatFill(val, khanValues.min, khanValues.max, heatMetric, isSelected, isHovered);

                            return (
                              <g
                                key={loc.id}
                                className={`khan-group ${isSelected ? "selected" : ""}`}
                                onClick={() => setSelectedKhan(selectedKhan === loc.id ? null : loc.id)}
                                onMouseEnter={() => setHoveredKhan(loc.id)}
                                onMouseLeave={() => setHoveredKhan(null)}
                              >
                                <path
                                  id={`khan-path-${loc.id}`}
                                  d={loc.path}
                                  className={`khan-polygon ${isSelected ? "selected" : ""}`}
                                  style={{ fill }}
                                >
                                  <title>{`${language === "km" ? loc.nameKm : loc.nameEn}: ${numberFormat.format(val)}`}</title>
                                </path>
                                <text
                                  x={loc.center[0]}
                                  y={loc.center[1] - 4}
                                  textAnchor="middle"
                                  className="khan-label"
                                >
                                  {language === "km" ? loc.nameKm : loc.nameEn}
                                </text>
                                <text
                                  x={loc.center[0]}
                                  y={loc.center[1] + 9}
                                  textAnchor="middle"
                                  className="khan-val-sub"
                                >
                                  {formatMetricSubValue(val, heatMetric)}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      ) : (
                        <svg
                          viewBox={cambodia.viewBox}
                          className="cambodia-svg-map"
                          role="img"
                          aria-label="Cambodia Provinces Map"
                        >
                          {cambodia.locations.map((loc: any) => {
                            const val = provValues.map.get(loc.id) || 0;
                            const isSelected = schoolProvince === loc.id;
                            const isHovered = hoveredKhan === loc.id;
                            const fill = getDistrictHeatFill(val, provValues.min, provValues.max, heatMetric, isSelected, isHovered);

                            return (
                              <path
                                key={loc.id}
                                id={loc.id}
                                d={loc.path}
                                className={`province-path ${isSelected ? "selected" : ""}`}
                                style={{ fill }}
                                onClick={() => {
                                  setSchoolProvince(schoolProvince === loc.id ? "all" : loc.id);
                                  if (loc.id !== "phnom-penh") setSchoolKhan("all");
                                }}
                                onMouseEnter={() => setHoveredKhan(loc.id)}
                                onMouseLeave={() => setHoveredKhan(null)}
                              >
                                <title>
                                  {`${loc.name}: ${numberFormat.format(val)} (${heatMetric})`}
                                </title>
                              </path>
                            );
                          })}
                        </svg>
                      )}
                      <div className="map-legend">
                        <span>{numberFormat.format(mapViewMode === "phnom-penh" ? khanValues.min : provValues.min)}</span>
                        <i />
                        <span>{numberFormat.format(mapViewMode === "phnom-penh" ? khanValues.max : provValues.max)}</span>
                      </div>
                    </div>

                    {/* Sidebar Pane for active Khan or Province */}
                    <div className="heatmap-sidebar-pane">
                      {mapViewMode === "phnom-penh" ? (
                        <div className="khan-info-card">
                          <div className="khan-info-head">
                            <div className="khan-info-head-text">
                              <h4>{language === "km" ? activeKhanStats?.nameKm || "ខណ្ឌ" : activeKhanStats?.nameEn || "Khan"}</h4>
                              <span>{language === "km" ? activeKhanStats?.nameEn : activeKhanStats?.nameKm}</span>
                            </div>
                            <span className="khan-badge">
                              {activeKhanStats?.schoolsCount || 0} {t.schools}
                            </span>
                          </div>

                          <div className="khan-kpi-grid">
                            <div className="khan-kpi-item">
                              <span>{t.candidates}</span>
                              <strong>{numberFormat.format(activeKhanStats?.candidateCount || 0)}</strong>
                              <small>♀ {activeKhanStats?.femalePercent?.toFixed(1) || 0}% {t.femalePercent}</small>
                            </div>
                            <div className="khan-kpi-item">
                              <span>{t.colGradeA}</span>
                              <strong style={{ color: "#d97706" }}>{numberFormat.format(activeKhanStats?.gradeA || 0)}</strong>
                              <small>{activeKhanStats?.gradeAPercent?.toFixed(1) || 0}% {t.gradeARateLabel}</small>
                              {activeKhanStats && activeKhanStats.gradeA > 0 && (
                                <div className="khan-grade-a-sub">
                                  <span className="sc-sub">⚛ {numberFormat.format(activeKhanStats.gradeAScience || 0)}</span>
                                  <span className="divider">·</span>
                                  <span className="so-sub">📖 {numberFormat.format(activeKhanStats.gradeASocial || 0)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Science vs Social Track Bar for District */}
                          {activeKhanStats && (activeKhanStats.scienceCount > 0 || activeKhanStats.socialCount > 0) && (
                            <SchoolTrackSplitBar
                              science={activeKhanStats.scienceCount}
                              social={activeKhanStats.socialCount}
                              language={language}
                            />
                          )}

                          {/* Top High Schools in this Khan */}
                          {activeKhanStats?.topSchools && activeKhanStats.topSchools.length > 0 && (
                            <div className="khan-top-schools-box">
                              <span className="box-title">{t.gradeAChampions}</span>
                              <div className="khan-top-schools-list">
                                {activeKhanStats.topSchools.map((sch, i) => (
                                  <div key={i} className="khan-top-school-row">
                                    <div className="khan-school-left">
                                      <OfficialSchoolImage
                                        year={selected.year}
                                        studentId={sch.sampleStudentId}
                                        fallback={sch.name}
                                      />
                                      {sch.branch && (
                                        <span className="school-branch-badge" style={{ fontSize: 10, padding: "1px 5px" }}>
                                          {sch.branch}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                                      <span className="khan-school-a-badge">
                                        {sch.gradeA} A
                                      </span>
                                      {sch.gradeA > 0 && (sch.gradeAScience !== undefined || sch.gradeASocial !== undefined) && (
                                        <span style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 600 }}>
                                          {sch.gradeAScience || 0} Sci · {sch.gradeASocial || 0} Soc
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            className={`khan-filter-btn ${schoolKhan === activeKhanId ? "active" : ""}`}
                            onClick={() => {
                              if (schoolKhan === activeKhanId) {
                                setSchoolKhan("all");
                              } else {
                                setSchoolKhan(activeKhanId);
                                setSchoolProvince("phnom-penh");
                                setActiveTab("schools");
                                window.location.hash = "#insights/schools";
                              }
                            }}
                          >
                            {schoolKhan === activeKhanId ? (
                              <>✓ {t.clearKhanFilter}</>
                            ) : (
                              <>🔍 {t.filterByKhan} ({language === "km" ? activeKhanStats?.nameKm : activeKhanStats?.nameEn})</>
                            )}
                          </button>
                        </div>
                      ) : (
                        (() => {
                          const selectedProvItem = schoolProvince !== "all" ? selected.provinces.find((p) => p.id === schoolProvince) : null;
                          return (
                            <div className="khan-info-card">
                              <div className="khan-info-head">
                                <div className="khan-info-head-text">
                                  <h4>{selectedProvItem ? (language === "km" ? selectedProvItem.name : provinceEnglish[selectedProvItem.id] || selectedProvItem.name) : t.viewProvinces}</h4>
                                  <span>{selectedProvItem ? `${numberFormat.format(selectedProvItem.candidateCount)} ${t.candidates}` : `${selected.provinceCount} ${t.provinces}`}</span>
                                </div>
                                {selectedProvItem && (
                                  <span className="khan-badge">
                                    {selectedProvItem.schoolCount} {t.schools}
                                  </span>
                                )}
                              </div>

                              <div className="khan-kpi-grid">
                                <div className="khan-kpi-item">
                                  <span>{t.candidates}</span>
                                  <strong>{numberFormat.format(selectedProvItem ? selectedProvItem.candidateCount : selected.candidateCount)}</strong>
                                  <small>{selectedProvItem ? `${selectedProvItem.centerCount} ${t.centers}` : `${selected.centerCount} ${t.centers}`}</small>
                                </div>
                                <div className="khan-kpi-item">
                                  <span>{t.colGradeA}</span>
                                  <strong style={{ color: "#d97706" }}>
                                    {numberFormat.format(selectedProvItem ? (selectedProvItem.gradeA || selectedProvItem.grades.A) : (selected.grades.find(g => g.grade === 'A')?.count || 2022))}
                                  </strong>
                                  {selectedProvItem && selectedProvItem.gradeA > 0 && (
                                    <div className="khan-grade-a-sub">
                                      <span className="sc-sub">⚛ {numberFormat.format(selectedProvItem.gradeAScience || 0)}</span>
                                      <span className="divider">·</span>
                                      <span className="so-sub">📖 {numberFormat.format(selectedProvItem.gradeASocial || 0)}</span>
                                    </div>
                                  )}
                                  {!selectedProvItem && (
                                    <small>{selected.candidateCount > 0 ? (((selected.grades.find(g => g.grade === 'A')?.count || 2022) / selected.candidateCount) * 100).toFixed(2) : 0}% {t.gradeARateLabel}</small>
                                  )}
                                </div>
                              </div>

                              {selectedProvItem && (selectedProvItem.scienceCount > 0 || selectedProvItem.socialScienceCount > 0) && (
                                <SchoolTrackSplitBar
                                  science={selectedProvItem.scienceCount}
                                  social={selectedProvItem.socialScienceCount}
                                  language={language}
                                />
                              )}

                              <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0" }}>
                                {language === "km"
                                  ? (selectedProvItem ? "ចុចលើខេត្តដទៃទៀត ឬប្ដូរទៅរាជធានីភ្នំពេញដើម្បីវិភាគលម្អិត" : "ចុចលើខេត្តណាមួយលើផែនទីដើម្បីចម្រាញ់យកអាគតដ្ឋានក្នុងខេត្តនោះ")
                                  : (selectedProvItem ? "Click another province or switch to Phnom Penh for district analytics." : "Click any province on the map to filter schools to that province.")}
                              </p>

                              {schoolProvince !== "all" && (
                                <button
                                  type="button"
                                  className="khan-filter-btn active"
                                  onClick={() => setSchoolProvince("all")}
                                >
                                  ✓ {t.allProvinces}
                                </button>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: SUBJECT LEVEL ANALYSIS (វិភាគតាមមុខវិជ្ជា) */}
          {activeTab === "subjects" && (
            <div className="tab-pane subject-tab-pane">
              <section className="subject-section shell" aria-label={t.subjectAnalysisTitle}>
                <div className="subject-section-head">
                  <div>
                    <span className="eyebrow"><Sparkles size={14} /> {t.subjectAnalysisTitle}</span>
                    <h2>{t.subjectAnalysisTitle}</h2>
                    <p>{t.subjectAnalysisSubtitle}</p>
                  </div>

                  <div className="tab-controls-right">
                    <YearSelector
                      selectedYear={selectedYear}
                      summaries={summaries}
                      onSelectYear={setSelectedYear}
                      label={t.year}
                    />

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

                    {/* Subject Difficulty Index Card */}
                    {trackSubjectRankings.length > 0 && (
                      <article className="insight-card subject-difficulty-card">
                        <div className="dashboard-card-head">
                          <div>
                            <span className="eyebrow"><Flame size={14} /> {selected.year} · {selectedTrack === "science" ? t.scienceTrack : t.socialTrack}</span>
                            <h2>{t.subjectDifficultyTitle}</h2>
                            <p className="card-subtext">{t.subjectDifficultySubtitle}</p>
                          </div>
                        </div>
                        <div className="difficulty-grid">
                          {trackSubjectRankings.map((subj, idx) => {
                            const isSelected = subj.key === selectedSubject;
                            const isHardest = idx === 0;
                            const isEasiest = idx === trackSubjectRankings.length - 1;
                            return (
                              <div
                                key={subj.key}
                                className={`difficulty-item ${isSelected ? "selected" : ""}`}
                                onClick={() => setSelectedSubject(subj.key)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") setSelectedSubject(subj.key);
                                }}
                              >
                                <div className="difficulty-item-header">
                                  <div className="difficulty-title-left">
                                    <span className="difficulty-rank">#{idx + 1}</span>
                                    <span className="difficulty-icon">{renderSubjectIcon(subj.key)}</span>
                                    <strong className="difficulty-name">
                                      {language === "km" ? subj.nameKm : subj.nameEn}
                                    </strong>
                                  </div>
                                  <div className="difficulty-tags">
                                    {isHardest && <span className="diff-badge hardest">{t.hardestSubject}</span>}
                                    {isEasiest && <span className="diff-badge easiest">{t.easiestSubject}</span>}
                                    {isSelected && <span className="diff-badge current">{t.subjectSelected}</span>}
                                  </div>
                                </div>

                                <div className="difficulty-stats-row">
                                  <div className="diff-stat fail">
                                    <span>{t.gradeFRate}</span>
                                    <strong>{subj.gradeFRate}%</strong>
                                  </div>
                                  <div className="diff-stat grade-a">
                                    <span>{t.gradeAPct}</span>
                                    <strong>{subj.gradeARate.toFixed(1)}%</strong>
                                  </div>
                                  <div className="diff-stat pass">
                                    <span>{t.subjectPassRate}</span>
                                    <strong>{subj.passRate.toFixed(1)}%</strong>
                                  </div>
                                </div>

                                <div className="difficulty-mini-bar" title={`F: ${subj.gradeFRate}%, Pass: ${subj.passRate}%`}>
                                  <div className="diff-bar-fail" style={{ width: `${Math.min(100, subj.gradeFRate)}%` }} />
                                  <div className="diff-bar-pass" style={{ width: `${Math.max(0, 100 - subj.gradeFRate)}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    )}

                    {/* Top 3 អាគតដ្ឋាន Champions in this Subject */}
                    {subjectChampions.length > 0 && (
                      <div className="school-champions-block">
                        <div className="champions-header">
                          <div className="champions-header-left">
                            <Trophy size={18} className="champions-trophy-icon" />
                            <div>
                              <h3>{t.subjectChampionsTitle}</h3>
                              <p>{t.subjectChampionsHelp}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="podium-toggle-btn"
                            onClick={() => setShowSubjectPodium(!showSubjectPodium)}
                            aria-expanded={showSubjectPodium}
                          >
                            {showSubjectPodium ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span>{showSubjectPodium ? t.togglePodiumHide : t.togglePodiumShow}</span>
                          </button>
                        </div>

                        {showSubjectPodium && (
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
                                <article key={`${champion.province}-${champion.name}-${champion.branch || ""}`} className={`school-champion-card medal-${medalClass}`}>
                                  <div className="champion-card-top">
                                    <span className={`champion-rank-badge rank-${idx + 1}`}>
                                      <Award size={14} />
                                      #{idx + 1}
                                    </span>
                                    <span className={`school-type-badge ${champion.schoolType || "public"}`}>
                                      {champion.schoolType === "private" ? "⭐ " : "🏛️ "}
                                      {champion.schoolType === "private" ? (language === "km" ? t.typePrivateShort : "Private") : (language === "km" ? t.typePublicShort : "Public")}
                                    </span>
                                    {champion.branch && (
                                      <span className="school-branch-badge">
                                        <Building2 size={11} /> {champion.branch}
                                      </span>
                                    )}
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
                        )}
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
                            value={subjectSchoolTypeFilter}
                            onChange={(e) => setSubjectSchoolTypeFilter(e.target.value as any)}
                          >
                            <option value="all">{t.typeAll}</option>
                            <option value="public">🏛️ {t.typePublic}</option>
                            <option value="private">⭐ {t.typePrivate}</option>
                          </select>
                        </label>

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

                      <div className="view-mode-toggle" role="group" aria-label={t.viewMode}>
                        <button
                          type="button"
                          className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
                          onClick={() => setViewMode("table")}
                          title={t.viewTable}
                          aria-pressed={viewMode === "table"}
                        >
                          <TableIcon size={14} />
                          <span>{t.viewTable}</span>
                        </button>
                        <button
                          type="button"
                          className={`view-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                          onClick={() => setViewMode("cards")}
                          title={t.viewCards}
                          aria-pressed={viewMode === "cards"}
                        >
                          <LayoutGrid size={14} />
                          <span>{t.viewCards}</span>
                        </button>
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
                    ) : viewMode === "table" ? (
                      <div className="compact-table-wrap">
                        <table className="compact-school-table">
                          <thead>
                            <tr>
                              <th className="th-rank">{t.colRank}</th>
                              <th className="th-school">{t.colSchool}</th>
                              <th className="th-province">{t.colProvince}</th>
                              <th className="th-num">{t.colCandidates}</th>
                              <th className="th-pass">{t.colPassRate}</th>
                              <th className="th-grade-a">{t.colGradeA}</th>
                              <th className="th-bar">{t.colSubjectDistribution}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleSubjectSchools.map((school, index) => {
                              const provObj = selected.provinces.find(
                                (p) => p.id === school.provinceId || p.id === school.province || p.name === school.province
                              );
                              const provLabel =
                                language === "km"
                                  ? provObj?.name || school.province
                                  : provinceEnglish[school.provinceId || school.province] || school.province;

                              return (
                                <tr key={`${school.province}-${school.name}-${school.branch || ""}`}>
                                  <td className="td-rank">#{index + 1}</td>
                                  <td className="td-school">
                                    <div className="table-school-cell">
                                      <OfficialSchoolImage
                                        year={selected.year}
                                        studentId={school.sampleStudentId}
                                        fallback={school.name}
                                      />
                                      <span className={`school-type-badge ${school.schoolType || "public"}`}>
                                        {school.schoolType === "private" ? "⭐ " : "🏛️ "}
                                        {school.schoolType === "private" ? (language === "km" ? t.typePrivateShort : "Private") : (language === "km" ? t.typePublicShort : "Public")}
                                      </span>
                                      {school.branch && (
                                        <span className="school-branch-badge">
                                          <Building2 size={11} /> {school.branch}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="td-province">
                                    <span className="table-prov-chip">{provLabel}</span>
                                  </td>
                                  <td className="td-num">
                                    <strong>{numberFormat.format(school.totalCandidates)}</strong>
                                  </td>
                                  <td className="td-pass">
                                    <span className="pass-rate-badge">{school.passPercent.toFixed(1)}%</span>
                                  </td>
                                  <td className="td-grade-a">
                                    <span className={`grade-a-badge ${school.gradeA > 0 ? "has-a" : "zero-a"}`}>
                                      <strong>{numberFormat.format(school.gradeA)}</strong>
                                      <small>({school.gradeAPercent.toFixed(1)}%)</small>
                                    </span>
                                  </td>
                                  <td className="td-bar">
                                    <SubjectStackedGradeBar grades={school.grades} total={school.totalCandidates} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
                            <article key={`${school.province}-${school.name}-${school.branch || ""}`} className="school-row-card">
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
                                    <span className={`school-type-badge ${school.schoolType || "public"}`}>
                                      {school.schoolType === "private" ? "⭐ " : "🏛️ "}
                                      {school.schoolType === "private" ? (language === "km" ? t.typePrivate : "Private") : (language === "km" ? t.typePublic : "Public")}
                                    </span>
                                    {school.branch && (
                                      <span className="school-branch-badge">
                                        <Building2 size={11} /> {school.branch}
                                      </span>
                                    )}
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

          {/* TAB 4: STUDENT ANALYSIS & STRAIGHT A (A គ្រប់មុខ) */}
          {activeTab === "students" && (
            <div className="tab-pane">
              {/* Hero Banner */}
              <section className="student-hero-banner shell">
                <div className="student-hero-content">
                  <div className="student-hero-left">
                    <div className="student-hero-badge">
                      <Award size={18} />
                      <span>{t.tabStudents}</span>
                    </div>
                    <h2>{t.studentAnalysisTitle}</h2>
                    <p>{t.studentAnalysisSubtitle}</p>
                  </div>
                  <div className="tab-controls-right">
                    <YearSelector
                      selectedYear={selectedYear}
                      summaries={summaries}
                      onSelectYear={setSelectedYear}
                      label={t.year}
                    />
                  </div>
                </div>
              </section>

              {/* Student KPI Cards */}
              <section className="student-kpis-grid shell" aria-label="Student Analysis KPIs">
                {/* Straight A 36 Hero Card */}
                <article
                  className="insight-kpi-card student-hero-kpi-card"
                  style={{
                    background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.05) 100%)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setStudentACountFilter(7);
                    setStudentProvince("all");
                    setStudentTrackFilter("all");
                    setStudentGenderFilter("all");
                    setStudentSchoolTypeFilter("all");
                  }}
                  title={language === "km" ? "ចុចដើម្បីមើលសិស្ស A គ្រប់មុខ" : "Click to view straight A achievers"}
                >
                  <div className="kpi-top">
                    <span>{t.kpiStraightA}</span>
                    <span className="kpi-icon-pill" style={{ background: "rgba(245, 158, 11, 0.2)", color: "#d97706" }}>
                      <Trophy size={16} />
                    </span>
                  </div>
                  <div className="kpi-value-row">
                    <strong style={{ color: "#d97706" }}>
                      {numberFormat.format(studentStats ? studentStats.straightACount : 0)}
                    </strong>
                    <span className="kpi-unit">{language === "km" ? "នាក់" : "students"}</span>
                  </div>
                  <div className="kpi-progress-track">
                    <div
                      className="kpi-progress-bar"
                      style={{
                        width: "100%",
                        background: "linear-gradient(90deg, #f59e0b, #d97706)",
                      }}
                    />
                  </div>
                  <small className="kpi-subtext">
                    {studentStats && studentStats.straightACount > 0
                      ? language === "km"
                        ? `ស្រី ${studentStats.femaleStraightA} នាក់ (${((studentStats.femaleStraightA / studentStats.straightACount) * 100).toFixed(1)}%), ប្រុស ${studentStats.maleStraightA} នាក់ · ${studentStats.scienceStraightA > 0 && studentStats.socialStraightA === 0 ? "វិទ្យាសាស្ត្រ ១០០%" : `វិទ្យាសាស្ត្រ ${studentStats.scienceStraightA}, សង្គម ${studentStats.socialStraightA}`}`
                        : `${studentStats.femaleStraightA} female (${((studentStats.femaleStraightA / studentStats.straightACount) * 100).toFixed(1)}%), ${studentStats.maleStraightA} male · ${studentStats.scienceStraightA > 0 && studentStats.socialStraightA === 0 ? "100% Science" : `Science: ${studentStats.scienceStraightA}, Social: ${studentStats.socialStraightA}`}`
                      : t.kpiStraightASub}
                  </small>
                </article>

                {/* Total Candidates Analyzed */}
                <article className="insight-kpi-card">
                  <div className="kpi-top">
                    <span>{t.kpiTotalCandidates}</span>
                    <span className="kpi-icon-pill">
                      <Users size={16} />
                    </span>
                  </div>
                  <div className="kpi-value-row">
                    <strong>
                      {numberFormat.format(studentStats ? studentStats.totalCandidates : selected.candidateCount)}
                    </strong>
                    <span className="kpi-unit">{language === "km" ? "នាក់" : "candidates"}</span>
                  </div>
                  <div className="kpi-progress-track">
                    <div
                      className="kpi-progress-bar"
                      style={{
                        width: `${studentStats ? studentStats.femalePercent : 55.2}%`,
                        background: "#ec4899",
                      }}
                    />
                  </div>
                  <small className="kpi-subtext">
                    {studentStats
                      ? language === "km"
                        ? `ស្រី ${numberFormat.format(studentStats.femaleTotal)} (${studentStats.femalePercent}%) · ប្រុស ${numberFormat.format(studentStats.maleTotal)} (${studentStats.malePercent}%)`
                        : `${numberFormat.format(studentStats.femaleTotal)} female (${studentStats.femalePercent}%) · ${numberFormat.format(studentStats.maleTotal)} male (${studentStats.malePercent}%)`
                      : t.kpiTotalCandidatesSub}
                  </small>
                </article>

                {/* Overall Grade A Candidates */}
                <article
                  className="insight-kpi-card"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setStudentACountFilter("all");
                    setStudentProvince("all");
                    setStudentTrackFilter("all");
                    setStudentGenderFilter("all");
                    setStudentSchoolTypeFilter("all");
                  }}
                  title="Click to view all Grade A candidates"
                >
                  <div className="kpi-top">
                    <span>{t.kpiGradeAAll}</span>
                    <span className="kpi-icon-pill" style={{ background: "rgba(217, 119, 6, 0.15)", color: "#d97706" }}>
                      <Award size={16} />
                    </span>
                  </div>
                  <div className="kpi-value-row">
                    <strong style={{ color: "#d97706" }}>
                      {numberFormat.format(studentStats ? studentStats.gradeACount : (selected.grades.find(g => g.grade === 'A')?.count || 0))}
                    </strong>
                    <span className="kpi-unit">{language === "km" ? "នាក់" : "candidates"}</span>
                  </div>
                  <div className="kpi-progress-track">
                    <div
                      className="kpi-progress-bar"
                      style={{
                        width: `${studentStats && studentStats.gradeACount > 0 ? ((studentStats.scienceGradeA / studentStats.gradeACount) * 100).toFixed(0) : 90}%`,
                        background: "#06b6d4",
                      }}
                    />
                  </div>
                  <small className="kpi-subtext">
                    {studentStats && studentStats.gradeACount > 0
                      ? language === "km"
                        ? `វិទ្យាសាស្ត្រ ${numberFormat.format(studentStats.scienceGradeA)} (${((studentStats.scienceGradeA / studentStats.gradeACount) * 100).toFixed(1)}%) · សង្គម ${numberFormat.format(studentStats.socialGradeA)}`
                        : `Science: ${numberFormat.format(studentStats.scienceGradeA)} (${((studentStats.scienceGradeA / studentStats.gradeACount) * 100).toFixed(1)}%) · Social: ${numberFormat.format(studentStats.socialGradeA)}`
                      : t.kpiGradeAAllSub}
                  </small>
                </article>

                {/* Public vs Private Straight A */}
                <article className="insight-kpi-card">
                  <div className="kpi-top">
                    <span>{t.kpiPublicVsPrivate}</span>
                    <span className="kpi-icon-pill" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                      <Building2 size={16} />
                    </span>
                  </div>
                  <div className="kpi-value-row">
                    <strong>
                      {studentStats?.publicVsPrivateStraightA?.public ?? 0} <span style={{ fontSize: "16px", color: "var(--muted)", fontWeight: 500 }}>vs</span> {studentStats?.publicVsPrivateStraightA?.private ?? 0}
                    </strong>
                    <span className="kpi-unit">{language === "km" ? "រដ្ឋ / ឯកជន" : "Pub / Priv"}</span>
                  </div>
                  <div className="kpi-progress-track" style={{ display: "flex", gap: "2px" }}>
                    <div
                      style={{
                        width: `${studentStats?.publicVsPrivateStraightA && studentStats.straightACount > 0 ? (studentStats.publicVsPrivateStraightA.public / studentStats.straightACount) * 100 : 50}%`,
                        height: "100%",
                        background: "#3b82f6",
                        borderRadius: "3px 0 0 3px",
                      }}
                      title="Public"
                    />
                    <div
                      style={{
                        width: `${studentStats?.publicVsPrivateStraightA && studentStats.straightACount > 0 ? (studentStats.publicVsPrivateStraightA.private / studentStats.straightACount) * 100 : 50}%`,
                        height: "100%",
                        background: "#10b981",
                        borderRadius: "0 3px 3px 0",
                      }}
                      title="Private"
                    />
                  </div>
                  <small className="kpi-subtext">
                    {studentStats && studentStats.publicVsPrivateStraightA && studentStats.straightACount > 0
                      ? language === "km"
                        ? `រដ្ឋ ${studentStats.publicVsPrivateStraightA.public} នាក់ (${((studentStats.publicVsPrivateStraightA.public / studentStats.straightACount) * 100).toFixed(1)}%) · ឯកជន ${studentStats.publicVsPrivateStraightA.private} នាក់ (${((studentStats.publicVsPrivateStraightA.private / studentStats.straightACount) * 100).toFixed(1)}%)`
                        : `Public: ${studentStats.publicVsPrivateStraightA.public} (${((studentStats.publicVsPrivateStraightA.public / studentStats.straightACount) * 100).toFixed(1)}%) · Private: ${studentStats.publicVsPrivateStraightA.private} (${((studentStats.publicVsPrivateStraightA.private / studentStats.straightACount) * 100).toFixed(1)}%)`
                      : t.kpiPublicVsPrivateSub}
                  </small>
                </article>
              </section>

              {/* A-Count Distribution Chips */}
              {(() => {
                const count7 = studentStats?.straightACount ?? aCountCountMap.get(7) ?? 0;
                const count6 = aCountCountMap.get(6) ?? 0;
                const count5 = aCountCountMap.get(5) ?? 0;
                const count4 = aCountCountMap.get(4) ?? 0;
                const count3 = aCountCountMap.get(3) ?? 0;
                const count2 = aCountCountMap.get(2) ?? 0;
                const count1 = aCountCountMap.get(1) ?? 0;
                const countAll = studentStats?.gradeACount ?? 0;

                return (
                  <section className="shell" style={{ marginTop: "24px" }}>
                    <div className="student-acount-box">
                      <div className="student-acount-header">
                        <div>
                          <h3>{t.aCountBreakdownTitle}</h3>
                          <p>{t.aCountBreakdownSub}</p>
                        </div>
                        <span className="student-filter-indicator">
                          {studentACountFilter === 7 ? (
                            <span className="gold-text-badge">⭐ {language === "km" ? "កំពុងជ្រើសរើស A គ្រប់មុខ (៧/៧)" : "Viewing Straight A (7/7)"}</span>
                          ) : studentACountFilter === "all" ? (
                            <span>{language === "km" ? "និទ្ទេស A ទាំងអស់" : "All Grade A"}</span>
                          ) : (
                            <span>{studentACountFilter} {language === "km" ? "មុខ A" : "As"}</span>
                          )}
                        </span>
                      </div>

                      <div className="acount-chips-row">
                        <button
                          type="button"
                          className={`acount-chip-btn straight-a-chip ${studentACountFilter === 7 ? "active" : ""}`}
                          onClick={() => setStudentACountFilter(7)}
                        >
                          <Trophy size={14} />
                          <span className="chip-label">
                            {t.chip7As} ({numberFormat.format(count7)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`acount-chip-btn ${studentACountFilter === 6 ? "active" : ""}`}
                          onClick={() => setStudentACountFilter(6)}
                        >
                          <span className="chip-label">
                            {t.chip6As} ({numberFormat.format(count6)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`acount-chip-btn ${studentACountFilter === 5 ? "active" : ""}`}
                          onClick={() => setStudentACountFilter(5)}
                        >
                          <span className="chip-label">
                            {t.chip5As} ({numberFormat.format(count5)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`acount-chip-btn ${studentACountFilter === 4 ? "active" : ""}`}
                          onClick={() => setStudentACountFilter(4)}
                        >
                          <span className="chip-label">
                            {t.chip4As} ({numberFormat.format(count4)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`acount-chip-btn ${studentACountFilter === 3 ? "active" : ""}`}
                          onClick={() => setStudentACountFilter(3)}
                        >
                          <span className="chip-label">
                            {t.chip3As} ({numberFormat.format(count3)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`acount-chip-btn ${studentACountFilter === 2 ? "active" : ""}`}
                          onClick={() => setStudentACountFilter(2)}
                        >
                          <span className="chip-label">
                            {t.chip2As} ({numberFormat.format(count2)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`acount-chip-btn ${studentACountFilter === 1 ? "active" : ""}`}
                          onClick={() => setStudentACountFilter(1)}
                        >
                          <span className="chip-label">
                            {t.chip1A} ({numberFormat.format(count1)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`acount-chip-btn all-a-chip ${studentACountFilter === "all" ? "active" : ""}`}
                          onClick={() => setStudentACountFilter("all")}
                        >
                          <span className="chip-label">
                            {t.chipAllA} ({numberFormat.format(countAll)}{language === "km" ? " នាក់" : ""})
                          </span>
                        </button>
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* Straight A Deep-Dive Widgets (Top Provinces & Top Schools) */}
              {studentStats && Array.isArray(studentStats.topStraightAProvinces) && Array.isArray(studentStats.topStraightASchools) && (
                <section className="student-insights-widgets shell" style={{ marginTop: "24px" }}>
                  <div className="student-widgets-grid">
                    {/* Top Provinces for Straight A */}
                    <article className="insight-card student-widget-card">
                      <div className="dashboard-card-head">
                        <div>
                          <span>{selected.year} · {language === "km" ? "សិស្ស A គ្រប់មុខ" : "Straight A Achievers"}</span>
                          <h2>{t.topStraightAProvinces}</h2>
                        </div>
                        <MapPin size={18} />
                      </div>
                      <div className="dashboard-ranking">
                        {studentStats.topStraightAProvinces.map((prov, index) => {
                          const maxCount = studentStats.topStraightAProvinces[0]?.count || 1;
                          const provDisplay = language === "km" ? prov.name : provinceEnglish[prov.id] || prov.name;
                          return (
                            <div
                              key={prov.id}
                              style={{ cursor: "pointer" }}
                              onClick={() => {
                                setStudentACountFilter(7);
                                setStudentProvince(prov.id);
                              }}
                              title={`Filter Straight A in ${provDisplay}`}
                            >
                              <b>{String(index + 1).padStart(2, "0")}</b>
                              <span>
                                {provDisplay}
                                <i style={{ width: `${(prov.count / maxCount) * 100}%`, background: "linear-gradient(90deg, #f59e0b, #d97706)" }} />
                              </span>
                              <strong>
                                {prov.count} <small>{language === "km" ? "នាក់" : "students"}</small>
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    </article>

                    {/* Top Schools for Straight A */}
                    <article className="insight-card student-widget-card">
                      <div className="dashboard-card-head">
                        <div>
                          <span>{selected.year} · {language === "km" ? "សិស្ស A គ្រប់មុខ" : "Straight A Achievers"}</span>
                          <h2>{t.topStraightASchools}</h2>
                        </div>
                        <School size={18} />
                      </div>
                      <div className="dashboard-ranking">
                        {studentStats.topStraightASchools.map((sch, index) => {
                          const maxCount = studentStats.topStraightASchools[0]?.count || 1;
                          return (
                            <div
                              key={`${sch.name}-${index}`}
                              style={{ cursor: "pointer" }}
                              onClick={() => {
                                setStudentACountFilter(7);
                                setStudentSearch(sch.name);
                              }}
                              title={`Filter Straight A at ${sch.name}`}
                            >
                              <b>{String(index + 1).padStart(2, "0")}</b>
                              <span>
                                {sch.name}
                                <span className={`table-type-pill pill-${sch.schoolType}`} style={{ marginLeft: "6px", fontSize: "10px", padding: "1px 5px" }}>
                                  {sch.schoolType === "private" ? t.typePrivateShort : t.typePublicShort}
                                </span>
                                <i style={{ width: `${(sch.count / maxCount) * 100}%`, background: "linear-gradient(90deg, #3b82f6, #6366f1)" }} />
                              </span>
                              <strong>
                                {sch.count} <small>{language === "km" ? "នាក់" : "students"}</small>
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  </div>
                </section>
              )}

              {/* Student Roster Header & Filter Controls */}
              <section className="school-analysis-section shell" style={{ marginTop: "32px" }}>
                <div className="all-schools-header">
                  <div>
                    <div className="section-eyebrow">
                      <Sparkles size={14} />
                      <span>{language === "km" ? "បញ្ជីរាយនាមសិស្ស" : "Candidate Roster"}</span>
                    </div>
                    <h2>{t.straightAExplorationTitle}</h2>
                    <p>{t.straightAExplorationSub}</p>
                  </div>

                  {/* View Mode Toggle */}
                  <div className="view-mode-toggle" role="group" aria-label={t.viewMode}>
                    <button
                      type="button"
                      className={`view-toggle-btn ${studentViewMode === "cards" ? "active" : ""}`}
                      onClick={() => setStudentViewMode("cards")}
                      title={t.viewCards}
                      aria-pressed={studentViewMode === "cards"}
                    >
                      <LayoutGrid size={14} />
                      <span>{t.viewCards}</span>
                    </button>
                    <button
                      type="button"
                      className={`view-toggle-btn ${studentViewMode === "table" ? "active" : ""}`}
                      onClick={() => setStudentViewMode("table")}
                      title={t.viewTable}
                      aria-pressed={studentViewMode === "table"}
                    >
                      <TableIcon size={14} />
                      <span>{t.viewTable}</span>
                    </button>
                  </div>
                </div>

                {/* Filter Toolbar */}
                <div className="school-filters-toolbar" style={{ flexWrap: "wrap" }}>
                  {/* Search */}
                  <div className="school-search-box" style={{ minWidth: "260px", flex: "1 1 260px" }}>
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder={t.searchStudentPlaceholder}
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                    {studentSearch && (
                      <button
                        type="button"
                        className="clear-search-btn"
                        onClick={() => setStudentSearch("")}
                        aria-label="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Year Filter */}
                  <div className="school-filter-select">
                    <Calendar size={15} />
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      aria-label={t.year}
                    >
                      {summaries.map((s) => (
                        <option key={s.year} value={s.year}>
                          {s.year}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Province Filter */}
                  <div className="school-filter-select">
                    <MapPin size={15} />
                    <select
                      value={studentProvince}
                      onChange={(e) => setStudentProvince(e.target.value)}
                      aria-label={t.studentCardProvince}
                    >
                      <option value="all">{t.allProvinces}</option>
                      {selected.provinces.map((prov) => (
                        <option key={prov.id} value={prov.id}>
                          {language === "km" ? prov.name : provinceEnglish[prov.id] || prov.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Track Filter */}
                  <div className="school-filter-select">
                    <select
                      value={studentTrackFilter}
                      onChange={(e) => setStudentTrackFilter(e.target.value as any)}
                      aria-label={t.chooseTrack}
                    >
                      <option value="all">{t.allTracks}</option>
                      <option value="science">{t.scienceTrack}</option>
                      <option value="social-science">{t.socialTrack}</option>
                    </select>
                  </div>

                  {/* Gender Filter */}
                  <div className="school-filter-select">
                    <Users size={15} />
                    <select
                      value={studentGenderFilter}
                      onChange={(e) => setStudentGenderFilter(e.target.value as any)}
                      aria-label="Gender"
                    >
                      <option value="all">{t.allGenders}</option>
                      <option value="female">{t.genderFemale}</option>
                      <option value="male">{t.genderMale}</option>
                    </select>
                  </div>

                  {/* School Type Filter */}
                  <div className="school-type-toggle-group">
                    <button
                      type="button"
                      className={`type-toggle-pill ${studentSchoolTypeFilter === "all" ? "active" : ""}`}
                      onClick={() => setStudentSchoolTypeFilter("all")}
                    >
                      {t.typeAll}
                    </button>
                    <button
                      type="button"
                      className={`type-toggle-pill ${studentSchoolTypeFilter === "public" ? "active" : ""}`}
                      onClick={() => setStudentSchoolTypeFilter("public")}
                    >
                      {t.typePublic}
                    </button>
                    <button
                      type="button"
                      className={`type-toggle-pill ${studentSchoolTypeFilter === "private" ? "active" : ""}`}
                      onClick={() => setStudentSchoolTypeFilter("private")}
                    >
                      {t.typePrivate}
                    </button>
                  </div>
                </div>

                {/* Showing Count */}
                <div className="school-count-bar">
                  <span>{t.showingStudentsCount(students.length, totalStudents)}</span>
                  {studentACountFilter === 7 && studentStats && studentStats.straightACount > 0 && (
                    <span className="straight-a-filter-note">
                      ⭐ <strong>{language === "km" ? "និទ្ទេស A គ្រប់មុខ (៧ មុខ)" : "Straight A (7/7 Subjects)"}</strong>: {studentStats.straightACount} {language === "km" ? "នាក់" : "students"} · {language === "km" ? `ស្រី ${studentStats.femaleStraightA} នាក់ (${((studentStats.femaleStraightA / studentStats.straightACount) * 100).toFixed(1)}%), ប្រុស ${studentStats.maleStraightA} នាក់` : `${studentStats.femaleStraightA} female (${((studentStats.femaleStraightA / studentStats.straightACount) * 100).toFixed(1)}%), ${studentStats.maleStraightA} male`}
                    </span>
                  )}
                </div>

                {/* Loading / Empty / Content */}
                {loadingStudents ? (
                  <div className="archive-state">{t.loading}</div>
                ) : students.length === 0 ? (
                  <div className="no-schools-empty">
                    <GraduationCap size={48} />
                    <p>{t.noStudentsFound}</p>
                  </div>
                ) : studentViewMode === "cards" ? (
                  /* Cards Grid View */
                  <div className="student-cards-grid">
                    {students.map((student, idx) => {
                      const isStraightA = student.aCount === 7;
                      return (
                        <article
                          key={student.id}
                          className={`student-card ${isStraightA ? "straight-a-student-card" : ""}`}
                        >
                          {/* Card Ribbon / Header */}
                          <div className="student-card-top">
                            <div className="student-rank-badge">
                              <b>#{String(idx + 1).padStart(2, "0")}</b>
                              {isStraightA && (
                                <span className="straight-a-tag">
                                  ⭐ {language === "km" ? "A គ្រប់មុខ" : "Straight A"}
                                </span>
                              )}
                            </div>
                            <div className="student-table-pill">
                              <span>{t.studentCardTableNum}</span>
                              <strong>{student.tableNumber}</strong>
                            </div>
                          </div>

                          {/* Official Cropped Name */}
                          <div className="student-name-box">
                            <OfficialStudentNameImage
                              cropUrl={student.nameImage}
                              tableNumber={student.tableNumber}
                              nameFallback={student.name}
                              height={34}
                            />
                          </div>

                          {/* School Info */}
                          <div className="student-school-row">
                            <School size={14} />
                            <div className="student-school-text">
                              <span className="school-name-highlight">
                                {student.schoolBaseName || student.school}
                              </span>
                              {student.schoolBranch && (
                                <span className="school-branch-text">
                                  ({student.schoolBranch})
                                </span>
                              )}
                              <span className={`table-type-pill pill-${student.schoolType}`}>
                                {student.schoolType === "private" ? t.typePrivateShort : t.typePublicShort}
                              </span>
                            </div>
                          </div>

                          {/* Location & Exam Center */}
                          <div className="student-meta-row">
                            <span className="student-meta-item">
                              <MapPin size={12} />
                              {language === "km" ? student.province : provinceEnglish[student.provinceId] || student.province}
                            </span>
                            <span className="student-meta-item">
                              <Building2 size={12} />
                              {student.examCenter}
                            </span>
                          </div>

                          {/* Gender & Track Tags */}
                          <div className="student-tags-row">
                            <span className={`student-gender-tag ${student.gender === "ស" ? "gender-female" : "gender-male"}`}>
                              {student.gender === "ស" ? t.genderFemale : t.genderMale}
                            </span>
                            <span className="student-track-tag">
                              {student.track === "science" ? t.scienceTrack : t.socialTrack}
                            </span>
                            <span className="student-acount-badge">
                              {student.aCount} {language === "km" ? "មុខ A" : "As"}
                            </span>
                          </div>

                          {/* 7 Subject Grades Grid */}
                          <div className="student-subjects-container">
                            <span className="student-subjects-label">{t.studentSubjectsBreakdown}</span>
                            <div className="student-subject-badges">
                              {student.subjects.map((sub) => {
                                const isA = sub.grade === "A";
                                return (
                                  <div
                                    key={sub.key}
                                    className={`student-sub-badge ${isA ? "sub-grade-a" : `sub-grade-${sub.grade.toLowerCase()}`}`}
                                    title={`${sub.nameKm}: Grade ${sub.grade}`}
                                  >
                                    <span className="sub-name">{sub.nameKm}</span>
                                    <span className="sub-grade">{sub.grade}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Card Footer / Actions */}
                          <div className="student-card-actions">
                            <a
                              href={`#archive?year=${selected.year}&tableNumber=${student.tableNumber}`}
                              className="student-action-btn primary-action"
                              title="Open official result"
                            >
                              <ExternalLink size={13} />
                              <span>{language === "km" ? "មើលលទ្ធផលផ្លូវការ" : "View Full Result"}</span>
                            </a>
                            {student.documentId && (
                              <a
                                href={apiUrl(`/api/archive/${selected.year}/documents/${student.documentId}/pdf`)}
                                target="_blank"
                                rel="noreferrer"
                                className="student-action-btn secondary-action"
                                title="Open official PDF page"
                              >
                                <FileText size={13} />
                                <span>PDF (p.{student.pageNumber})</span>
                              </a>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  /* Compact Table View */
                  <div className="school-table-container">
                    <table className="school-table student-table">
                      <thead>
                        <tr>
                          <th style={{ width: "45px" }}>{t.colRank}</th>
                          <th style={{ width: "160px" }}>{language === "km" ? "ឈ្មោះផ្លូវការ (PDF)" : "Official Name"}</th>
                          <th style={{ width: "80px" }}>{t.studentCardTableNum}</th>
                          <th style={{ width: "65px" }}>{language === "km" ? "ភេទ" : "Gender"}</th>
                          <th>{t.colSchool}</th>
                          <th>{t.colProvince}</th>
                          <th>{t.colTrack}</th>
                          <th style={{ width: "70px", textAlign: "center" }}>{language === "km" ? "ចំនួន A" : "A Count"}</th>
                          <th style={{ minWidth: "220px" }}>{t.studentSubjectsBreakdown}</th>
                          <th style={{ width: "100px", textAlign: "center" }}>{language === "km" ? "សកម្មភាព" : "Action"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student, idx) => {
                          const isStraightA = student.aCount === 7;
                          return (
                            <tr key={student.id} className={isStraightA ? "straight-a-row" : ""}>
                              <td>
                                <span className={`table-rank-pill ${idx < 3 ? `top-${idx + 1}` : ""}`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td>
                                <OfficialStudentNameImage
                                  cropUrl={student.nameImage}
                                  tableNumber={student.tableNumber}
                                  nameFallback={student.name}
                                  height={26}
                                />
                              </td>
                              <td>
                                <b>#{student.tableNumber}</b>
                              </td>
                              <td>
                                <span className={`student-gender-tag small-tag ${student.gender === "ស" ? "gender-female" : "gender-male"}`}>
                                  {student.gender === "ស" ? t.genderFemale : t.genderMale}
                                </span>
                              </td>
                              <td>
                                <div className="student-table-school">
                                  <strong>{student.schoolBaseName || student.school}</strong>
                                  {student.schoolBranch && <small>({student.schoolBranch})</small>}
                                  <span className={`table-type-pill pill-${student.schoolType}`} style={{ marginLeft: "4px" }}>
                                    {student.schoolType === "private" ? t.typePrivateShort : t.typePublicShort}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <span>{language === "km" ? student.province : provinceEnglish[student.provinceId] || student.province}</span>
                              </td>
                              <td>
                                <span className="student-table-track">
                                  {student.track === "science" ? t.scienceTrackShort : t.socialTrackShort}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span className={`table-acount-pill ${isStraightA ? "straight-a-pill" : ""}`}>
                                  {student.aCount} / 7
                                </span>
                              </td>
                              <td>
                                <div className="table-subjects-mini-row">
                                  {student.subjects.map((sub) => (
                                    <span
                                      key={sub.key}
                                      className={`mini-sub-grade ${sub.grade === "A" ? "grade-a" : `grade-${sub.grade.toLowerCase()}`}`}
                                      title={`${sub.nameKm}: ${sub.grade}`}
                                    >
                                      {sub.grade}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div className="table-actions-cell">
                                  <a
                                    href={`#archive?year=${selected.year}&tableNumber=${student.tableNumber}`}
                                    className="table-action-link"
                                    title="View result"
                                  >
                                    <ExternalLink size={13} />
                                  </a>
                                  {student.documentId && (
                                    <a
                                      href={apiUrl(`/api/archive/${selected.year}/documents/${student.documentId}/pdf`)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="table-action-link pdf-btn"
                                      title="Open PDF"
                                    >
                                      <FileText size={13} />
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Show More / Show All Pagination Button */}
                {totalStudents > students.length && (
                  <div className="school-load-more" style={{ marginTop: "24px" }}>
                    <button
                      type="button"
                      className="school-more-button"
                      onClick={() => setStudentDisplayLimit((prev) => prev + 36)}
                    >
                      {t.showMore}
                    </button>
                    <button
                      type="button"
                      className="school-all-button"
                      onClick={() => setStudentDisplayLimit(totalStudents)}
                    >
                      {t.showAll} ({totalStudents})
                    </button>
                  </div>
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
