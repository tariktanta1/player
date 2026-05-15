/* ════════════════════════════════════════════════════
   SESLER — app.js
   Supabase storage bağlantısı + tam müzik oynatıcı
════════════════════════════════════════════════════ */

/* ── SUPABASE AYARLARI ── */
const SUPABASE_URL = 'https://zjsyoqkxhabkevgyaega.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpqc3lvcWt4aGFia2V2Z3lhZWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODA2MTAsImV4cCI6MjA5NDI1NjYxMH0.mrtRgw2y02CnAnBJNte2urvZy7Od_13-oQZ2_gPDwOo';
const BUCKET = 'muzik';

/* ── UYGULAMA DURUMU ── */
const state = {
  tracks:    [],    // { name, path, size, url } dizisi
  idx:       -1,    // şu an çalınan indeks
  playing:   false, // çalıyor mu?
  seeking:   false, // kullanıcı seek bar'ı sürüklüyor mu?
  muted:     false, // sessiz mi?
  volume:    0.8,   // 0-1 arası ses seviyesi
};

/* ── ELEMENT REFERANSLARI ── */
const el = {
  audio:          id('audioEl'),
  trackList:      id('trackList'),
  playerBar:      id('playerBar'),
  count:          id('count'),
  uploadProgress: id('uploadProgress'),
  upFill:         id('upFill'),
  upPct:          id('upPct'),
  upFilename:     id('upFilename'),
  sectionHdr:     id('sectionHdr'),
  fileInput:      id('fileInput'),
  toast:          id('toast'),
  sheet:          id('sheet'),

  /* Mobil bar */
  mCurTime:  id('mCurTime'),
  mDurTime:  id('mDurTime'),
  mSeekWrap: id('mSeekWrap'),
  mSeekFill: id('mSeekFill'),
  mSeekThumb:id('mSeekThumb'),
  mNowName:  id('nowPlayingMobile'),
  mPlayBtn:  id('mPlayBtn'),
  mPrevBtn:  id('mPrevBtn'),
  mNextBtn:  id('mNextBtn'),

  /* Desktop bar */
  dCurTime:  id('dCurTime'),
  dDurTime:  id('dDurTime'),
  dSeekWrap: id('dSeekWrap'),
  dSeekFill: id('dSeekFill'),
  dSeekThumb:id('dSeekThumb'),
  dNowName:  id('deskNowName'),
  dNowArt:   id('deskArt'),
  dPlayBtn:  id('dPlayBtn'),
  dPrevBtn:  id('dPrevBtn'),
  dNextBtn:  id('dNextBtn'),
  dVolBtn:   id('dVolBtn'),
  dVolWrap:  id('dVolWrap'),
  dVolFill:  id('dVolFill'),
  dVolThumb: id('dVolThumb'),

  /* Sheet (mobil tam ekran) */
  sheetArt:       id('sheetArt'),
  sheetArtLetter: id('sheetArtLetter'),
  sheetTrackName: id('sheetTrackName'),
  sCurTime:       id('sCurTime'),
  sDurTime:       id('sDurTime'),
  sSeekWrap:      id('sSeekWrap'),
  sSeekFill:      id('sSeekFill'),
  sSeekThumb:     id('sSeekThumb'),
  sPlayBtn:       id('sPlayBtn'),
  sPrevBtn:       id('sPrevBtn'),
  sNextBtn:       id('sNextBtn'),
  sVolBtn:        id('sVolBtn'),
  sVolWrap:       id('sVolWrap'),
  sVolFill:       id('sVolFill'),
  sVolThumb:      id('sVolThumb'),
  sheetClose:     id('sheetClose'),
  sheetHandle:    id('sheetHandle'),
};

/* ── YARDIMCI FONKSİYONLAR ── */
function id(x) { return document.getElementById(x); }

/* Saniyeyi "3:45" formatına çevirir */
function fmt(s) {
  if (!s || isNaN(s) || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
}

/* Byte'ı okunabilir boyuta çevirir */
function fmtSize(b) {
  if (!b) return '';
  if (b < 1_048_576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1_048_576).toFixed(1) + ' MB';
}

/* Supabase public URL */
function getUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
}

/* Kapak gradyanları — şarkı adı uzunluğuna göre seçilir */
const GRADIENTS = [
  'linear-gradient(145deg, #3b1f00, #1a0e00)',
  'linear-gradient(145deg, #1c1400, #2d2000)',
  'linear-gradient(145deg, #200a00, #3a1500)',
  'linear-gradient(145deg, #0e0e1a, #1a1430)',
  'linear-gradient(145deg, #001a14, #002d22)',
  'linear-gradient(145deg, #1a0014, #2d0022)',
];
function pickGrad(name) {
  return GRADIENTS[(name || '').length % GRADIENTS.length];
}

/* Toast bildirimi göster */
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  el.toast.textContent = msg;
  el.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

/* ════════════════════════════════════════════════════
   SEEK / VOLUME ÇUBUĞU — EVRENSEL SÜRÜKLEME
   Hem mouse hem touch desteği
════════════════════════════════════════════════════ */
function bindSlider(wrap, onMove, onRelease) {
  let active = false;

  function getPos(e) {
    const rect = wrap.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function start(e) {
    active = true;
    onMove(getPos(e));
    e.preventDefault();
  }
  function move(e) {
    if (!active) return;
    onMove(getPos(e));
    e.preventDefault();
  }
  function end(e) {
    if (!active) return;
    active = false;
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const rect = wrap.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (onRelease) onRelease(pos);
  }

  wrap.addEventListener('mousedown',  start, { passive: false });
  wrap.addEventListener('touchstart', start, { passive: false });
  document.addEventListener('mousemove',  move, { passive: false });
  document.addEventListener('touchmove',  move, { passive: false });
  document.addEventListener('mouseup',  end);
  document.addEventListener('touchend', end);
}

/* Seek çubuğu güncelle (fill + thumb) */
function updateSeekUI(fill, thumb, pct) {
  const p = Math.max(0, Math.min(1, pct));
  fill.style.width  = (p * 100) + '%';
  thumb.style.left  = (p * 100) + '%';
}

/* ════════════════════════════════════════════════════
   SES SEVİYESİ
════════════════════════════════════════════════════ */
function applyVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  el.audio.volume = state.muted ? 0 : state.volume;

  /* Volume bar güncelle — desktop + sheet */
  [
    [el.dVolFill, el.dVolThumb],
    [el.sVolFill, el.sVolThumb],
  ].forEach(([f, t]) => updateSeekUI(f, t, state.volume));

  /* İkon güncelle */
  updateVolIcon();
}

function updateVolIcon() {
  const muted = state.muted || state.volume === 0;
  const low   = state.volume < 0.4;

  [el.dVolBtn, el.sVolBtn].forEach(btn => {
    if (!btn) return;
    btn.querySelector('.icon-vol-hi').style.display   = (!muted && !low) ? '' : 'none';
    btn.querySelector('.icon-vol-lo').style.display   = (!muted &&  low) ? '' : 'none';
    btn.querySelector('.icon-vol-mute').style.display = muted             ? '' : 'none';
  });
}

function toggleMute() {
  state.muted = !state.muted;
  el.audio.volume = state.muted ? 0 : state.volume;
  updateVolIcon();
}

/* ════════════════════════════════════════════════════
   OYNAT / DURDUR DURUMU
════════════════════════════════════════════════════ */
function setPlayState(isPlaying) {
  state.playing = isPlaying;

  /* Tüm play/pause butonlarını güncelle */
  [el.mPlayBtn, el.dPlayBtn, el.sPlayBtn].forEach(btn => {
    if (!btn) return;
    btn.querySelector('.icon-play').style.display  = isPlaying ? 'none' : '';
    btn.querySelector('.icon-pause').style.display = isPlaying ? '' : 'none';
  });

  /* Parça listesindeki is-playing sınıfını güncelle */
  renderTrackStates();
}

/* ── Sadece is-playing sınıfını güncelle (tüm listeyi yeniden oluşturmadan) ── */
function renderTrackStates() {
  document.querySelectorAll('.track-item').forEach((item, i) => {
    const isPlaying = i === state.idx && state.playing;
    item.classList.toggle('is-playing', i === state.idx);

    const overlay = item.querySelector('.track-art-overlay svg');
    if (overlay) {
      overlay.outerHTML = i === state.idx && state.playing
        ? `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3h2v10H5zm4 0h2v10H9z"/></svg>`
        : `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5l8 4.5-8 4.5V3.5z"/></svg>`;
    }
  });
}

/* ── "Şu an çalıyor" bilgilerini güncelle ── */
function setNowPlaying(track) {
  if (!track) return;

  /* Mobil bar */
  el.mNowName.textContent = track.name;

  /* Desktop bar */
  el.dNowName.textContent = track.name;
  el.dNowArt.style.background = pickGrad(track.name);
  el.dNowArt.textContent = track.name.charAt(0).toUpperCase();

  /* Sheet */
  el.sheetTrackName.textContent = track.name;
  el.sheetArt.style.background  = pickGrad(track.name);
  el.sheetArtLetter.textContent = track.name.charAt(0).toUpperCase();
}

/* ════════════════════════════════════════════════════
   PARÇA ÇALMA
════════════════════════════════════════════════════ */
function playTrack(i) {
  const track = state.tracks[i];
  if (!track) return;

  state.idx = i;
  el.audio.src = track.url;
  el.audio.currentTime = 0;
  el.audio.play().catch(() => showToast('Oynatılamadı'));

  setNowPlaying(track);
  el.playerBar.classList.add('is-active');
  setPlayState(true);
}

function togglePlay() {
  if (state.idx < 0) return;
  if (state.playing) {
    el.audio.pause();
    setPlayState(false);
  } else {
    el.audio.play().catch(() => {});
    setPlayState(true);
  }
}

function playNext() {
  if (!state.tracks.length) return;
  playTrack((state.idx + 1) % state.tracks.length);
}

function playPrev() {
  if (!state.tracks.length) return;
  /* İlk 3 saniyede ise önceki parça, değilse başa sar */
  if (el.audio.currentTime > 3) {
    el.audio.currentTime = 0;
    return;
  }
  playTrack((state.idx - 1 + state.tracks.length) % state.tracks.length);
}

/* ════════════════════════════════════════════════════
   ZAMANLAYICI — Audio timeupdate
════════════════════════════════════════════════════ */
function onTimeUpdate() {
  if (!el.audio.duration || state.seeking) return;

  const pct = el.audio.currentTime / el.audio.duration;
  const cur = fmt(el.audio.currentTime);
  const dur = fmt(el.audio.duration);

  /* Mobil seek */
  updateSeekUI(el.mSeekFill, el.mSeekThumb, pct);
  el.mCurTime.textContent = cur;
  el.mDurTime.textContent = dur;

  /* Desktop seek */
  updateSeekUI(el.dSeekFill, el.dSeekThumb, pct);
  el.dCurTime.textContent = cur;
  el.dDurTime.textContent = dur;

  /* Sheet seek */
  updateSeekUI(el.sSeekFill, el.sSeekThumb, pct);
  el.sCurTime.textContent = cur;
  el.sDurTime.textContent = dur;

  /* Parça listesindeki süre göstergesi */
  const durEl = document.getElementById(`dur-${state.idx}`);
  if (durEl && durEl.textContent === '—') durEl.textContent = dur;
}

/* ════════════════════════════════════════════════════
   PARÇA LİSTESİNİ RENDER ET
════════════════════════════════════════════════════ */
function render() {
  el.count.textContent = state.tracks.length;
  el.sectionHdr.style.display = state.tracks.length ? '' : 'none';

  if (!state.tracks.length) {
    el.trackList.innerHTML = `
      <div class="empty-state" id="emptyState">
        <div class="empty-note">♩</div>
        <p>Henüz parça yok</p>
        <span>Yükle butonuna bas ya da dosyaları sürükle</span>
      </div>`;
    return;
  }

  el.trackList.innerHTML = state.tracks.map((t, i) => {
    const isPlaying = i === state.idx;
    const grad = pickGrad(t.name);
    const playIcon  = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5l8 4.5-8 4.5V3.5z"/></svg>`;
    const pauseIcon = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3h2v10H5zm4 0h2v10H9z"/></svg>`;

    return `
    <div
      class="track-item${isPlaying ? ' is-playing' : ''}"
      onclick="window._pickTrack(${i})"
      data-idx="${i}"
    >
      <!-- Kapak / numara -->
      <div class="track-art" style="background:${grad}">
        <span class="track-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="track-art-overlay">
          ${isPlaying && state.playing ? pauseIcon : playIcon}
        </div>
      </div>

      <!-- Bilgi -->
      <div class="track-info">
        <div class="track-name">${escHtml(t.name)}</div>
        <div class="track-meta">${fmtSize(t.size)}</div>
      </div>

      <!-- Süre -->
      <div class="track-dur" id="dur-${i}">—</div>

      <!-- Sil butonu -->
      <button
        class="track-del"
        onclick="event.stopPropagation(); window._deleteTrack(${i})"
        aria-label="Sil"
      >✕</button>
    </div>`;
  }).join('');
}

/* HTML özel karakterlerini kaçır (XSS koruması) */
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ════════════════════════════════════════════════════
   GLOBAL ONCLICK HANDLERLAR (onclick="..." için)
════════════════════════════════════════════════════ */
window._pickTrack = function(i) {
  if (state.idx === i && state.playing) {
    /* Aynı şarkıya tıklayınca durdur */
    el.audio.pause();
    setPlayState(false);
  } else {
    playTrack(i);
  }
};

window._deleteTrack = async function(i) {
  const track = state.tracks[i];
  if (!confirm(`"${track.name}" silinsin mi?`)) return;

  /* Çalınan parça siliniyorsa durdur */
  if (state.idx === i) {
    el.audio.pause();
    el.audio.src = '';
    setPlayState(false);
    state.idx = -1;
    el.playerBar.classList.remove('is-active');
    closeSheet(false);
  } else if (state.idx > i) {
    state.idx--;
  }

  /* Supabase'den sil */
  await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(track.path)}`,
    { method: 'DELETE', headers: headers() }
  );

  showToast('Parça silindi');
  fetchTracks();
};

/* ════════════════════════════════════════════════════
   SUPABASE — PARÇALARI YÜKLEMİ GETİR
════════════════════════════════════════════════════ */
function headers(extra) {
  return {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    apikey: SUPABASE_KEY,
    ...extra,
  };
}

async function fetchTracks() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`,
      {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ limit: 500, offset: 0, prefix: '' }),
      }
    );
    const data = await res.json();
    state.tracks = (Array.isArray(data) ? data : [])
      .filter(f => f.name && /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name))
      .map(f => ({
        name: f.name.replace(/\.[^.]+$/, ''),
        path: f.name,
        size: f.metadata?.size || 0,
        url:  getUrl(f.name),
      }));
  } catch (e) {
    showToast('Bağlantı hatası');
  }
  render();
}

/* ════════════════════════════════════════════════════
   SUPABASE — DOSYA YÜKLEME
════════════════════════════════════════════════════ */
async function addFiles(files) {
  const audioFiles = [...files].filter(f =>
    f.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name)
  );
  if (!audioFiles.length) return;

  /* Yükleme çubuğunu göster */
  el.uploadProgress.classList.add('active');
  let uploaded = 0;

  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    el.upFilename.textContent = file.name.replace(/\.[^.]+$/, '');
    const pct = Math.round((i / audioFiles.length) * 100);
    el.upFill.style.width = pct + '%';
    el.upPct.textContent  = pct + '%';

    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(file.name)}`,
      {
        method: 'POST',
        headers: headers({
          'Content-Type': file.type || 'audio/mpeg',
          'x-upsert': 'true',
        }),
        body: file,
      }
    );
    if (res.ok) uploaded++;
  }

  /* Yükleme tamamlandı */
  el.upFill.style.width = '100%';
  el.upPct.textContent  = '100%';
  setTimeout(() => {
    el.uploadProgress.classList.remove('active');
    el.upFill.style.width = '0%';
  }, 800);

  showToast(`${uploaded}/${audioFiles.length} parça yüklendi ✓`);
  fetchTracks();
}

/* ════════════════════════════════════════════════════
   MOBİL TAM EKRAN SHEET
════════════════════════════════════════════════════ */
function openSheet() {
  /* Sadece mobilde aç */
  if (window.innerWidth >= 900) return;
  if (state.idx < 0) return;
  el.sheet.classList.add('is-open');
}

function closeSheet(animate = true) {
  el.sheet.classList.remove('is-open');
}

/* Aşağı kaydırarak kapatma (swipe down) */
let swipeStartY = null;
let swipeDelta  = 0;

el.sheetHandle.addEventListener('touchstart', e => {
  swipeStartY = e.touches[0].clientY;
  swipeDelta  = 0;
}, { passive: true });

el.sheet.addEventListener('touchstart', e => {
  /* Sadece handle'dan ya da üst bölümden başlatılan swipe */
  if (e.target.closest('.sheet-handle') || e.target.closest('.sheet-header')) {
    swipeStartY = e.touches[0].clientY;
    swipeDelta  = 0;
  }
}, { passive: true });

el.sheet.addEventListener('touchmove', e => {
  if (swipeStartY === null) return;
  const delta = e.touches[0].clientY - swipeStartY;
  if (delta > 0) {
    swipeDelta = delta;
    el.sheet.style.transform = `translateY(${Math.min(delta * 0.45, 55)}%)`;
  }
}, { passive: true });

el.sheet.addEventListener('touchend', () => {
  el.sheet.style.transform = '';
  if (swipeDelta > 90) closeSheet();
  swipeStartY = null;
  swipeDelta  = 0;
});

/* Bar'a tıklayınca sheet aç */
el.playerBar.addEventListener('click', e => {
  if (
    !e.target.closest('button') &&
    !e.target.closest('.seek-wrap')
  ) {
    openSheet();
  }
});

/* Kapat butonu */
el.sheetClose.addEventListener('click', closeSheet);

/* ════════════════════════════════════════════════════
   DRAG & DROP — Sürükle bırak yükleme
════════════════════════════════════════════════════ */
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

/* ════════════════════════════════════════════════════
   TÜM OLAY DİNLEYİCİLERİ
════════════════════════════════════════════════════ */
function bindAll() {
  /* Dosya seçimi */
  el.fileInput.addEventListener('change', e => addFiles(e.target.files));

  /* Audio olayları */
  el.audio.addEventListener('timeupdate', onTimeUpdate);
  el.audio.addEventListener('ended', () => {
    /* Sona gelince bir sonraki çal */
    if (state.idx < state.tracks.length - 1) {
      playNext();
    } else {
      /* Liste bitti — durdur */
      setPlayState(false);
    }
  });
  el.audio.addEventListener('play',  () => setPlayState(true));
  el.audio.addEventListener('pause', () => setPlayState(false));

  /* Mobil bar kontrolleri */
  el.mPlayBtn.addEventListener('click', togglePlay);
  el.mPrevBtn.addEventListener('click', playPrev);
  el.mNextBtn.addEventListener('click', playNext);

  /* Desktop bar kontrolleri */
  el.dPlayBtn.addEventListener('click', togglePlay);
  el.dPrevBtn.addEventListener('click', playPrev);
  el.dNextBtn.addEventListener('click', playNext);

  /* Sheet kontrolleri */
  el.sPlayBtn.addEventListener('click', togglePlay);
  el.sPrevBtn.addEventListener('click', playPrev);
  el.sNextBtn.addEventListener('click', playNext);

  /* Ses butonları */
  el.dVolBtn.addEventListener('click', toggleMute);
  el.sVolBtn.addEventListener('click', toggleMute);

  /* ── SEEK BARLARI ── */

  /* Mobil seek */
  bindSlider(
    el.mSeekWrap,
    pos => {
      state.seeking = true;
      if (el.audio.duration) el.audio.currentTime = pos * el.audio.duration;
      updateSeekUI(el.mSeekFill, el.mSeekThumb, pos);
    },
    () => { state.seeking = false; }
  );

  /* Desktop seek */
  bindSlider(
    el.dSeekWrap,
    pos => {
      state.seeking = true;
      if (el.audio.duration) el.audio.currentTime = pos * el.audio.duration;
      updateSeekUI(el.dSeekFill, el.dSeekThumb, pos);
    },
    () => { state.seeking = false; }
  );

  /* Sheet seek */
  bindSlider(
    el.sSeekWrap,
    pos => {
      state.seeking = true;
      if (el.audio.duration) el.audio.currentTime = pos * el.audio.duration;
      updateSeekUI(el.sSeekFill, el.sSeekThumb, pos);
    },
    () => { state.seeking = false; }
  );

  /* ── VOLUME BARLARI ── */

  /* Desktop volume */
  bindSlider(
    el.dVolWrap,
    pos => { state.muted = false; applyVolume(pos); }
  );

  /* Sheet volume */
  bindSlider(
    el.sVolWrap,
    pos => { state.muted = false; applyVolume(pos); }
  );

  /* ── KLAVYE KISAYOLLARI ── */
  document.addEventListener('keydown', e => {
    /* Input içindeyken çalıştırma */
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        if (el.audio.duration) el.audio.currentTime = Math.min(el.audio.duration, el.audio.currentTime + 10);
        break;
      case 'ArrowLeft':
        if (el.audio.duration) el.audio.currentTime = Math.max(0, el.audio.currentTime - 10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        applyVolume(state.volume + 0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        applyVolume(state.volume - 0.1);
        break;
      case 'KeyM':
        toggleMute();
        break;
      case 'KeyN':
        playNext();
        break;
      case 'KeyP':
        playPrev();
        break;
    }
  });
}

/* ════════════════════════════════════════════════════
   BAŞLAT
════════════════════════════════════════════════════ */
function init() {
  bindAll();
  applyVolume(state.volume);  /* Başlangıç ses seviyesi */
  fetchTracks();               /* Supabase'den parçaları çek */
}

/* DOM hazır olunca başlat */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
