const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function getOrCreateVisitorId(): string {
  if (typeof window === "undefined" || !window.localStorage) return "";
  const STORAGE_KEY = "bacii_visitor_id";
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id || !/^[0-9a-f-]{16,64}$/i.test(id)) {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        id = crypto.randomUUID();
      } else {
        id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      }
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

let lastTrackedPath = "";
let lastTrackedTime = 0;

export function trackPageView(customPath?: string): void {
  if (typeof window === "undefined") return;

  const currentPath = customPath || (window.location.pathname + window.location.hash) || "/";

  // Do not track admin area
  if (currentPath.includes("/admin") || currentPath.includes("#admin")) {
    return;
  }

  // Debounce duplicate calls within 2 seconds
  const now = Date.now();
  if (currentPath === lastTrackedPath && now - lastTrackedTime < 2000) {
    return;
  }

  lastTrackedPath = currentPath;
  lastTrackedTime = now;

  const visitorId = getOrCreateVisitorId();
  const referrer = typeof document !== "undefined" ? document.referrer : "";

  const payload = JSON.stringify({
    visitorId,
    path: currentPath,
    referrer,
  });

  const url = `${API_BASE_URL}/api/analytics/track`;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Ignore tracking failures gracefully
  }
}
