/* ============================================================
   ЛОКАЛЬНЫЙ ПЛЕЕР — воспроизведение mp3 с телефона.
   Работает параллельно с app.js (тот отвечает за Яндекс.Музыку).
   Использует @capacitor/filesystem для сохранения во внутреннюю память.
   ============================================================ */

(function () {
  "use strict";

  const fsPlugin = window.Capacitor?.Plugins?.Filesystem;
  if (!fsPlugin) {
    console.warn(
      "⚠️ @capacitor/filesystem не установлен — файлы не сохранятся."
    );
  }

  const LIB_FILE = "local_library.json";
  const SONGS_DIR = "songs";

  let localTracks = [];
  let localAudio = null;
  let localCurrentIndex = -1;
  let localIsPlaying = false;
  let currentBlobUrl = null;

  // ============ БИБЛИОТЕКА ============
  async function loadLibrary() {
    if (!fsPlugin) return;
    try {
      const res = await fsPlugin.readFile({
        path: LIB_FILE,
        directory: "DATA",
        encoding: "utf8",
      });
      localTracks = JSON.parse(res.data);
    } catch {
      localTracks = [];
    }
    renderLocalList();
    updateLocalCounter();
  }

  async function saveLibrary() {
    if (!fsPlugin) return;
    await fsPlugin.writeFile({
      path: LIB_FILE,
      data: JSON.stringify(localTracks),
      directory: "DATA",
      encoding: "utf8",
    });
  }

  // ============ ДОБАВЛЕНИЕ ФАЙЛОВ ============
  function setupFileInput() {
    const input = document.getElementById("localFileInput");
    const btn = document.getElementById("addSongsBtn");
    if (!input || !btn) return;

    btn.addEventListener("click", () => input.click());

    input.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      showProgress(`Загрузка 0 / ${files.length}...`);

      for (let i = 0; i < files.length; i++) {
        try {
          await addFile(files[i]);
        } catch (err) {
          console.error("Ошибка добавления:", files[i].name, err);
        }
        showProgress(`Загрузка ${i + 1} / ${files.length}...`);
      }

      hideProgress();
      input.value = "";
      await saveLibrary();
      renderLocalList();
      updateLocalCounter();

      if (localCurrentIndex === -1 && localTracks.length) {
        localCurrentIndex = 0;
        updateLocalUI();
      }
    });
  }

  async function addFile(file) {
    if (!fsPlugin) {
      alert("Плагин Filesystem не установлен");
      return;
    }
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    const safeName = Date.now() + "_" + file.name.replace(/[^\w.\-]/g, "_");

    await fsPlugin.writeFile({
      path: SONGS_DIR + "/" + safeName,
      data: base64,
      directory: "DATA",
      recursive: true,
    });

    const baseName = file.name.replace(/\.(mp3|m4a|wav|ogg|flac|aac)$/i, "");
    let artist = "Неизвестный";
    let title = baseName;

    if (baseName.includes(" - ")) {
      const parts = baseName.split(" - ");
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }

    localTracks.push({
      id: Date.now() + "_" + Math.random().toString(36).slice(2),
      title,
      artist,
      fileName: safeName,
      size: file.size,
    });
  }

  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // ============ ВОСПРОИЗВЕДЕНИЕ ============
  async function getFileUrl(track) {
    if (!fsPlugin) return null;
    const res = await fsPlugin.readFile({
      path: SONGS_DIR + "/" + track.fileName,
      directory: "DATA",
    });
    const byteChars = atob(res.data);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], {
      type: "audio/mpeg",
    });
    return URL.createObjectURL(blob);
  }

  async function playLocal(index) {
    const t = localTracks[index];
    if (!t) return;

    const ymAudio = document.getElementById("audio");
    if (ymAudio && !ymAudio.paused) ymAudio.pause();

    localCurrentIndex = index;

    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }

    try {
      const url = await getFileUrl(t);
      currentBlobUrl = url;
      localAudio.src = url;
      await localAudio.play();
      localIsPlaying = true;
      updateLocalUI();
      renderLocalList();
    } catch (err) {
      console.error("play error:", err);
      alert("Не удалось воспроизвести: " + t.title);
    }
  }

  function toggleLocalPlay() {
    if (localCurrentIndex === -1 && localTracks.length) return playLocal(0);
    if (!localAudio || !localAudio.src) return;

    if (localIsPlaying) {
      localAudio.pause();
      localIsPlaying = false;
      updateLocalUI();
    } else {
      localAudio.play().then(() => {
        localIsPlaying = true;
        updateLocalUI();
      });
    }
  }

  function nextLocal() {
    if (!localTracks.length) return;
    playLocal((localCurrentIndex + 1) % localTracks.length);
  }

  function prevLocal() {
    if (!localTracks.length) return;
    playLocal(
      (localCurrentIndex - 1 + localTracks.length) % localTracks.length
    );
  }

  // ============ УДАЛЕНИЕ ============
  async function deleteLocal(index) {
    const t = localTracks[index];
    if (!t) return;
    if (!confirm(`Удалить «${t.title}»?`)) return;

    try {
      if (fsPlugin) {
        await fsPlugin.deleteFile({
          path: SONGS_DIR + "/" + t.fileName,
          directory: "DATA",
        });
      }
    } catch (e) {
      console.warn("Файл не найден:", e);
    }

    localTracks.splice(index, 1);
    await saveLibrary();

    if (index === localCurrentIndex) {
      localAudio.pause();
      localAudio.src = "";
      localIsPlaying = false;
      localCurrentIndex = localTracks.length ? 0 : -1;
      updateLocalUI();
    } else if (index < localCurrentIndex) {
      localCurrentIndex--;
    }

    renderLocalList();
    updateLocalCounter();
  }

  // ============ UI ============
  function updateLocalUI() {
    const t = localTracks[localCurrentIndex];
    if (!t) return;

    const miniPlay = document.getElementById("miniPlay");
    if (miniPlay)
      miniPlay.innerHTML = localIsPlaying
        ? '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 5H10V19H6V5ZM14 5H18V19H14V5Z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5V19L19 12L8 5Z"/></svg>';

    const playBtn = document.getElementById("playBtn");
    if (playBtn)
      playBtn.innerHTML = localIsPlaying
        ? '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 5H10V19H6V5ZM14 5H18V19H14V5Z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5V19L19 12L8 5Z"/></svg>';

    const miniTitle = document.getElementById("miniTitle");
    const miniArtist = document.getElementById("miniArtist");
    if (miniTitle) miniTitle.textContent = t.title;
    if (miniArtist) miniArtist.textContent = t.artist;

    const info = document.getElementById("waveTrackInfo");
    if (info) info.textContent = `${t.artist} — ${t.title}`;

    const cover = document.getElementById("waveCover");
    const ph = document.getElementById("waveCoverPlaceholder");
    if (cover) cover.style.display = "none";
    if (ph) ph.style.display = "flex";
  }

  function renderLocalList() {
    const list = document.getElementById("localList");
    const empty = document.getElementById("localEmpty");
    if (!list) return;

    list.innerHTML = "";

    if (!localTracks.length) {
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";

    localTracks.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "track-row" + (i === localCurrentIndex ? " playing" : "");
      row.innerHTML = `
        <div class="track-cover">♪</div>
        <div class="track-info">
          <div class="track-title">${escapeHtml(t.title)}</div>
          <div class="track-artist">${escapeHtml(t.artist)}</div>
        </div>
        <button class="delete-btn" data-index="${i}" title="Удалить">🗑</button>
      `;

      row.addEventListener("click", (e) => {
        if (e.target.classList.contains("delete-btn")) return;
        playLocal(i);
      });

      const del = row.querySelector(".delete-btn");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteLocal(i);
      });

      list.appendChild(row);
    });
  }

  function updateLocalCounter() {
    let counter = document.getElementById("localCount");
    if (!counter) {
      counter = document.createElement("div");
      counter.id = "localCount";
      counter.className = "local-count";
      const header = document.querySelector(".local-header");
      if (header && header.parentNode) {
        header.parentNode.insertBefore(counter, header.nextSibling);
      }
    }
    counter.textContent = localTracks.length
      ? `Всего песен: ${localTracks.length}`
      : "";
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  function showProgress(text) {
    let el = document.getElementById("uploadProgress");
    if (!el) {
      el = document.createElement("div");
      el.id = "uploadProgress";
      el.className = "upload-progress";
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  function hideProgress() {
    const el = document.getElementById("uploadProgress");
    if (el) el.remove();
  }

  function formatTime(s) {
    if (!s || isNaN(s)) return "0:00";
    return `${Math.floor(s / 60)}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;
  }

  function isLocalPageActive() {
    const p = document.getElementById("page-local");
    return p && p.classList.contains("active");
  }

  // ============ ИНИЦИАЛИЗАЦИЯ ============
  window.addEventListener("load", () => {
    localAudio = document.createElement("audio");
    localAudio.preload = "metadata";
    document.body.appendChild(localAudio);

    localAudio.addEventListener("timeupdate", () => {
      if (!isLocalPageActive()) return;
      const cur = document.getElementById("miniCurrent");
      const seek = document.getElementById("miniSeek");
      if (cur) cur.textContent = formatTime(localAudio.currentTime);
      if (seek) seek.value = localAudio.currentTime;
    });

    localAudio.addEventListener("loadedmetadata", () => {
      const dur = document.getElementById("miniDuration");
      const seek = document.getElementById("miniSeek");
      if (dur) dur.textContent = formatTime(localAudio.duration);
      if (seek) seek.max = localAudio.duration;
    });

    localAudio.addEventListener("ended", nextLocal);

    // Перехват управления мини-плеером на странице "Мои песни"
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(
        "click",
        (e) => {
          if (isLocalPageActive()) {
            e.stopImmediatePropagation();
            e.preventDefault();
            fn();
          }
        },
        true
      );
    };

    bind("miniPlay", toggleLocalPlay);
    bind("miniNext", nextLocal);
    bind("miniPrev", prevLocal);
    bind("playBtn", toggleLocalPlay);
    bind("nextBtn", nextLocal);
    bind("prevBtn", prevLocal);

    const miniSeek = document.getElementById("miniSeek");
    if (miniSeek) {
      miniSeek.addEventListener(
        "input",
        (e) => {
          if (isLocalPageActive()) {
            e.stopImmediatePropagation();
            localAudio.currentTime = parseFloat(e.target.value);
          }
        },
        true
      );
    }

    setupFileInput();
    loadLibrary();
  });
})();
