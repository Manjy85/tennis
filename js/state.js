import { loadConfig, saveConfig, loadAllTournaments, loadTournament, saveTournament } from './firebase.js';

const defaultRounds = [
  { name: 'Huitièmes',    matches: 8, points: 6  },
  { name: 'Quarts',       matches: 4, points: 10 },
  { name: 'Demi-finales', matches: 2, points: 15 },
  { name: 'Finale',       matches: 1, points: 40 },
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
  // Prono Tableau
  initialPlayers: [],
  rounds: [],
  officialResults: {},
  tPlayers: [],     // participants tableau
  playerMeta: {},
  // Prono Match
  format: 'bo3',
  matches: [],
  mPlayers: [],     // participants match
};

// UI state pour le rendu bracket (dimensions auto)
export const uiState = {
  measuredMatchHeight: 70,
  measuredRoundWidths: [],
  hiddenRounds: new Set(),
};

export function getScores() {
  return state.format === 'bo5' ? ['3-0', '3-1', '3-2'] : ['2-0', '2-1'];
}

export async function loadState() {
  const [config, all] = await Promise.all([loadConfig(), loadAllTournaments()]);
  state.tournamentList = all.map(t => ({ id: t.id, name: t.name || t.id }));
  const activeId = (config.activeTournamentId && all.find(t => t.id === config.activeTournamentId))
    ? config.activeTournamentId
    : (all.length > 0 ? all[0].id : null);
  if (activeId) await switchTournament(activeId);
}

export async function switchTournament(id) {
  const data = await loadTournament(id);
  if (!data) return;
  state.currentTournamentId = id;
  state.tournamentName      = data.name || id;
  // Tableau
  state.initialPlayers  = data.rg_initialPlayers || Array(16).fill('').map((_, i) => `Joueur ${i + 1}`);
  state.rounds          = data.rg_rounds         || defaultRounds.map(r => ({ ...r }));
  state.officialResults = data.rg_results        || makeDefaultResults(state.rounds);
  state.tPlayers        = data.rg_players        || [];
  state.playerMeta      = data.rg_playerMeta     || {};
  // Match
  state.format   = data.pm_format  || 'bo3';
  state.matches  = data.pm_matches || [];
  state.mPlayers = data.pm_players || [];
  // Reset UI state
  uiState.measuredMatchHeight = 70;
  uiState.measuredRoundWidths = [];
  uiState.hiddenRounds = new Set();
  saveConfig({ activeTournamentId: id }).catch(() => {});
}

export function saveTableau() {
  if (!state.currentTournamentId) return;
  saveTournament(state.currentTournamentId, {
    name: state.tournamentName,
    rg_initialPlayers: state.initialPlayers,
    rg_rounds:         state.rounds,
    rg_results:        state.officialResults,
    rg_players:        state.tPlayers,
    rg_playerMeta:     state.playerMeta,
  }).catch(console.error);
}

export function saveMatch() {
  if (!state.currentTournamentId) return;
  saveTournament(state.currentTournamentId, {
    pm_format:  state.format,
    pm_matches: state.matches,
    pm_players: state.mPlayers,
  }).catch(console.error);
}

export function getPlayerMetaParts(name) {
  const meta = state.playerMeta[name] || {};
  return { seed: meta.seed ? String(meta.seed) : '', nat: meta.nat ? String(meta.nat) : '' };
}

export function splitDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length <= 1) return { lastName: parts[0] || '', firstName: '' };
  return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
}
