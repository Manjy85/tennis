const STORAGE_PREFIX = 'rg_live_';

const defaultInitialPlayers = [
  'Alcaraz', 'Muller', 'Rune', 'Paul',
  'Ruud', 'Fils', 'Zverev', 'Goffin',
  'Medvedev', 'Cobolli', 'Tsitsipas', 'Sinner',
  'Djokovic', 'Musetti', 'Dimitrov', 'Shelton'
];

const defaultRounds = [
  { name: 'Huitiemes', matches: 8 },
  { name: 'Quarts', matches: 4 },
  { name: 'Demis', matches: 2 },
  { name: 'Finale', matches: 1 }
];

const defaultSettings = {
  pointsWinner: 1,
  pointsExact: 3
};

function createEmptyResults(rounds) {
  const results = {};
  rounds.forEach((round, index) => {
    results[`round${index}`] = Array(round.matches).fill(null);
  });
  return results;
}

function parseScorePair(value) {
  const match = String(value || '').match(/^(\d+)-(\d+)$/);
  if (!match) return { score1: '', score2: '' };
  return { score1: match[1], score2: match[2] };
}

function normalizeOfficialEntry(entry) {
  if (!entry) return null;
  const scoreParts = entry.score1 !== undefined || entry.score2 !== undefined
    ? { score1: entry.score1 ? String(entry.score1) : '', score2: entry.score2 ? String(entry.score2) : '' }
    : parseScorePair(entry.score);
  return {
    winner: entry.winner || null,
    score: entry.score ? String(entry.score) : (scoreParts.score1 && scoreParts.score2 ? `${scoreParts.score1}-${scoreParts.score2}` : ''),
    score1: scoreParts.score1,
    score2: scoreParts.score2
  };
}

function normalizePredictionEntry(entry) {
  if (!entry) return { winner: null, score: '', score1: '', score2: '' };
  const scoreParts = entry.score1 !== undefined || entry.score2 !== undefined
    ? { score1: entry.score1 ? String(entry.score1) : '', score2: entry.score2 ? String(entry.score2) : '' }
    : parseScorePair(entry.score);
  return {
    winner: entry.winner || null,
    score: entry.score ? String(entry.score) : (scoreParts.score1 && scoreParts.score2 ? `${scoreParts.score1}-${scoreParts.score2}` : ''),
    score1: scoreParts.score1,
    score2: scoreParts.score2
  };
}

export const state = {
  initialPlayers: JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}initialPlayers`)) || defaultInitialPlayers,
  rounds: JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}rounds`)) || defaultRounds,
  officialResults: JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}results`)) || createEmptyResults(defaultRounds),
  players: JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}players`)) || [],
  playerMeta: JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}playerMeta`)) || {},
  settings: JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}settings`)) || defaultSettings
};

export const uiState = {
  measuredMatchHeight: 90,
  measuredRoundWidths: [],
  hiddenRounds: new Set()
};

export function save() {
  localStorage.setItem(`${STORAGE_PREFIX}players`, JSON.stringify(state.players));
  localStorage.setItem(`${STORAGE_PREFIX}results`, JSON.stringify(state.officialResults));
  localStorage.setItem(`${STORAGE_PREFIX}rounds`, JSON.stringify(state.rounds));
  localStorage.setItem(`${STORAGE_PREFIX}initialPlayers`, JSON.stringify(state.initialPlayers));
  localStorage.setItem(`${STORAGE_PREFIX}playerMeta`, JSON.stringify(state.playerMeta));
  localStorage.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(state.settings));
}

export function ensurePlayerMeta() {
  const nextMeta = {};
  state.initialPlayers.forEach((name) => {
    if (!name) return;
    const existing = state.playerMeta[name] || {};
    nextMeta[name] = {
      seed: existing.seed || '',
      nat: existing.nat || ''
    };
  });
  state.playerMeta = nextMeta;
}

export function ensureOfficialResults() {
  const nextResults = createEmptyResults(state.rounds);
  state.rounds.forEach((round, roundIndex) => {
    const entries = state.officialResults[`round${roundIndex}`];
    if (!Array.isArray(entries)) return;
    entries.forEach((entry, matchIndex) => {
      if (matchIndex >= round.matches) return;
      nextResults[`round${roundIndex}`][matchIndex] = normalizeOfficialEntry(entry);
    });
  });
  state.officialResults = nextResults;
}

export function ensurePlayerPredictions(player) {
  if (!player.predictions || typeof player.predictions !== 'object') player.predictions = {};
  state.rounds.forEach((round, roundIndex) => {
    const key = `round${roundIndex}`;
    const existing = player.predictions[key];
    if (!Array.isArray(existing) || existing.length !== round.matches) {
      player.predictions[key] = Array(round.matches)
        .fill(null)
        .map(() => normalizePredictionEntry(null));
      return;
    }
    player.predictions[key] = existing.map(entry => normalizePredictionEntry(entry));
  });
}

export function ensureAllPlayersPredictions() {
  state.players.forEach(ensurePlayerPredictions);
}

export function getPlayerMetaParts(name) {
  const meta = state.playerMeta[name] || {};
  return {
    seed: meta.seed ? String(meta.seed) : '',
    nat: meta.nat ? String(meta.nat) : ''
  };
}

export function splitDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length === 0) return { lastName: '', firstName: '' };
  if (parts.length === 1) return { lastName: parts[0], firstName: '' };
  return {
    lastName: parts[0],
    firstName: parts.slice(1).join(' ')
  };
}

ensurePlayerMeta();
ensureOfficialResults();
ensureAllPlayersPredictions();
