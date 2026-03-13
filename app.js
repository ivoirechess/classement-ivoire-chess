import { supabase } from './supabaseClient.js';

const state = {
  mode: 'rapid',
  topLimit: 20,
  players: [],
  ratingsByUser: new Map(),
  session: null,
};

const els = {
  rankingBody: document.getElementById('ranking-body'),
  status: document.getElementById('status'),
  adminStatus: document.getElementById('admin-status'),
  lastSync: document.getElementById('last-sync'),
  adminPanel: document.getElementById('admin-panel'),
  adminPlayerList: document.getElementById('admin-player-list'),
  refreshBtn: document.getElementById('refresh-btn'),
  adminToggleBtn: document.getElementById('admin-toggle-btn'),
  loginForm: document.getElementById('login-form'),
  addPlayerForm: document.getElementById('add-player-form'),
  topLimitForm: document.getElementById('top-limit-form'),
  logoutBtn: document.getElementById('logout-btn'),
  topLimitInput: document.getElementById('top-limit-input'),
};

function setStatus(type, message) {
  els.status.className = `status ${type}`;
  els.status.textContent = message;
}

function setAdminStatus(type, message) {
  els.adminStatus.className = `status ${type}`;
  els.adminStatus.textContent = message;
}

function chessStatForMode(stats, mode) {
  const key = mode === 'rapid' ? 'chess_rapid' : mode === 'blitz' ? 'chess_blitz' : 'chess_bullet';
  return stats?.[key] ?? null;
}

async function fetchChessRatingsForPlayer(username) {
  const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`);
  if (!response.ok) return { rating: 0, games: 0 };
  const stats = await response.json();
  const modeStat = chessStatForMode(stats, state.mode);
  return {
    rating: Number(modeStat?.last?.rating || 0),
    games: Number(modeStat?.record?.win || 0) + Number(modeStat?.record?.loss || 0) + Number(modeStat?.record?.draw || 0),
  };
}

async function loadSharedData() {
  setStatus('info', 'Chargement depuis Supabase...');

  const [{ data: players, error: playersError }, { data: setting, error: settingError }] = await Promise.all([
    supabase.from('players').select('*').eq('is_active', true).order('created_at', { ascending: true }),
    supabase.from('app_settings').select('value').eq('key', 'top_limit').single(),
  ]);

  if (playersError || settingError) {
    const msg = playersError?.message || settingError?.message || 'Erreur inconnue';
    setStatus('error', `Supabase indisponible: ${msg}`);
    return;
  }

  state.players = players;
  state.topLimit = Number(setting?.value || 20);
  els.topLimitInput.value = String(state.topLimit);

  await refreshRatings();
  renderAdminPlayers();
  els.lastSync.textContent = `Dernière synchro: ${new Date().toLocaleTimeString('fr-FR')}`;
  setStatus('success', 'Données synchronisées.');
}

async function refreshRatings() {
  const calls = state.players.map(async (player) => {
    const ratingData = await fetchChessRatingsForPlayer(player.username_chesscom);
    state.ratingsByUser.set(player.username_chesscom, ratingData);
  });
  await Promise.all(calls);
  renderRanking();
}

function renderRanking() {
  const rows = state.players
    .map((p) => ({ ...p, ...(state.ratingsByUser.get(p.username_chesscom) || { rating: 0, games: 0 }) }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, state.topLimit);

  els.rankingBody.innerHTML = rows
    .map((row, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${row.display_name}</td>
        <td>${row.username_chesscom}</td>
        <td>${row.rating}</td>
        <td>${row.games}</td>
      </tr>
    `)
    .join('');

  if (!rows.length) {
    els.rankingBody.innerHTML = '<tr><td colspan="5">Aucun joueur actif.</td></tr>';
  }
}

function renderAdminPlayers() {
  els.adminPlayerList.innerHTML = state.players
    .map((p) => `
      <li class="player-item" data-id="${p.id}">
        <div>
          <strong>${p.display_name}</strong><br>
          <small>@${p.username_chesscom}</small>
        </div>
        <div class="player-actions">
          <button data-action="rename" data-id="${p.id}">Renommer</button>
          <button class="danger" data-action="deactivate" data-id="${p.id}">Désactiver</button>
        </div>
      </li>
    `)
    .join('');
}

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  const isConnected = Boolean(state.session);
  setAdminStatus('info', isConnected ? `Connecté: ${state.session.user.email}` : 'Non connecté.');
}

async function loginAdmin(event) {
  event.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setAdminStatus('error', `Connexion refusée: ${error.message}`);
    return;
  }
  await ensureSession();
  setAdminStatus('success', 'Connexion admin réussie.');
}

async function logoutAdmin() {
  await supabase.auth.signOut();
  await ensureSession();
  setAdminStatus('info', 'Déconnecté.');
}

async function addPlayer(event) {
  event.preventDefault();
  const username = document.getElementById('player-username').value.trim().toLowerCase();
  const displayName = document.getElementById('player-display-name').value.trim();
  const club = document.getElementById('player-club').value.trim() || 'Ivoire Chess Club';

  const { error } = await supabase.from('players').insert({
    username_chesscom: username,
    display_name: displayName,
    club,
    is_active: true,
  });

  if (error) {
    const duplicate = error.message.toLowerCase().includes('duplicate');
    setAdminStatus('error', duplicate ? 'Ce username existe déjà.' : `Insertion refusée: ${error.message}`);
    return;
  }

  setAdminStatus('success', 'Joueur ajouté.');
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
}

async function onAdminPlayerAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;

  if (action === 'deactivate') {
    const { error } = await supabase.from('players').update({ is_active: false }).eq('id', id);
    if (error) return setAdminStatus('error', `Suppression refusée: ${error.message}`);
    setAdminStatus('success', 'Joueur désactivé.');
  }

  if (action === 'rename') {
    const nextName = window.prompt('Nouveau nom d\'affichage :');
    if (!nextName) return;
    const { error } = await supabase.from('players').update({ display_name: nextName.trim() }).eq('id', id);
    if (error) return setAdminStatus('error', `Modification refusée: ${error.message}`);
    setAdminStatus('success', 'Nom affiché mis à jour.');
  }
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.mode = tab.dataset.mode;
      await refreshRatings();
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

function bindEvents() {
  els.refreshBtn.addEventListener('click', loadSharedData);
  els.adminToggleBtn.addEventListener('click', () => els.adminPanel.classList.toggle('hidden'));
  els.loginForm.addEventListener('submit', loginAdmin);
  els.logoutBtn.addEventListener('click', logoutAdmin);
  els.addPlayerForm.addEventListener('submit', addPlayer);
  els.topLimitForm.addEventListener('submit', updateTopLimit);
  els.adminPlayerList.addEventListener('click', onAdminPlayerAction);
}

async function bootstrap() {
  bindEvents();
  initTabs();
  await ensureSession();
  await loadSharedData();
  subscribeRealtime();
}

bootstrap();
