// ============================================================
// Cloudflare Worker — Яндекс.Музыка + авторизация + CORS
// ============================================================

const YM_API = "https://api.music.yandex.net";

const ALLOWED_ORIGINS = ["http://localhost:5000", "http://127.0.0.1:5000"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const query = url.searchParams;
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const YM_TOKEN = env.YM_TOKEN;
    const KV = env.MUZYKA_KV;

    if (path === "/api/debug") {
      return json(
        {
          origin,
          method: request.method,
          hasKV: !!KV,
          hasToken: !!YM_TOKEN,
        },
        200,
        origin
      );
    }

    if (path === "/api/ping") {
      return json(
        { status: "ok", hasKV: !!KV, hasToken: !!YM_TOKEN },
        200,
        origin
      );
    }

    if (!KV) {
      return json(
        { error: "MUZYKA_KV не привязан (KV Namespace Binding)" },
        500,
        origin
      );
    }

    const ymHeaders = {
      Authorization: `OAuth ${YM_TOKEN}`,
      "Accept-Language": "ru",
      "User-Agent": "Yandex-Music-API",
    };

    try {
      // ============ АВТОРИЗАЦИЯ ============
      if (path === "/api/auth/register" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400, origin);
        }
        const email = (body.email || "").trim().toLowerCase();
        const password = body.password || "";
        if (!email || !password)
          return json({ error: "Email and password required" }, 400, origin);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
          return json({ error: "Invalid email format" }, 400, origin);
        if (password.length < 6)
          return json(
            { error: "Password must be at least 6 characters" },
            400,
            origin
          );
        const existing = await KV.get(`user:${email}`);
        if (existing)
          return json({ error: "User already exists" }, 400, origin);
        const hash = await hashPassword(password, email);
        const userId = crypto.randomUUID();
        await KV.put(
          `user:${email}`,
          JSON.stringify({
            id: userId,
            email,
            password: hash,
            likedTracks: [],
            playlists: [],
            createdAt: new Date().toISOString(),
          })
        );
        const token = crypto.randomUUID();
        await KV.put(`session:${token}`, JSON.stringify({ userId, email }), {
          expirationTtl: 60 * 60 * 24 * 30,
        });
        return jsonWithCookie({ success: true, email }, token, origin, request);
      }

      if (path === "/api/auth/login" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400, origin);
        }
        const email = (body.email || "").trim().toLowerCase();
        const password = body.password || "";
        if (!email || !password)
          return json({ error: "Email and password required" }, 400, origin);
        const raw = await KV.get(`user:${email}`);
        if (!raw) return json({ error: "Invalid credentials" }, 400, origin);
        const user = JSON.parse(raw);
        const hash = await hashPassword(password, email);
        if (hash !== user.password)
          return json({ error: "Invalid credentials" }, 400, origin);
        const token = crypto.randomUUID();
        await KV.put(
          `session:${token}`,
          JSON.stringify({ userId: user.id, email: user.email }),
          { expirationTtl: 60 * 60 * 24 * 30 }
        );
        return jsonWithCookie(
          { success: true, email: user.email },
          token,
          origin,
          request
        );
      }

      if (path === "/api/auth/logout" && request.method === "POST") {
        const token = getCookie(request, "token");
        if (token) await KV.delete(`session:${token}`);
        return jsonWithCookie({ success: true }, null, origin, request, true);
      }

      if (path === "/api/auth/me") {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        return json({ email: session.email }, 200, origin);
      }

      // ============ ЛАЙКИ ============
      if (path === "/api/likes" && request.method === "GET") {
        const session = await getSession(request, KV);
        if (!session) return json({ tracks: [] }, 200, origin);
        const raw = await KV.get(`user:${session.email}`);
        if (!raw) return json({ tracks: [] }, 200, origin);
        const user = JSON.parse(raw);
        return json({ tracks: user.likedTracks || [] }, 200, origin);
      }

      if (path === "/api/likes" && request.method === "POST") {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        const { track } = await request.json();
        if (!track) return json({ error: "Track required" }, 400, origin);
        const raw = await KV.get(`user:${session.email}`);
        if (!raw) return json({ error: "User not found" }, 404, origin);
        const user = JSON.parse(raw);
        user.likedTracks = user.likedTracks || [];
        if (!user.likedTracks.find((t) => String(t.id) === String(track.id))) {
          user.likedTracks.push(track);
        }
        await KV.put(`user:${session.email}`, JSON.stringify(user));
        return json({ success: true }, 200, origin);
      }

      if (path.startsWith("/api/likes/") && request.method === "DELETE") {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        const trackId = path.split("/").pop();
        const raw = await KV.get(`user:${session.email}`);
        if (!raw) return json({ error: "User not found" }, 404, origin);
        const user = JSON.parse(raw);
        user.likedTracks = (user.likedTracks || []).filter(
          (t) => String(t.id) !== String(trackId)
        );
        await KV.put(`user:${session.email}`, JSON.stringify(user));
        return json({ success: true }, 200, origin);
      }

      // ============ ПЛЕЙЛИСТЫ ============
      if (path === "/api/playlists" && request.method === "GET") {
        const session = await getSession(request, KV);
        if (!session) return json({ playlists: [] }, 200, origin);
        const raw = await KV.get(`user:${session.email}`);
        if (!raw) return json({ playlists: [] }, 200, origin);
        const user = JSON.parse(raw);
        return json({ playlists: user.playlists || [] }, 200, origin);
      }

      if (path === "/api/playlists" && request.method === "POST") {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        const { name } = await request.json();
        if (!name || !name.trim())
          return json({ error: "Name required" }, 400, origin);
        const raw = await KV.get(`user:${session.email}`);
        const user = JSON.parse(raw);
        user.playlists = user.playlists || [];
        const playlist = {
          id: crypto.randomUUID(),
          name: name.trim(),
          tracks: [],
          createdAt: new Date().toISOString(),
        };
        user.playlists.push(playlist);
        await KV.put(`user:${session.email}`, JSON.stringify(user));
        return json({ playlist }, 200, origin);
      }

      if (
        path.startsWith("/api/playlists/") &&
        request.method === "DELETE" &&
        !path.includes("/tracks")
      ) {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        const playlistId = path.split("/").pop();
        const raw = await KV.get(`user:${session.email}`);
        const user = JSON.parse(raw);
        user.playlists = (user.playlists || []).filter(
          (p) => p.id !== playlistId
        );
        await KV.put(`user:${session.email}`, JSON.stringify(user));
        return json({ success: true }, 200, origin);
      }

      if (
        path.startsWith("/api/playlists/") &&
        path.endsWith("/tracks") &&
        request.method === "POST"
      ) {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        const parts = path.split("/");
        const playlistId = parts[3];
        const { track } = await request.json();
        if (!track) return json({ error: "Track required" }, 400, origin);
        const raw = await KV.get(`user:${session.email}`);
        const user = JSON.parse(raw);
        const playlist = (user.playlists || []).find(
          (p) => p.id === playlistId
        );
        if (!playlist)
          return json({ error: "Playlist not found" }, 404, origin);
        playlist.tracks = playlist.tracks || [];
        if (!playlist.tracks.find((t) => String(t.id) === String(track.id))) {
          playlist.tracks.push(track);
        }
        await KV.put(`user:${session.email}`, JSON.stringify(user));
        return json({ success: true }, 200, origin);
      }

      if (
        path.startsWith("/api/playlists/") &&
        path.includes("/tracks/") &&
        request.method === "DELETE"
      ) {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        const parts = path.split("/");
        const playlistId = parts[3];
        const trackId = parts[5];
        const raw = await KV.get(`user:${session.email}`);
        const user = JSON.parse(raw);
        const playlist = (user.playlists || []).find(
          (p) => p.id === playlistId
        );
        if (!playlist)
          return json({ error: "Playlist not found" }, 404, origin);
        playlist.tracks = (playlist.tracks || []).filter(
          (t) => String(t.id) !== String(trackId)
        );
        await KV.put(`user:${session.email}`, JSON.stringify(user));
        return json({ success: true }, 200, origin);
      }

      if (
        path.startsWith("/api/playlists/") &&
        path.endsWith("/reorder") &&
        request.method === "POST"
      ) {
        const session = await getSession(request, KV);
        if (!session) return json({ error: "Not authenticated" }, 401, origin);
        const parts = path.split("/");
        const playlistId = parts[3];
        const { trackIds } = await request.json();
        if (!Array.isArray(trackIds))
          return json({ error: "trackIds required" }, 400, origin);
        const raw = await KV.get(`user:${session.email}`);
        const user = JSON.parse(raw);
        const playlist = (user.playlists || []).find(
          (p) => p.id === playlistId
        );
        if (!playlist)
          return json({ error: "Playlist not found" }, 404, origin);
        const map = new Map(playlist.tracks.map((t) => [String(t.id), t]));
        playlist.tracks = trackIds
          .map((id) => map.get(String(id)))
          .filter(Boolean);
        await KV.put(`user:${session.email}`, JSON.stringify(user));
        return json({ success: true }, 200, origin);
      }

      // ============ МУЗЫКА ============
      if (path === "/api/search") {
        const q = query.get("q");
        const count = parseInt(query.get("count")) || 20;
        if (!q) return json({ error: "Query required" }, 400, origin);
        const tracks = await searchTracks(q, count, ymHeaders);
        return json({ tracks }, 200, origin);
      }

      if (path === "/api/chart") {
        try {
          const r = await fetch(`${YM_API}/landing3/chart`, {
            headers: ymHeaders,
          });
          const data = await r.json();
          if (!data.result?.chart?.tracks) {
            const tracks = await searchTracks("хиты музыка", 20, ymHeaders);
            return json({ tracks }, 200, origin);
          }
          const raw = data.result.chart.tracks.slice(0, 20);
          const tracks = raw.map((item) =>
            formatTrack(item.track || item, null)
          );
          return json({ tracks }, 200, origin);
        } catch (e) {
          const tracks = await searchTracks("хиты музыка", 20, ymHeaders);
          return json({ tracks }, 200, origin);
        }
      }

      if (path === "/api/artists") {
        const q = query.get("q") || "популярные исполнители";
        const r = await fetch(
          `${YM_API}/search?text=${encodeURIComponent(q)}&type=artist&page=0`,
          { headers: ymHeaders }
        );
        const data = await r.json();
        if (!data.result?.artists) return json({ artists: [] }, 200, origin);
        const artists = data.result.artists.results.slice(0, 20).map((a) => ({
          id: a.id,
          name: a.name,
          cover_url: a.cover?.uri
            ? `https://${a.cover.uri.replace("%%", "400x400")}`
            : null,
          genres: a.genres || [],
        }));
        return json({ artists }, 200, origin);
      }

      if (path.startsWith("/api/artist/") && path.endsWith("/tracks")) {
        const artistId = path.split("/")[3];
        const r = await fetch(
          `${YM_API}/artists/${artistId}/tracks?page=0&page-size=20`,
          { headers: ymHeaders }
        );
        const data = await r.json();
        if (!data.result?.tracks) return json({ tracks: [] }, 200, origin);
        const raw = data.result.tracks.slice(0, 20);
        const tracks = raw.map((t) => formatTrack(t, null));
        return json({ tracks }, 200, origin);
      }

      // ============ АЛЬБОМ ============
      if (path.startsWith("/api/album/") && path.endsWith("/tracks")) {
        const albumId = path.split("/")[3];
        try {
          const r = await fetch(`${YM_API}/albums/${albumId}/with-tracks`, {
            headers: ymHeaders,
          });
          const data = await r.json();
          if (!data.result?.volumes) return json({ tracks: [] }, 200, origin);
          const all = [];
          data.result.volumes.forEach((vol) => {
            vol.forEach((t) => all.push(formatTrack(t, null)));
          });
          return json({ tracks: all }, 200, origin);
        } catch (e) {
          return json({ tracks: [] }, 200, origin);
        }
      }

      // ============ НОВИНКИ (РАЗНЫЕ АЛЬБОМЫ) ============
      if (path === "/api/new-releases") {
        const albums = await getNewAlbums(ymHeaders);
        return json({ albums }, 200, origin);
      }

      return json({ error: "Not found", path }, 404, origin);
    } catch (err) {
      return json({ error: err.message, stack: err.stack }, 500, origin);
    }
  },
};

// ============================================================
// РАЗНЫЕ АЛЬБОМЫ — собираем из поиска по жанрам
// ============================================================
async function getNewAlbums(ymHeaders) {
  // 12 разных жанров — каждый вернёт СВОИ альбомы
  const genres = [
    "поп",
    "рэп",
    "рок",
    "электроника",
    "джаз",
    "классика",
    "инди",
    "хип-хоп",
    "R&B",
    "шансон",
    "metal",
    "folk",
    "регги",
    "блюз",
    "кантри",
    "хаус",
    "техно",
    "ambient",
  ];

  // Перемешиваем и берём 10 случайных жанров
  const shuffledGenres = genres.sort(() => Math.random() - 0.5).slice(0, 10);

  const allAlbums = [];
  const seenIds = new Set();

  // 1. Новинки (базовый источник)
  try {
    const r = await fetch(`${YM_API}/landing3/new-releases`, {
      headers: ymHeaders,
    });
    const data = await r.json();
    const list =
      data.result?.newReleases ||
      data.result?.new_releases ||
      (Array.isArray(data.result) ? data.result : []);
    list.forEach((a) => {
      const id = a.id || a.albumId;
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      allAlbums.push(albumFromApi(a));
    });
  } catch (e) {}

  // 2. Поиск по каждому жанру — 6 альбомов на жанр
  const genrePromises = shuffledGenres.map(async (genre) => {
    try {
      const q = `новинки ${genre} 2025`;
      const r = await fetch(
        `${YM_API}/search?text=${encodeURIComponent(q)}&type=album&page=0`,
        { headers: ymHeaders }
      );
      const data = await r.json();
      return data.result?.albums?.results || [];
    } catch (e) {
      return [];
    }
  });

  const genreResults = await Promise.all(genrePromises);

  genreResults.forEach((albums) => {
    albums.slice(0, 6).forEach((a) => {
      if (!a.id || seenIds.has(a.id)) return;
      seenIds.add(a.id);
      allAlbums.push(albumFromApi(a));
    });
  });

  // 3. Фолбэк — если альбомов меньше 20, ищем треки
  if (allAlbums.length < 20) {
    try {
      const r = await fetch(
        `${YM_API}/search?text=${encodeURIComponent(
          "новинки 2025"
        )}&type=track&page=0`,
        { headers: ymHeaders }
      );
      const data = await r.json();
      const tracks = data.result?.tracks?.results || [];
      tracks.forEach((t) => {
        const albumId = t.albums?.[0]?.id;
        if (!albumId || seenIds.has(albumId)) return;
        seenIds.add(albumId);
        allAlbums.push(albumFromTrack(t));
      });
    } catch (e) {}
  }

  // Перемешиваем и берём 40
  return allAlbums.sort(() => Math.random() - 0.5).slice(0, 40);
}

function albumFromApi(a) {
  const coverUri = a.coverUri || a.cover?.uri || a.cover_uri;
  return {
    id: a.id || a.albumId,
    title: a.title || a.name || "Без названия",
    artist:
      a.artists?.map((x) => x.name).join(", ") ||
      a.artist?.name ||
      a.artist ||
      "Неизвестен",
    cover_url: coverUri ? `https://${coverUri.replace("%%", "400x400")}` : null,
    year: a.year || a.releaseDate?.slice(0, 4) || null,
    trackCount: a.trackCount || a.tracks?.length || null,
  };
}

function albumFromTrack(t) {
  const album = t.albums?.[0];
  const coverUri = album?.coverUri || t.coverUri;
  return {
    id: album?.id || t.id,
    title: album?.title || t.title,
    artist: t.artists?.map((a) => a.name).join(", ") || "Неизвестен",
    cover_url: coverUri ? `https://${coverUri.replace("%%", "400x400")}` : null,
    year: album?.year || null,
    trackCount: null,
    isTrack: !album,
  };
}

// ============ CORS ============
function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function jsonWithCookie(
  data,
  token,
  origin = "",
  request = null,
  clear = false
) {
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders(origin),
  };
  let isLocalhost = false;
  let isHttps = false;
  if (request) {
    try {
      const reqUrl = new URL(request.url);
      isHttps = reqUrl.protocol === "https:";
      const reqOrigin = request.headers.get("Origin") || "";
      isLocalhost =
        reqOrigin.includes("localhost") ||
        reqOrigin.includes("127.0.0.1") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1");
    } catch (e) {}
  }
  const cookieParts = [
    "Path=/",
    `Max-Age=${clear ? 0 : 60 * 60 * 24 * 30}`,
    "HttpOnly",
    isLocalhost ? "SameSite=Lax" : "SameSite=None",
  ];
  if (isHttps && !isLocalhost) cookieParts.push("Secure");
  if (clear) {
    headers["Set-Cookie"] = `token=; ${cookieParts.join("; ")}`;
  } else if (token) {
    headers["Set-Cookie"] = `token=${token}; ${cookieParts.join("; ")}`;
  }
  return new Response(JSON.stringify(data), { status: 200, headers });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

async function getSession(request, KV) {
  const token = getCookie(request, "token");
  if (!token) return null;
  const raw = await KV.get(`session:${token}`);
  return raw ? JSON.parse(raw) : null;
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(
    password + "::" + String(salt).toLowerCase()
  );
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function searchTracks(query, count, headers) {
  const url = `${YM_API}/search?text=${encodeURIComponent(
    query
  )}&type=track&page=0`;
  const r = await fetch(url, { headers });
  const data = await r.json();
  if (!data.result?.tracks) return [];
  const raw = data.result.tracks.results.slice(0, count);
  return raw.map((t) => formatTrack(t, null));
}

function formatTrack(track, audioUrl) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artists?.map((a) => a.name).join(", ") || "Unknown",
    duration: Math.floor((track.durationMs || 0) / 1000),
    audio_url: audioUrl || null,
    cover_url: track.coverUri
      ? `https://${track.coverUri.replace("%%", "400x400")}`
      : null,
  };
}
