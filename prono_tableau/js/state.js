const defaultInitialPlayers = [
  'Alcaraz', 'Muller', 'Rune', 'Paul',
  'Ruud', 'Fils', 'Zverev', 'Goffin',
  'Medvedev', 'Cobolli', 'Tsitsipas', 'Sinner',
  'Djokovic', 'Musetti', 'Dimitrov', 'Shelton'
];

const defaultRounds = [
  { name: 'Huitiemes', matches: 8, points: 6 },
  { name: 'Quarts', matches: 4, points: 10 },
  { name: 'Demis', matches: 2, points: 15 },
  { name: 'Finale', matches: 1, points: 40 }
];

const defaultResults = {
  round0: Array(8).fill(null),
  round1: Array(4).fill(null),
  round2: Array(2).fill(null),
  round3: Array(1).fill(null)
};

export const state = {
  initialPlayers: JSON.parse(localStorage.getItem('rg_initialPlayers')) || defaultInitialPlayers,
  rounds: JSON.parse(localStorage.getItem('rg_rounds')) || defaultRounds,
  officialResults: JSON.parse(localStorage.getItem('rg_results')) || defaultResults,
  players: JSON.parse(localStorage.getItem('rg_players')) || [],
  playerMeta: JSON.parse(localStorage.getItem('rg_playerMeta')) || {}
};

export const uiState = {
  measuredMatchHeight: 70,
  measuredRoundWidths: [],
  hiddenRounds: new Set()
};

export function save() {
  localStorage.setItem('rg_players', JSON.stringify(state.players));
  localStorage.setItem('rg_results', JSON.stringify(state.officialResults));
  localStorage.setItem('rg_rounds', JSON.stringify(state.rounds));
  localStorage.setItem('rg_initialPlayers', JSON.stringify(state.initialPlayers));
  localStorage.setItem('rg_playerMeta', JSON.stringify(state.playerMeta));
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
