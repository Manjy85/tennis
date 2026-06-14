import { loadAppConfig, saveAppConfig, loadAllTournaments, loadTournament, saveTournament } from './firebase.js';

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

function makeDefaultResults(rounds) {
  const r = {};
  rounds.forEach((round, i) => { r[`round${i}`] = Array(round.matches).fill(null); });
  return r;
}

export const state = {
  currentTournamentId: null,
  tournamentName: '',
  tournamentList: [],
  initialPlayers: [...defaultInitialPlayers],
  rounds: defaultRounds.map(r => ({ ...r })),
  officialResults: makeDefaultResults(defaultRounds),
  players: [],
  playerMeta: {}
};

export const uiState = {
  measuredMatchHeight: 70,
  measuredRoundWidths: [],
  hiddenRounds: new Set()
};

export async function loadState() {
  const [appConfig, allTournaments] = await Promise.all([loadAppConfig(), loadAllTournaments()]);
  state.tournamentList = allTournaments.map(t => ({ id: t.id, name: t.name || t.id }));

  const activeId = (appConfig.activeTournamentId && allTournaments.find(t => t.id === appConfig.activeTournamentId))
    ? appConfig.activeTournamentId
    : (allTournaments.length > 0 ? allTournaments[0].id : null);

  if (activeId) {
    await switchTournament(activeId);
  } else {
    ensurePlayerMeta();
  }
}

export async function switchTournament(id) {
  const data = await loadTournament(id);
  if (!data) return;
  state.currentTournamentId = id;
  state.tournamentName = data.name || id;
  state.initialPlayers = data.rg_initialPlayers || [...defaultInitialPlayers];
  state.rounds = data.rg_rounds || defaultRounds.map(r => ({ ...r }));
  state.officialResults = data.rg_results || makeDefaultResults(state.rounds);
  state.players = data.rg_players || [];
  state.playerMeta = data.rg_playerMeta || {};
  ensurePlayerMeta();
  saveAppConfig({ activeTournamentId: id }).catch(() => {});
}

export async function createTournament(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const id = `${slug}-${Date.now()}`;
  const rounds = defaultRounds.map(r => ({ ...r }));
  await saveTournament(id, {
    name,
    createdAt: new Date().toISOString(),
    rg_initialPlayers: Array(16).fill('').map((_, i) => `Joueur ${i + 1}`),
    rg_rounds: rounds,
    rg_results: makeDefaultResults(rounds),
    rg_players: [],
    rg_playerMeta: {}
  });
  state.tournamentList.push({ id, name });
  await switchTournament(id);
  return id;
}

export function save() {
  if (!state.currentTournamentId) return;
  saveTournament(state.currentTournamentId, {
    name: state.tournamentName,
    rg_initialPlayers: state.initialPlayers,
    rg_rounds: state.rounds,
    rg_results: state.officialResults,
    rg_players: state.players,
    rg_playerMeta: state.playerMeta
  }).catch(err => console.error('Erreur sauvegarde Firestore:', err));
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
