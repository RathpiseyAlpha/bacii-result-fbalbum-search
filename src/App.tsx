import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  Hash,
  Images,
  Link2,
  LoaderCircle,
  MapPin,
  MousePointer2,
  Moon,
  PackageCheck,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  Sun,
  Languages,
  X,
  Zap,
} from "lucide-react";

type Photo = {
  id: string;
  url: string;
  previewUrl: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
};

type Discovery = {
  id: string;
  status: "queued" | "working" | "ready" | "failed" | "cancelled";
  phase: string;
  current: number;
  total: number;
  photos: Photo[];
  cacheHit?: boolean;
  error?: string;
};

type ZipJob = {
  id: string;
  status: "queued" | "working" | "ready" | "failed" | "cancelled";
  phase: string;
  current: number;
  total: number;
  bytes: number;
  failures: number;
  fileName: string;
  error?: string;
};

type OcrRow = { number: string; name?: string };

type OcrPhotoResult = {
  photoId: string;
  photoIndex: number;
  status: "ready" | "skipped" | "failed";
  headerText: string;
  examCenter?: string;
  province?: string;
  track: "science" | "social-science" | "unknown";
  rows: OcrRow[];
  error?: string;
};

type OcrJob = {
  id: string;
  status: "queued" | "working" | "ready" | "failed" | "cancelled";
  phase: string;
  current: number;
  total: number;
  includeNames: boolean;
  model: string;
  results: OcrPhotoResult[];
  failures: number;
  cacheHits: number;
  error?: string;
};

type ServerLoad = {
  status: "busy" | "normal" | "idle";
  currentRequests: number;
  queuedRequests: number;
  updatedAt: number;
};

type CenterOption = { id: string; label: string; photoIds: Set<string>; count: number };
type Theme = "light" | "dark";
type Language = "en" | "km";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function preferredTheme(): Theme {
  try {
    const saved = window.localStorage.getItem("album-packer-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage may be disabled; system preference still works.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function preferredLanguage(): Language {
  try {
    const saved = window.localStorage.getItem("album-packer-language");
    if (saved === "en" || saved === "km") return saved;
  } catch {
    // Storage is optional.
  }
  return navigator.language.toLowerCase().startsWith("km") ? "km" : "en";
}

const englishText = {
  brandName: "BacII Result Search Engine",
  facebookSearch: "Facebook search", resultsArchive: "Results archive", insightsMenu: "Insights",
  how: "How it works",
  hero1: "Find the right result sheet.", hero2: "Without opening every photo.",
  heroCopy: "Paste the URL of BacII result from a MOEYS public Facebook result album, detect its exam centers and tracks, then enter the table number.",
  albumLink: "Album link", photoLinks: "Photo links", provinceUrl: "Please enter URL of Photo Albums of the post or Share URL", clearUrl: "Clear URL",
  scanning: "Scanning…", scanAlbum: "Scan album", publicNote: "Paste an album URL or the Share link copied from the Facebook app. Public albums only.",
  imageLinks: "Facebook image links, one per line", links: "links", fallback: "A reliable fallback when Facebook places the public album page behind a login wall.",
  largeAlbumWait: "This can take a few minutes for large albums.", upTo: "Up to 2,000 photos", quality: "Original available quality",
  autoZip: "Automatic ZIP packaging", readyPack: "Ready to pack", photosFound: "photos found", linksReady: "photo links ready",
  chooseZip: "Choose exactly what goes into your ZIP.", validateLinks: "We’ll validate each link while building your ZIP.", deselectAll: "Deselect all", selectAll: "Select all",
  finderTitle: "Find a BacII result sheet", finderHelp: "Detect exam centers and tracks from every photo, then look up the exact table number.",
  provinceUnknown: "Province not confidently detected", examCenter: "exam center", examCenters: "exam centers", examCenterStep: "1. Exam center",
  allCenters: "All exam centers", trackStep: "2. Track", allTracks: "All tracks", science: "Science · វិទ្យាសាស្ត្រ",
  social: "Social science · វិទ្យាសាស្ត្រសង្គម", tableStep: "3. Table number", tableExample: "e.g. 41", matching: "matching result photos",
  indexed: "indexed album photos", clearFilters: "Clear filters", detecting: "Detecting…", sheetsIndexed: "result sheets indexed locally.",
  restored: "restored from the database.", coverSkipped: "The cover is skipped automatically.", select: "Select", deselect: "Deselect", photo: "photo",
  view: "View", download: "Download", noMatch: "No matching result sheet", noMatchHelp: "Check the exam center, track, and exact number from column one.",
  tableNotFound: "Table number {number} was not found in any photo.", tableNotFoundHelp: "Check the number and try again.",
  downloadName: "Name your download", downloadHelp: "A folder with numbered photos will be placed inside the ZIP.", packing: "Packing…", buildZip: "Build ZIP",
  zipReady: "ZIP ready", photosPacked: "photos packed", processed: "processed", downloadZip: "Download ZIP",
  skippedOne: "expired or unavailable photo was skipped.", skippedMany: "expired or unavailable photos were skipped.", simple: "Simple by design",
  threeSteps: "From album to archive in three steps.", pasteAlbum: "Paste the album", pasteAlbumHelp: "Use any Facebook album that is publicly visible without signing in.",
  choosePhotos: "Choose your photos", choosePhotosHelp: "Review the gallery and include everything—or pick only the keepers.", oneZip: "Download one ZIP",
  oneZipHelp: "We fetch, number, and package the photos without filling your downloads folder.", bigAlbums: "Built for big albums", noMarathon: "No tabs. No right-click marathon.",
  details: "BacII Result Search Engine uses a real browser to discover the photos Facebook shows publicly, then resolves the best available image before building your archive on disk.",
  hundreds: "Handles hundreds at once", hundredsHelp: "Large jobs run in the background with live progress.", skipsFailures: "Skips individual failures",
  skipsFailuresHelp: "One expired photo link won’t ruin the entire ZIP.", noPassword: "No Facebook password needed", noPasswordHelp: "Only public pages and Facebook CDN links are accepted.",
  tagline: "Save what matters. Keep it together.", legal: "For downloading photos you own or have permission to save. Not affiliated with Meta or Facebook.", backTop: "Back to top",
  preview: "Result sheet preview", previewHelp: "Use the original-size image to inspect the table.", closePreview: "Close preview", facebookSource: "Facebook source",
  downloadPhoto: "Download photo", samplePhotos: "photos", home: "BacII Result Search Engine home", resultImage: "BacII result sheet",
  urlPlaceholder: "Facebook album or Share URL", switchLight: "Switch to light mode", switchDark: "Switch to dark mode",
  switchKhmer: "ប្តូរទៅភាសាខ្មែរ", switchEnglish: "Switch to English", cancel: "Cancel", cancelling: "Cancelling…",
  recognizeNames: "Also recognize Khmer names", recognizeNamesHelp: "Slower: reads every name row instead of only headers and numbers.",
  detectCenters: "Detect centers in", photos: "photos", photosUnread: "photos could not be read.",
  serverStatus: "Server status", statusBusy: "Busy", statusNormal: "Normal", statusIdle: "Idle", statusChecking: "Checking", statusUnavailable: "Unavailable",
  activeRequests: "active requests", queuedRequests: "waiting in queue",
} as const;

type TranslationKey = keyof typeof englishText;

const khmerText: Record<TranslationKey, string> = {
  brandName: "ប្រព័ន្ធស្វែងរកលទ្ធផលបាក់ឌុប",
  facebookSearch: "ស្វែងរកតាម Facebook", resultsArchive: "បណ្ណសារលទ្ធផល", insightsMenu: "ទិន្នន័យវិភាគ",
  how: "របៀបប្រើ",
  hero1: "ងាយស្រួលស្វែងរកលទ្ធផលបាក់ឌុប", hero2: "ដោយមិនចាំបាច់បើករូបហ្វេសប៊ុកម្ដងមួយៗ",
  heroCopy: "ដាក់តំណភ្ជាប់់អាល់ប៊ុមលទ្ធផលសាធារណៈរបស់ខេត្ត រាជធានី ណាមួយ បន្ទាប់មកជ្រើសរើសមណ្ឌលប្រឡង ថ្នាក់វិទ្យាសាស្រ្ត ឬ សង្គុម និងលេខតុ",
  albumLink: "តំណអាល់ប៊ុម", photoLinks: "តំណរូបភាព", provinceUrl: "សូមបញ្ចូល URL អាល់ប៊ុមរូបភាពនៃការបង្ហោះ ឬ Share URL", clearUrl: "សម្អាតតំណ",
  scanning: "កំពុងស្កេន…", scanAlbum: "ស្កេនអាល់ប៊ុម", publicNote: "បិទភ្ជាប់តំណអាល់ប៊ុម ឬតំណ Share ដែលចម្លងពីកម្មវិធី Facebook។ ប្រើបានតែអាល់ប៊ុមសាធារណៈ។",
  imageLinks: "តំណរូបភាព Facebook មួយតំណក្នុងមួយបន្ទាត់", links: "តំណ", fallback: "ជម្រើសបម្រុង នៅពេល Facebook តម្រូវឱ្យចូលគណនីដើម្បីមើលអាល់ប៊ុមសាធារណៈ។",
  largeAlbumWait: "អាល់ប៊ុមធំអាចចំណាយពេលប៉ុន្មាននាទី។", upTo: "រហូតដល់ ២,០០០ រូប", quality: "រក្សាគុណភាពដើមដែលមាន",
  autoZip: "រៀបចំឯកសារ ZIP ដោយស្វ័យប្រវត្តិ", readyPack: "រួចរាល់សម្រាប់រៀបចំ", photosFound: "រូបត្រូវបានរកឃើញ", linksReady: "តំណរូបភាពរួចរាល់",
  chooseZip: "ជ្រើសរើសរូបដែលអ្នកចង់ដាក់ក្នុង ZIP។", validateLinks: "យើងនឹងផ្ទៀងផ្ទាត់តំណនីមួយៗពេលបង្កើត ZIP។", deselectAll: "ដកការជ្រើសរើសទាំងអស់", selectAll: "ជ្រើសរើសទាំងអស់",
  finderTitle: "ស្វែងរកសន្លឹកលទ្ធផលបាក់ឌុប", finderHelp: "ស្វែងរកមណ្ឌលប្រឡង និងផ្នែកសិក្សាពីគ្រប់រូប បន្ទាប់មកបញ្ចូលលេខតុត្រឹមត្រូវ។",
  provinceUnknown: "មិនអាចកំណត់ខេត្តបានច្បាស់", examCenter: "មណ្ឌលប្រឡង", examCenters: "មណ្ឌលប្រឡង", examCenterStep: "១. មណ្ឌលប្រឡង",
  allCenters: "មណ្ឌលប្រឡងទាំងអស់", trackStep: "២. ផ្នែកសិក្សា", allTracks: "ផ្នែកទាំងអស់", science: "វិទ្យាសាស្ត្រ",
  social: "វិទ្យាសាស្ត្រសង្គម", tableStep: "៣. លេខតុ", tableExample: "ឧ. 41", matching: "រូបលទ្ធផលដែលត្រូវគ្នា",
  indexed: "រូបក្នុងអាល់ប៊ុមដែលបានរៀបចំ", clearFilters: "សម្អាតតម្រង", detecting: "កំពុងស្វែងរក…", sheetsIndexed: "សន្លឹកលទ្ធផលបានរៀបចំរួច។",
  restored: "បានយកពីមូលដ្ឋានទិន្នន័យ។", coverSkipped: "រូបគម្របត្រូវបានរំលងដោយស្វ័យប្រវត្តិ។", select: "ជ្រើសរើស", deselect: "ដកការជ្រើសរើស", photo: "រូប",
  view: "មើល", download: "ទាញយក", noMatch: "រកមិនឃើញសន្លឹកលទ្ធផលដែលត្រូវគ្នា", noMatchHelp: "សូមពិនិត្យមណ្ឌលប្រឡង ផ្នែកសិក្សា និងលេខតុក្នុងជួរទីមួយ។",
  tableNotFound: "រកមិនឃើញលេខតុ {number} ក្នុងរូបភាពណាមួយទេ។", tableNotFoundHelp: "សូមពិនិត្យលេខតុ ហើយសាកល្បងម្តងទៀត។",
  downloadName: "ដាក់ឈ្មោះឯកសារទាញយក", downloadHelp: "ថតរូបដែលមានលេខរៀងនឹងត្រូវដាក់ក្នុងឯកសារ ZIP។", packing: "កំពុងរៀបចំ…", buildZip: "បង្កើត ZIP",
  zipReady: "ZIP រួចរាល់", photosPacked: "រូបបានរៀបចំ", processed: "បានដំណើរការ", downloadZip: "ទាញយក ZIP",
  skippedOne: "រូបដែលផុតកំណត់ ឬមិនអាចប្រើបានត្រូវបានរំលង។", skippedMany: "រូបដែលផុតកំណត់ ឬមិនអាចប្រើបានត្រូវបានរំលង។", simple: "ងាយស្រួលប្រើ",
  threeSteps: "ពីអាល់ប៊ុមទៅឯកសារ ZIP ក្នុងបីជំហាន។", pasteAlbum: "បិទភ្ជាប់អាល់ប៊ុម", pasteAlbumHelp: "ប្រើអាល់ប៊ុម Facebook សាធារណៈដែលអាចមើលបានដោយមិនចូលគណនី។",
  choosePhotos: "ជ្រើសរើសរូបភាព", choosePhotosHelp: "ពិនិត្យរូបទាំងអស់ រួចជ្រើសរើសទាំងអស់ ឬតែរូបដែលអ្នកត្រូវការ។", oneZip: "ទាញយកជា ZIP មួយ",
  oneZipHelp: "យើងទាញយក ដាក់លេខរៀង និងរៀបចំរូប ដោយមិនធ្វើឱ្យថត Downloads របស់អ្នករញ៉េរញ៉ៃ។", bigAlbums: "បង្កើតសម្រាប់អាល់ប៊ុមធំ", noMarathon: "មិនចាំបាច់បើកផ្ទាំងច្រើន ឬចុចទាញយកម្តងមួយៗ។",
  details: "ប្រព័ន្ធស្វែងរកលទ្ធផលបាក់ឌុប ប្រើកម្មវិធីរុករកដើម្បីរករូបសាធារណៈដែល Facebook បង្ហាញ រួចជ្រើសគុណភាពរូបល្អបំផុតមុនបង្កើតឯកសារ ZIP។",
  hundreds: "ដំណើរការរាប់រយរូបក្នុងពេលតែមួយ", hundredsHelp: "ការងារធំដំណើរការនៅផ្ទៃខាងក្រោយ និងបង្ហាញវឌ្ឍនភាពផ្ទាល់។", skipsFailures: "រំលងរូបដែលមានបញ្ហា",
  skipsFailuresHelp: "តំណរូបផុតកំណត់មួយ មិនធ្វើឱ្យ ZIP ទាំងមូលបរាជ័យទេ។", noPassword: "មិនត្រូវការពាក្យសម្ងាត់ Facebook", noPasswordHelp: "ទទួលយកតែទំព័រសាធារណៈ និងតំណរូបភាពពី Facebook CDN។",
  tagline: "រក្សាទុកអ្វីដែលសំខាន់។ រៀបចំឱ្យនៅជាមួយគ្នា។", legal: "សម្រាប់ទាញយករូបដែលអ្នកជាម្ចាស់ ឬមានការអនុញ្ញាត។ មិនមានទំនាក់ទំនងជាមួយ Meta ឬ Facebook ទេ។", backTop: "ត្រឡប់ទៅខាងលើ",
  preview: "មើលសន្លឹកលទ្ធផល", previewHelp: "ប្រើរូបទំហំដើមដើម្បីពិនិត្យតារាង។", closePreview: "បិទការមើលរូប", facebookSource: "ប្រភព Facebook",
  downloadPhoto: "ទាញយករូប", samplePhotos: "រូប", home: "ទំព័រដើមប្រព័ន្ធស្វែងរកលទ្ធផលបាក់ឌុប", resultImage: "សន្លឹកលទ្ធផលបាក់ឌុប",
  urlPlaceholder: "តំណអាល់ប៊ុម Facebook ឬតំណ Share", switchLight: "ប្តូរទៅផ្ទៃភ្លឺ", switchDark: "ប្តូរទៅផ្ទៃងងឹត",
  switchKhmer: "ប្តូរទៅភាសាខ្មែរ", switchEnglish: "ប្តូរទៅភាសាអង់គ្លេស", cancel: "បោះបង់", cancelling: "កំពុងបោះបង់…",
  recognizeNames: "អានឈ្មោះជាភាសាខ្មែរផងដែរ", recognizeNamesHelp: "យឺតជាងមុន៖ អានឈ្មោះក្នុងគ្រប់ជួរ ជំនួសឱ្យតែចំណងជើង និងលេខតុ។",
  detectCenters: "ស្វែងរកមណ្ឌលក្នុង", photos: "រូប", photosUnread: "រូបមិនអាចអានបាន។",
  serverStatus: "ស្ថានភាពម៉ាស៊ីនមេ", statusBusy: "រវល់", statusNormal: "ធម្មតា", statusIdle: "ទំនេរ", statusChecking: "កំពុងពិនិត្យ", statusUnavailable: "មិនអាចភ្ជាប់បាន",
  activeRequests: "សំណើកំពុងដំណើរការ", queuedRequests: "សំណើកំពុងរង់ចាំ",
};

const translations: Record<Language, Record<TranslationKey, string>> = { en: englishText, km: khmerText };


function normalizedCenter(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

function editDistance(left: string, right: string) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = costs[0];
    costs[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = costs[column];
      costs[column] = Math.min(costs[column] + 1, costs[column - 1] + 1, diagonal + Number(left[row - 1] !== right[column - 1]));
      diagonal = above;
    }
  }
  return costs[right.length];
}

function centerSimilarity(left: string, right: string) {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - editDistance(left, right) / longest;
}

function groupExamCenters(results: OcrPhotoResult[]): CenterOption[] {
  const groups: Array<{ aliases: Set<string>; labels: Map<string, number>; photoIds: Set<string> }> = [];
  for (const result of results) {
    if (result.status !== "ready" || !result.examCenter) continue;
    const alias = normalizedCenter(result.examCenter);
    if (!alias) continue;
    let group = groups.find((candidate) => [...candidate.aliases].some((value) => centerSimilarity(value, alias) >= 0.9));
    if (!group) {
      group = { aliases: new Set(), labels: new Map(), photoIds: new Set() };
      groups.push(group);
    }
    group.aliases.add(alias);
    group.labels.set(result.examCenter, (group.labels.get(result.examCenter) ?? 0) + 1);
    group.photoIds.add(result.photoId);
  }
  return groups.map((group, index) => {
    const label = [...group.labels].sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)[0][0];
    return { id: `center-${index}`, label, photoIds: group.photoIds, count: group.photoIds.size };
  }).sort((left, right) => left.label.localeCompare(right.label, "km"));
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 35;
  return (
    <div className={`progress-track ${total === 0 ? "indeterminate" : ""}`} aria-label={`${percent}% complete`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState<Theme>(preferredTheme);
  const [language, setLanguage] = useState<Language>(preferredLanguage);
  const [mode, setMode] = useState<"album" | "links">("album");
  const [albumUrl, setAlbumUrl] = useState("");
  const [manualLinks, setManualLinks] = useState("");
  const [albumName, setAlbumName] = useState("my-facebook-album");
  const [submittingScan, setSubmittingScan] = useState(false);
  const [cancellingScan, setCancellingScan] = useState(false);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [zipJob, setZipJob] = useState<ZipJob | null>(null);
  const [ocrJob, setOcrJob] = useState<OcrJob | null>(null);
  const [includeNames, setIncludeNames] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [serverLoad, setServerLoad] = useState<ServerLoad | null>(null);
  const [serverStatusFailed, setServerStatusFailed] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const autoOcrDiscoveryRef = useRef<string | null>(null);
  const t = (key: TranslationKey) => translations[language][key];

  const parsedLinks = useMemo(() => manualLinks.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [manualLinks]);
  const busy = submittingScan || discovery?.status === "queued" || discovery?.status === "working";
  const zipBusy = zipJob?.status === "queued" || zipJob?.status === "working";
  const ocrBusy = ocrJob?.status === "queued" || ocrJob?.status === "working";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem("album-packer-theme", theme); } catch { /* Storage is optional. */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    try { window.localStorage.setItem("album-packer-language", language); } catch { /* Storage is optional. */ }
  }, [language]);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), delay);
    };
    const refresh = async () => {
      if (document.visibilityState !== "visible") return schedule(15_000);
      try {
        const response = await fetch(apiUrl("/api/server/status"), {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("Server status unavailable.");
        const next = await response.json() as ServerLoad;
        if (stopped) return;
        setServerLoad(next);
        setServerStatusFailed(false);
      } catch {
        if (stopped) return;
        setServerLoad(null);
        setServerStatusFailed(true);
      }
      schedule(15_000 + Math.round(Math.random() * 5_000));
    };
    const resume = () => {
      if (document.visibilityState === "visible" && !stopped) schedule(0);
    };
    void refresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, []);

  useEffect(() => {
    if (!discovery || !["queued", "working"].includes(discovery.status)) return;
    let stopped = false;
    let timer = 0;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      try {
        const next = await api<Discovery>(`/api/discover/${discovery.id}`);
        if (stopped) return;
        setError("");
        setDiscovery(next);
        if (next.status === "ready") {
          setSelected(new Set(next.photos.map((photo) => photo.id)));
          window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        } else if (["queued", "working"].includes(next.status)) {
          schedule(1_000);
        }
      } catch (pollError) {
        if (stopped) return;
        setError(pollError instanceof Error ? pollError.message : "Lost connection to the scan.");
        schedule(2_500);
      }
    };
    const resume = () => {
      if (document.visibilityState === "visible" && !stopped) schedule(0);
    };
    schedule(1_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [discovery?.id, discovery?.status]);

  useEffect(() => {
    if (!zipJob || !["queued", "working"].includes(zipJob.status)) return;
    const timer = window.setTimeout(async () => {
      try {
        setZipJob(await api<ZipJob>(`/api/zip/${zipJob.id}`));
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Lost connection to the ZIP job.");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [zipJob]);

  useEffect(() => {
    if (!ocrJob || !["queued", "working"].includes(ocrJob.status)) return;
    let stopped = false;
    let timer = 0;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      try {
        const next = await api<OcrJob>(`/api/ocr/${ocrJob.id}`);
        if (stopped) return;
        setError("");
        setOcrJob(next);
        if (["queued", "working"].includes(next.status)) schedule(1_000);
      } catch (pollError) {
        if (stopped) return;
        setError(pollError instanceof Error ? pollError.message : "Lost connection to the OCR job.");
        schedule(2_500);
      }
    };
    const resume = () => {
      if (document.visibilityState === "visible" && !stopped) schedule(0);
    };
    schedule(1_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [ocrJob?.id, ocrJob?.status]);

  useEffect(() => {
    if (discovery?.status !== "ready" || discovery.photos.length === 0 || ocrJob) return;
    if (autoOcrDiscoveryRef.current === discovery.id) return;
    autoOcrDiscoveryRef.current = discovery.id;
    void analyzeResults();
  }, [discovery?.id, discovery?.status, ocrJob]);

  useEffect(() => {
    if (!viewingPhoto) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setViewingPhoto(null);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [viewingPhoto]);

  async function scanAlbum() {
    setError("");
    setZipJob(null);
    setOcrJob(null);
    setSelectedCenter("");
    setSelectedTrack("");
    setTableNumber("");
    setViewingPhoto(null);
    autoOcrDiscoveryRef.current = null;
    if (!albumUrl.trim()) return setError("Paste a public Facebook album or Share URL first.");
    setSubmittingScan(true);
    try {
      const job = await api<Discovery>("/api/discover", {
        method: "POST",
        body: JSON.stringify({ url: albumUrl }),
      });
      setDiscovery(job);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Could not start the album scan.");
    } finally {
      setSubmittingScan(false);
    }
  }

  async function cancelScan() {
    if (!discovery || !["queued", "working"].includes(discovery.status)) return;
    setCancellingScan(true);
    setError("");
    try {
      await api(`/api/discover/${discovery.id}`, { method: "DELETE" });
      setDiscovery((current) => current?.id === discovery.id
        ? { ...current, status: "cancelled", phase: "Scan cancelled" }
        : current);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel the scan.");
    } finally {
      setCancellingScan(false);
    }
  }

  async function buildZip() {
    setError("");
    try {
      const body = mode === "album"
        ? { discoveryId: discovery?.id, photoIds: [...selected], name: albumName }
        : { urls: parsedLinks, name: albumName };
      const job = await api<ZipJob>("/api/zip", { method: "POST", body: JSON.stringify(body) });
      setZipJob(job);
    } catch (zipError) {
      setError(zipError instanceof Error ? zipError.message : "Could not start the ZIP.");
    }
  }

  async function analyzeResults() {
    setError("");
    try {
      const job = await api<OcrJob>("/api/ocr", {
        method: "POST",
        body: JSON.stringify({ discoveryId: discovery?.id, photoIds: readyPhotos.map((photo) => photo.id), includeNames }),
      });
      setOcrJob(job);
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : "Could not start Khmer OCR.");
    }
  }

  function reset() {
    setDiscovery(null);
    setZipJob(null);
    setOcrJob(null);
    setSelectedCenter("");
    setSelectedTrack("");
    setTableNumber("");
    setViewingPhoto(null);
    setSelected(new Set());
    setError("");
  }

  const readyPhotos = discovery?.status === "ready" ? discovery.photos : [];

  const allSelected = readyPhotos.length > 0 && selected.size === readyPhotos.length;
  const canBuild = mode === "album" ? selected.size > 0 : parsedLinks.length > 0;
  const ocrByPhoto = useMemo(() => new Map((ocrJob?.results ?? []).map((result) => [result.photoId, result])), [ocrJob?.results]);
  const centerOptions = useMemo(() => groupExamCenters(ocrJob?.results ?? []), [ocrJob?.results]);
  const centerFilter = centerOptions.find((center) => center.id === selectedCenter);
  const trackOptions = useMemo(() => {
    const tracks = new Set((ocrJob?.results ?? []).filter((result) => result.status === "ready").map((result) => result.track));
    return (["science", "social-science"] as const).filter((track) => tracks.has(track));
  }, [ocrJob?.results]);
  const detectedProvinces = useMemo(
    () => [...new Set((ocrJob?.results ?? []).map((result) => result.province).filter((province): province is string => Boolean(province)))],
    [ocrJob?.results],
  );
  const filtersActive = Boolean(selectedCenter || selectedTrack || tableNumber);
  const tableNumberFound = !tableNumber || (ocrJob?.results ?? []).some((result) =>
    result.status === "ready" && result.rows.some((row) => row.number === tableNumber),
  );
  const visiblePhotos = useMemo(() => {
    if (!filtersActive || ocrJob?.status !== "ready") return readyPhotos;
    return readyPhotos.filter((photo) => {
      const result = ocrByPhoto.get(photo.id);
      if (!result || result.status !== "ready") return false;
      if (centerFilter && !centerFilter.photoIds.has(photo.id)) return false;
      if (selectedTrack && result.track !== selectedTrack) return false;
      if (tableNumber && !result.rows.some((row) => row.number === tableNumber)) return false;
      return true;
    });
  }, [readyPhotos, filtersActive, ocrJob?.status, ocrByPhoto, centerFilter, selectedTrack, tableNumber]);
  const serverState = serverLoad?.status ?? (serverStatusFailed ? "unavailable" : "checking");
  const serverStatusLabel = serverLoad
    ? t(serverLoad.status === "busy" ? "statusBusy" : serverLoad.status === "normal" ? "statusNormal" : "statusIdle")
    : t(serverStatusFailed ? "statusUnavailable" : "statusChecking");

  return (
    <main>
      <nav className="nav site-header shell">
        <a className="brand" href="#top" aria-label={t("home")}>
          <span className="brand-mark"><GraduationCap size={24} strokeWidth={2.3} /></span>
          <span>{t("brandName")}</span>
        </a>
        <div className="site-header-right">
          <div className="primary-nav">
            <a className="active" href="#top" aria-current="page" aria-label={t("facebookSearch")}><Search size={18} /><span>{t("facebookSearch")}</span></a>
            <a href="#archive" aria-label={t("resultsArchive")}><Archive size={18} /><span>{t("resultsArchive")}</span></a>
            <a href="#insights" aria-label={t("insightsMenu")}><BarChart3 size={18} /><span>{t("insightsMenu")}</span></a>
          </div>
          <div className="header-actions">
            <button type="button" className="language-toggle" onClick={() => setLanguage((current) => current === "en" ? "km" : "en")}
              aria-label={language === "en" ? t("switchKhmer") : t("switchEnglish")} title={language === "en" ? t("switchKhmer") : t("switchEnglish")}>
              <Languages size={15} /> {language === "en" ? "ខ្មែរ" : "EN"}
            </button>
            <button type="button" className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? t("switchLight") : t("switchDark")} title={theme === "dark" ? t("switchLight") : t("switchDark")}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </nav>

      <section className="hero shell" id="top">
        {language === "km"
          ? <h1>{t("hero1")}{t("hero2")}</h1>
          : <h1>{t("hero1")}<br /><em>{t("hero2")}</em></h1>}
        <p className="hero-copy">{t("heroCopy")}</p>
        <a className="hero-how-link" href="#how-it-works">{t("how")} <ChevronRight size={15} /></a>

        <div className="workspace-card">
          <div className="mode-tabs" role="tablist">
            <button type="button" className={mode === "album" ? "active" : ""} onClick={() => { setMode("album"); reset(); }}>
              <Link2 size={17} /> {t("albumLink")}
            </button>
            <button type="button" className={mode === "links" ? "active" : ""} onClick={() => { setMode("links"); reset(); }}>
              <Images size={17} /> {t("photoLinks")}
            </button>
          </div>

          {mode === "album" ? (
            <div className="input-pane">
              <label htmlFor="album-url">{t("provinceUrl")}</label>
              <div className="url-row">
                <div className="field-with-icon">
                  <Link2 size={19} />
                  <input id="album-url" type="url" value={albumUrl} onChange={(event) => setAlbumUrl(event.target.value)}
                    placeholder={t("urlPlaceholder")} onKeyDown={(event) => event.key === "Enter" && !busy && void scanAlbum()} />
                  {albumUrl && <button type="button" className="clear-button" onClick={() => setAlbumUrl("")} aria-label={t("clearUrl")}><X size={16} /></button>}
                </div>
                <button className="primary-button" onClick={() => void scanAlbum()} disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={19} /> : <ScanSearch size={19} />}
                  {busy ? t("scanning") : t("scanAlbum")}
                </button>
              </div>
              <p className="field-note"><ShieldCheck size={14} /> {t("publicNote")}</p>
            </div>
          ) : (
            <div className="input-pane manual-pane">
              <div className="label-line">
                <label htmlFor="photo-links">{t("imageLinks")}</label>
                <span>{parsedLinks.length.toLocaleString()} {t("links")}</span>
              </div>
              <textarea id="photo-links" rows={6} value={manualLinks} onChange={(event) => setManualLinks(event.target.value)}
                placeholder={"https://scontent-...fbcdn.net/...jpg\nhttps://scontent-...fbcdn.net/...jpg"} />
              <p className="field-note"><EyeOff size={14} /> {t("fallback")}</p>
            </div>
          )}

          {error && <div className="error-banner"><X size={17} /><span>{error}</span></div>}

          {busy && discovery && (
            <div className="job-panel">
              <div className="job-heading">
                <span className="job-icon"><LoaderCircle className="spin" size={20} /></span>
                <div><strong>{discovery.phase}</strong><span>{t("largeAlbumWait")}</span></div>
                <b>{discovery.total > 0 ? `${discovery.current}/${discovery.total}` : discovery.current || ""}</b>
                <button type="button" className="cancel-scan-button" onClick={() => void cancelScan()} disabled={cancellingScan}>
                  {cancellingScan ? <LoaderCircle className="spin" size={14} /> : <X size={14} />}
                  {cancellingScan ? t("cancelling") : t("cancel")}
                </button>
              </div>
              <ProgressBar current={discovery.current} total={discovery.total} />
            </div>
          )}
        </div>

        <div className={`server-indicator ${serverState}`} role="status" aria-live="polite">
          <span className="server-state"><i aria-hidden="true" /><Activity size={15} /> {t("serverStatus")}: <strong>{serverStatusLabel}</strong></span>
          <span className="server-metrics">
            <span><b>{serverLoad?.currentRequests ?? "—"}</b> {t("activeRequests")}</span>
            {(serverLoad?.queuedRequests ?? 0) > 0 && <span><b>{serverLoad?.queuedRequests}</b> {t("queuedRequests")}</span>}
          </span>
        </div>

        <div className="trust-row">
          <span><Check size={16} /> {t("upTo")}</span>
          <span><Check size={16} /> {t("quality")}</span>
          <span><Check size={16} /> {t("autoZip")}</span>
        </div>
      </section>

      {(readyPhotos.length > 0 || mode === "links") && canBuild && (
        <section className="results shell" ref={resultsRef}>
          <div className="results-head">
            <div>
              <span className="section-kicker">{t("readyPack")}</span>
              <h2>{mode === "album" ? `${readyPhotos.length.toLocaleString()} ${t("photosFound")}` : `${parsedLinks.length.toLocaleString()} ${t("linksReady")}`}</h2>
              <p>{mode === "album" ? t("chooseZip") : t("validateLinks")}</p>
            </div>
            {mode === "album" && (
              <button className="text-button" onClick={() => setSelected(allSelected ? new Set() : new Set(readyPhotos.map((photo) => photo.id)))}>
                {allSelected ? t("deselectAll") : t("selectAll")}
              </button>
            )}
          </div>

          {mode === "album" && (
            <>
              <div className="ocr-card">
                <div className="ocr-title">
                  <span><Languages size={21} /></span>
                  <div>
                    <strong>{t("finderTitle")}</strong>
                    <small>{t("finderHelp")}</small>
                  </div>
                </div>
                {ocrJob?.status === "ready" ? (
                  <div className="result-finder">
                    <div className="detected-context">
                      <MapPin size={14} />
                      <span>{detectedProvinces.length > 0 ? detectedProvinces.join(" · ") : t("provinceUnknown")}</span>
                      <b>{centerOptions.length} {centerOptions.length === 1 ? t("examCenter") : t("examCenters")}</b>
                    </div>
                    <div className="finder-fields">
                      <label>
                        <span>{t("examCenterStep")}</span>
                        <div className="select-field"><MapPin size={17} /><select value={selectedCenter} onChange={(event) => setSelectedCenter(event.target.value)}>
                          <option value="">{t("allCenters")}</option>
                          {centerOptions.map((center) => <option key={center.id} value={center.id}>{center.label} ({center.count})</option>)}
                        </select></div>
                      </label>
                      <label>
                        <span>{t("trackStep")}</span>
                        <div className="select-field"><GraduationCap size={17} /><select value={selectedTrack} onChange={(event) => setSelectedTrack(event.target.value)}>
                          <option value="">{t("allTracks")}</option>
                          {trackOptions.includes("science") && <option value="science">{t("science")}</option>}
                          {trackOptions.includes("social-science") && <option value="social-science">{t("social")}</option>}
                        </select></div>
                      </label>
                      <label>
                        <span>{t("tableStep")}</span>
                        <div className="table-number-field"><Hash size={17} /><input inputMode="numeric" pattern="[0-9]*" value={tableNumber}
                          onChange={(event) => setTableNumber(event.target.value.replace(/\D/g, "").slice(0, 7))} placeholder={t("tableExample")} /></div>
                      </label>
                    </div>
                    <div className="finder-result">
                      <div><strong>{visiblePhotos.length.toLocaleString()}</strong><span>{filtersActive ? t("matching") : t("indexed")}</span></div>
                      {filtersActive && <button className="text-button" onClick={() => { setSelectedCenter(""); setSelectedTrack(""); setTableNumber(""); }}>{t("clearFilters")}</button>}
                    </div>
                  </div>
                ) : (
                  <div className="ocr-actions">
                    <label className="check-option">
                      <input type="checkbox" checked={includeNames} onChange={(event) => setIncludeNames(event.target.checked)} disabled={ocrBusy} />
                      <span><b>{t("recognizeNames")}</b><small>{t("recognizeNamesHelp")}</small></span>
                    </label>
                    <button className="secondary-button" onClick={() => void analyzeResults()} disabled={ocrBusy || readyPhotos.length === 0}>
                      {ocrBusy ? <LoaderCircle className="spin" size={18} /> : <ScanSearch size={18} />}
                      {ocrBusy ? t("detecting") : `${t("detectCenters")} ${readyPhotos.length.toLocaleString()} ${t("photos")}`}
                    </button>
                  </div>
                )}
                {ocrJob && ocrJob.status !== "ready" && (
                  <div className={`ocr-progress ${ocrJob.status}`}>
                    <div><span>{ocrJob.status === "failed" ? ocrJob.error : ocrJob.phase}</span><b>{ocrJob.current}/{ocrJob.total}</b></div>
                    {ocrBusy && <ProgressBar current={ocrJob.current} total={ocrJob.total} />}
                  </div>
                )}
                {ocrJob?.status === "ready" && (
                  <>
                    <p className="ocr-summary"><CheckCircle2 size={14} /> {ocrJob.results.filter((result) => result.status === "ready").length} {t("sheetsIndexed")} {ocrJob.cacheHits > 0 ? `${ocrJob.cacheHits} ${t("restored")}` : t("coverSkipped")}</p>
                    {ocrJob.failures > 0 && (
                      <p className="failure-note">{ocrJob.failures} {t("photosUnread")} {ocrJob.results.find((result) => result.status === "failed")?.error}</p>
                    )}
                  </>
                )}
              </div>

              <div className="photo-grid">
              {visiblePhotos.map((photo) => {
                const index = readyPhotos.findIndex((candidate) => candidate.id === photo.id);
                const checked = selected.has(photo.id);
                const ocr = ocrByPhoto.get(photo.id);
                const numbers = ocr?.rows.map((row) => Number(row.number)).filter(Number.isFinite) ?? [];
                const range = numbers.length > 0 ? `${Math.min(...numbers)}–${Math.max(...numbers)}` : "";
                return (
                  <div className={`photo-card ${checked ? "selected" : ""}`} key={photo.id}>
                    <button className="photo-select" onClick={() => {
                      const next = new Set(selected);
                      checked ? next.delete(photo.id) : next.add(photo.id);
                      setSelected(next);
                    }} aria-label={`${checked ? t("deselect") : t("select")} ${t("photo")} ${index + 1}`}>
                      <img src={photo.previewUrl} loading="lazy" alt="" />
                      <span className="photo-check">{checked && <Check size={15} strokeWidth={3} />}</span>
                      <span className="photo-number">{String(index + 1).padStart(3, "0")}</span>
                      {range && <span className="photo-table-range">#{range}</span>}
                    </button>
                    <div className="photo-actions">
                      <button title={t("view")} aria-label={`${t("view")} ${t("photo")} ${index + 1}`} onClick={() => setViewingPhoto(photo)}>
                        <Eye size={16} /> <b>{t("view")}</b>
                      </button>
                      <a title={t("downloadPhoto")} aria-label={`${t("downloadPhoto")} ${index + 1}`}
                        href={apiUrl(`/api/discover/${discovery?.id}/photo/${encodeURIComponent(photo.id)}/download`)}>
                        <Download size={16} /> <b>{t("download")}</b>
                      </a>
                    </div>
                  </div>
                );
              })}
              </div>
              {filtersActive && visiblePhotos.length === 0 && (
                <div className="no-matches">
                  <Search size={22} />
                  <strong>{tableNumber && !tableNumberFound ? t("tableNotFound").replace("{number}", tableNumber) : t("noMatch")}</strong>
                  <span>{tableNumber && !tableNumberFound ? t("tableNotFoundHelp") : t("noMatchHelp")}</span>
                </div>
              )}
            </>
          )}

          <div className="pack-card">
            <div className="pack-title">
              <span><Archive size={21} /></span>
              <div><strong>{t("downloadName")}</strong><small>{t("downloadHelp")}</small></div>
            </div>
            <div className="pack-actions">
              <div className="name-field"><input value={albumName} onChange={(event) => setAlbumName(event.target.value)} maxLength={80} /><span>.zip</span></div>
              <button className="primary-button pack-button" onClick={() => void buildZip()} disabled={zipBusy || !canBuild}>
                {zipBusy ? <LoaderCircle className="spin" size={19} /> : <PackageCheck size={19} />}
                {zipBusy ? t("packing") : `${t("buildZip")} · ${(mode === "album" ? selected.size : parsedLinks.length).toLocaleString()}`}
              </button>
            </div>

            {zipJob && (
              <div className={`zip-status ${zipJob.status}`}>
                <div className="zip-status-line">
                  <span className="job-icon">{zipJob.status === "ready" ? <CheckCircle2 size={20} /> : zipJob.status === "failed" ? <X size={20} /> : <ArrowDownToLine size={20} />}</span>
                  <div>
                    <strong>{zipJob.status === "failed" ? zipJob.error : zipJob.status === "ready" ? t("zipReady") : t("packing")}</strong>
                    <span>{zipJob.status === "ready" ? `${formatBytes(zipJob.bytes)} · ${zipJob.total - zipJob.failures} ${t("photosPacked")}` : `${zipJob.current}/${zipJob.total} ${t("processed")} · ${formatBytes(zipJob.bytes)}`}</span>
                  </div>
                  {zipJob.status === "ready" && <a className="download-button" href={apiUrl(`/api/zip/${zipJob.id}/download`)}><Download size={18} /> {t("downloadZip")}</a>}
                </div>
                {zipBusy && <ProgressBar current={zipJob.current} total={zipJob.total} />}
                {zipJob.failures > 0 && <p className="failure-note">{zipJob.failures} {zipJob.failures === 1 ? t("skippedOne") : t("skippedMany")}</p>}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="how-section" id="how-it-works">
        <div className="shell">
          <div className="section-intro">
            <span className="section-kicker">{t("simple")}</span>
            <h2>{t("threeSteps")}</h2>
          </div>
          <div className="steps-grid">
            <article><span className="step-number">01</span><div className="step-icon"><Link2 /></div><h3>{t("pasteAlbum")}</h3><p>{t("pasteAlbumHelp")}</p></article>
            <article><span className="step-number">02</span><div className="step-icon"><MousePointer2 /></div><h3>{t("choosePhotos")}</h3><p>{t("choosePhotosHelp")}</p></article>
            <article><span className="step-number">03</span><div className="step-icon"><Download /></div><h3>{t("oneZip")}</h3><p>{t("oneZipHelp")}</p></article>
          </div>
        </div>
      </section>

      <section className="details shell">
        <div className="details-visual" aria-hidden="true">
          <div className="stack-photo photo-one" />
          <div className="stack-photo photo-two" />
          <div className="stack-photo photo-three"><Archive size={38} /><b>album.zip</b><span>248 {t("samplePhotos")}</span></div>
        </div>
        <div className="details-copy">
          <span className="section-kicker">{t("bigAlbums")}</span>
          <h2>{t("noMarathon")}</h2>
          <p>{t("details")}</p>
          <ul>
            <li><span><Zap size={17} /></span><div><strong>{t("hundreds")}</strong><small>{t("hundredsHelp")}</small></div></li>
            <li><span><RefreshCw size={17} /></span><div><strong>{t("skipsFailures")}</strong><small>{t("skipsFailuresHelp")}</small></div></li>
            <li><span><ShieldCheck size={17} /></span><div><strong>{t("noPassword")}</strong><small>{t("noPasswordHelp")}</small></div></li>
          </ul>
        </div>
      </section>

      <footer>
        <div className="shell footer-inner">
          <div><a className="brand" href="#top"><span className="brand-mark"><GraduationCap size={20} strokeWidth={2.2} /></span><span>{t("brandName")}</span></a><p>{t("tagline")}</p></div>
          <p className="legal">{t("legal")}</p>
          <a className="source-link" href="#top">{t("backTop")} <ChevronRight size={15} /></a>
        </div>
      </footer>

      {viewingPhoto && (
        <div className="photo-modal" role="dialog" aria-modal="true" aria-label={t("preview")} onClick={() => setViewingPhoto(null)}>
          <div className="photo-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="photo-modal-head">
              <div><strong>{t("preview")}</strong><span>{t("previewHelp")}</span></div>
              <button onClick={() => setViewingPhoto(null)} aria-label={t("closePreview")}><X size={19} /></button>
            </div>
            <div className="photo-modal-image"><img src={viewingPhoto.url} alt={t("resultImage")} /></div>
            <div className="photo-modal-actions">
              {viewingPhoto.sourceUrl && <a href={viewingPhoto.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> {t("facebookSource")}</a>}
              <a className="download-button" href={apiUrl(`/api/discover/${discovery?.id}/photo/${encodeURIComponent(viewingPhoto.id)}/download`)}>
                <Download size={17} /> {t("downloadPhoto")}
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
