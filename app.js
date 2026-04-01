import { supabase } from './supabaseClient.js';
import {
  clearCache,
  fetchRecentArchives,
  fetchMonthlyContext,
  fetchMonthlyGames,
  fetchPlayerProfile,
  fetchPlayerStats,
  topOpeningsFromGames,
} from './chessApi.js';

const MODE_LABEL = { rapid: 'Rapide', blitz: 'Blitz', bullet: 'Bullet' };
const CHESS_QUOTES = [
  '« Les échecs sont avant tout une question de combativité. » — Garry Kasparov',
  '« Même un mauvais plan vaut mieux qu’aucun plan. » — Savielly Tartakower',
  '« Les pions sont l’âme des échecs. » — François-André Philidor',
  '« Un cavalier en bordure est une honte. » — Proverbe échiquéen',
  '« Les échecs, c’est 99% de tactique. » — Richard Teichmann',
  '« Le roi est une pièce de combat. » — Wilhelm Steinitz',
  '« Le gagnant est celui qui fait l’avant-dernière erreur. » — Savielly Tartakower',
  '« Une combinaison n’existe que si l’adversaire la permet. » — Siegbert Tarrasch',
  '« Aux échecs, la menace est souvent plus forte que son exécution. » — Aron Nimzowitsch',
  '« Les échecs enseignent la prévoyance. » — Blaise Pascal',
  '« Il faut jouer activement, sinon on souffre. » — Anatoli Karpov',
  '« Chaque coup de pion crée une faiblesse irréversible. » — Wilhelm Steinitz',
  '« Le style, c’est savoir quoi simplifier. » — Mikhail Botvinnik',
  '« Les échecs récompensent la patience et punissent la précipitation. » — Proverbe échiquéen',
  '« Dans une position difficile, cherche les ressources cachées. » — David Bronstein',
];
const DEFAULT_REWARD_SETTINGS = {
  topAmount: 10000,
  progressAmount: 5000,
  nextRewardAt: '',
  isFrozen: false,
  frozenAt: '',
  topWinnerUsername: '',
  topWinnerName: '',
  topWinnerRating: '',
  progressWinnerUsername: '',
  progressWinnerName: '',
  progressWinnerValue: '',
};

const state = {
  mode: 'rapid',
  topLimit: 20,
  players: [],
  ratingsByUser: new Map(),
  profilesByUser: new Map(),
  // Stocke { referenceRating, isInactive, currentGames } par username
  monthlyContextByUser: new Map(),
  lastGameByUser: new Map(),
  rankingDeltaByUser: new Map(),
  baseOrderByUser: new Map(),
  session: null,
  search: '',
  sort: { key: 'rating', direction: 'desc' },
  isOffline: false,
  pendingDeleteId: null,
  isAdminCollapsed: false,
  playerModalMode: 'rapid',
  playerModalRequestId: 0,
  rewardSettings: { ...DEFAULT_REWARD_SETTINGS },
  rewardCandidates: { topPlayer: null, topProgress: null },
  rewardFreezeSyncInProgress: false,
  matches: [],
  tournaments: [],
  refDateMode: 'auto',
  refDateStart: '',
  refDateEnd: '',
  compare: {
    leftId: null,
    rightId: null,
    mode: 'rapid',
    loading: false,
    data: null,
  },
  countdownTimer: null,
  activityTimer: null,
  activityLog: [],
};

const els = {
  rankingList: document.getElementById('ranking-list'),
  chessQuote: document.getElementById('chess-quote'),
  matchesSection: document.getElementById('matches-section'),
  tournamentsSection: document.getElementById('tournaments-section'),
  activityFeed: document.getElementById('activity-feed'),
  clubStatsSection: document.getElementById('club-stats-section'),
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
  addMatchForm: document.getElementById('add-match-form'),
  addTournamentForm: document.getElementById('add-tournament-form'),
  topLimitForm: document.getElementById('top-limit-form'),
  topLimitInput: document.getElementById('top-limit-input'),
  rewardSettingsForm: document.getElementById('reward-settings-form'),
  rewardTopAmountInput: document.getElementById('reward-top-amount-input'),
  rewardProgressAmountInput: document.getElementById('reward-progress-amount-input'),
  rewardNextAtInput: document.getElementById('reward-next-at-input'),
  refDateModeRadios: Array.from(document.querySelectorAll('input[name="ref-date-mode"]')),
  refDateStartInput: document.getElementById('ref-date-start-input'),
  refDateEndInput: document.getElementById('ref-date-end-input'),
  refDateManualFields: document.getElementById('ref-date-manual-fields'),
  searchInput: document.getElementById('search-input'),
  sortHeaders: Array.from(document.querySelectorAll('.sort-head')),
  toastRegion: document.getElementById('toast-region'),
  loginModal: document.getElementById('login-modal'),
  playerModal: document.getElementById('player-modal'),
  playerModalBody: document.getElementById('player-modal-body'),
  compareBtn: document.getElementById('compare-btn'),
  compareModal: document.getElementById('compare-modal'),
  compareModalBody: document.getElementById('compare-modal-body'),
  confirmModal: document.getElementById('confirm-modal'),
  confirmText: document.getElementById('confirm-text'),
  confirmForm: document.getElementById('confirm-form'),
  confirmSubmitBtn: document.getElementById('confirm-submit-btn'),
  insightCountdown: document.getElementById('insight-countdown'),
  insightTopPlayer: document.getElementById('insight-top-player'),
  insightTopProgress: document.getElementById('insight-top-progress'),
  insightTopAmount: document.getElementById('insight-top-amount'),
  insightProgressAmount: document.getElementById('insight-progress-amount'),
  insightTopPlayerAvatar: document.getElementById('insight-top-player-avatar'),
  insightTopProgressAvatar: document.getElementById('insight-top-progress-avatar'),
  insightTopPlayerLabel: document.getElementById('insight-top-player-label'),
  insightTopProgressLabel: document.getElementById('insight-top-progress-label'),
  insightCountdownSub: document.getElementById('insight-countdown-sub'),
  adminMatchList: document.getElementById('admin-match-list'),
  adminTournamentList: document.getElementById('admin-tournament-list'),
  matchPlayer1: document.getElementById('match-player1'),
  matchPlayer2: document.getElementById('match-player2'),
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

function renderRandomQuote() {
  if (!els.chessQuote) return;
  const quote = CHESS_QUOTES[Math.floor(Math.random() * CHESS_QUOTES.length)];
  els.chessQuote.textContent = quote;
}

function formatAmountFcfa(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

function parseRewardSettings(rows = []) {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const topAmount = Number(map.get('reward_top_amount') || DEFAULT_REWARD_SETTINGS.topAmount);
  const progressAmount = Number(map.get('reward_progress_amount') || DEFAULT_REWARD_SETTINGS.progressAmount);
  const nextRewardAt = map.get('reward_next_at') || computeNextRewardDate().toISOString();
  const isFrozen = map.get('reward_is_frozen') === '1';
  const frozenAt = map.get('reward_frozen_at') || '';

  return {
    topAmount: Number.isFinite(topAmount) ? topAmount : DEFAULT_REWARD_SETTINGS.topAmount,
    progressAmount: Number.isFinite(progressAmount) ? progressAmount : DEFAULT_REWARD_SETTINGS.progressAmount,
    nextRewardAt,
    isFrozen,
    frozenAt,
    topWinnerUsername: map.get('reward_top_winner_username') || '',
    topWinnerName: map.get('reward_top_winner_name') || '',
    topWinnerRating: map.get('reward_top_winner_rating') || '',
    progressWinnerUsername: map.get('reward_progress_winner_username') || '',
    progressWinnerName: map.get('reward_progress_winner_name') || '',
    progressWinnerValue: map.get('reward_progress_winner_value') || '',
  };
}

function toDatetimeLocalValue(isoDateString) {
  if (!isoDateString) return '';
  const date = new Date(isoDateString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


function initials(name, username) {
  const source = name || username || '?';
  return source
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function avatarFallbackMarkup(name, username, extraClasses = '') {
  const classes = ['avatar', extraClasses, 'avatar-fallback'].filter(Boolean).join(' ');
  return `<div class="${classes}">${initials(name, username)}</div>`;
}

function avatarMarkup(avatarUrl, name, username, extraClasses = '') {
  if (!avatarUrl) return avatarFallbackMarkup(name, username, extraClasses);
  const classes = ['avatar', extraClasses].filter(Boolean).join(' ');
  return `<img class="${classes}" src="${escapeHtml(avatarUrl)}" alt="Avatar ${escapeHtml(name || username || 'joueur')}" loading="lazy" data-avatar-fallback="1" data-avatar-name="${escapeHtml(name || '')}" data-avatar-username="${escapeHtml(username || '')}" />`;
}

function installAvatarFallbackHandler() {
  if (document.body.dataset.avatarFallbackReady === '1') return;
  document.body.dataset.avatarFallbackReady = '1';

  document.addEventListener('error', (event) => {
    const node = event.target;
    if (!(node instanceof HTMLImageElement) || !node.dataset.avatarFallback) return;

    const classes = node.className || 'avatar';
    const fallback = document.createElement('div');
    fallback.className = `${classes} avatar-fallback`;
    fallback.textContent = initials(node.dataset.avatarName || '', node.dataset.avatarUsername || '');
    node.replaceWith(fallback);
  }, true);
}

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

function classifyResult(result = '') {
  const r = result.toLowerCase();
  if (r.startsWith('victoire')) return 'win';
  if (r.startsWith('nulle') || r.startsWith('nul')) return 'draw';
  return 'loss';
}

function ratingDiffBadge(diff) {
  if (typeof diff !== 'number' || Number.isNaN(diff) || diff === 0) return '<span class="elo-diff neutral">±0</span>';
  const sign = diff > 0 ? '+' : '';
  const kind = diff > 0 ? 'up' : 'down';
  return `<span class="elo-diff ${kind}">${sign}${diff}</span>`;
}

function lastGameMarkup(lastGame) {
  if (!lastGame) return '—';
  const kind = classifyResult(lastGame.result);
  const icon = kind === 'win' ? '✓' : kind === 'draw' ? '=' : '✗';
  const klass = kind === 'win' ? 'up' : kind === 'draw' ? 'neutral' : 'down';
  return `
    <div class="last-game-pill">
      <span class="elo-diff ${klass}" style="padding:2px 6px;">${icon}</span>
      <span class="last-opening" title="${escapeHtml(lastGame.opening || '')}">${escapeHtml(shortOpening(lastGame.opening || '—', 18))}</span>
      ${ratingDiffBadge(lastGame.ratingDiff)}
    </div>
  `;
}

/**
 * Badge de progression mensuelle.
 * - null ou isInactive → badge "Inactif" grisé
 * - 0 → "Stable"
 * - positif/négatif → +N / -N coloré
 */
function progressBadge(value, isInactive = false) {
  if (isInactive || value === null || value === undefined) {
    return '<span class="elo-diff neutral">Inactif</span>';
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value === 0) {
    return '<span class="elo-diff neutral">Stable</span>';
  }
  const sign = value > 0 ? '+' : '';
  const klass = value > 0 ? 'up' : 'down';
  return `<span class="elo-diff ${klass}">${sign}${value}</span>`;
}

function shortOpening(name = '', maxLen = 28) {
  if (!name || name === 'Ouverture non disponible') return '—';
  return name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name;
}

function computeNextRewardDate(now = new Date()) {
  if (state.rewardSettings.nextRewardAt) {
    const configured = new Date(state.rewardSettings.nextRewardAt);
    if (!Number.isNaN(configured.getTime()) && configured.getTime() > now.getTime()) return configured;
  }

  const fallback = new Date(now);
  fallback.setUTCHours(10, 0, 0, 0);
  if (now.getUTCDate() === 1 && now < fallback) return fallback;
  fallback.setUTCMonth(fallback.getUTCMonth() + 1, 1);
  return fallback;
}

function formatDateTimeGmt(date) {
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function formatDateFr(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return 'Date invalide';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(',', ' à');
}

function statusLabel(status) {
  if (status === 'completed') return 'Terminé';
  if (status === 'ongoing') return 'En cours';
  return 'À venir';
}

function countdownText(targetDate, now = new Date()) {
  const target = new Date(targetDate);
  const diff = target.getTime() - now.getTime();
  if (Number.isNaN(target.getTime()) || diff <= 0) return 'En cours';
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `dans ${days}j ${hours}h ${minutes}min`;
}

function formatRelativeFr(timestampMs) {
  const diff = Math.max(0, Date.now() - Number(timestampMs || 0));
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'à l’instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function buildActivityEvents(prevRatings, prevBaseOrder, newBaseOrder, mode) {
  const now = Date.now();
  const events = [];
  state.players.forEach((player) => {
    const username = player.username_chesscom;
    const displayName = player.display_name;
    const oldRating = Number(prevRatings.get(username)?.rating || 0);
    const newRating = Number(state.ratingsByUser.get(username)?.rating || 0);
    const delta = newRating - oldRating;
    if (oldRating > 0 && newRating > 0 && delta !== 0) {
      events.push({
        type: 'elo_change',
        username,
        displayName,
        delta,
        newRating,
        mode,
        timestamp: now,
      });
    }

    const oldRank = Number(prevBaseOrder.get(username) || 0);
    const newRank = Number(newBaseOrder.get(username) || 0);
    if (oldRank > 0 && newRank > 0 && oldRank - newRank >= 2) {
      events.push({
        type: 'rank_up',
        username,
        displayName,
        oldRank,
        newRank,
        timestamp: now,
      });
    }
  });
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function renderActivityFeed() {
  if (!els.activityFeed) return;
  if (!state.activityLog.length) {
    els.activityFeed.innerHTML = '<p class="empty-state">Aucune activité récente pour l’instant.</p>';
    return;
  }
  els.activityFeed.innerHTML = state.activityLog.map((event) => {
    const player = state.players.find((p) => p.username_chesscom === event.username);
    const profile = state.profilesByUser.get(event.username) || {};
    const positive = event.type === 'rank_up' || Number(event.delta || 0) > 0;
    const badge = positive ? 'status success' : 'status error';
    const text = event.type === 'rank_up'
      ? `${event.displayName} grimpe de la ${event.oldRank}e à la ${event.newRank}e place !`
      : (event.delta > 0
        ? `${event.displayName} a gagné +${event.delta} Elo en ${MODE_LABEL[event.mode] || event.mode} → ${event.newRating}`
        : `${event.displayName} a perdu ${Math.abs(event.delta)} Elo en ${MODE_LABEL[event.mode] || event.mode} → ${event.newRating}`);
    return `
      <article class="event-card">
        <div class="match-player" data-player="${player?.id || ''}">
          ${avatarMarkup(profile.avatar, player?.display_name || event.displayName, event.username)}
          <div>
            <p class="player-name">${escapeHtml(event.displayName)}</p>
            <p style="font-size:12px;color:var(--text-2);">${escapeHtml(text)}</p>
            <p class="player-username">${formatRelativeFr(event.timestamp)}</p>
          </div>
          <span class="${badge}" style="margin-left:auto;padding:4px 8px;">${event.type === 'rank_up' ? 'Rang' : (event.delta > 0 ? 'Gain' : 'Perte')}</span>
        </div>
      </article>`;
  }).join('');
}

function renderClubStats() {
  if (!els.clubStatsSection) return;
  const ratings = state.players
    .map((p) => ({ player: p, rating: Number(state.ratingsByUser.get(p.username_chesscom)?.rating || 0), games: Number(state.ratingsByUser.get(p.username_chesscom)?.games || 0) }));
  const activePlayers = state.players.length;
  const totalGames = ratings.reduce((sum, entry) => sum + entry.games, 0);
  const rated = ratings.filter((entry) => entry.rating > 0);
  const avg = rated.length ? Math.round(rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length) : 0;
  const best = ratings.sort((a, b) => b.rating - a.rating)[0] || { rating: 0, player: null };
  els.clubStatsSection.innerHTML = `
    <article><p>Joueurs actifs</p><strong>${activePlayers}</strong></article>
    <article><p>Total parties ce mois</p><strong>${totalGames}</strong></article>
    <article><p>Elo moyen du club</p><strong>${avg}</strong></article>
    <article><p>Meilleur Elo</p><strong>${best.rating || 0}</strong><small class="meta-sub">${best.player?.display_name || '—'}</small></article>
  `;
}

function formatCountdown(diffMs) {
  if (diffMs <= 0) return 'Échéance atteinte';

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  return parts.join(' ');
}

function buildRefOptions() {
  const mode = String(state.refDateMode || 'auto').toLowerCase();
  if (mode !== 'manual') return {};
  if (!state.refDateStart || !state.refDateEnd) return {};
  const refDateStart = new Date(`${state.refDateStart}T00:00:00Z`);
  const refDateEnd = new Date(`${state.refDateEnd}T00:00:00Z`);
  if (Number.isNaN(refDateStart.getTime()) || Number.isNaN(refDateEnd.getTime())) return {};
  if (refDateStart.getTime() > refDateEnd.getTime()) return {};
  return { refDateStart, refDateEnd };
}

function renderRefDateModeUi() {
  const isManual = state.refDateMode === 'manual';
  els.refDateManualFields?.classList.toggle('hidden', !isManual);
  els.refDateModeRadios.forEach((radio) => { radio.checked = radio.value === state.refDateMode; });
  if (els.refDateStartInput) els.refDateStartInput.value = state.refDateStart || '';
  if (els.refDateEndInput) els.refDateEndInput.value = state.refDateEnd || '';
}

function computeBadges(row, context = {}) {
  const badges = [];
  if (row.isInactive) badges.push('💤 En veille');
  if (typeof row.monthlyProgress === 'number' && row.monthlyProgress >= 30) badges.push('🔥 En feu');
  else if (typeof row.monthlyProgress === 'number' && row.monthlyProgress >= 10) badges.push('📈 En hausse');
  if (!row.isInactive && Number(row.games || 0) >= 20 && Number(row.monthlyProgress || 0) >= -10) badges.push('🛡 Solide');
  if (context.isLeader) badges.push('👑 Leader');
  if (context.isTopProgress) badges.push('🏹 Le Chasseur');
  return badges;
}

async function refreshRewardCandidates() {
  if (state.rewardSettings.isFrozen) {
    state.rewardCandidates = {
      topPlayer: state.rewardSettings.topWinnerUsername ? {
        display_name: state.rewardSettings.topWinnerName || state.rewardSettings.topWinnerUsername,
        username: state.rewardSettings.topWinnerUsername,
        avatar: state.profilesByUser.get(state.rewardSettings.topWinnerUsername)?.avatar || null,
        rating: Number(state.rewardSettings.topWinnerRating || 0),
      } : null,
      topProgress: state.rewardSettings.progressWinnerUsername ? {
        display_name: state.rewardSettings.progressWinnerName || state.rewardSettings.progressWinnerUsername,
        username: state.rewardSettings.progressWinnerUsername,
        avatar: state.profilesByUser.get(state.rewardSettings.progressWinnerUsername)?.avatar || null,
        monthlyProgress: Number(state.rewardSettings.progressWinnerValue || 0),
      } : null,
    };
    return;
  }

  const rapidSnapshotsSettled = await Promise.allSettled(state.players.map(async (player) => {
    const [rating, context] = await Promise.all([
      fetchPlayerStats(player.username_chesscom, 'rapid'),
      fetchMonthlyContext(player.username_chesscom, 'rapid', buildRefOptions()),
    ]);

    const monthlyProgress = (!context || context.isInactive || context.referenceRating === null)
      ? null
      : Number(rating.rating || 0) - Number(context.referenceRating || 0);

    return {
      player,
      rating: Number(rating.rating || 0),
      games: Number(rating.games || 0),
      isInactive: Boolean(context?.isInactive),
      monthlyProgress,
    };
  }));
  const rapidSnapshots = rapidSnapshotsSettled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value);

  const topPlayer = rapidSnapshots.sort((a, b) => b.rating - a.rating)[0] || null;
  const topProgress = rapidSnapshots
    .filter((entry) => !entry.isInactive && entry.games > 0 && typeof entry.monthlyProgress === 'number' && !Number.isNaN(entry.monthlyProgress))
    .sort((a, b) => b.monthlyProgress - a.monthlyProgress)[0] || null;

  state.rewardCandidates = {
    topPlayer: topPlayer ? {
      display_name: topPlayer.player.display_name,
      username: topPlayer.player.username_chesscom,
      avatar: state.profilesByUser.get(topPlayer.player.username_chesscom)?.avatar || null,
      rating: topPlayer.rating,
    } : null,
    topProgress: topProgress ? {
      display_name: topProgress.player.display_name,
      username: topProgress.player.username_chesscom,
      avatar: state.profilesByUser.get(topProgress.player.username_chesscom)?.avatar || null,
      monthlyProgress: topProgress.monthlyProgress,
    } : null,
  };
}

async function freezeRewardWinnersIfNeeded() {
  if (state.rewardFreezeSyncInProgress) return;
  if (state.rewardSettings.isFrozen) return;

  const now = new Date();
  const target = new Date(state.rewardSettings.nextRewardAt);
  if (Number.isNaN(target.getTime()) || now.getTime() < target.getTime()) return;

  state.rewardFreezeSyncInProgress = true;
  const frozenAt = now.toISOString();
  const topPlayer = state.rewardCandidates.topPlayer;
  const topProgress = state.rewardCandidates.topProgress;

  const payload = [
    { key: 'reward_is_frozen', value: '1' },
    { key: 'reward_frozen_at', value: frozenAt },
    { key: 'reward_top_winner_username', value: topPlayer?.username || '' },
    { key: 'reward_top_winner_name', value: topPlayer?.display_name || '' },
    { key: 'reward_top_winner_rating', value: String(topPlayer?.rating ?? '') },
    { key: 'reward_progress_winner_username', value: topProgress?.username || '' },
    { key: 'reward_progress_winner_name', value: topProgress?.display_name || '' },
    { key: 'reward_progress_winner_value', value: String(topProgress?.monthlyProgress ?? '') },
  ];

  const { error } = await supabase.from('app_settings').upsert(payload);
  state.rewardFreezeSyncInProgress = false;

  if (error) {
    toast(`Impossible de figer les lauréats: ${error.message}`, 'error');
    return;
  }

  state.rewardSettings.isFrozen = true;
  state.rewardSettings.frozenAt = frozenAt;
  state.rewardSettings.topWinnerUsername = topPlayer?.username || '';
  state.rewardSettings.topWinnerName = topPlayer?.display_name || '';
  state.rewardSettings.topWinnerRating = String(topPlayer?.rating ?? '');
  state.rewardSettings.progressWinnerUsername = topProgress?.username || '';
  state.rewardSettings.progressWinnerName = topProgress?.display_name || '';
  state.rewardSettings.progressWinnerValue = String(topProgress?.monthlyProgress ?? '');
}

function updateRewardInsights() {
  const { topPlayer, topProgress } = state.rewardCandidates;
  const isFrozen = Boolean(state.rewardSettings.isFrozen);

  if (els.insightTopAmount) els.insightTopAmount.textContent = `Récompense: ${formatAmountFcfa(state.rewardSettings.topAmount)}`;
  if (els.insightProgressAmount) els.insightProgressAmount.textContent = `Récompense: ${formatAmountFcfa(state.rewardSettings.progressAmount)}`;
  if (els.insightTopPlayerLabel) {
    els.insightTopPlayerLabel.textContent = isFrozen ? '🏆 Lauréat du mois (meilleur joueur)' : '🏆 Potentiel meilleur joueur';
  }
  if (els.insightTopProgressLabel) {
    els.insightTopProgressLabel.textContent = isFrozen ? '📈 Lauréat du mois (progression)' : '📈 Potentielle meilleure progression';
  }

  if (els.insightTopPlayer) {
    els.insightTopPlayer.textContent = topPlayer
      ? `${topPlayer.display_name} (${topPlayer.rating} Elo rapide)`
      : (isFrozen ? 'Aucun lauréat enregistré' : 'Aucun candidat');
  }
  if (els.insightTopPlayerAvatar) {
    els.insightTopPlayerAvatar.innerHTML = topPlayer
      ? avatarMarkup(topPlayer.avatar, topPlayer.display_name, topPlayer.username, 'insight-avatar')
      : avatarFallbackMarkup('?', '?', 'insight-avatar');
  }

  if (els.insightTopProgress) {
    els.insightTopProgress.textContent = topProgress
      ? `${topProgress.display_name} (${topProgress.monthlyProgress > 0 ? '+' : ''}${topProgress.monthlyProgress} Elo rapide)`
      : (isFrozen ? 'Aucun lauréat enregistré' : 'Aucune progression active');
  }
  if (els.insightTopProgressAvatar) {
    els.insightTopProgressAvatar.innerHTML = topProgress
      ? avatarMarkup(topProgress.avatar, topProgress.display_name, topProgress.username, 'insight-avatar')
      : avatarFallbackMarkup('?', '?', 'insight-avatar');
  }

  const now = new Date();
  const nextRewardDate = computeNextRewardDate(now);
  const diff = nextRewardDate.getTime() - now.getTime();
  if (els.insightCountdown) {
    if (isFrozen) {
      els.insightCountdown.textContent = 'Résultats figés';
      if (els.insightCountdownSub) {
        const frozenAt = state.rewardSettings.frozenAt ? new Date(state.rewardSettings.frozenAt) : null;
        els.insightCountdownSub.textContent = frozenAt && !Number.isNaN(frozenAt.getTime())
          ? `Lauréats verrouillés le ${formatDateTimeGmt(frozenAt)}`
          : 'Lauréats verrouillés jusqu’à la prochaine date de récompense';
      }
    } else {
      els.insightCountdown.textContent = `${formatCountdown(diff)} · ${formatDateTimeGmt(nextRewardDate)}`;
      if (els.insightCountdownSub) {
        els.insightCountdownSub.textContent = 'Date et heure de remise affichées en GMT (UTC)';
      }
    }
  }
}

/**
 * Calcule la progression mensuelle pour un joueur :
 * Elo actuel − Elo de référence (1ère partie du mois ou M-1).
 * Retourne null si inactif.
 */
function computeMonthlyProgress(username, currentRating) {
  const ctx = state.monthlyContextByUser.get(username);
  if (!ctx || ctx.isInactive || ctx.referenceRating === null) return null;
  return currentRating - ctx.referenceRating;
}

function comparePlayerOptionsMarkup(selectedId) {
  return state.players
    .map((player) => `<option value="${player.id}" ${Number(selectedId) === Number(player.id) ? 'selected' : ''}>${escapeHtml(player.display_name)} (@${escapeHtml(player.username_chesscom)})</option>`)
    .join('');
}

function summarizeHeadToHead(gamesA = [], usernameA = '', usernameB = '') {
  const target = String(usernameB || '').toLowerCase();
  const total = { win: 0, draw: 0, loss: 0, total: 0 };
  gamesA.forEach((game) => {
    if (String(game.opponent || '').toLowerCase() !== target) return;
    const kind = classifyResult(game.result);
    if (kind === 'win') total.win += 1;
    else if (kind === 'draw') total.draw += 1;
    else total.loss += 1;
    total.total += 1;
  });
  return { ...total, usernameA, usernameB };
}

function buildComparisonChart(pointsA = [], pointsB = [], playerA, playerB) {
  const width = 900;
  const height = 180;
  const pad = { top: 12, right: 8, bottom: 20, left: 42 };
  const all = [...pointsA, ...pointsB];
  if (!all.length) return '<p class="empty-state">Aucune donnée Elo disponible sur les 3 derniers mois.</p>';

  const minX = Math.min(...all.map((p) => p.date.getTime()));
  const maxX = Math.max(...all.map((p) => p.date.getTime()));
  const minY = Math.min(...all.map((p) => p.rating));
  const maxY = Math.max(...all.map((p) => p.rating));
  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);

  const x = (v) => pad.left + ((v - minX) / xRange) * (width - pad.left - pad.right);
  const y = (v) => height - pad.bottom - ((v - minY) / yRange) * (height - pad.top - pad.bottom);
  const polyline = (pts) => pts.map((p) => `${x(p.date.getTime()).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="180" role="img" aria-label="Évolution Elo comparée">
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="rgba(90,80,60,0.4)" />
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="rgba(90,80,60,0.4)" />
      <text x="${pad.left}" y="${pad.top}" font-size="10" fill="#7a705f">${maxY}</text>
      <text x="${pad.left}" y="${height - pad.bottom - 2}" font-size="10" fill="#7a705f">${minY}</text>
      <text x="${pad.left}" y="${height - 4}" font-size="10" fill="#7a705f">${new Date(minX).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</text>
      <text x="${width - 66}" y="${height - 4}" font-size="10" fill="#7a705f">${new Date(maxX).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</text>
      ${pointsA.length ? `<polyline fill="none" stroke="#b8900a" stroke-width="2.5" points="${polyline(pointsA)}" />` : ''}
      ${pointsB.length ? `<polyline fill="none" stroke="#2878d0" stroke-width="2.5" points="${polyline(pointsB)}" />` : ''}
    </svg>
    <div class="compare-legend">
      <span><span class="legend-dot" style="background:#b8900a;"></span>${escapeHtml(playerA.display_name)}</span>
      <span><span class="legend-dot" style="background:#2878d0;"></span>${escapeHtml(playerB.display_name)}</span>
    </div>
  `;
}

function renderCompareModal() {
  if (!els.compareModalBody) return;
  const fallbackLeft = state.players[0]?.id ?? '';
  const fallbackRight = state.players[1]?.id ?? state.players[0]?.id ?? '';
  const leftId = state.compare.leftId ?? fallbackLeft;
  const rightId = state.compare.rightId ?? fallbackRight;

  const loadingMarkup = state.compare.loading
    ? '<div class="status info">Chargement…</div>'
    : '';

  const data = state.compare.data;
  const analysisMarkup = data
    ? data.markup
    : '<p class="status info">Choisissez deux joueurs puis lancez la comparaison.</p>';

  els.compareModalBody.innerHTML = `
    <div class="compare-controls">
      <div class="compare-select-block">
        <label>Joueur 1
          <select id="compare-left-select">${comparePlayerOptionsMarkup(leftId)}</select>
        </label>
      </div>
      <div class="status info" style="margin:0;">vs</div>
      <div class="compare-select-block">
        <label>Joueur 2
          <select id="compare-right-select">${comparePlayerOptionsMarkup(rightId)}</select>
        </label>
      </div>
      <button id="compare-run-btn" class="btn btn-violet" type="button">Comparer</button>
    </div>
    <div class="tabs" role="tablist" aria-label="Cadence comparaison">
      <button class="tab ${state.compare.mode === 'rapid' ? 'active' : ''}" data-compare-mode="rapid" type="button">Rapide</button>
      <button class="tab ${state.compare.mode === 'blitz' ? 'active' : ''}" data-compare-mode="blitz" type="button">Blitz</button>
      <button class="tab ${state.compare.mode === 'bullet' ? 'active' : ''}" data-compare-mode="bullet" type="button">Bullet</button>
    </div>
    ${loadingMarkup}
    <div class="compare-body">${analysisMarkup}</div>
  `;
}

async function runCompareAnalysis() {
  const left = playerById(state.compare.leftId);
  const right = playerById(state.compare.rightId);
  if (!left || !right) {
    toast('Veuillez sélectionner deux joueurs valides.', 'error');
    return;
  }
  state.compare.loading = true;
  renderCompareModal();

  const mode = state.compare.mode;
  const [leftRating, rightRating] = await Promise.all([
    fetchPlayerStats(left.username_chesscom, mode),
    fetchPlayerStats(right.username_chesscom, mode),
  ]);
  const [leftProfile, rightProfile] = await Promise.all([
    state.profilesByUser.get(left.username_chesscom) || fetchPlayerProfile(left.username_chesscom),
    state.profilesByUser.get(right.username_chesscom) || fetchPlayerProfile(right.username_chesscom),
  ]);
  const [leftCtx, rightCtx] = await Promise.all([
    mode === state.mode ? (state.monthlyContextByUser.get(left.username_chesscom) || fetchMonthlyContext(left.username_chesscom, mode, buildRefOptions())) : fetchMonthlyContext(left.username_chesscom, mode, buildRefOptions()),
    mode === state.mode ? (state.monthlyContextByUser.get(right.username_chesscom) || fetchMonthlyContext(right.username_chesscom, mode, buildRefOptions())) : fetchMonthlyContext(right.username_chesscom, mode, buildRefOptions()),
  ]);

  const leftProgress = leftCtx.isInactive || leftCtx.referenceRating === null ? null : Number(leftRating.rating || 0) - Number(leftCtx.referenceRating || 0);
  const rightProgress = rightCtx.isInactive || rightCtx.referenceRating === null ? null : Number(rightRating.rating || 0) - Number(rightCtx.referenceRating || 0);
  const leftGames = await fetchMonthlyGames(left.username_chesscom, leftCtx.currentGames?.length ? leftCtx.currentGames : null, mode);
  const rightGames = await fetchMonthlyGames(right.username_chesscom, rightCtx.currentGames?.length ? rightCtx.currentGames : null, mode);
  const leftOpenings = topOpeningsFromGames(leftGames);
  const rightOpenings = topOpeningsFromGames(rightGames);
  const [leftTrend, rightTrend] = await Promise.all([
    fetchRecentArchives(left.username_chesscom, mode, 3),
    fetchRecentArchives(right.username_chesscom, mode, 3),
  ]);
  const leftH2h = summarizeHeadToHead(leftGames, left.username_chesscom, right.username_chesscom);
  const rightH2h = summarizeHeadToHead(rightGames, right.username_chesscom, left.username_chesscom);
  const best = Number(leftRating.rating || 0) === Number(rightRating.rating || 0) ? '' : (Number(leftRating.rating || 0) > Number(rightRating.rating || 0) ? 'left' : 'right');

  const openingMarkup = (items) => items.length
    ? items.map((entry) => `<li class="opening-item"><span class="opening-name">${escapeHtml(shortOpening(entry.opening, 44))}</span><span class="opening-count">${entry.count}</span></li>`).join('')
    : '<li class="opening-item"><span class="opening-name">—</span></li>';

  const h2hMarkup = leftH2h.total === 0 && rightH2h.total === 0
    ? '<p class="empty-state">Aucune confrontation ce mois.</p>'
    : `
      <table class="compare-h2h-table">
        <thead><tr><th>Joueur</th><th>V</th><th>N</th><th>D</th><th>Total</th></tr></thead>
        <tbody>
          <tr><td>${escapeHtml(left.display_name)}</td><td>${leftH2h.win}</td><td>${leftH2h.draw}</td><td>${leftH2h.loss}</td><td>${leftH2h.total}</td></tr>
          <tr><td>${escapeHtml(right.display_name)}</td><td>${rightH2h.win}</td><td>${rightH2h.draw}</td><td>${rightH2h.loss}</td><td>${rightH2h.total}</td></tr>
        </tbody>
      </table>`;

  const markup = `
    <div class="compare-grid-2">
      <article class="compare-card ${best === 'left' ? 'is-best' : ''}" data-player="${left.id}" tabindex="0">
        <div class="compare-player-head">
          ${avatarMarkup(leftProfile?.avatar, left.display_name, left.username_chesscom)}
          <div><p class="player-name">${escapeHtml(left.display_name)}</p><p class="player-username">@${escapeHtml(left.username_chesscom)}</p></div>
          <p class="compare-player-elo">${Number(leftRating.rating || 0)}</p>
        </div>
      </article>
      <article class="compare-card ${best === 'right' ? 'is-best' : ''}" data-player="${right.id}" tabindex="0">
        <div class="compare-player-head">
          ${avatarMarkup(rightProfile?.avatar, right.display_name, right.username_chesscom)}
          <div><p class="player-name">${escapeHtml(right.display_name)}</p><p class="player-username">@${escapeHtml(right.username_chesscom)}</p></div>
          <p class="compare-player-elo">${Number(rightRating.rating || 0)}</p>
        </div>
      </article>
    </div>
    <div class="compare-grid-2">
      <article class="compare-card"><p class="section-label">Progression mensuelle</p>${progressBadge(leftProgress, leftCtx.isInactive)}</article>
      <article class="compare-card"><p class="section-label">Progression mensuelle</p>${progressBadge(rightProgress, rightCtx.isInactive)}</article>
    </div>
    <article class="compare-chart-wrap">
      <p class="section-label">Évolution Elo (3 mois)</p>
      ${buildComparisonChart(leftTrend, rightTrend, left, right)}
    </article>
    <div class="compare-grid-2">
      <article class="compare-card"><p class="section-label">Ouvertures préférées · ${escapeHtml(left.display_name)}</p><ul class="opening-list">${openingMarkup(leftOpenings)}</ul></article>
      <article class="compare-card"><p class="section-label">Ouvertures préférées · ${escapeHtml(right.display_name)}</p><ul class="opening-list">${openingMarkup(rightOpenings)}</ul></article>
    </div>
    <article class="compare-card">
      <p class="section-label">Face-à-face (mois en cours)</p>
      ${h2hMarkup}
    </article>
  `;

  state.compare.data = { markup };
  state.compare.loading = false;
  renderCompareModal();
}

function getMergedRows() {
  return state.players.map((p, index) => {
    const ratingData = state.ratingsByUser.get(p.username_chesscom) || {
      rating: 0,
      games: 0,
    };
    const profile = state.profilesByUser.get(p.username_chesscom) || {};
    const ctx = state.monthlyContextByUser.get(p.username_chesscom) || {
      referenceRating: null,
      isInactive: true,
    };
    const monthlyProgress = computeMonthlyProgress(p.username_chesscom, ratingData.rating);
    const lastGame = state.lastGameByUser.get(p.username_chesscom) || null;

    return {
      ...p,
      ...ratingData,
      ...profile,
      referenceRating: ctx.referenceRating,
      isInactive: ctx.isInactive,
      monthlyProgress,
      lastGame,
      baseRank: state.baseOrderByUser.get(p.username_chesscom) || index + 1,
    };
  });
}

function compareValues(a, b, key) {
  if (key === 'player') return a.display_name.localeCompare(b.display_name, 'fr');
  if (key === 'rank') return a.baseRank - b.baseRank;
  if (key === 'monthlyProgress') {
    // Les inactifs vont en dernier lors du tri par progression
    if (a.isInactive && !b.isInactive) return 1;
    if (!a.isInactive && b.isInactive) return -1;
    return Number(a.monthlyProgress || 0) - Number(b.monthlyProgress || 0);
  }
  if (key === 'referenceRating') {
    // Les références non disponibles vont en dernier
    if (a.referenceRating === null && b.referenceRating !== null) return 1;
    if (a.referenceRating !== null && b.referenceRating === null) return -1;
    return Number(a.referenceRating || 0) - Number(b.referenceRating || 0);
  }
  if (['rating', 'games'].includes(key)) return Number(a[key] || 0) - Number(b[key] || 0);
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

  // Ordre d'affichage visuel : 2 - 1 - 3
  const displayOrder = [1, 0, 2];
  const rankLabels = { 0: '🥇', 1: '🥈', 2: '🥉' };
  const rankNumbers = { 0: '1', 1: '2', 2: '3' };

  const topProgressUser = rows
    .filter((r) => !r.isInactive && typeof r.monthlyProgress === 'number')
    .sort((a, b) => Number(b.monthlyProgress || 0) - Number(a.monthlyProgress || 0))[0]?.username_chesscom;

  els.topThree.innerHTML = displayOrder
    .map((topIndex) => {
      const player = top3[topIndex];
      if (!player) return '';
      const rank = topIndex + 1;
      const avatar = avatarMarkup(player.avatar, player.display_name, player.username_chesscom);
      const progHtml = progressBadge(player.monthlyProgress, player.isInactive);
      const badges = computeBadges(player, {
        isLeader: rank === 1,
        isTopProgress: player.username_chesscom === topProgressUser,
      });
      const badgesHtml = badges.length
        ? `<p class="badges-line">${badges.map((b) => `<span class="badge-pill">${escapeHtml(b)}</span>`).join('')}</p>`
        : '';

      return `
        <div class="podium-col rank-${rank}">
          <article class="podium-card" data-player="${player.id}">
            <span class="podium-badge">${rankLabels[topIndex]} #${rank}</span>
            ${avatar}
            <p class="player-name">${player.display_name}</p>
            <p class="player-username">@${player.username_chesscom}</p>
            <p class="player-rating">${player.rating} Elo</p>
            <p class="player-submetric">${progHtml} · ${player.games || 0} parties</p>
            ${badgesHtml}
          </article>
          <div class="podium-step" aria-hidden="true">
            <span class="podium-rank-label">${rankNumbers[topIndex]}</span>
          </div>
        </div>
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
  updateRewardInsights();

  if (!rows.length) {
    els.rankingList.innerHTML = '<p class="empty-state">Aucun joueur actif pour ce filtre.</p>';
    return;
  }

  const topProgressUser = rows
    .filter((r) => !r.isInactive && typeof r.monthlyProgress === 'number')
    .sort((a, b) => Number(b.monthlyProgress || 0) - Number(a.monthlyProgress || 0))[0]?.username_chesscom;

  els.rankingList.innerHTML = rows
    .map((row, idx) => {
      const rank = idx + 1;
      const shift = state.rankingDeltaByUser.get(row.username_chesscom) || 0;
      const shiftClass = shift > 0 ? 'rank-up' : shift < 0 ? 'rank-down' : '';
      const avatar = avatarMarkup(row.avatar, row.display_name, row.username_chesscom);
      const badges = computeBadges(row, {
        isLeader: rank === 1,
        isTopProgress: row.username_chesscom === topProgressUser,
      });
      const badgesHtml = badges.length
        ? `<p class="badges-line">${badges.map((b) => `<span class="badge-pill">${escapeHtml(b)}</span>`).join('')}</p>`
        : '';
      return `
        <article class="ranking-card ${shiftClass}" data-player="${row.id}" tabindex="0" role="button" aria-label="Voir détails ${row.display_name}">
          <p class="rank">${rankMedal(rank) || '#' + rank}</p>
          <div class="player-line">${avatar}<div><p class="player-name">${row.display_name}</p><p class="player-username">@${row.username_chesscom}</p>${badgesHtml}</div></div>
          <p class="player-rating">${row.rating} Elo</p>
          <p class="peak-wrap">${row.referenceRating ?? '—'}</p>
          <p class="peak-progress">${progressBadge(row.monthlyProgress, row.isInactive)}</p>
          <p class="matches-count">${row.games || 0}</p>
          <div class="last-game-cell">${lastGameMarkup(row.lastGame)}</div>
        </article>
      `;
    })
    .join('');
  renderClubStats();
}

function setOffline(isOffline) {
  state.isOffline = isOffline;
  els.offlineBanner.classList.toggle('hidden', !isOffline);
}

async function refreshRatings() {
  const prevRatings = new Map(state.ratingsByUser);
  const prevBaseOrder = new Map(state.baseOrderByUser);
  const tasks = state.players.map(async (player) => {
    try {
      const [ratingData, profile, monthlyCtx] = await Promise.all([
        fetchPlayerStats(player.username_chesscom, state.mode),
        fetchPlayerProfile(player.username_chesscom),
        fetchMonthlyContext(player.username_chesscom, state.mode, buildRefOptions()),
      ]);
      const monthlyGames = await fetchMonthlyGames(
        player.username_chesscom,
        monthlyCtx?.currentGames?.length ? monthlyCtx.currentGames : null,
        state.mode,
      );
      state.ratingsByUser.set(player.username_chesscom, ratingData);
      state.profilesByUser.set(player.username_chesscom, profile || {});
      state.monthlyContextByUser.set(player.username_chesscom, monthlyCtx);
      state.lastGameByUser.set(player.username_chesscom, monthlyGames[0] || null);
    } catch {
      // joueur ignoré sans bloquer les autres
    }
    renderRanking(); // rendu incrémental après chaque joueur
  });
  await Promise.allSettled(tasks);

  const baseline = getMergedRows().sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  const newBaseOrder = new Map();
  baseline.forEach((row, idx) => state.baseOrderByUser.set(row.username_chesscom, idx + 1));
  baseline.forEach((row, idx) => newBaseOrder.set(row.username_chesscom, idx + 1));

  const newEvents = buildActivityEvents(prevRatings, prevBaseOrder, newBaseOrder, state.mode);
  newEvents.forEach((event) => {
    const head = state.activityLog[0];
    const isDuplicateConsecutive = head
      && head.username === event.username
      && head.type === event.type
      && Number(head.delta || 0) === Number(event.delta || 0);
    if (!isDuplicateConsecutive) state.activityLog.unshift(event);
  });
  state.activityLog = state.activityLog.slice(0, 20);

  renderRanking();
  renderActivityFeed();
}

async function loadSharedData({ forceRefresh = false } = {}) {
  if (forceRefresh) clearCache();
  setStatus('info', 'Synchronisation Supabase en cours...');
  els.rankingList.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

  const [
    { data: players, error: playersError },
    { data: settingsRows, error: settingError },
    { data: matchesRows, error: matchesError },
    { data: tournamentsRows, error: tournamentsError },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('is_active', true).order('created_at', { ascending: true }),
    supabase.from('app_settings').select('key, value').in('key', [
      'top_limit',
      'reward_top_amount',
      'reward_progress_amount',
      'reward_next_at',
      'reward_is_frozen',
      'reward_frozen_at',
      'reward_top_winner_username',
      'reward_top_winner_name',
      'reward_top_winner_rating',
      'reward_progress_winner_username',
      'reward_progress_winner_name',
      'reward_progress_winner_value',
      'ref_date_mode',
      'ref_date_start',
      'ref_date_end',
    ]),
    supabase.from('club_matches').select('*').order('match_date', { ascending: false }),
    supabase.from('club_tournaments').select('*').order('tournament_date', { ascending: false }),
  ]);

  if (playersError || settingError || matchesError || tournamentsError) {
    const msg = playersError?.message || settingError?.message || matchesError?.message || tournamentsError?.message || 'Erreur inconnue';
    setStatus('error', `Supabase indisponible: ${msg}`);
    setOffline(true);
    return;
  }

  state.players = players;
  state.matches = matchesRows || [];
  state.tournaments = tournamentsRows || [];
  const settingsMap = new Map((settingsRows || []).map((row) => [row.key, row.value]));
  state.topLimit = Number(settingsMap.get('top_limit') || 20);
  state.rewardSettings = parseRewardSettings(settingsRows || []);
  state.refDateMode = settingsMap.get('ref_date_mode') || 'auto';
  state.refDateStart = settingsMap.get('ref_date_start') || '';
  state.refDateEnd = settingsMap.get('ref_date_end') || '';

  els.topLimitInput.value = String(state.topLimit);
  if (els.rewardTopAmountInput) els.rewardTopAmountInput.value = String(state.rewardSettings.topAmount);
  if (els.rewardProgressAmountInput) els.rewardProgressAmountInput.value = String(state.rewardSettings.progressAmount);
  if (els.rewardNextAtInput) els.rewardNextAtInput.value = toDatetimeLocalValue(state.rewardSettings.nextRewardAt);
  renderRefDateModeUi();

  await refreshRatings();
  await refreshRewardCandidates();
  await freezeRewardWinnersIfNeeded();
  await refreshRewardCandidates();
  updateRewardInsights();
  renderAdminPlayers();
  renderMatches();
  renderTournaments();
  setOffline(false);
  const now = new Date();
  els.lastSync.textContent = `Sync ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  setStatus('success', `${sortedRows().length} joueurs synchronisés.`);
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
  const optionMarkup = state.players
    .map((p) => `<option value="${escapeHtml(p.username_chesscom)}">${escapeHtml(p.display_name)} (@${escapeHtml(p.username_chesscom)})</option>`)
    .join('');
  if (els.matchPlayer1) els.matchPlayer1.innerHTML = optionMarkup;
  if (els.matchPlayer2) els.matchPlayer2.innerHTML = optionMarkup;
  if (els.matchPlayer2 && state.players[1]) els.matchPlayer2.value = state.players[1].username_chesscom;
  renderAdminMatches();
  renderAdminTournaments();
}

function playerByUsername(username) {
  return state.players.find((p) => p.username_chesscom === username);
}

function renderMatches() {
  if (!els.matchesSection) return;
  if (!state.matches.length) {
    els.matchesSection.innerHTML = '<p class="empty-state">Aucun ring chess annoncé.</p>';
    return;
  }
  els.matchesSection.innerHTML = state.matches.map((match) => {
    const p1 = playerByUsername(match.player1_username);
    const p2 = playerByUsername(match.player2_username);
    const profile1 = state.profilesByUser.get(match.player1_username) || {};
    const profile2 = state.profilesByUser.get(match.player2_username) || {};
    const liveStatus = match.status === 'upcoming' && new Date(match.match_date).getTime() <= Date.now() ? 'ongoing' : match.status;
    const countdown = liveStatus === 'upcoming' ? countdownText(match.match_date) : '';
    return `
      <article class="event-card">
        <div class="match-line">
          <div class="match-player" data-player="${p1?.id || ''}">
            ${avatarMarkup(profile1.avatar, p1?.display_name || match.player1_username, match.player1_username)}
            <div><p class="player-name">${escapeHtml(p1?.display_name || match.player1_username)}</p><p class="player-username">@${escapeHtml(match.player1_username)}</p></div>
          </div>
          <p class="match-vs">🥊 VS 🥊</p>
          <div class="match-player" data-player="${p2?.id || ''}">
            ${avatarMarkup(profile2.avatar, p2?.display_name || match.player2_username, match.player2_username)}
            <div><p class="player-name">${escapeHtml(p2?.display_name || match.player2_username)}</p><p class="player-username">@${escapeHtml(match.player2_username)}</p></div>
          </div>
        </div>
        <div class="event-meta">
          <span class="status-pill ${liveStatus}">${statusLabel(liveStatus)}</span>
          <span>${escapeHtml(match.format)}</span>
          <span>${formatDateFr(match.match_date)}</span>
          ${countdown ? `<span>${countdown}</span>` : ''}
        </div>
        ${liveStatus === 'completed' && match.result ? `<p class="event-result">${escapeHtml(match.result)}</p>` : ''}
      </article>`;
  }).join('');
}

function renderTournaments() {
  if (!els.tournamentsSection) return;
  if (!state.tournaments.length) {
    els.tournamentsSection.innerHTML = '<p class="empty-state">Aucun tournoi annoncé.</p>';
    return;
  }
  els.tournamentsSection.innerHTML = state.tournaments.map((tournament) => {
    const dateValue = `${tournament.tournament_date}T12:00:00Z`;
    const liveStatus = tournament.status === 'upcoming' && new Date(dateValue).getTime() <= Date.now() ? 'ongoing' : tournament.status;
    const isOnline = String(tournament.location || '').toLowerCase().includes('ligne');
    const linkLabel = String(tournament.external_link || '').toLowerCase().includes('chessresults') ? 'Voir les résultats' : 'Voir sur Chess.com';
    return `
      <article class="event-card">
        <h3>${escapeHtml(tournament.title)}</h3>
        <div class="event-meta">
          <span class="status-pill ${liveStatus}">${statusLabel(liveStatus)}</span>
          <span>${new Date(dateValue).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span>${escapeHtml(tournament.format)}</span>
          <span class="status-pill ${isOnline ? 'upcoming' : 'completed'}">${isOnline ? 'En ligne' : 'Présentiel'}</span>
          ${liveStatus === 'upcoming' ? `<span>${countdownText(dateValue)}</span>` : ''}
        </div>
        ${tournament.description ? `<p style="margin-top:8px;color:var(--text-2);">${escapeHtml(tournament.description)}</p>` : ''}
        ${tournament.external_link ? `<a class="btn btn-ghost" style="margin-top:10px;display:inline-flex;" href="${escapeHtml(tournament.external_link)}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>` : ''}
      </article>`;
  }).join('');
}

function renderAdminMatches() {
  if (!els.adminMatchList) return;
  els.adminMatchList.innerHTML = state.matches.map((match) => `
    <li class="player-item" data-id="${match.id}">
      <div>
        <strong>🥊 ${match.player1_username} vs ${match.player2_username}</strong><br>
        <small>${formatDateFr(match.match_date)} · ${match.format}</small>
      </div>
      <div class="player-actions">
        <button data-action="complete-match" data-id="${match.id}">Marquer terminé</button>
        <button class="danger" data-action="delete-match" data-id="${match.id}">Supprimer</button>
      </div>
    </li>`).join('');
}

function renderAdminTournaments() {
  if (!els.adminTournamentList) return;
  els.adminTournamentList.innerHTML = state.tournaments.map((tournament) => `
    <li class="player-item" data-id="${tournament.id}">
      <div>
        <strong>${escapeHtml(tournament.title)}</strong><br>
        <small>${tournament.tournament_date} · ${escapeHtml(tournament.format)} · ${statusLabel(tournament.status)}</small>
      </div>
      <div class="player-actions">
        <button data-action="status-tournament" data-id="${tournament.id}">Modifier le statut</button>
        <button class="danger" data-action="delete-tournament" data-id="${tournament.id}">Supprimer</button>
      </div>
    </li>`).join('');
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
  state.isAdminCollapsed = false;
  els.adminContent?.classList.remove('collapsed');
  els.adminToggle?.setAttribute('aria-expanded', 'true');
  if (els.adminToggleIcon) els.adminToggleIcon.textContent = '▾';
  els.adminPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

async function updateRewardSettings(event) {
  event.preventDefault();

  const topAmount = Number(els.rewardTopAmountInput?.value || DEFAULT_REWARD_SETTINGS.topAmount);
  const progressAmount = Number(els.rewardProgressAmountInput?.value || DEFAULT_REWARD_SETTINGS.progressAmount);
  const nextAtLocal = els.rewardNextAtInput?.value || '';
  const nextAtIso = nextAtLocal ? new Date(nextAtLocal).toISOString() : '';
  const refMode = els.refDateModeRadios.find((radio) => radio.checked)?.value || 'auto';
  const refStart = refMode === 'manual' ? (els.refDateStartInput?.value || '') : '';
  const refEnd = refMode === 'manual' ? (els.refDateEndInput?.value || '') : '';

  const payload = [
    { key: 'reward_top_amount', value: String(topAmount) },
    { key: 'reward_progress_amount', value: String(progressAmount) },
    { key: 'reward_next_at', value: nextAtIso },
    { key: 'reward_is_frozen', value: '0' },
    { key: 'reward_frozen_at', value: '' },
    { key: 'reward_top_winner_username', value: '' },
    { key: 'reward_top_winner_name', value: '' },
    { key: 'reward_top_winner_rating', value: '' },
    { key: 'reward_progress_winner_username', value: '' },
    { key: 'reward_progress_winner_name', value: '' },
    { key: 'reward_progress_winner_value', value: '' },
    { key: 'ref_date_mode', value: refMode },
    { key: 'ref_date_start', value: refStart },
    { key: 'ref_date_end', value: refEnd },
  ];

  const { error } = await supabase.from('app_settings').upsert(payload);
  if (error) {
    setAdminStatus('error', `Mise à jour récompenses refusée: ${error.message}`);
    return;
  }

  state.rewardSettings = {
    ...state.rewardSettings,
    topAmount,
    progressAmount,
    nextRewardAt: nextAtIso,
    isFrozen: false,
    frozenAt: '',
    topWinnerUsername: '',
    topWinnerName: '',
    topWinnerRating: '',
    progressWinnerUsername: '',
    progressWinnerName: '',
    progressWinnerValue: '',
  };
  state.refDateMode = refMode;
  state.refDateStart = refStart;
  state.refDateEnd = refEnd;
  renderRefDateModeUi();
  await refreshRewardCandidates();
  updateRewardInsights();
  setAdminStatus('success', 'Paramètres des récompenses mis à jour.');
  toast('Récompenses mises à jour.', 'success');
}

async function addMatch(event) {
  event.preventDefault();
  const player1 = document.getElementById('match-player1')?.value || '';
  const player2 = document.getElementById('match-player2')?.value || '';
  const matchDateRaw = document.getElementById('match-datetime')?.value || '';
  const format = document.getElementById('match-format')?.value?.trim() || '';
  if (!player1 || !player2 || player1 === player2 || !matchDateRaw || !format) {
    setAdminStatus('error', 'Veuillez remplir correctement le formulaire de ring chess.');
    return;
  }
  const { error } = await supabase.from('club_matches').insert({
    player1_username: player1,
    player2_username: player2,
    match_date: new Date(matchDateRaw).toISOString(),
    format,
    status: 'upcoming',
  });
  if (error) {
    setAdminStatus('error', `Annonce ring chess refusée: ${error.message}`);
    return;
  }
  setAdminStatus('success', 'Ring chess annoncé.');
  event.target.reset();
}

async function addTournament(event) {
  event.preventDefault();
  const title = document.getElementById('tournament-title')?.value?.trim() || '';
  const tournament_date = document.getElementById('tournament-date')?.value || '';
  const format = document.getElementById('tournament-format')?.value?.trim() || '';
  const location = document.getElementById('tournament-location')?.value?.trim() || '';
  const description = document.getElementById('tournament-description')?.value?.trim() || null;
  const external_link = document.getElementById('tournament-link')?.value?.trim() || null;
  const status = document.getElementById('tournament-status')?.value || 'upcoming';
  if (!title || !tournament_date || !format || !location) {
    setAdminStatus('error', 'Veuillez remplir les champs requis du tournoi.');
    return;
  }
  const { error } = await supabase.from('club_tournaments').insert({
    title,
    tournament_date,
    format,
    location,
    description,
    external_link,
    status,
  });
  if (error) {
    setAdminStatus('error', `Annonce tournoi refusée: ${error.message}`);
    return;
  }
  setAdminStatus('success', 'Tournoi annoncé.');
  event.target.reset();
}

function playerById(id) {
  return state.players.find((p) => p.id === Number(id));
}

async function showPlayerModal(id, mode = state.mode) {
  const player = playerById(id);
  if (!player) return;

  const requestId = ++state.playerModalRequestId;
  state.playerModalMode = mode;

  const isRankingMode = mode === state.mode;
  const ratingData = isRankingMode
    ? (state.ratingsByUser.get(player.username_chesscom) || { rating: 0, games: 0 })
    : await fetchPlayerStats(player.username_chesscom, mode);
  const profile = state.profilesByUser.get(player.username_chesscom) || {};
  const ctx = isRankingMode
    ? (state.monthlyContextByUser.get(player.username_chesscom) || { referenceRating: null, isInactive: true, currentGames: [] })
    : await fetchMonthlyContext(player.username_chesscom, mode, buildRefOptions());
  const monthlyProgress = computeMonthlyProgress(player.username_chesscom, ratingData.rating);
  const rank = sortedRows().findIndex((item) => item.id === player.id) + 1;
  const modalRows = sortedRows();
  const modalTopProgressUser = modalRows
    .filter((r) => !r.isInactive && typeof r.monthlyProgress === 'number')
    .sort((a, b) => Number(b.monthlyProgress || 0) - Number(a.monthlyProgress || 0))[0]?.username_chesscom;
  const modalBadges = computeBadges({
    ...player,
    ...ratingData,
    monthlyProgress: isRankingMode ? monthlyProgress : (ctx.isInactive || ctx.referenceRating === null ? null : ratingData.rating - ctx.referenceRating),
    isInactive: ctx.isInactive,
  }, {
    isLeader: rank === 1,
    isTopProgress: player.username_chesscom === modalTopProgressUser,
  });
  const modalBadgesHtml = modalBadges.length
    ? `<p class="badges-line">${modalBadges.map((b) => `<span class="badge-pill">${escapeHtml(b)}</span>`).join('')}</p>`
    : '';

  els.playerModalBody.innerHTML = '<p class="status info">Chargement du profil…</p>';
  if (!els.playerModal.open) els.playerModal.showModal();

  // Réutilise les parties déjà chargées si disponibles
  const games = await fetchMonthlyGames(
    player.username_chesscom,
    ctx.currentGames?.length ? ctx.currentGames : null,
    mode,
  );

  if (requestId !== state.playerModalRequestId) return;

  const openings = topOpeningsFromGames(games);

  const openerRows = openings.length
    ? openings.map((entry) => `
        <li class="opening-item">
          <span class="opening-name" title="${entry.opening}">${shortOpening(entry.opening)}</span>
          <span class="opening-count">${entry.count}</span>
        </li>`)
      .join('')
    : '<li class="opening-item"><span class="opening-name">—</span></li>';

  const gameCards = games.length
    ? games.map((game) => {
        const kind = classifyResult(game.result);
        const labelMap = { win: 'Victoire', draw: 'Nulle', loss: 'Défaite' };
        const label = labelMap[kind];
        const oppAvatar = avatarMarkup(game.opponentAvatar, game.opponent, game.opponent, 'opp-avatar');
        const colorDot = game.color === 'white'
          ? '<span class="color-dot white" title="Blancs"></span>'
          : '<span class="color-dot black" title="Noirs"></span>';
        return `
          <article class="game-pill result-${kind}">
            <span class="result-stripe"></span>
            <div class="game-pill-left">
              ${oppAvatar}
              <div class="game-pill-info">
                <p class="game-opponent">${game.opponent}</p>
                <p class="game-meta">${game.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} ${colorDot}</p>
              </div>
            </div>
            <div class="game-pill-right">
              <span class="result-tag result-${kind}">${label}</span>
              ${ratingDiffBadge(game.ratingDiff)}
            </div>
          </article>`;
      }).join('')
    : '<p class="empty-state">Aucune partie ce mois.</p>';

  const avatar = avatarMarkup(profile.avatar, player.display_name, player.username_chesscom, 'avatar-xl');

  // Ligne de référence mensuelle dans les stats
  const refLabel = ctx.isInactive
    ? 'Inactif'
    : (ctx.referenceRating ? `Réf. ${ctx.referenceRating}` : '—');

  const adminActions = state.session
    ? `<div class="modal-actions" style="margin-top:20px;">
        <button id="share-player-btn" class="btn btn-ghost" type="button" data-username="${player.username_chesscom}">🔗 Partager</button>
        <button id="edit-player-btn" class="btn btn-violet" type="button" data-player="${player.id}">Modifier</button>
        <button id="delete-player-btn" class="btn btn-ghost" type="button" data-player="${player.id}">Désactiver</button>
      </div>`
    : `<div class="modal-actions" style="margin-top:20px;">
        <button id="share-player-btn" class="btn btn-ghost" type="button" data-username="${player.username_chesscom}">🔗 Partager</button>
      </div>`;

  els.playerModalBody.innerHTML = `
    <div class="profile-hero">
      ${avatar}
      <div class="profile-hero-info">
        <p class="player-name">${player.display_name}</p>
        <p class="player-username">@${player.username_chesscom}</p>
        ${modalBadgesHtml}
        <p class="meta-sub">${rank ? `#${rank} · ` : ''}${ratingData.rating} Elo · ${MODE_LABEL[mode] || mode}</p>
      </div>
    </div>

    <div class="profile-mode-switch tabs" role="tablist" aria-label="Cadence dans le profil joueur">
      <button class="tab ${mode === 'rapid' ? 'active' : ''}" type="button" data-player-mode="rapid" data-player-id="${player.id}">Rapide</button>
      <button class="tab ${mode === 'blitz' ? 'active' : ''}" type="button" data-player-mode="blitz" data-player-id="${player.id}">Blitz</button>
      <button class="tab ${mode === 'bullet' ? 'active' : ''}" type="button" data-player-mode="bullet" data-player-id="${player.id}">Bullet</button>
    </div>

    <div class="stats-grid">
      <article><p>Elo</p><strong>${ratingData.rating}</strong></article>
      <article><p>Réf. mois</p><strong>${ctx.referenceRating ?? '—'}</strong></article>
      <article><p>Progr. mois</p><strong>${progressBadge(
        isRankingMode ? monthlyProgress : (ctx.isInactive || ctx.referenceRating === null ? null : ratingData.rating - ctx.referenceRating),
        ctx.isInactive,
      )}</strong></article>
      <article><p>Parties</p><strong>${ratingData.games || 0}</strong></article>
    </div>

    <div class="profile-panels">
      <div class="panel-col panel-openings">
        <p class="panel-title">Ouvertures</p>
        <ul class="opening-list">${openerRows}</ul>
      </div>
      <div class="panel-col panel-games">
        <p class="panel-title">10 dernières parties</p>
        <div class="games-list">${gameCards}</div>
      </div>
    </div>

    ${adminActions}
  `;
  history.replaceState(null, '', `?player=${encodeURIComponent(player.username_chesscom)}`);
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

  supabase.from('players').update({
    display_name: displayName.trim(),
    club: club.trim(),
    username_chesscom: username.trim().toLowerCase(),
  }).eq('id', id).then(({ error }) => {
    if (error) { toast(`Modification refusée: ${error.message}`, 'error'); return; }
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
  if (error) { toast(`Désactivation refusée: ${error.message}`, 'error'); return; }
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

async function onAdminMatchAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === 'delete-match') {
    const { error } = await supabase.from('club_matches').delete().eq('id', id);
    if (error) toast(`Suppression impossible: ${error.message}`, 'error');
    return;
  }
  if (button.dataset.action === 'complete-match') {
    const result = window.prompt('Résultat du ring chess (ex: 1-0, 0.5-0.5)', '1-0');
    if (result === null) return;
    const { error } = await supabase.from('club_matches').update({ status: 'completed', result: result.trim() }).eq('id', id);
    if (error) toast(`Mise à jour impossible: ${error.message}`, 'error');
  }
}

async function onAdminTournamentAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === 'delete-tournament') {
    const { error } = await supabase.from('club_tournaments').delete().eq('id', id);
    if (error) toast(`Suppression impossible: ${error.message}`, 'error');
    return;
  }
  if (button.dataset.action === 'status-tournament') {
    const status = window.prompt('Nouveau statut: upcoming / ongoing / completed', 'ongoing');
    if (!status) return;
    const { error } = await supabase.from('club_tournaments').update({ status: status.trim() }).eq('id', id);
    if (error) toast(`Mise à jour impossible: ${error.message}`, 'error');
  }
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'club_matches' }, loadSharedData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'club_tournaments' }, loadSharedData)
    .subscribe();
}

function bindModalClose() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.close).close());
  });
}

function bindEvents() {
  els.refreshBtn.addEventListener('click', () => loadSharedData({ forceRefresh: true }));
  els.compareBtn?.addEventListener('click', () => {
    if (!state.players.length) {
      toast('Aucun joueur actif à comparer.', 'error');
      return;
    }
    if (!state.compare.leftId) state.compare.leftId = state.players[0]?.id || null;
    if (!state.compare.rightId) state.compare.rightId = state.players[1]?.id || state.players[0]?.id || null;
    renderCompareModal();
    els.compareModal?.showModal();
  });
  els.adminLoginBtn.addEventListener('click', () => els.loginModal.showModal());
  els.logoutBtn.addEventListener('click', logoutAdmin);
  els.adminToggle.addEventListener('click', toggleAdminPanel);
  els.loginForm.addEventListener('submit', loginAdmin);
  els.addPlayerForm.addEventListener('submit', addPlayer);
  els.addMatchForm?.addEventListener('submit', addMatch);
  els.addTournamentForm?.addEventListener('submit', addTournament);
  els.topLimitForm.addEventListener('submit', updateTopLimit);
  els.rewardSettingsForm?.addEventListener('submit', updateRewardSettings);
  els.refDateModeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      state.refDateMode = radio.value;
      renderRefDateModeUi();
    });
  });

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
  els.adminMatchList?.addEventListener('click', onAdminMatchAction);
  els.adminTournamentList?.addEventListener('click', onAdminTournamentAction);
  els.matchesSection?.addEventListener('click', (event) => {
    const node = event.target.closest('[data-player]');
    if (!node) return;
    const id = Number(node.dataset.player);
    if (id) showPlayerModal(id);
  });
  els.activityFeed?.addEventListener('click', (event) => {
    const node = event.target.closest('[data-player]');
    if (!node) return;
    const id = Number(node.dataset.player);
    if (id) showPlayerModal(id);
  });
  els.playerModalBody.addEventListener('click', (event) => {
    const edit = event.target.closest('#edit-player-btn');
    const remove = event.target.closest('#delete-player-btn');
    const share = event.target.closest('#share-player-btn');
    const modeButton = event.target.closest('[data-player-mode]');
    if (modeButton) {
      const targetMode = modeButton.dataset.playerMode;
      const playerId = Number(modeButton.dataset.playerId);
      if (targetMode && playerId && targetMode !== state.playerModalMode) {
        showPlayerModal(playerId, targetMode);
      }
    }
    if (edit) openEditPrompt(Number(edit.dataset.player));
    if (remove) askDeactivate(Number(remove.dataset.player));
    if (share) {
      const username = share.dataset.username;
      const url = `${window.location.origin}${window.location.pathname}?player=${encodeURIComponent(username || '')}`;
      navigator.clipboard.writeText(url).then(() => toast('Lien copié !', 'success')).catch(() => toast('Impossible de copier le lien.', 'error'));
    }
  });
  els.compareModalBody?.addEventListener('change', (event) => {
    const leftSelect = event.target.closest('#compare-left-select');
    const rightSelect = event.target.closest('#compare-right-select');
    if (leftSelect) state.compare.leftId = Number(leftSelect.value);
    if (rightSelect) state.compare.rightId = Number(rightSelect.value);
  });
  els.compareModalBody?.addEventListener('click', async (event) => {
    const run = event.target.closest('#compare-run-btn');
    const modeButton = event.target.closest('[data-compare-mode]');
    const playerCard = event.target.closest('[data-player]');
    if (playerCard) {
      showPlayerModal(Number(playerCard.dataset.player));
      return;
    }
    if (modeButton) {
      const targetMode = modeButton.dataset.compareMode;
      if (targetMode && targetMode !== state.compare.mode) {
        state.compare.mode = targetMode;
        await runCompareAnalysis();
      }
      return;
    }
    if (run) {
      await runCompareAnalysis();
    }
  });
  els.confirmForm.addEventListener('submit', confirmDeactivate);

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    updateAdminUi();
  });

  els.playerModal.addEventListener('close', () => {
    history.replaceState(null, '', window.location.pathname);
  });

  bindModalClose();
}

async function bootstrap() {
  renderRandomQuote();
  bindEvents();
  installAvatarFallbackHandler();
  initTabs();
  await ensureSession();
  await loadSharedData();
  const params = new URLSearchParams(window.location.search);
  const playerUsername = params.get('player');
  if (playerUsername) {
    const target = state.players.find((p) => p.username_chesscom === playerUsername.toLowerCase());
    if (target) await showPlayerModal(target.id);
  }
  subscribeRealtime();
  if (state.countdownTimer) window.clearInterval(state.countdownTimer);
  state.countdownTimer = window.setInterval(() => {
    renderMatches();
    renderTournaments();
  }, 30000);
  if (state.activityTimer) window.clearInterval(state.activityTimer);
  state.activityTimer = window.setInterval(() => {
    renderActivityFeed();
  }, 60000);
  window.setInterval(async () => {
    await refreshRewardCandidates();
    await freezeRewardWinnersIfNeeded();
    await refreshRewardCandidates();
    updateRewardInsights();
  }, 60000);
}


bootstrap();
