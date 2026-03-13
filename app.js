import { supabase } from './supabaseClient.js';
import {
  fetchMonthlyGames,
  fetchPlayerProfile,
  fetchPlayerStats,
  topOpeningsFromGames,
} from './chessApi.js';

const state = {
  mode: 'rapid',
  topLimit: 20,
  players: [],
  ratingsByUser: new Map(),
  profilesByUser: new Map(),
  rankingDeltaByUser: new Map(),
  baseOrderByUser: new Map(),
  session: null,
  search: '',
  sort: { key: 'rating', direction: 'desc' },
  isOffline: false,
  pendingDeleteId: null,
  isAdminCollapsed: false,
};

const els = {
  rankingList: document.getElementById('ranking-list'),
  topThree: document.getElementById('top-three'),
  status: document.getElementById('status'),
  offlineBanner: document.getElementById('offline-banner'),
  adminStatus: document.getElementById('admin-status'),
  adminBadge: document.getElementById('admin-badge'),
  lastSync: document.getElementById('last-sync'),
  adminPanel: document.getElementById('admin-panel'),
  adminPlayerList: document.getElementById('admin-player-list'),
  adminContent: document.getElementById('admin-content'),
  adminToggle: document.getElementById('admin-toggle'),
  adminToggleIcon: document.getElementById('admin-toggle-icon'),
  refreshBtn: document.getElementById('refresh-btn'),
  adminLoginBtn: document.getElementById('admin-login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  loginForm: document.getElementById('login-form'),
  loginSubmitBtn: document.getElementById('login-submit-btn'),
  loginError: document.getElementById('login-error'),
  addPlayerForm: document.getElementById('add-player-form'),
  topLimitForm: document.getElementById('top-limit-form'),
  topLimitInput: document.getElementById('top-limit-input'),
  searchInput: document.getElementById('search-input'),
  sortHeaders: Array.from(document.querySelectorAll('.sort-head')),
  toastRegion: document.getElementById('toast-region'),
  loginModal: document.getElementById('login-modal'),
  playerModal: document.getElementById('player-modal'),
  playerModalBody: document.getElementById('player-modal-body'),
  confirmModal: document.getElementById('confirm-modal'),
  confirmText: document.getElementById('confirm-text'),
  confirmForm: document.getElementById('confirm-form'),
  confirmSubmitBtn: document.getElementById('confirm-submit-btn'),
};

function setStatus(type, message) {
  els.status.className = `status ${type}`;
  els.status.textContent = message;
}

function setAdminStatus(type, message) {
  els.adminStatus.className = `status ${type}`;
  els.adminStatus.textContent = message;
}

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  els.toastRegion.appendChild(node);
  window.setTimeout(() => node.remove(), 3200);
}

function initials(name, username) {
  const source = name || username || '?';
  return source
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

function normalizeResult(result = '') {
  const lower = result.toLowerCase();
  if (lower.includes('win') || lower.includes('gagn')) return 'Victoire';
  if (lower.includes('draw') || lower.includes('nul') || lower.includes('stalemate')) return 'Nul';
  return 'Défaite';
}

function ratingDiffBadge(diff) {
  if (typeof diff !== 'number' || Number.isNaN(diff) || diff === 0) return '<span class="elo-diff neutral">±0</span>';
  const sign = diff > 0 ? '+' : '';
  const kind = diff > 0 ? 'up' : 'down';
  return `<span class="elo-diff ${kind}">${sign}${diff}</span>`;
}

function progressBadge(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || value === 0) return '<span class="elo-diff neutral">Stable</span>';
  const sign = value > 0 ? '+' : '';
  const klass = value > 0 ? 'up' : 'down';
  return `<span class="elo-diff ${klass}">${sign}${value}</span>`;
}

function getMergedRows() {
  return state.players.map((p, index) => {
    const ratingData = state.ratingsByUser.get(p.username_chesscom) || {
      rating: 0,
      games: 0,
      peakRating: 0,
      progressToPeak: 0,
    };
    const profile = state.profilesByUser.get(p.username_chesscom) || {};
    return {
      ...p,
      ...ratingData,
      ...profile,
      baseRank: state.baseOrderByUser.get(p.username_chesscom) || index + 1,
    };
  });
}

function compareValues(a, b, key) {
  if (key === 'player') return a.display_name.localeCompare(b.display_name, 'fr');
  if (key === 'rank') return a.baseRank - b.baseRank;
  if (['rating', 'peakRating', 'progressToPeak', 'games'].includes(key)) return Number(a[key] || 0) - Number(b[key] || 0);
  return 0;
}

function sortedRows() {
  const q = state.search.toLowerCase();
  const filtered = getMergedRows().filter((p) => {
    return !q || p.display_name.toLowerCase().includes(q) || p.username_chesscom.toLowerCase().includes(q);
  });

  const { key, direction } = state.sort;
  filtered.sort((a, b) => {
    const diff = compareValues(a, b, key);
    if (diff === 0) return a.baseRank - b.baseRank;
    return direction === 'asc' ? diff : -diff;
  });

  return filtered.slice(0, state.topLimit);
}

function updateSortUi() {
  els.sortHeaders.forEach((head) => {
    const isActive = head.dataset.sort === state.sort.key;
    head.classList.toggle('active', isActive);
    head.setAttribute('aria-sort', isActive ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    const arrow = head.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = isActive ? (state.sort.direction === 'asc' ? '↑' : '↓') : '';
  });
}

function renderPodium(rows) {
  const top3 = rows.slice(0, 3);
  if (!top3.length) {
    els.topThree.innerHTML = '<p class="empty-state">Aucun joueur disponible.</p>';
    return;
  }

  els.topThree.innerHTML = top3
    .map((player, index) => {
      const rank = index + 1;
      const avatar = player.avatar
        ? `<img class="avatar" src="${player.avatar}" alt="Avatar ${player.display_name}" loading="lazy" />`
        : `<div class="avatar avatar-fallback">${initials(player.display_name, player.username_chesscom)}</div>`;
      return `
        <article class="podium-card rank-${rank}" data-player="${player.id}">
          <span class="podium-badge">${rankMedal(rank)} #${rank}</span>
          ${avatar}
          <p class="player-name">${player.display_name}</p>
          <p class="player-username">@${player.username_chesscom}</p>
          <p class="player-rating">${player.rating} Elo</p>
          <p class="player-submetric">Pic ${player.peakRating || player.rating} · ${player.games || 0} parties</p>
        </article>
      `;
    })
    .join('');
}

function renderRanking() {
  const rows = sortedRows();
  const previous = new Map(state.rankingDeltaByUser);
  state.rankingDeltaByUser.clear();
  rows.forEach((row, idx) => {
    const oldRank = previous.get(row.username_chesscom);
    if (oldRank) state.rankingDeltaByUser.set(row.username_chesscom, oldRank - (idx + 1));
    else state.rankingDeltaByUser.set(row.username_chesscom, 0);
  });

  updateSortUi();
  renderPodium(rows);

  if (!rows.length) {
    els.rankingList.innerHTML = '<p class="empty-state">Aucun joueur actif pour ce filtre.</p>';
    return;
  }

  els.rankingList.innerHTML = rows
    .map((row, idx) => {
      const rank = idx + 1;
      const shift = state.rankingDeltaByUser.get(row.username_chesscom) || 0;
      const shiftClass = shift > 0 ? 'rank-up' : shift < 0 ? 'rank-down' : '';
      const avatar = row.avatar
        ? `<img class="avatar" src="${row.avatar}" alt="Avatar ${row.display_name}" loading="lazy" />`
        : `<div class="avatar avatar-fallback">${initials(row.display_name, row.username_chesscom)}</div>`;
      return `
        <article class="ranking-card ${shiftClass}" data-player="${row.id}" tabindex="0" role="button" aria-label="Voir détails ${row.display_name}">
          <p class="rank">${rankMedal(rank) || '#' + rank}</p>
          <div class="player-line">${avatar}<div><p class="player-name">${row.display_name}</p><p class="player-username">@${row.username_chesscom}</p></div></div>
          <p class="player-rating">${row.rating} Elo</p>
          <p class="peak-wrap">${row.peakRating || row.rating}</p>
          <p class="peak-progress">${progressBadge(row.progressToPeak)}</p>
          <p class="matches-count">${row.games || 0}</p>
        </article>
      `;
    })
    .join('');
}

function setOffline(isOffline) {
  state.isOffline = isOffline;
  els.offlineBanner.classList.toggle('hidden', !isOffline);
}

async function refreshRatings() {
  const tasks = state.players.map(async (player) => {
    const [ratingData, profile] = await Promise.all([
      fetchPlayerStats(player.username_chesscom, state.mode),
      fetchPlayerProfile(player.username_chesscom),
    ]);
    state.ratingsByUser.set(player.username_chesscom, ratingData);
    state.profilesByUser.set(player.username_chesscom, profile || {});
  });
  await Promise.all(tasks);

  const baseline = getMergedRows().sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  baseline.forEach((row, idx) => state.baseOrderByUser.set(row.username_chesscom, idx + 1));

  renderRanking();
}

async function loadSharedData() {
  setStatus('info', 'Synchronisation Supabase en cours...');
  els.rankingList.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

  const [{ data: players, error: playersError }, { data: setting, error: settingError }] = await Promise.all([
    supabase.from('players').select('*').eq('is_active', true).order('created_at', { ascending: true }),
    supabase.from('app_settings').select('value').eq('key', 'top_limit').single(),
  ]);

  if (playersError || settingError) {
    const msg = playersError?.message || settingError?.message || 'Erreur inconnue';
    setStatus('error', `Supabase indisponible: ${msg}`);
    setOffline(true);
    return;
  }

  state.players = players;
  state.topLimit = Number(setting?.value || 20);
  els.topLimitInput.value = String(state.topLimit);

  await refreshRatings();
  renderAdminPlayers();
  setOffline(false);
  const now = new Date();
  els.lastSync.textContent = `Dernière mise à jour: ${now.toLocaleString('fr-FR')}`;
  setStatus('success', `${rowsMessage()} synchronisés.`);
}

function rowsMessage() {
  return `${sortedRows().length} joueurs`;
}

function renderAdminPlayers() {
  const isConnected = Boolean(state.session);
  els.adminPanel.classList.toggle('hidden', !isConnected);
  els.adminPlayerList.innerHTML = state.players
    .map((p) => `
      <li class="player-item" data-id="${p.id}">
        <div>
          <strong>${p.display_name}</strong><br>
          <small>@${p.username_chesscom}</small>
        </div>
        <div class="player-actions">
          <button data-action="open" data-id="${p.id}">Ouvrir</button>
          <button class="danger" data-action="deactivate" data-id="${p.id}">Désactiver</button>
        </div>
      </li>
    `)
    .join('');
}

function updateAdminUi() {
  const isConnected = Boolean(state.session);
  els.adminBadge.classList.toggle('hidden', !isConnected);
  els.logoutBtn.classList.toggle('hidden', !isConnected);
  els.adminLoginBtn.classList.toggle('hidden', isConnected);
  setAdminStatus('info', isConnected ? `Connecté: ${state.session.user.email}` : 'Non connecté.');
  renderAdminPlayers();
}

function toggleAdminPanel() {
  state.isAdminCollapsed = !state.isAdminCollapsed;
  els.adminContent.classList.toggle('collapsed', state.isAdminCollapsed);
  els.adminToggle.setAttribute('aria-expanded', String(!state.isAdminCollapsed));
  els.adminToggleIcon.textContent = state.isAdminCollapsed ? '▸' : '▾';
}

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  updateAdminUi();
}

async function loginAdmin(event) {
  event.preventDefault();
  els.loginSubmitBtn.disabled = true;
  els.loginError.classList.add('hidden');
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  els.loginSubmitBtn.disabled = false;

  if (error) {
    els.loginError.textContent = `Connexion refusée: ${error.message}`;
    els.loginError.classList.remove('hidden');
    return;
  }

  await ensureSession();
  els.loginModal.close();
  toast('Connexion admin réussie.', 'success');
}

async function logoutAdmin() {
  await supabase.auth.signOut();
  await ensureSession();
  toast('Déconnexion effectuée.', 'info');
}

async function addPlayer(event) {
  event.preventDefault();
  const username = document.getElementById('player-username').value.trim().toLowerCase();
  const displayName = document.getElementById('player-display-name').value.trim();
  const club = document.getElementById('player-club').value.trim() || 'Ivoire Chess Club';
  const submit = event.submitter;
  if (submit) submit.disabled = true;

  const { error } = await supabase.from('players').insert({ username_chesscom: username, display_name: displayName, club, is_active: true });
  if (submit) submit.disabled = false;

  if (error) {
    setAdminStatus('error', `Insertion refusée: ${error.message}`);
    toast('Échec ajout joueur.', 'error');
    return;
  }

  setAdminStatus('success', 'Joueur ajouté.');
  toast('Joueur ajouté avec succès.', 'success');
  event.target.reset();
}

async function updateTopLimit(event) {
  event.preventDefault();
  const value = Number(els.topLimitInput.value);
  const { error } = await supabase.from('app_settings').upsert({ key: 'top_limit', value: String(value) });
  if (error) {
    setAdminStatus('error', `Mise à jour refusée: ${error.message}`);
    return;
  }
  setAdminStatus('success', 'Top limit mis à jour.');
  toast('Top limit mis à jour.', 'success');
}

function playerById(id) {
  return state.players.find((p) => p.id === Number(id));
}

async function showPlayerModal(id) {
  const player = playerById(id);
  if (!player) return;

  const ratingData = state.ratingsByUser.get(player.username_chesscom) || {
    rating: 0,
    games: 0,
    peakRating: 0,
    progressToPeak: 0,
  };
  const profile = state.profilesByUser.get(player.username_chesscom) || {};
  const rank = sortedRows().findIndex((item) => item.id === player.id) + 1;

  els.playerModalBody.innerHTML = '<p class="status info">Chargement du profil détaillé...</p>';
  els.playerModal.showModal();

  const games = await fetchMonthlyGames(player.username_chesscom);
  const openings = topOpeningsFromGames(games);

  const openers = openings.length
    ? openings.map((entry) => `<li><span>${entry.opening}</span><strong>${entry.count}</strong></li>`).join('')
    : '<li><span>Pas assez de données</span><strong>-</strong></li>';

  const gamesRows = games.length
    ? games
      .map((game) => {
        const outcome = normalizeResult(game.result);
        const outcomeClass = outcome === 'Victoire' ? 'result-win' : outcome === 'Nul' ? 'result-draw' : 'result-loss';
        const avatar = game.opponentAvatar
          ? `<img class="avatar" src="${game.opponentAvatar}" alt="Avatar adversaire ${game.opponent}" loading="lazy" />`
          : `<div class="avatar avatar-fallback">${initials(game.opponent, game.opponent)}</div>`;
        return `
          <article class="game-row ${outcomeClass}">
            <div>
              <p class="meta-title">${game.date.toLocaleDateString('fr-FR')}</p>
              <p class="meta-sub">${game.opening}</p>
            </div>
            <div class="opponent-wrap">
              ${avatar}
              <div>
                <p class="meta-title">${game.opponent}</p>
                <p class="meta-sub">${game.color === 'white' ? 'Blanc' : 'Noir'}</p>
              </div>
            </div>
            <p><span class="badge ${outcomeClass}">${outcome}</span></p>
            <p>${ratingDiffBadge(game.ratingDiff)}</p>
            <p>${game.url ? `<a href="${game.url}" target="_blank" rel="noreferrer">Voir la partie</a>` : '-'}</p>
          </article>
        `;
      })
      .join('')
    : '<p class="empty-state">Aucune partie trouvée pour ce mois.</p>';

  const avatar = profile.avatar
    ? `<img class="avatar avatar-xl" src="${profile.avatar}" alt="Avatar ${player.display_name}"/>`
    : `<div class="avatar avatar-xl avatar-fallback">${initials(player.display_name, player.username_chesscom)}</div>`;

  const adminActions = state.session
    ? `
      <div class="modal-actions">
        <button id="edit-player-btn" class="btn btn-violet" type="button" data-player="${player.id}">Modifier</button>
        <button id="delete-player-btn" class="btn btn-ghost" type="button" data-player="${player.id}">Désactiver</button>
      </div>
    `
    : '';

  els.playerModalBody.innerHTML = `
    <section class="player-detail-card">
      <div class="player-detail-head">
        ${avatar}
        <div>
          <p class="player-name">${player.display_name}</p>
          <p class="player-username">@${player.username_chesscom}</p>
          <p class="meta-sub">${rank ? `Rang #${rank} • ` : ''}${ratingData.rating} Elo (${state.mode})</p>
        </div>
      </div>
      <div class="stats-grid">
        <article><p>Elo courant</p><strong>${ratingData.rating}</strong></article>
        <article><p>Pic Elo</p><strong>${ratingData.peakRating || ratingData.rating}</strong></article>
        <article><p>Progression</p><strong>${progressBadge(ratingData.progressToPeak)}</strong></article>
        <article><p>Parties</p><strong>${ratingData.games || 0}</strong></article>
      </div>
    </section>

    <section class="player-detail-panels">
      <article class="detail-panel">
        <h4>Ouvertures favorites</h4>
        <ul class="opening-list">${openers}</ul>
      </article>

      <article class="detail-panel">
        <h4>10 dernières parties</h4>
        <div class="games-list">${gamesRows}</div>
      </article>
    </section>
    ${adminActions}
  `;
}

function openEditPrompt(id) {
  const player = playerById(id);
  if (!player) return;
  const displayName = window.prompt('Nom affiché', player.display_name);
  if (displayName === null) return;
  const club = window.prompt('Club', player.club || 'Ivoire Chess Club');
  if (club === null) return;
  const username = window.prompt('Username Chess.com', player.username_chesscom);
  if (username === null) return;

  supabase
    .from('players')
    .update({
      display_name: displayName.trim(),
      club: club.trim(),
      username_chesscom: username.trim().toLowerCase(),
    })
    .eq('id', id)
    .then(({ error }) => {
      if (error) {
        toast(`Modification refusée: ${error.message}`, 'error');
        return;
      }
      toast('Joueur modifié.', 'success');
    });
}

function askDeactivate(id) {
  state.pendingDeleteId = Number(id);
  const p = playerById(id);
  els.confirmText.textContent = `Désactiver ${p?.display_name || 'ce joueur'} ?`;
  els.confirmModal.showModal();
}

async function confirmDeactivate(event) {
  event.preventDefault();
  if (!state.pendingDeleteId) return;
  els.confirmSubmitBtn.disabled = true;
  const { error } = await supabase.from('players').update({ is_active: false }).eq('id', state.pendingDeleteId);
  els.confirmSubmitBtn.disabled = false;
  if (error) {
    toast(`Désactivation refusée: ${error.message}`, 'error');
    return;
  }
  toast('Joueur désactivé.', 'success');
  state.pendingDeleteId = null;
  els.confirmModal.close();
  els.playerModal.close();
}

function onRankingClick(event) {
  const card = event.target.closest('[data-player]');
  if (!card) return;
  showPlayerModal(Number(card.dataset.player));
}

function onAdminPlayerAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === 'deactivate') askDeactivate(id);
  if (button.dataset.action === 'open') showPlayerModal(id);
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.mode = tab.dataset.mode;
      await refreshRatings();
      setStatus('success', `${rowsMessage()} synchronisés.`);
    });
  });
}

function subscribeRealtime() {
  supabase
    .channel('public:shared-state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadSharedData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, loadSharedData)
    .subscribe();
}

function bindModalClose() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.close).close());
  });
}

function bindEvents() {
  els.refreshBtn.addEventListener('click', loadSharedData);
  els.adminLoginBtn.addEventListener('click', () => els.loginModal.showModal());
  els.logoutBtn.addEventListener('click', logoutAdmin);
  els.adminToggle.addEventListener('click', toggleAdminPanel);
  els.loginForm.addEventListener('submit', loginAdmin);
  els.addPlayerForm.addEventListener('submit', addPlayer);
  els.topLimitForm.addEventListener('submit', updateTopLimit);

  els.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    renderRanking();
  });

  els.sortHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      if (state.sort.key === key) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.key = key;
        state.sort.direction = key === 'player' ? 'asc' : 'desc';
      }
      renderRanking();
    });
  });

  els.rankingList.addEventListener('click', onRankingClick);
  els.topThree.addEventListener('click', onRankingClick);
  els.adminPlayerList.addEventListener('click', onAdminPlayerAction);
  els.playerModalBody.addEventListener('click', (event) => {
    const edit = event.target.closest('#edit-player-btn');
    const remove = event.target.closest('#delete-player-btn');
    if (edit) openEditPrompt(Number(edit.dataset.player));
    if (remove) askDeactivate(Number(remove.dataset.player));
  });
  els.confirmForm.addEventListener('submit', confirmDeactivate);

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    updateAdminUi();
  });

  bindModalClose();
}

async function bootstrap() {
  bindEvents();
  initTabs();
  await ensureSession();
  await loadSharedData();
  subscribeRealtime();
}

bootstrap();
