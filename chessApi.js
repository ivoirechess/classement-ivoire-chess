const CHESS_API_BASE = 'https://api.chess.com/pub/player';

function safeUsername(username) {
  return encodeURIComponent(String(username || '').trim().toLowerCase());
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
      avatar: payload.avatar || null,
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

export async function fetchPlayerStats(username, mode) {
  if (!username) return { rating: 0, games: 0, peakRating: 0, progressToPeak: 0 };
  try {
    const stats = await fetchJson(`${CHESS_API_BASE}/${safeUsername(username)}/stats`);
    const modeStat = stats?.[statKey(mode)] || {};
    const wins = Number(modeStat?.record?.win || 0);
    const losses = Number(modeStat?.record?.loss || 0);
    const draws = Number(modeStat?.record?.draw || 0);
    const rating = Number(modeStat?.last?.rating || 0);
    const peakRating = Number(modeStat?.best?.rating || rating || 0);
    return {
      rating,
      games: wins + losses + draws,
      peakRating,
      progressToPeak: rating - peakRating,
    };
  } catch {
    return { rating: 0, games: 0, peakRating: 0, progressToPeak: 0 };
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

function monthArchiveUrl(username, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${CHESS_API_BASE}/${safeUsername(username)}/games/${y}/${m}`;
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

function extractGames(games, username) {
  const lower = username.toLowerCase();
  return games
    .filter((game) => ['rapid', 'blitz', 'bullet'].includes(game.time_class))
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
        opponentAvatar: opponent?.avatar || null,
        opening: inferOpening(game),
        ratingDiff: mySide?.rating && mySide?.rating_diff ? Number(mySide.rating_diff) : null,
        url: game.url || null,
      };
    });
}

export async function fetchMonthlyGames(username) {
  if (!username) return [];
  try {
    const data = await fetchJson(monthArchiveUrl(username));
    return extractGames(data.games || [], username);
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
