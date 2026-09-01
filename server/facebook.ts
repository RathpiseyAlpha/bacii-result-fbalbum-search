import { chromium, type BrowserContext, type Page } from "playwright";
import { parsePublicAlbumUrl } from "./security.ts";
import type { DiscoveryJob, Photo } from "./types.ts";

const PHOTO_LINK_MARKERS = ["/photo/", "/photos/", "photo.php", "photo?fbid="];
const ALBUM_PAGINATION_OPERATION = "ProfileCometLegacyAlbumGridViewPaginationQuery";
const ALBUM_PAGINATION_DOC_ID = "34407011978913359";
const POST_MEDIA_OPERATION = "CometPhotoRootContentQuery";

type PostMediaSet = {
  token: string;
  total: number;
  photos: Photo[];
  postUrl: string;
};

type SharedTarget = { albumUrl: string; postMediaSet?: PostMediaSet };

const shareAlbumCache = new Map<string, SharedTarget>();

const isPhotoPage = (href: string) => PHOTO_LINK_MARKERS.some((marker) => href.includes(marker));
const isCdnImage = (src: string) => {
  try {
    const host = new URL(src).hostname;
    return host === "fbcdn.net" || host.endsWith(".fbcdn.net");
  } catch {
    return false;
  }
};

type GraphTemplate = { url: string; body: string };
type AlbumGraphState = {
  photos: Map<string, Photo>;
  template?: GraphTemplate;
  endCursor?: string;
  hasNext: boolean;
};

type PostGraphState = {
  photos: Map<string, Photo>;
  template?: GraphTemplate;
  nextId?: string;
  queriedIds: Set<string>;
};

function addGraphPhoto(state: Pick<AlbumGraphState, "photos">, node: Record<string, unknown>) {
  const id = typeof node.id === "string" ? node.id : "";
  const image = node.image && typeof node.image === "object" ? node.image as Record<string, unknown> : null;
  const url = image && typeof image.uri === "string" ? image.uri : "";
  if (!id || !url || !isCdnImage(url)) return;
  state.photos.set(id, {
    id,
    url,
    previewUrl: url,
    sourceUrl: `https://www.facebook.com/photo/?fbid=${id}`,
    width: typeof image?.width === "number" ? image.width : undefined,
    height: typeof image?.height === "number" ? image.height : undefined,
  });
}

function ingestGraphPayload(body: string, state: AlbumGraphState) {
  for (const line of body.split("\n").filter(Boolean)) {
    let root: unknown;
    try {
      root = JSON.parse(line);
    } catch {
      continue;
    }
    const stack: unknown[] = [root];
    while (stack.length > 0) {
      const value = stack.pop();
      if (!value || typeof value !== "object") continue;
      if (Array.isArray(value)) {
        stack.push(...value);
        continue;
      }
      const record = value as Record<string, unknown>;
      const edges = Array.isArray(record.edges) ? record.edges : null;
      const pageInfo = record.page_info && typeof record.page_info === "object"
        ? record.page_info as Record<string, unknown>
        : null;
      if (edges && pageInfo) {
        let containsPhotos = false;
        for (const edge of edges) {
          if (!edge || typeof edge !== "object") continue;
          const node = (edge as Record<string, unknown>).node;
          if (!node || typeof node !== "object" || (node as Record<string, unknown>).__typename !== "Photo") continue;
          containsPhotos = true;
          addGraphPhoto(state, node as Record<string, unknown>);
        }
        if (containsPhotos) {
          if (typeof pageInfo.end_cursor === "string") state.endCursor = pageInfo.end_cursor;
          state.hasNext = pageInfo.has_next_page === true;
        }
      }
      stack.push(...Object.values(record));
    }
  }
}

function seedGraphStateFromHtml(html: string, albumId: string, state: AlbumGraphState) {
  const photoPattern = /\"__typename\":\"Photo\",\"id\":\"(\d+)\"[\s\S]{0,900}?\"image\":\{\"uri\":\"(https:\\?\/\\?\/[^\"]+)\",\"width\":(\d+),\"height\":(\d+)/g;
  for (const match of html.matchAll(photoPattern)) {
    let url = match[2];
    try {
      url = JSON.parse(`"${url}"`) as string;
    } catch {
      url = url.replaceAll("\\/", "/");
    }
    addGraphPhoto(state, { id: match[1], image: { uri: url, width: Number(match[3]), height: Number(match[4]) } });
  }
  const escapedAlbumId = albumId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pageInfoPattern = new RegExp(`\\"page_info\\":\\{\\"end_cursor\\":\\"([^\\"]+)\\",\\"has_next_page\\":(true|false)\\}\\},\\"id\\":\\"${escapedAlbumId}\\"`);
  const pageInfo = html.match(pageInfoPattern);
  if (pageInfo) {
    state.endCursor = pageInfo[1];
    state.hasNext = pageInfo[2] === "true";
  }
}

async function ensureGraphTemplate(page: Page, albumId: string, state: AlbumGraphState) {
  if (state.template || !albumId || !state.endCursor) return;
  const tokens = await page.evaluate(() => {
    const moduleRequire = (window as unknown as { require?: (name: string) => Record<string, unknown> }).require;
    let lsd = document.querySelector<HTMLInputElement>('input[name="lsd"]')?.value ?? "";
    let revision = "";
    let hsi = "";
    try {
      lsd ||= String(moduleRequire?.("LSD")?.token ?? "");
      const siteData = moduleRequire?.("SiteData");
      revision = String(siteData?.revision ?? "");
      hsi = String(siteData?.hsi ?? "");
    } catch {
      // The hidden form token is sufficient on the anonymous page.
    }
    return { lsd, revision, hsi };
  });
  if (!tokens.lsd) return;
  const jazoest = `2${Array.from(tokens.lsd, (character) => character.charCodeAt(0)).join("")}`;
  const params = new URLSearchParams({
    __user: "0",
    __a: "1",
    __req: "1",
    __comet_req: "15",
    lsd: tokens.lsd,
    jazoest,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: ALBUM_PAGINATION_OPERATION,
    variables: JSON.stringify({ count: 50, cursor: state.endCursor, scale: 1, id: albumId }),
    server_timestamps: "true",
    doc_id: ALBUM_PAGINATION_DOC_ID,
  });
  if (tokens.revision) params.set("__rev", tokens.revision);
  if (tokens.hsi) params.set("__hsi", tokens.hsi);
  state.template = { url: `${new URL(page.url()).origin}/api/graphql/`, body: params.toString() };
}

async function continueGraphPagination(page: Page, state: AlbumGraphState, job: DiscoveryJob, expectedTotal: number) {
  if (!state.template || !state.endCursor || !state.hasNext) return;
  let stalled = 0;
  for (let attempt = 0; attempt < 100 && state.hasNext && stalled < 3; attempt += 1) {
    if (job.controller.signal.aborted) throw new Error("Cancelled.");
    const before = state.photos.size;
    const params = new URLSearchParams(state.template.body);
    const variables = JSON.parse(params.get("variables") ?? "{}") as Record<string, unknown>;
    variables.cursor = state.endCursor;
    variables.count = 50;
    // Facebook otherwise returns roughly 417 px pagination thumbnails. Asking
    // for device scale 3 provides OCR-readable fallbacks when a photo page is gated.
    variables.scale = 3;
    params.set("variables", JSON.stringify(variables));
    params.set("__req", (attempt + 20).toString(36));
    const result = await page.evaluate(async ({ url, body, friendlyName, lsd }) => {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-fb-friendly-name": friendlyName,
          ...(lsd ? { "x-fb-lsd": lsd } : {}),
        },
        body,
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    }, {
      url: state.template.url,
      body: params.toString(),
      friendlyName: params.get("fb_api_req_friendly_name") ?? ALBUM_PAGINATION_OPERATION,
      lsd: params.get("lsd") ?? "",
    });
    if (!result.ok) throw new Error(`Facebook album pagination failed (${result.status}).`);
    ingestGraphPayload(result.body, state);
    stalled = state.photos.size === before ? stalled + 1 : 0;
    const found = Math.min(expectedTotal || Number.MAX_SAFE_INTEGER, state.photos.size);
    job.phase = `Reading album data · ${found}${expectedTotal ? ` of ${expectedTotal}` : ""}`;
    job.current = found;
    job.total = expectedTotal;
    if (expectedTotal > 0 && state.photos.size >= expectedTotal) break;
  }
}

async function refreshGraphFirstPage(page: Page, state: AlbumGraphState) {
  if (!state.template) return;
  const params = new URLSearchParams(state.template.body);
  const variables = JSON.parse(params.get("variables") ?? "{}") as Record<string, unknown>;
  variables.cursor = null;
  variables.count = 50;
  variables.scale = 3;
  params.set("variables", JSON.stringify(variables));
  params.set("__req", "z");
  const result = await page.evaluate(async ({ url, body, friendlyName, lsd }) => {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-fb-friendly-name": friendlyName,
        ...(lsd ? { "x-fb-lsd": lsd } : {}),
      },
      body,
    });
    return { ok: response.ok, body: await response.text() };
  }, {
    url: state.template.url,
    body: params.toString(),
    friendlyName: params.get("fb_api_req_friendly_name") ?? ALBUM_PAGINATION_OPERATION,
    lsd: params.get("lsd") ?? "",
  });
  if (result.ok) ingestGraphPayload(result.body, state);
}

function photoIdentity(href: string) {
  try {
    const url = new URL(href);
    const fbid = url.searchParams.get("fbid");
    if (fbid && /^\d+$/.test(fbid)) return fbid;
    const numericSegments = url.pathname.split("/").filter((segment) => /^\d{8,}$/.test(segment));
    return numericSegments.at(-1) ?? `${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    return href;
  }
}

async function dismissPrompts(page: Page) {
  const labels = ["Allow all cookies", "Accept all cookies", "Only allow essential cookies", "Close"];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label, exact: false }).first();
    if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
      await button.click({ timeout: 1_000 }).catch(() => undefined);
      break;
    }
  }
}

function canonicalAlbumUrl(albumId: string) {
  const canonical = new URL("https://www.facebook.com/media/set/");
  canonical.searchParams.set("set", `a.${albumId.replace(/^a\./, "")}`);
  return canonical.toString();
}

async function postMediaSetExposedByPage(page: Page): Promise<PostMediaSet | null> {
  const result = await page.evaluate(() => {
    type Candidate = {
      token: string;
      count: number;
      postUrl: string;
      photos: Array<{ id: string; url: string; width?: number; height?: number }>;
    };
    const candidates: Candidate[] = [];
    for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/json"]')) {
      let root: unknown;
      try {
        root = JSON.parse(script.textContent ?? "") as unknown;
      } catch {
        continue;
      }
      const stack: unknown[] = [root];
      while (stack.length > 0) {
        const value = stack.pop();
        if (!value || typeof value !== "object") continue;
        if (Array.isArray(value)) {
          stack.push(...value);
          continue;
        }
        const record = value as Record<string, unknown>;
        const token = typeof record.mediaset_token === "string" ? record.mediaset_token : "";
        const connection = record.all_subattachments && typeof record.all_subattachments === "object"
          ? record.all_subattachments as Record<string, unknown>
          : null;
        if (token.startsWith("pcb.") && connection && typeof connection.count === "number" && Array.isArray(connection.nodes)) {
          const photos = connection.nodes.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const media = (entry as Record<string, unknown>).media;
            if (!media || typeof media !== "object") return [];
            const photo = media as Record<string, unknown>;
            const image = photo.viewer_image && typeof photo.viewer_image === "object"
              ? photo.viewer_image as Record<string, unknown>
              : photo.image && typeof photo.image === "object" ? photo.image as Record<string, unknown> : null;
            const id = typeof photo.id === "string" ? photo.id : "";
            const url = image && typeof image.uri === "string" ? image.uri : "";
            if (!id || !url) return [];
            return [{
              id,
              url,
              width: typeof image?.width === "number" ? image.width : undefined,
              height: typeof image?.height === "number" ? image.height : undefined,
            }];
          });
          candidates.push({
            token,
            count: connection.count,
            postUrl: typeof record.url === "string" ? record.url : location.href,
            photos,
          });
        }
        stack.push(...Object.values(record));
      }
    }
    return candidates.sort((left, right) => right.count - left.count || right.photos.length - left.photos.length)[0] ?? null;
  }).catch(() => null);
  if (!result || result.photos.length === 0) return null;
  const photos = result.photos
    .filter((photo) => isCdnImage(photo.url))
    .map((photo) => ({
      ...photo,
      previewUrl: photo.url,
      sourceUrl: `https://www.facebook.com/photo/?fbid=${photo.id}&set=${result.token}`,
    }));
  if (photos.length === 0) return null;
  return {
    token: result.token,
    total: result.count,
    photos,
    postUrl: result.postUrl,
  };
}

function ingestPostMediaPayload(body: string, state: PostGraphState) {
  for (const line of body.split("\n").filter(Boolean)) {
    let root: unknown;
    try {
      root = JSON.parse(line);
    } catch {
      continue;
    }
    if (!root || typeof root !== "object") continue;
    const data = (root as Record<string, unknown>).data;
    if (!data || typeof data !== "object") continue;
    const record = data as Record<string, unknown>;
    const current = record.currMedia;
    if (current && typeof current === "object") addGraphPhoto(state, current as Record<string, unknown>);
    if ("nextMediaAfterNodeId" in record) {
      const next = record.nextMediaAfterNodeId;
      state.nextId = next && typeof next === "object" && typeof (next as Record<string, unknown>).id === "string"
        ? (next as Record<string, unknown>).id as string
        : undefined;
    }
    if (process.env.ALBUM_DEBUG === "1" && (current || "nextMediaAfterNodeId" in record)) {
      console.log("post-media-payload", JSON.stringify({
        keys: Object.keys(record),
        current: current && typeof current === "object" ? (current as Record<string, unknown>).id : undefined,
        next: state.nextId,
        photos: state.photos.size,
      }));
    }
  }
}

async function discoverPostMediaSet(page: Page, mediaSet: PostMediaSet, job: DiscoveryJob) {
  if (mediaSet.total > 2_000) throw new Error(`This Facebook post contains ${mediaSet.total.toLocaleString()} photos. The safety limit is 2,000.`);
  const state: PostGraphState = {
    photos: new Map(mediaSet.photos.map((photo) => [photo.id, photo])),
    queriedIds: new Set(),
  };
  job.status = "working";
  job.phase = `Reading post attachments · ${state.photos.size} of ${mediaSet.total}`;
  job.current = state.photos.size;
  job.total = mediaSet.total;

  const firstPhoto = mediaSet.photos[0];
  const viewerUrl = `https://www.facebook.com/photo/?fbid=${firstPhoto.id}&set=${mediaSet.token}`;
  const [response] = await Promise.all([
    page.waitForResponse((response) => {
      if (!response.url().includes("/api/graphql")) return false;
      const params = new URLSearchParams(response.request().postData() ?? "");
      return params.get("fb_api_req_friendly_name") === POST_MEDIA_OPERATION;
    }, { timeout: 30_000 }),
    page.goto(viewerUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }),
  ]);
  state.template = { url: response.url(), body: response.request().postData() ?? "" };
  ingestPostMediaPayload(await response.text(), state);

  let stalled = 0;
  for (let attempt = 0; attempt < mediaSet.total && state.nextId && state.photos.size < mediaSet.total && stalled < 3; attempt += 1) {
    if (job.controller.signal.aborted) throw new Error("Cancelled.");
    const nodeId = state.nextId;
    if (state.queriedIds.has(nodeId)) break;
    state.queriedIds.add(nodeId);
    const params = new URLSearchParams(state.template.body);
    const variables = JSON.parse(params.get("variables") ?? "{}") as Record<string, unknown>;
    variables.nodeID = nodeId;
    variables.mediasetToken = mediaSet.token;
    variables.scale = 3;
    variables.shouldShowComments = false;
    params.set("variables", JSON.stringify(variables));
    params.set("__req", (attempt + 20).toString(36));
    const before = state.photos.size;
    const result = await page.evaluate(async ({ url, body, friendlyName, lsd }) => {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-fb-friendly-name": friendlyName,
          ...(lsd ? { "x-fb-lsd": lsd } : {}),
        },
        body,
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    }, {
      url: state.template.url,
      body: params.toString(),
      friendlyName: params.get("fb_api_req_friendly_name") ?? POST_MEDIA_OPERATION,
      lsd: params.get("lsd") ?? "",
    });
    if (!result.ok) throw new Error(`Facebook post pagination failed (${result.status}).`);
    const alreadyHadPhoto = state.photos.has(nodeId);
    ingestPostMediaPayload(result.body, state);
    stalled = state.photos.size === before && !alreadyHadPhoto ? stalled + 1 : 0;
    job.current = state.photos.size;
    job.phase = `Reading post attachments · ${state.photos.size} of ${mediaSet.total}`;
  }

  job.photos = [...state.photos.values()];
  if (job.photos.length < mediaSet.total) {
    throw new Error(`Facebook exposed only ${job.photos.length} of ${mediaSet.total} photos attached to this post. Please retry.`);
  }
  job.current = job.photos.length;
  job.total = job.photos.length;
  job.phase = `${job.photos.length} post photos ready`;
  job.status = "ready";
}

async function albumUrlExposedByPage(page: Page) {
  const pageCandidates = await page.locator([
    'link[rel="canonical"]',
    'meta[property="og:url"]',
    'a[href*="/media/set/"]',
    'a[href*="set=a."]',
  ].join(",")).evaluateAll((nodes) => nodes.map((node) =>
    node instanceof HTMLMetaElement ? node.content : node.getAttribute("href") ?? "",
  )).catch(() => [] as string[]);

  for (const candidate of [page.url(), ...pageCandidates]) {
    try {
      const parsed = new URL(candidate, page.url());
      const set = parsed.searchParams.get("set")?.replace(/^a\./, "");
      if (set && /^\d+$/.test(set)) return canonicalAlbumUrl(set);
    } catch {
      // Ignore malformed links embedded in Facebook's page markup.
    }
  }

  const html = (await page.content().catch(() => ""))
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u003d", "=")
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&");
  const serializedSet = html.match(/[?&]set=a\.(\d{6,})/i)?.[1]
    ?? html.match(/["']set["']\s*:\s*["']a\.(\d{6,})/i)?.[1];
  return serializedSet ? canonicalAlbumUrl(serializedSet) : null;
}

async function resolveSharedAlbumUrl(context: BrowserContext, shareUrl: string, job: DiscoveryJob) {
  const cacheKey = new URL(shareUrl);
  cacheKey.search = "";
  cacheKey.hash = "";
  const cached = shareAlbumCache.get(cacheKey.toString());
  if (cached) return cached;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (job.controller.signal.aborted) throw new Error("Cancelled.");
    job.phase = `Resolving Facebook Share link · attempt ${attempt} of 5`;
    const page = await context.newPage();
    try {
      await page.goto(shareUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
      await dismissPrompts(page);
      for (let poll = 0; poll < 6; poll += 1) {
        const postMediaSet = await postMediaSetExposedByPage(page);
        if (postMediaSet) {
          const target: SharedTarget = { albumUrl: postMediaSet.postUrl, postMediaSet };
          shareAlbumCache.set(cacheKey.toString(), target);
          return target;
        }
        const resolved = await albumUrlExposedByPage(page);
        if (resolved) {
          const target: SharedTarget = { albumUrl: resolved };
          shareAlbumCache.set(cacheKey.toString(), target);
          return target;
        }
        await page.waitForTimeout(500);
      }
    } finally {
      await page.close().catch(() => undefined);
    }
  }
  throw new Error("Facebook did not expose an album link from this shared story after 5 automatic attempts. Confirm the post and album are public.");
}

async function scanAlbum(page: Page, job: DiscoveryJob) {
  const links = new Map<string, string>();
  const thumbnails = new Map<string, { url: string; width: number; height: number }>();
  let unchanged = 0;
  let expectedTotal = 0;
  const debug = process.env.ALBUM_DEBUG === "1";

  for (let round = 0; round < 400 && unchanged < 18; round += 1) {
    if (job.controller.signal.aborted) throw new Error("Cancelled.");
    const before = links.size + thumbnails.size;
    const snapshot = await page.evaluate(() => ({
      links: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"), (node) => node.href),
      images: Array.from(document.querySelectorAll<HTMLImageElement>("img[src]"), (node) => ({
        src: node.currentSrc || node.src,
        width: node.naturalWidth || node.width,
        height: node.naturalHeight || node.height,
      })),
      body: document.body.innerText.slice(0, 2_000),
      itemCount: (() => {
        const match = document.body.innerText.match(/([\d,]+)\s+(?:items?|photos?)/i);
        return match ? Number(match[1].replaceAll(",", "")) : 0;
      })(),
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    snapshot.links.filter(isPhotoPage).forEach((href) => {
      const cleanHref = href.split("#")[0];
      links.set(photoIdentity(cleanHref), cleanHref);
    });
    snapshot.images.filter((image) => isCdnImage(image.src) && image.width >= 180 && image.height >= 180)
      .forEach((image) => thumbnails.set(image.src, { url: image.src, width: image.width, height: image.height }));
    expectedTotal = Math.max(expectedTotal, snapshot.itemCount);

    const after = links.size + thumbnails.size;
    unchanged = after === before ? unchanged + 1 : 0;
    const found = Math.max(links.size, thumbnails.size);
    job.phase = `Scanning album · ${found}${expectedTotal ? ` of ${expectedTotal}` : ""} found`;
    job.current = Math.max(links.size, thumbnails.size);
    job.total = expectedTotal;
    if (debug) {
      console.log("album-scan", JSON.stringify({ round, links: links.size, thumbnails: thumbnails.size, expectedTotal, unchanged, scrollY: snapshot.scrollY, scrollHeight: snapshot.scrollHeight }));
    }
    if (expectedTotal > 0 && found >= expectedTotal) break;

    const movedInternalScroller = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((node) => {
          const overflowY = getComputedStyle(node).overflowY;
          return node.scrollHeight > node.clientHeight + 20 && (overflowY === "auto" || overflowY === "scroll");
        })
        .sort((a, b) => b.clientHeight - a.clientHeight || b.scrollHeight - a.scrollHeight);
      const scroller = candidates[0];
      if (!scroller) return false;
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      return true;
    });
    if (!movedInternalScroller) {
      await page.mouse.wheel(0, Math.max(800, snapshot.viewportHeight));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    await page.waitForTimeout(1_200);
  }

  return { links: [...links.values()].slice(0, 1_500), thumbnails: [...thumbnails.values()], expectedTotal };
}

async function resolvePhoto(context: BrowserContext, href: string, signal: AbortSignal): Promise<Photo | null> {
  if (signal.aborted) return null;
  const page = await context.newPage();
  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);
    const images = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>("img[src]"), (node) => ({
      src: node.currentSrc || node.src,
      width: node.naturalWidth || node.width,
      height: node.naturalHeight || node.height,
      main: node.getAttribute("data-visualcompletion") === "media-vc-image" || node.closest('[role="dialog"]') !== null,
    })));
    const candidates = images
      .filter((image) => isCdnImage(image.src) && image.width >= 300 && image.height >= 300)
      .sort((a, b) => Number(b.main) - Number(a.main) || (b.width * b.height) - (a.width * a.height));
    const best = candidates[0];
    if (!best) return null;
    return {
      id: Buffer.from(href).toString("base64url").slice(0, 32),
      url: best.src,
      previewUrl: best.src,
      sourceUrl: href,
      width: best.width,
      height: best.height,
    };
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

export async function discoverPublicAlbum(rawUrl: string, job: DiscoveryJob) {
  let albumUrl = parsePublicAlbumUrl(rawUrl);
  let postMediaSet: PostMediaSet | undefined;
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 3,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    });
    const isShareUrl = new URL(albumUrl).pathname.toLowerCase().includes("/share/");
    if (isShareUrl) {
      const target = await resolveSharedAlbumUrl(context, albumUrl, job);
      albumUrl = target.albumUrl;
      postMediaSet = target.postMediaSet;
      job.albumUrl = albumUrl;
    }
    const page = await context.newPage();
    if (postMediaSet) {
      await discoverPostMediaSet(page, postMediaSet, job);
      return;
    }
    const albumId = new URL(albumUrl).searchParams.get("set")?.replace(/^a\./, "") ?? "";
    const graphState: AlbumGraphState = { photos: new Map(), hasNext: false };
    page.on("response", async (response) => {
      if (!response.url().includes("/api/graphql")) return;
      try {
        const postData = response.request().postData() ?? "";
        const params = new URLSearchParams(postData);
        const operation = params.get("fb_api_req_friendly_name");
        if (operation !== ALBUM_PAGINATION_OPERATION) return;
        graphState.template = { url: response.url(), body: postData };
        const body = await response.text();
        ingestGraphPayload(body, graphState);
        if (process.env.ALBUM_DEBUG === "1") {
          console.log("facebook-graphql", JSON.stringify({
            operation,
            docId: params.get("doc_id"),
            variables: params.get("variables"),
            bytes: body.length,
            photos: graphState.photos.size,
            hasNext: graphState.hasNext,
          }));
        }
      } catch {
        // A malformed Facebook response should not discard DOM-discovered photos.
      }
    });
    job.status = "working";
    job.phase = isShareUrl ? "Opening shared album" : "Opening public album";
    await page.goto(albumUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissPrompts(page);
    const directPostMediaSet = await postMediaSetExposedByPage(page);
    if (directPostMediaSet) {
      job.albumUrl = directPostMediaSet.postUrl;
      await discoverPostMediaSet(page, directPostMediaSet, job);
      return;
    }
    const html = await page.content();
    seedGraphStateFromHtml(html, albumId, graphState);
    const { links: domLinks, thumbnails, expectedTotal } = await scanAlbum(page, job);
    await page.waitForTimeout(250);
    await ensureGraphTemplate(page, albumId, graphState);
    await refreshGraphFirstPage(page, graphState);
    if (process.env.ALBUM_DEBUG === "1") {
      console.log("album-pagination-state", JSON.stringify({ photos: graphState.photos.size, hasNext: graphState.hasNext, hasCursor: Boolean(graphState.endCursor), hasTemplate: Boolean(graphState.template), expectedTotal }));
    }
    await continueGraphPagination(page, graphState, job, expectedTotal);
    const graphIsComplete = expectedTotal > 0 && graphState.photos.size >= expectedTotal && !graphState.hasNext;
    const linkMap = new Map<string, string>();
    if (!graphIsComplete) {
      domLinks.forEach((href) => linkMap.set(photoIdentity(href), href));
    }
    for (const [id, photo] of graphState.photos) {
      const sourceUrl = `https://www.facebook.com/photo/?fbid=${id}${albumId ? `&set=a.${albumId}` : ""}`;
      photo.sourceUrl = sourceUrl;
      linkMap.set(id, sourceUrl);
    }
    const links = [...linkMap.values()];

    if (links.length === 0 && thumbnails.length === 0) {
      const text = await page.locator("body").innerText().catch(() => "");
      if (/log in|sign up/i.test(text)) {
        throw new Error("Facebook placed this album behind its login wall, even though it is public. Use the photo-link fallback below.");
      }
      throw new Error("No public photos were found. Check that the album is public and the URL opens in a private window.");
    }

    if (links.length > 0) {
      job.phase = "Resolving full-size photos";
      job.current = 0;
      job.total = links.length;
      const results: Array<Photo | null> = new Array(links.length).fill(null);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(6, links.length) }, async () => {
        while (cursor < links.length) {
          const index = cursor++;
          const id = photoIdentity(links[index]);
          const resolved = await resolvePhoto(context, links[index], job.controller.signal);
          results[index] = resolved ? { ...resolved, id } : graphState.photos.get(id) ?? null;
          job.current += 1;
        }
      });
      await Promise.all(workers);
      job.photos = results.filter((photo): photo is Photo => photo !== null);
    }

    if (job.photos.length === 0) {
      job.photos = thumbnails.map((image, index) => ({
        id: `thumb-${index}`,
        url: image.url,
        previewUrl: image.url,
        width: image.width,
        height: image.height,
      }));
    }

    const unique = new Map(job.photos.map((photo) => [photo.id, photo]));
    job.photos = [...unique.values()];
    if (job.photos.length === 0) throw new Error("Facebook did not expose downloadable photos on this page.");
    job.current = job.photos.length;
    job.total = job.photos.length;
    job.phase = `${job.photos.length} photos ready`;
    job.status = "ready";
  } finally {
    await browser.close();
  }
}
