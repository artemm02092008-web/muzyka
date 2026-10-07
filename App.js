const API_BASE = '/api';
let waveTracks = [];
let currentIndex = 0;
let isPlaying = false;
let likedTracks = [];
let currentUser = null;
let isRegisterMode = false;

const audio = document.getElementById('audio');

// Иконки play/pause (SVG)
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5V19L19 12L8 5Z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 5H10V19H6V5ZM14 5H18V19H14V5Z"/></svg>';
const PLAY_ICON_SM = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5V19L19 12L8 5Z"/></svg>';
const PAUSE_ICON_SM = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 5H10V19H6V5ZM14 5H18V19H14V5Z"/></svg>';

function setPlayIcons(playing) {
    document.getElementById('playBtn').innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    document.getElementById('miniPlay').innerHTML = playing ? PAUSE_ICON_SM : PLAY_ICON_SM;
}

// ============ АВТОРИЗАЦИЯ ============
async function checkAuth() {
    try {
        const r = await fetch(`${API_BASE}/auth/me`);
        if (r.ok) {
            const data = await r.json();
            currentUser = data.email;
            renderUserBlock();
            await loadLikesFromServer();
        } else {
            currentUser = null;
            renderUserBlock();
        }
    } catch (e) {
        console.error('Auth check error:', e);
    }
}

function renderUserBlock() {
    const block = document.getElementById('userBlock');
    if (currentUser) {
        block.innerHTML = `
            <span class="user-email">${currentUser}</span>
            <button class="logout-btn" id="logoutBtn">Выйти</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
            currentUser = null;
            likedTracks = [];
            renderUserBlock();
            if (document.getElementById('page-collection').classList.contains('active')) {
                loadCollection();
            }
        });
    } else {
        block.innerHTML = '<button id="loginBtn" class="login-btn">Войти</button>';
        document.getElementById('loginBtn').addEventListener('click', () => openAuth(false));
    }
}

function openAuth(register) {
    isRegisterMode = register;
    const modal = document.getElementById('authModal');
    modal.style.display = 'flex';
    document.getElementById('authTitle').textContent = register ? 'Регистрация' : 'Вход';
    document.getElementById('authSubmit').textContent = register ? 'Зарегистрироваться' : 'Войти';
    document.getElementById('authSwitchText').textContent = register ? 'Уже есть аккаунт?' : 'Нет аккаунта?';
    document.getElementById('authSwitchLink').textContent = register ? 'Войти' : 'Зарегистрироваться';
    document.getElementById('authError').textContent = '';
}

document.getElementById('authSwitchLink').addEventListener('click', (e) => {
    e.preventDefault();
    openAuth(!isRegisterMode);
});

document.getElementById('authSubmit').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) {
        document.getElementById('authError').textContent = 'Заполните все поля';
        return;
    }
    const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';

    try {
        const r = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await r.json();
        if (!r.ok) {
            document.getElementById('authError').textContent = data.error || 'Ошибка';
            return;
        }
        currentUser = data.email;
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('authEmail').value = '';
        document.getElementById('authPassword').value = '';
        renderUserBlock();
        await loadLikesFromServer();
    } catch (e) {
        document.getElementById('authError').textContent = 'Ошибка сети';
    }
});

async function loadLikesFromServer() {
    try {
        const r = await fetch(`${API_BASE}/likes`);
        if (r.ok) {
            const data = await r.json();
            likedTracks = data.tracks || [];
            updateLikeButton();
        }
    } catch (e) {}
}

// ============ НАВИГАЦИЯ ============
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(item.dataset.page);
    });
});

function navigate(page) {
    document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.toggle('active', i.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector('.main').scrollTop = 0;

    if (page === 'artists') loadArtists();
    if (page === 'chart') loadChart();
    if (page === 'new') loadNewReleases();
    if (page === 'collection') loadCollection();
}

// ============ МОЯ ВОЛНА ============
async function loadWave() {
    const queries = ['популярное 2025', 'хиты музыка', 'новинки музыка', 'топ треки', 'лучшие песни'];
    const q = queries[Math.floor(Math.random() * queries.length)];

    document.getElementById('waveTrackInfo').textContent = 'Загрузка...';
    try {
        const r = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&count=20`);
        const data = await r.json();
        waveTracks = data.tracks || [];
        currentIndex = 0;
        updateUI();
    } catch (e) {
        document.getElementById('waveTrackInfo').textContent = 'Ошибка загрузки';
        console.error(e);
    }
}

function updateUI() {
    const t = waveTracks[currentIndex];
    if (!t) return;

    document.getElementById('waveTrackInfo').textContent = `${t.artist} — ${t.title}`;

    const cover = document.getElementById('waveCover');
    const placeholder = document.getElementById('waveCoverPlaceholder');
    if (t.cover_url) {
        cover.src = t.cover_url;
        cover.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        cover.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    document.getElementById('miniTitle').textContent = t.title;
    document.getElementById('miniArtist').textContent = t.artist;
    const miniCover = document.getElementById('miniCover');
    if (t.cover_url) {
        miniCover.src = t.cover_url;
        miniCover.style.display = 'block';
    } else {
        miniCover.style.display = 'none';
    }

    updateLikeButton();
}

function updateLikeButton() {
    const t = waveTracks[currentIndex];
    if (!t) return;
    const likeBtn = document.getElementById('likeBtn');
    if (likedTracks.find(x => String(x.id) === String(t.id))) {
        likeBtn.classList.add('active');
    } else {
        likeBtn.classList.remove('active');
    }
}

function togglePlay() {
    if (!waveTracks[currentIndex]) return;
    const t = waveTracks[currentIndex];
    if (!t.audio_url) { next(); return; }

    if (isPlaying) {
        audio.pause();
        isPlaying = false;
        setPlayIcons(false);
    } else {
        if (audio.src !== t.audio_url) audio.src = t.audio_url;
        audio.play().then(() => {
            isPlaying = true;
            setPlayIcons(true);
        }).catch(err => { console.error(err); next(); });
    }
}

document.getElementById('playBtn').addEventListener('click', togglePlay);
document.getElementById('miniPlay').addEventListener('click', togglePlay);

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

document.getElementById('nextBtn').addEventListener('click', next);
document.getElementById('miniNext').addEventListener('click', next);
document.getElementById('prevBtn').addEventListener('click', prev);
document.getElementById('miniPrev').addEventListener('click', prev);

function playCurrent() {
    const t = waveTracks[currentIndex];
    if (!t || !t.audio_url) { next(); return; }
    audio.src = t.audio_url;
    audio.load();
    audio.play().then(() => {
        isPlaying = true;
        setPlayIcons(true);
    }).catch(console.error);
    updateUI();
}

// ============ ЛАЙКИ ============
document.getElementById('likeBtn').addEventListener('click', async () => {
    const t = waveTracks[currentIndex];
    if (!t) return;

    if (!currentUser) {
        openAuth(false);
        return;
    }

    const idx = likedTracks.findIndex(x => String(x.id) === String(t.id));
    if (idx === -1) {
        likedTracks.push(t);
        document.getElementById('likeBtn').classList.add('active');
        await fetch(`${API_BASE}/likes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track: t })
        });
    } else {
        likedTracks.splice(idx, 1);
        document.getElementById('likeBtn').classList.remove('active');
        await fetch(`${API_BASE}/likes/${t.id}`, { method: 'DELETE' });
    }
});

document.getElementById('dislikeBtn').addEventListener('click', next);
document.getElementById('refreshBtn').addEventListener('click', loadWave);

audio.addEventListener('timeupdate', () => {
    document.getElementById('miniCurrent').textContent = formatTime(audio.currentTime);
    document.getElementById('miniSeek').value = audio.currentTime;
});

audio.addEventListener('loadedmetadata', () => {
    document.getElementById('miniDuration').textContent = formatTime(audio.duration);
    document.getElementById('miniSeek').max = audio.duration;
});

audio.addEventListener('ended', next);

document.getElementById('miniSeek').addEventListener('input', e => {
    audio.currentTime = parseFloat(e.target.value);
});

// ============ ИСПОЛНИТЕЛИ ============
function loadArtists(query = '') {
    const grid = document.getElementById('artistsGrid');
    grid.innerHTML = '<p class="empty">Загрузка...</p>';
    const url = query ? `${API_BASE}/artists?q=${encodeURIComponent(query)}` : `${API_BASE}/artists`;
    fetch(url)
        .then(r => r.json())
        .then(data => {
            if (!data.artists || data.artists.length === 0) {
                grid.innerHTML = '<p class="empty">Исполнители не найдены</p>';
                return;
            }
            grid.innerHTML = '';
            data.artists.forEach(a => {
                const card = document.createElement('div');
                card.className = 'card card-round';
                card.innerHTML = `
                    ${a.cover_url ? `<img class="card-img" src="${a.cover_url}" alt="">` : `<div class="card-img">🎤</div>`}
                    <div class="card-title">${a.name}</div>
                    <div class="card-desc">${(a.genres || []).slice(0, 2).join(', ') || 'Исполнитель'}</div>
                `;
                card.addEventListener('click', () => openArtist(a));
                grid.appendChild(card);
            });
        })
        .catch(() => { grid.innerHTML = '<p class="empty">Ошибка загрузки</p>'; });
}

document.getElementById('artistSearchBtn').addEventListener('click', () => {
    loadArtists(document.getElementById('artistSearch').value.trim());
});
document.getElementById('artistSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadArtists(e.target.value.trim());
});

function openArtist(artist) {
    const header = document.getElementById('artistHeader');
    header.innerHTML = `
        ${artist.cover_url
            ? `<img src="${artist.cover_url}" alt="">`
            : `<div class="placeholder">🎤</div>`}
        <div class="artist-header-info">
            <h1>${artist.name}</h1>
            <div class="genres">${(artist.genres || []).join(', ') || 'Исполнитель'}</div>
        </div>
    `;

    const list = document.getElementById('artistTracksList');
    list.innerHTML = '<p class="empty">Загрузка треков...</p>';

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-artist').classList.add('active');
    document.querySelector('.main').scrollTop = 0;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

    fetch(`${API_BASE}/artist/${artist.id}/tracks?count=20`)
        .then(r => r.json())
        .then(data => {
            if (data.tracks && data.tracks.length) renderTrackList(list, data.tracks);
            else list.innerHTML = '<p class="empty">Треки не найдены</p>';
        })
        .catch(() => { list.innerHTML = '<p class="empty">Ошибка загрузки</p>'; });
}

document.getElementById('backFromArtist').addEventListener('click', () => {
    navigate('artists');
});

// ============ ЧАРТ ============
function loadChart() {
    const list = document.getElementById('chartList');
    list.innerHTML = '<p class="empty">Загрузка...</p>';
    fetch(`${API_BASE}/chart`)
        .then(r => r.json())
        .then(data => {
            if (data.tracks && data.tracks.length) renderTrackList(list, data.tracks, true);
            else list.innerHTML = '<p class="empty">Чарт пуст</p>';
        })
        .catch(() => { list.innerHTML = '<p class="empty">Ошибка загрузки</p>'; });
}

// ============ НОВИНКИ ============
function loadNewReleases() {
    const grid = document.getElementById('newGrid');
    grid.innerHTML = '<p class="empty">Загрузка...</p>';
    fetch(`${API_BASE}/new-releases`)
        .then(r => r.json())
        .then(data => {
            if (!data.albums || data.albums.length === 0) {
                grid.innerHTML = '<p class="empty">Новинок пока нет</p>';
                return;
            }
            grid.innerHTML = '';
            data.albums.forEach(a => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    ${a.cover_url ? `<img class="card-img" src="${a.cover_url}" alt="">` : `<div class="card-img">💿</div>`}
                    <div class="card-title">${a.title}</div>
                    <div class="card-desc">${a.artist}</div>
                `;
                grid.appendChild(card);
            });
        })
        .catch(() => { grid.innerHTML = '<p class="empty">Ошибка загрузки</p>'; });
}

// ============ КОЛЛЕКЦИЯ ============
function loadCollection() {
    const list = document.getElementById('collectionList');
    const empty = document.getElementById('collectionEmpty');

    if (!currentUser) {
        list.innerHTML = '';
        empty.style.display = 'block';
        empty.textContent = 'Войдите в аккаунт, чтобы сохранять треки';
        return;
    }

    if (likedTracks.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        empty.textContent = 'Пока ничего нет. Нажмите ❤️ на треке в «Моей волне».';
        return;
    }
    empty.style.display = 'none';
    renderTrackList(list, likedTracks);
}

// ============ ПОИСК ============
document.getElementById('searchBtn').addEventListener('click', doSearch);
document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
});

function doSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    const list = document.getElementById('searchList');
    list.innerHTML = '<p class="empty">Загрузка...</p>';
    fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&count=20`)
        .then(r => r.json())
        .then(data => {
            if (data.tracks && data.tracks.length) renderTrackList(list, data.tracks);
            else list.innerHTML = '<p class="empty">Ничего не найдено</p>';
        })
        .catch(() => { list.innerHTML = '<p class="empty">Ошибка поиска</p>'; });
}

// ============ РЕНДЕР СПИСКА ============
function renderTrackList(container, list, showNumbers = false) {
    container.innerHTML = '';
    list.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.innerHTML = `
            ${showNumbers ? `<span class="track-num">${i + 1}</span>` : ''}
            ${t.cover_url ? `<img class="track-cover" src="${t.cover_url}" alt="">` : `<div class="track-cover"></div>`}
            <div class="track-info">
                <div class="track-title">${t.title}</div>
                <div class="track-artist">${t.artist}</div>
            </div>
            <span class="track-duration">${formatTime(t.duration)}</span>
        `;
        row.addEventListener('click', () => {
            waveTracks = list;
            currentIndex = i;
            playCurrent();
        });
        container.appendChild(row);
    });
}

// ============ УТИЛИТЫ ============
function formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ============ СТАРТ ============
checkAuth();
loadWave();