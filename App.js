// ============================================================
// КОНФИГ
// ============================================================
const API_BASE = "https://music-api.artemitrb1.workers.dev/api";

let waveTracks = [];
let currentIndex = 0;
let isPlaying = false;
let likedTracks = [];
let currentUser = null;
let currentUserData = null;
let isRegisterMode = false;

const audio = document.getElementById("audio");

// Иконки play/pause
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5V19L19 12L8 5Z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 5H10V19H6V5ZM14 5H18V19H14V5Z"/></svg>';
const PLAY_ICON_SM =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5V19L19 12L8 5Z"/></svg>';
const PAUSE_ICON_SM =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 5H10V19H6V5ZM14 5H18V19H14V5Z"/></svg>';

function setPlayIcons(playing) {
  const pb = document.getElementById("playBtn");
  const mp = document.getElementById("miniPlay");
  if (pb) pb.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  if (mp) mp.innerHTML = playing ? PAUSE_ICON_SM : PLAY_ICON_SM;
}

// ============================================================
// 🔐 РЕГИСТРАЦИЯ ЧЕРЕЗ LOCALSTORAGE
// ============================================================
function getUsers() {
  try {
    return JSON.parse(localStorage.getItem("muzika_users") || "{}");
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem("muzika_users", JSON.stringify(users));
}

function getCurrentUserEmail() {
  return localStorage.getItem("muzika_current_user");
}

function setCurrentUserEmail(email) {
  if (email) localStorage.setItem("muzika_current_user", email);
  else localStorage.removeItem("muzika_current_user");
}

function loadCurrentUser() {
  const email = getCurrentUserEmail();
  if (!email) {
    currentUser = null;
    currentUserData = null;
    likedTracks = [];
    return;
  }
  const users = getUsers();
  const user = users[email];
  if (user) {
    currentUser = email;
    currentUserData = user;
    likedTracks = user.likedTracks || [];
  } else {
    setCurrentUserEmail(null);
    currentUser = null;
    currentUserData = null;
    likedTracks = [];
  }
}

function registerUser(email, password) {
  email = email.trim().toLowerCase();
  if (!email || !password) return { error: "Заполните все поля" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { error: "Неверный формат email" };
  if (password.length < 4) return { error: "Пароль минимум 4 символа" };

  const users = getUsers();
  if (users[email]) return { error: "Такой email уже зарегистрирован" };

  users[email] = {
    email,
    password,
    likedTracks: [],
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);
  setCurrentUserEmail(email);

  currentUser = email;
  currentUserData = users[email];
  likedTracks = [];

  return { success: true };
}

function loginUser(email, password) {
  email = email.trim().toLowerCase();
  if (!email || !password) return { error: "Заполните все поля" };

  const users = getUsers();
  const user = users[email];
  if (!user) return { error: "Пользователь не найден" };
  if (user.password !== password) return { error: "Неверный пароль" };

  setCurrentUserEmail(email);
  currentUser = email;
  currentUserData = user;
  likedTracks = user.likedTracks || [];

  return { success: true };
}

function logoutUser() {
  setCurrentUserEmail(null);
  currentUser = null;
  currentUserData = null;
  likedTracks = [];
}

function saveCurrentUser() {
  if (!currentUser) return;
  const users = getUsers();
  if (!users[currentUser]) return;
  users[currentUser].likedTracks = likedTracks;
  saveUsers(users);
  currentUserData = users[currentUser];
}

// ============================================================
// АВТОРИЗАЦИЯ — UI
// ============================================================
function checkAuth() {
  loadCurrentUser();
  renderUserBlock();
  updateLikeButton();
}

function renderUserBlock() {
  const block = document.getElementById("userBlock");
  if (!block) return;

  if (currentUser) {
    block.innerHTML = `
      <span class="user-email">${currentUser}</span>
      <button class="logout-btn" id="logoutBtn">Выйти</button>
    `;
    const btn = document.getElementById("logoutBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        logoutUser();
        renderUserBlock();
        updateLikeButton();
        if (
          document.getElementById("page-collection") &&
          document
            .getElementById("page-collection")
            .classList.contains("active")
        ) {
          loadCollection();
        }
      });
    }
  } else {
    block.innerHTML = '<button id="loginBtn" class="login-btn">Войти</button>';
    const btn = document.getElementById("loginBtn");
    if (btn) btn.addEventListener("click", () => openAuth(false));
  }
}

function openAuth(register) {
  isRegisterMode = register;
  const modal = document.getElementById("authModal");
  if (!modal) return;
  modal.style.display = "flex";
  document.getElementById("authTitle").textContent = register
    ? "Регистрация"
    : "Вход";
  document.getElementById("authSubmit").textContent = register
    ? "Зарегистрироваться"
    : "Войти";
  document.getElementById("authSwitchText").textContent = register
    ? "Уже есть аккаунт?"
    : "Нет аккаунта?";
  document.getElementById("authSwitchLink").textContent = register
    ? "Войти"
    : "Зарегистрироваться";
  document.getElementById("authError").textContent = "";
}

if (document.getElementById("authSwitchLink")) {
  document.getElementById("authSwitchLink").addEventListener("click", (e) => {
    e.preventDefault();
    openAuth(!isRegisterMode);
  });
}

if (document.getElementById("authSubmit")) {
  document.getElementById("authSubmit").addEventListener("click", () => {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;

    const result = isRegisterMode
      ? registerUser(email, password)
      : loginUser(email, password);

    if (result.error) {
      document.getElementById("authError").textContent = result.error;
      return;
    }

    document.getElementById("authModal").style.display = "none";
    document.getElementById("authEmail").value = "";
    document.getElementById("authPassword").value = "";
    renderUserBlock();
    updateLikeButton();

    if (
      document.getElementById("page-collection") &&
      document.getElementById("page-collection").classList.contains("active")
    ) {
      loadCollection();
    }
  });
}

// ============================================================
// НАВИГАЦИЯ
// ============================================================
document.querySelectorAll(".nav-item").forEach((item) => {
  if (item) {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  }
});

function navigate(page) {
  document.querySelectorAll(".nav-item").forEach((i) => {
    if (i) i.classList.toggle("active", i.dataset.page === page);
  });
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add("active");
  if (document.querySelector(".main"))
    document.querySelector(".main").scrollTop = 0;

  if (page === "artists") loadArtists();
  if (page === "chart") loadChart();
  if (page === "new") loadNewReleases();
  if (page === "collection") loadCollection();
}

// ============================================================
// МОЯ ВОЛНА
// ============================================================
async function loadWave() {
  const queries = [
    "популярное 2025",
    "хиты музыка",
    "новинки музыка",
    "топ треки",
    "лучшие песни",
  ];
  const q = queries[Math.floor(Math.random() * queries.length)];

  document.getElementById("waveTrackInfo").textContent = "Загрузка...";
  try {
    const r = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(q)}&count=20`
    );

    if (r.status === 501) {
      waveTracks = [
        {
          id: "test-1",
          title: "Тестовый трек",
          artist: "GigaChat",
          cover_url: "https://via.placeholder.com/300",
          audio_url:
            "https://www.bensound.com/bensound-music/bensound-clearday.mp3",
        },
      ];
      currentIndex = 0;
      updateUI();
      document.getElementById("waveTrackInfo").textContent =
        "API временно недоступно (501). Работаем на тестовом треке.";
      return;
    }

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const data = await r.json();

    waveTracks = (data.tracks || []).map((track) => {
      if (!track.audio_url) {
        return {
          ...track,
          audio_url:
            "https://www.bensound.com/bensound-music/bensound-clearday.mp3",
          title: track.title || "Без названия",
          artist: track.artist || "Неизвестен",
        };
      }
      return track;
    });

    waveTracks = waveTracks.filter((t) => t && t.audio_url);

    if (waveTracks.length === 0) throw new Error("Пустой список");

    currentIndex = 0;
    updateUI();
  } catch (e) {
    document.getElementById("waveTrackInfo").textContent = "Ошибка загрузки";
    console.error(e);
  }
}

function updateUI() {
  const t = waveTracks[currentIndex];
  if (!t) return;

  document.getElementById(
    "waveTrackInfo"
  ).textContent = `${t.artist} — ${t.title}`;

  const cover = document.getElementById("waveCover");
  const placeholder = document.getElementById("waveCoverPlaceholder");
  if (t.cover_url) {
    cover.src = t.cover_url;
    cover.style.display = "block";
    placeholder.style.display = "none";
  } else {
    cover.style.display = "none";
    placeholder.style.display = "flex";
  }

  document.getElementById("miniTitle").textContent = t.title;
  document.getElementById("miniArtist").textContent = t.artist;
  const miniCover = document.getElementById("miniCover");
  if (t.cover_url) {
    miniCover.src = t.cover_url;
    miniCover.style.display = "block";
  } else {
    miniCover.style.display = "none";
  }

  updateLikeButton();
}

function updateLikeButton() {
  const t = waveTracks[currentIndex];
  if (!t) return;
  const likeBtn = document.getElementById("likeBtn");
  if (!likeBtn) return;

  if (likedTracks.find((x) => String(x.id) === String(t.id))) {
    likeBtn.classList.add("active");
  } else {
    likeBtn.classList.remove("active");
  }
}

function togglePlay() {
  if (!waveTracks[currentIndex]) return;
  const t = waveTracks[currentIndex];
  if (!t.audio_url) {
    next();
    return;
  }

  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    setPlayIcons(false);
  } else {
    if (audio.src !== t.audio_url) audio.src = t.audio_url;
    audio
      .play()
      .then(() => {
        isPlaying = true;
        setPlayIcons(true);
      })
      .catch((err) => {
        console.error(err);
        next();
      });
  }
}

if (document.getElementById("playBtn"))
  document.getElementById("playBtn").addEventListener("click", togglePlay);
if (document.getElementById("miniPlay"))
  document.getElementById("miniPlay").addEventListener("click", togglePlay);

function next() {
  if (waveTracks.length === 0) return;
  currentIndex = (currentIndex + 1) % waveTracks.length;
  playCurrent();
}

function prev() {
  if (waveTracks.length === 0) return;
  currentIndex = (currentIndex - 1 + waveTracks.length) % waveTracks.length;
  playCurrent();
}

if (document.getElementById("nextBtn"))
  document.getElementById("nextBtn").addEventListener("click", next);
if (document.getElementById("miniNext"))
  document.getElementById("miniNext").addEventListener("click", next);
if (document.getElementById("prevBtn"))
  document.getElementById("prevBtn").addEventListener("click", prev);
if (document.getElementById("miniPrev"))
  document.getElementById("miniPrev").addEventListener("click", prev);

function playCurrent() {
  const t = waveTracks[currentIndex];
  if (!t || !t.audio_url) {
    next();
    return;
  }
  audio.src = t.audio_url;
  audio.load();
  audio
    .play()
    .then(() => {
      isPlaying = true;
      setPlayIcons(true);
    })
    .catch(console.error);
  updateUI();
}

// ============================================================
// ЛАЙКИ
// ============================================================
if (document.getElementById("likeBtn")) {
  document.getElementById("likeBtn").addEventListener("click", () => {
    const t = waveTracks[currentIndex];
    if (!t) return;

    if (!currentUser) {
      openAuth(false);
      return;
    }

    const idx = likedTracks.findIndex((x) => String(x.id) === String(t.id));
    if (idx === -1) {
      likedTracks.push(t);
      document.getElementById("likeBtn").classList.add("active");
    } else {
      likedTracks.splice(idx, 1);
      document.getElementById("likeBtn").classList.remove("active");
    }
    saveCurrentUser();
  });
}

if (document.getElementById("dislikeBtn"))
  document.getElementById("dislikeBtn").addEventListener("click", next);
if (document.getElementById("refreshBtn"))
  document.getElementById("refreshBtn").addEventListener("click", loadWave);

audio.addEventListener("timeupdate", () => {
  document.getElementById("miniCurrent").textContent = formatTime(
    audio.currentTime
  );
  const seek = document.getElementById("miniSeek");
  if (seek) seek.value = audio.currentTime;
});

audio.addEventListener("loadedmetadata", () => {
  document.getElementById("miniDuration").textContent = formatTime(
    audio.duration
  );
  const seek = document.getElementById("miniSeek");
  if (seek) seek.max = audio.duration;
});

audio.addEventListener("ended", next);

if (document.getElementById("miniSeek")) {
  document.getElementById("miniSeek").addEventListener("input", (e) => {
    audio.currentTime = parseFloat(e.target.value);
  });
}

// ============================================================
// ИСПОЛНИТЕЛИ
// ============================================================
function loadArtists(query = "") {
  const grid = document.getElementById("artistsGrid");
  if (!grid) return;
  grid.innerHTML = '<p class="empty">Загрузка...</p>';
  const url = query
    ? `${API_BASE}/artists?q=${encodeURIComponent(query)}`
    : `${API_BASE}/artists`;
  fetch(url)
    .then((r) => r.json())
    .then((data) => {
      if (!data.artists || data.artists.length === 0) {
        grid.innerHTML = '<p class="empty">Исполнители не найдены</p>';
        return;
      }
      grid.innerHTML = "";
      data.artists.forEach((a) => {
        const card = document.createElement("div");
        card.className = "card card-round";
        card.innerHTML = `
          ${
            a.cover_url
              ? `<img class="card-img" src="${a.cover_url}" alt="">`
              : `<div class="card-img">🎤</div>`
          }
          <div class="card-title">${a.name}</div>
          <div class="card-desc">${
            (a.genres || []).slice(0, 2).join(", ") || "Исполнитель"
          }</div>
        `;
        card.addEventListener("click", () => openArtist(a));
        grid.appendChild(card);
      });
    })
    .catch(() => {
      grid.innerHTML = '<p class="empty">Ошибка загрузки</p>';
    });
}

if (document.getElementById("artistSearchBtn")) {
  document.getElementById("artistSearchBtn").addEventListener("click", () => {
    loadArtists(document.getElementById("artistSearch").value.trim());
  });
}
if (document.getElementById("artistSearch")) {
  document.getElementById("artistSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadArtists(e.target.value.trim());
  });
}

function openArtist(artist) {
  const header = document.getElementById("artistHeader");
  if (!header) return;
  header.innerHTML = `
    ${
      artist.cover_url
        ? `<img src="${artist.cover_url}" alt="">`
        : `<div class="placeholder">🎤</div>`
    }
    <div class="artist-header-info">
      <h1>${artist.name}</h1>
      <div class="genres">${
        (artist.genres || []).join(", ") || "Исполнитель"
      }</div>
    </div>
  `;

  const list = document.getElementById("artistTracksList");
  if (!list) return;
  list.innerHTML = '<p class="empty">Загрузка треков...</p>';

  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const artistPage = document.getElementById("page-artist");
  if (artistPage) artistPage.classList.add("active");
  if (document.querySelector(".main"))
    document.querySelector(".main").scrollTop = 0;
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));

  fetch(`${API_BASE}/artist/${artist.id}/tracks?count=20`)
    .then((r) => r.json())
    .then((data) => {
      if (data.tracks && data.tracks.length) renderTrackList(list, data.tracks);
      else list.innerHTML = '<p class="empty">Треки не найдены</p>';
    })
    .catch(() => {
      list.innerHTML = '<p class="empty">Ошибка загрузки</p>';
    });
}

if (document.getElementById("backFromArtist")) {
  document.getElementById("backFromArtist").addEventListener("click", () => {
    navigate("artists");
  });
}

// ============================================================
// ЧАРТ
// ============================================================
function loadChart() {
  const list = document.getElementById("chartList");
  if (!list) return;
  list.innerHTML = '<p class="empty">Загрузка...</p>';
  fetch(`${API_BASE}/chart`)
    .then((r) => r.json())
    .then((data) => {
      if (data.tracks && data.tracks.length)
        renderTrackList(list, data.tracks, true);
      else list.innerHTML = '<p class="empty">Чарт пуст</p>';
    })
    .catch(() => {
      list.innerHTML = '<p class="empty">Ошибка загрузки</p>';
    });
}

// ============================================================
// НОВИНКИ — АЛЬБОМЫ
// ============================================================
function loadNewReleases() {
  const grid = document.getElementById("newGrid");
  if (!grid) return;

  // Скелетон-загрузка
  grid.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const skeleton = document.createElement("div");
    skeleton.className = "card skeleton";
    skeleton.innerHTML = `
      <div class="skeleton-img"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text-short"></div>
    `;
    grid.appendChild(skeleton);
  }

  fetch(`${API_BASE}/new-releases`)
    .then((r) => r.json())
    .then((data) => {
      if (!data.albums || data.albums.length === 0) {
        grid.innerHTML = '<p class="empty">Новинок пока нет</p>';
        return;
      }
      grid.innerHTML = "";
      data.albums.forEach((a) => {
        const card = document.createElement("div");
        card.className = "card album-card";
        card.innerHTML = `
          <div class="album-cover-wrap">
            ${
              a.cover_url
                ? `<img class="card-img" src="${a.cover_url}" alt="" loading="lazy">`
                : `<div class="card-img">💿</div>`
            }
            <div class="album-play-overlay">
              <div class="album-play-btn">▶</div>
            </div>
          </div>
          <div class="card-title">${a.title}</div>
          <div class="card-desc">${a.artist}${
          a.year ? " • " + a.year : ""
        }</div>
        `;
        card.addEventListener("click", () => openAlbum(a));
        grid.appendChild(card);
      });
    })
    .catch(() => {
      grid.innerHTML = '<p class="empty">Ошибка загрузки</p>';
    });
}

function openAlbum(album) {
  const header = document.getElementById("artistHeader");
  if (!header) return;

  header.innerHTML = `
    ${
      album.cover_url
        ? `<img src="${album.cover_url}" alt="">`
        : `<div class="placeholder">💿</div>`
    }
    <div class="artist-header-info">
      <h1>${album.title}</h1>
      <div class="genres">${album.artist}${
    album.year ? " • " + album.year : ""
  }${album.trackCount ? " • " + album.trackCount + " треков" : ""}</div>
    </div>
  `;

  const list = document.getElementById("artistTracksList");
  if (!list) return;
  list.innerHTML = '<p class="empty">Загрузка треков...</p>';

  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const artistPage = document.getElementById("page-artist");
  if (artistPage) artistPage.classList.add("active");
  if (document.querySelector(".main"))
    document.querySelector(".main").scrollTop = 0;
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));

  if (album.isTrack) {
    fetch(
      `${API_BASE}/search?q=${encodeURIComponent(
        album.artist + " " + album.title
      )}&count=20`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.tracks && d.tracks.length) renderTrackList(list, d.tracks);
        else list.innerHTML = '<p class="empty">Ничего не найдено</p>';
      })
      .catch(() => {
        list.innerHTML = '<p class="empty">Ошибка загрузки</p>';
      });
    return;
  }

  fetch(`${API_BASE}/album/${album.id}/tracks`)
    .then((r) => r.json())
    .then((data) => {
      if (data.tracks && data.tracks.length) renderTrackList(list, data.tracks);
      else {
        list.innerHTML =
          '<p class="empty">Треки альбома не найдены. Ищем похожие...</p>';
        fetch(
          `${API_BASE}/search?q=${encodeURIComponent(
            album.artist + " " + album.title
          )}&count=20`
        )
          .then((r) => r.json())
          .then((d) => {
            if (d.tracks && d.tracks.length) renderTrackList(list, d.tracks);
            else list.innerHTML = '<p class="empty">Ничего не найдено</p>';
          });
      }
    })
    .catch(() => {
      list.innerHTML = '<p class="empty">Ошибка загрузки</p>';
    });
}

// ============================================================
// КОЛЛЕКЦИЯ
// ============================================================
function loadCollection() {
  const list = document.getElementById("collectionList");
  const empty = document.getElementById("collectionEmpty");
  if (!list || !empty) return;

  if (!currentUser) {
    list.innerHTML = "";
    empty.style.display = "block";
    empty.textContent = "Войдите в аккаунт, чтобы сохранять треки";
    return;
  }

  if (likedTracks.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    empty.textContent = "Пока ничего нет. Нажмите ❤️ на треке в «Моей волне».";
    return;
  }
  empty.style.display = "none";
  renderTrackList(list, likedTracks);
}

// ============================================================
// ПОИСК
// ============================================================
if (document.getElementById("searchBtn")) {
  document.getElementById("searchBtn").addEventListener("click", doSearch);
}
if (document.getElementById("searchInput")) {
  document.getElementById("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
}

function doSearch() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  const list = document.getElementById("searchList");
  if (!list) return;
  list.innerHTML = '<p class="empty">Загрузка...</p>';
  fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&count=20`)
    .then((r) => r.json())
    .then((data) => {
      if (data.tracks && data.tracks.length) renderTrackList(list, data.tracks);
      else list.innerHTML = '<p class="empty">Ничего не найдено</p>';
    })
    .catch(() => {
      list.innerHTML = '<p class="empty">Ошибка поиска</p>';
    });
}

// ============================================================
// РЕНДЕР СПИСКА
// ============================================================
function renderTrackList(container, list, showNumbers = false) {
  if (!container) return;
  container.innerHTML = "";
  list.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.innerHTML = `
      ${showNumbers ? `<span class="track-num">${i + 1}</span>` : ""}
      ${
        t.cover_url
          ? `<img class="track-cover" src="${t.cover_url}" alt="">`
          : `<div class="track-cover"></div>`
      }
      <div class="track-info">
        <div class="track-title">${t.title}</div>
        <div class="track-artist">${t.artist}</div>
      </div>
      <span class="track-duration">${formatTime(t.duration)}</span>
    `;
    row.addEventListener("click", () => {
      waveTracks = list;
      currentIndex = i;
      playCurrent();
    });
    container.appendChild(row);
  });
}

// ============================================================
// УТИЛИТЫ
// ============================================================
function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ============================================================
// СТАРТ
// ============================================================
checkAuth();
loadWave();
