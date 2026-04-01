const CHESS_API_BASE = 'https://api.chess.com/pub/player';

function safeUsername(username) {
  return encodeURIComponent(String(username || '').trim().toLowerCase());
}

function normalizeAvatarUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return trimmed;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function fetchPlayerProfile(username) {
  if (!username) return null;
  try {
    const payload = await fetchJson(`${CHESS_API_BASE}/${safeUsername(username)}`);
    return {
      avatar: normalizeAvatarUrl(payload.avatar || payload.avatar_url || payload.image) || null,
      name: payload.name || null,
      username: payload.username || username,
      url: payload.url || null,
    };
  } catch {
    return null;
  }
}

function statKey(mode) {
  if (mode === 'blitz') return 'chess_blitz';
  if (mode === 'bullet') return 'chess_bullet';
  return 'chess_rapid';
}

function archiveUrl(username, year, month) {
  const m = String(month).padStart(2, '0');
  return `${CHESS_API_BASE}/${safeUsername(username)}/games/${year}/${m}`;
}

/**
 * Retourne { year, month } pour le mois courant et M-1.
 */
function currentAndPrevMonth() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return {
    current: { year: y, month: m },
    prev: { year: prevY, month: prevM },
  };
}

function isFirstDayOfMonthUtc(now = new Date()) {
  return now.getUTCDate() === 1;
}

/**
 * Depuis une liste de parties brutes de l'API Chess.com,
 * retourne l'Elo du joueur sur la PREMIÈRE partie dans la cadence donnée
 * (ordre chronologique ascendant → on prend index 0).
 */
function firstRatingFromGames(games, username, mode) {
  const lower = username.toLowerCase();
  const key = statKey(mode); // 'chess_rapid' | 'chess_blitz' | 'chess_bullet'
  // time_class: 'rapid' | 'blitz' | 'bullet'
  const timeClass = key.replace('chess_', '');

  const filtered = games
    .filter((g) => g.time_class === timeClass)
    .sort((a, b) => a.end_time - b.end_time); // ascendant

  if (!filtered.length) return null;

  const first = filtered[0];
  const isWhite = first.white?.username?.toLowerCase() === lower;
  const side = isWhite ? first.white : first.black;
  const rating = Number(side?.rating);
  return Number.isFinite(rating) && rating > 0 ? rating : null;
}

/**
 * Récupère les parties d'un mois donné.
 * Retourne un tableau vide en cas d'erreur (mois sans archive, 404, etc.)
 */
async function fetchArchive(username, year, month) {
  try {
    const data = await fetchJson(archiveUrl(username, year, month));
    return data.games || [];
  } catch {
    return [];
  }
}

/**
 * Calcule l'Elo de référence pour le mois courant :
 * 1. Première partie du mois courant dans la cadence → référence idéale
 * 2. Sinon : première partie de M-1 dans la cadence
 * 3. Sinon : null (joueur considéré inactif sur cette cadence)
 *
 * Retourne aussi les parties du mois courant (pour éviter un double appel dans app.js).
 */
export async function fetchMonthlyContext(username, mode) {
  if (!username) return { currentGames: [], referenceRating: null, isInactive: true };

  const { current, prev } = currentAndPrevMonth();

  // On charge le mois courant dans tous les cas (nécessaire pour les parties récentes)
  const currentGames = await fetchArchive(username, current.year, current.month);

  const shouldKeepPreviousMonthReference = isFirstDayOfMonthUtc();
  let referenceRating = null;

  if (shouldKeepPreviousMonthReference) {
    // Le 1er jour du mois, on maintient la référence de M-1
    // pour conserver la progression affichée des récompenses.
    const prevGames = await fetchArchive(username, prev.year, prev.month);
    referenceRating = firstRatingFromGames(prevGames, username, mode);
  } else {
    // Tentative 1 : Elo de la 1ère partie du mois courant
    referenceRating = firstRatingFromGames(currentGames, username, mode);

    if (referenceRating === null) {
      // Tentative 2 : Elo de la 1ère partie de M-1
      const prevGames = await fetchArchive(username, prev.year, prev.month);
      referenceRating = firstRatingFromGames(prevGames, username, mode);
    }
  }

  const isInactive = referenceRating === null;

  return { currentGames, referenceRating, isInactive };
}

export async function fetchPlayerStats(username, mode) {
  if (!username) return { rating: 0, games: 0, referenceRating: null, isInactive: true };
  try {
    const stats = await fetchJson(`${CHESS_API_BASE}/${safeUsername(username)}/stats`);
    const modeStat = stats?.[statKey(mode)] || {};
    const wins = Number(modeStat?.record?.win || 0);
    const losses = Number(modeStat?.record?.loss || 0);
    const draws = Number(modeStat?.record?.draw || 0);
    const rating = Number(modeStat?.last?.rating || 0);
    return {
      rating,
      games: wins + losses + draws,
      // referenceRating et isInactive sont calculés séparément via fetchMonthlyContext
      referenceRating: null,
      isInactive: false,
    };
  } catch {
    return { rating: 0, games: 0, referenceRating: null, isInactive: true };
  }
}

function parsePgnHeader(pgn, key) {
  const match = pgn?.match(new RegExp(`\\[${key} "([^"]+)"\\]`, 'i'));
  return match ? match[1] : null;
}

function inferOpening(game) {
  return game.eco?.includes('/openings/')
    ? game.eco.split('/openings/')[1].replaceAll('-', ' ')
    : parsePgnHeader(game.pgn, 'Opening') || 'Ouverture non disponible';
}

function formatResult(game, username) {
  const lower = username.toLowerCase();
  const isWhite = game.white?.username?.toLowerCase() === lower;
  const side = isWhite ? game.white : game.black;
  const code = side?.result || 'unknown';
  const map = {
    win: 'Victoire',
    checkmated: 'Défaite (mat)',
    resigned: 'Défaite (abandon)',
    timeout: 'Défaite (temps)',
    agreed: 'Nulle',
    repetition: 'Nulle',
    stalemate: 'Nulle',
    insufficient: 'Nulle',
    fiftymove: 'Nulle',
    timevsinsufficient: 'Nulle',
  };
  return map[code] || code;
}

function extractGames(games, username, mode = 'rapid') {
  const lower = username.toLowerCase();
  const timeClass = mode === 'blitz' ? 'blitz' : mode === 'bullet' ? 'bullet' : 'rapid';
  return games
    .filter((game) => game.time_class === timeClass)
    .sort((a, b) => new Date(b.end_time * 1000) - new Date(a.end_time * 1000))
    .slice(0, 10)
    .map((game) => {
      const isWhite = game.white?.username?.toLowerCase() === lower;
      const mySide = isWhite ? game.white : game.black;
      const opponent = isWhite ? game.black : game.white;
      return {
        date: new Date(game.end_time * 1000),
        opponent: opponent?.username || 'Inconnu',
        result: formatResult(game, username),
        color: isWhite ? 'white' : 'black',
        opponentAvatar: normalizeAvatarUrl(opponent?.avatar) || null,
        opening: inferOpening(game),
        ratingDiff: mySide?.rating && mySide?.rating_diff ? Number(mySide.rating_diff) : null,
        url: game.url || null,
      };
    });
}

/**
 * Expose les parties du mois courant formatées pour l'affichage dans le modal.
 * Réutilise currentGames déjà chargées si disponibles, sinon recharge.
 */
export async function fetchMonthlyGames(username, preloadedGames = null, mode = 'rapid') {
  if (!username) return [];
  try {
    let raw = preloadedGames;
    if (!raw) {
      const { current } = currentAndPrevMonth();
      raw = await fetchArchive(username, current.year, current.month);
    }
    return extractGames(raw, username, mode);
  } catch {
    return [];
  }
}

export function topOpeningsFromGames(games) {
  const counts = new Map();
  games.forEach((g) => {
    const name = g.opening || 'Inconnue';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([opening, count]) => ({ opening, count }));
}
