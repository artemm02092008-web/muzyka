const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// ⚠️ Твой токен Яндекс.Музыки
const YM_TOKEN = process.env.YM_TOKEN;
const YM_API = "https://api.music.yandex.net";

const headers = {
  Authorization: `OAuth ${YM_TOKEN}`,
  "Accept-Language": "ru",
  "User-Agent": "Yandex-Music-API",
};

// ============ MongoDB ============
mongoose
  .connect("mongodb://localhost:27017/musicapp")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err.message));

const JWT_SECRET = "super-secret-key-change-me";

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  likedTracks: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", UserSchema);

function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ============ ВСПОМОГАТЕЛЬНЫЕ ============
async function getDirectLink(trackId) {
  try {
    const dlRes = await fetch(`${YM_API}/tracks/${trackId}/download-info`, {
      headers,
    });
    const dlData = await dlRes.json();
    if (!dlData.result || dlData.result.length === 0) return null;

    const mp3Info =
      dlData.result.find((i) => i.codec === "mp3") || dlData.result[0];
    const xmlRes = await fetch(mp3Info.downloadInfoUrl);
    const xml = await xmlRes.text();

    const host = xml.match(/<host>(.*?)<\/host>/)?.[1];
    const pathMatch = xml.match(/<path>(.*?)<\/path>/)?.[1];
    const ts = xml.match(/<ts>(.*?)<\/ts>/)?.[1];
    const s = xml.match(/<s>(.*?)<\/s>/)?.[1];

    if (!host || !pathMatch || !ts || !s) return null;

    const sign = crypto
      .createHash("md5")
      .update(`XGRlBW9FXlekgbPrRHuSiA${pathMatch.slice(1)}${s}`)
      .digest("hex");

    return `https://${host}/get-mp3/${sign}/${ts}${pathMatch}`;
  } catch (e) {
    return null;
  }
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

async function searchTracksByQuery(query, count = 20) {
  const url = `${YM_API}/search?text=${encodeURIComponent(
    query
  )}&type=track&page=0&nocorrect=false`;
  const r = await fetch(url, { headers });
  const data = await r.json();

  if (!data.result || !data.result.tracks) return [];

  const raw = data.result.tracks.results.slice(0, count);
  return await Promise.all(
    raw.map(async (t) => {
      const audioUrl = await getDirectLink(t.id);
      return formatTrack(t, audioUrl);
    })
  );
}

// ============ АВТОРИЗАЦИЯ ============
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "User already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hash });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "30d",
    });
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "30d",
    });
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    res.json({ email: user.email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ ЛАЙКИ ============
app.get("/api/likes", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json({ tracks: user.likedTracks });
});

app.post("/api/likes", authMiddleware, async (req, res) => {
  const { track } = req.body;
  const user = await User.findById(req.userId);
  const exists = user.likedTracks.find(
    (t) => String(t.id) === String(track.id)
  );
  if (!exists) {
    user.likedTracks.push(track);
    await user.save();
  }
  res.json({ success: true });
});

app.delete("/api/likes/:id", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  user.likedTracks = user.likedTracks.filter(
    (t) => String(t.id) !== String(req.params.id)
  );
  await user.save();
  res.json({ success: true });
});

// ============ МУЗЫКА ============
app.get("/api/popular", async (req, res) => {
  try {
    const tracks = await searchTracksByQuery("популярное 2025", 20);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/search", async (req, res) => {
  const query = req.query.q;
  const count = parseInt(req.query.count) || 20;
  if (!query) return res.status(400).json({ error: "Query required" });

  try {
    const tracks = await searchTracksByQuery(query, count);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/chart", async (req, res) => {
  try {
    const url = `${YM_API}/landing3/chart`;
    const r = await fetch(url, { headers });
    const data = await r.json();

    if (!data.result || !data.result.chart || !data.result.chart.tracks) {
      const tracks = await searchTracksByQuery("хиты музыка", 20);
      return res.json({ tracks });
    }

    const raw = data.result.chart.tracks.slice(0, 20);
    const tracks = await Promise.all(
      raw.map(async (item) => {
        const t = item.track || item;
        const audioUrl = await getDirectLink(t.id);
        return formatTrack(t, audioUrl);
      })
    );

    res.json({ tracks });
  } catch (err) {
    try {
      const tracks = await searchTracksByQuery("топ треки", 20);
      res.json({ tracks });
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.get("/api/artists", async (req, res) => {
  const query = req.query.q || "популярные исполнители";
  const count = parseInt(req.query.count) || 20;

  try {
    const url = `${YM_API}/search?text=${encodeURIComponent(
      query
    )}&type=artist&page=0`;
    const r = await fetch(url, { headers });
    const data = await r.json();

    if (!data.result || !data.result.artists) return res.json({ artists: [] });

    const artists = data.result.artists.results.slice(0, count).map((a) => ({
      id: a.id,
      name: a.name,
      cover_url: a.cover?.uri
        ? `https://${a.cover.uri.replace("%%", "400x400")}`
        : null,
      genres: a.genres || [],
    }));
    res.json({ artists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/artist/:id/tracks", async (req, res) => {
  const artistId = req.params.id;
  const count = parseInt(req.query.count) || 20;

  try {
    const url = `${YM_API}/artists/${artistId}/tracks?page=0&page-size=${count}`;
    const r = await fetch(url, { headers });
    const data = await r.json();

    if (!data.result || !data.result.tracks) return res.json({ tracks: [] });

    const raw = data.result.tracks.slice(0, count);
    const tracks = await Promise.all(
      raw.map(async (t) => {
        const audioUrl = await getDirectLink(t.id);
        return formatTrack(t, audioUrl);
      })
    );
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/new-releases", async (req, res) => {
  try {
    const url = `${YM_API}/landing3/new-releases`;
    const r = await fetch(url, { headers });
    const data = await r.json();

    if (!data.result || !data.result.newReleases)
      return res.json({ albums: [] });

    const albums = data.result.newReleases.slice(0, 20).map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artists?.map((x) => x.name).join(", ") || "",
      cover_url: a.coverUri
        ? `https://${a.coverUri.replace("%%", "400x400")}`
        : null,
      year: a.year,
    }));
    res.json({ albums });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/ping", (req, res) => res.json({ status: "ok" }));

// ============ SPA ============
app.get("/{*splat}", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============ ЗАПУСК ============
const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://192.168.1.142:${PORT}`);
});
