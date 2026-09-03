const FACEBOOK_HOSTS = ["facebook.com", "fb.com"];
const TELEGRAM_HOSTS = ["t.me", "telegram.me"];
const CDN_HOSTS = ["fbcdn.net", "facebook.com"];

function matchesHost(hostname: string, suffixes: string[]) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function parsePublicAlbumUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete Facebook album URL.");
  }
  if (url.protocol !== "https:" || !matchesHost(url.hostname, FACEBOOK_HOSTS)) {
    throw new Error("Only HTTPS links on facebook.com are supported.");
  }
  url.hash = "";
  return url.toString();
}

export function parsePublicArchivePostUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete Facebook or Telegram post URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS post links are supported.");
  if (matchesHost(url.hostname, FACEBOOK_HOSTS)) return parsePublicAlbumUrl(value);
  if (!matchesHost(url.hostname, TELEGRAM_HOSTS)) {
    throw new Error("Only public Facebook or Telegram post links are supported.");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const offset = segments[0]?.toLowerCase() === "s" ? 1 : 0;
  const channel = segments[offset] || "";
  const messageId = segments[offset + 1] || "";
  if (!/^[a-zA-Z0-9_]{5,}$/.test(channel) || !/^\d+$/.test(messageId)) {
    throw new Error("Enter a public Telegram post link such as https://t.me/channel/1234.");
  }
  return `https://t.me/s/${channel}/${messageId}`;
}

export function parseFacebookImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("One or more photo links are invalid.");
  }
  if (url.protocol !== "https:" || !matchesHost(url.hostname, CDN_HOSTS)) {
    throw new Error("Only HTTPS Facebook CDN photo links are accepted.");
  }
  return url.toString();
}

export async function fetchFacebookImage(value: string, signal: AbortSignal, redirects = 4): Promise<Response> {
  let current = parseFacebookImageUrl(value);
  for (let index = 0; index <= redirects; index += 1) {
    const response = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        referer: "https://www.facebook.com/",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Facebook returned an incomplete redirect.");
      current = parseFacebookImageUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Photo request failed (${response.status}).`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error("The link did not return an image.");
    return response;
  }
  throw new Error("The photo redirected too many times.");
}
