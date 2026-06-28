import {
  loadConfig, loadAllTournaments, loadTournament,
  loadTableauPreds, saveMyTableauPred, loadMatchPreds, saveMyMatchPred,
} from './firebase.js';

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
  // Utilisateur connecté : { uid, name } | null
  me: null,
  // Prono Tableau
  initialPlayers: [],
  rounds: [],
  officialResults: {},
  tPlayers: [],     // participants tableau (chargés depuis la sous-collection)
  playerMeta: {},
  // Prono Match
  format: 'bo3',
  matches: [],
  mPlayers: [],     // participants match (chargés depuis la sous-collection)
};

export function setMe(user) {
  state.me = user ? { uid: user.uid, name: user.name } : null;
}

export function isMine(player) {
  return !!state.me && !!player && player.uid === state.me.uid;
}

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
  const [data, tableauPreds, matchPreds] = await Promise.all([
    loadTournament(id),
    loadTableauPreds(id),
    loadMatchPreds(id),
  ]);
  if (!data) return;
  state.currentTournamentId = id;
  state.tournamentName      = data.name || id;
  // Données officielles (admin)
  state.initialPlayers  = data.rg_initialPlayers || Array(16).fill('').map((_, i) => `Joueur ${i + 1}`);
  state.rounds          = data.rg_rounds         || defaultRounds.map(r => ({ ...r }));
  state.officialResults = data.rg_results        || makeDefaultResults(state.rounds);
  state.playerMeta      = data.rg_playerMeta     || {};
  state.format   = data.pm_format  || 'bo3';
  state.matches  = data.pm_matches || [];
  // Pronostics des joueurs (sous-collections, 1 doc par uid)
  state.tPlayers = tableauPreds.map(d => ({ uid: d.uid, name: d.displayName || d.uid, predictions: d.predictions || {}, locked: !!d.locked, score: 0 }));
  state.mPlayers = matchPreds.map(d => ({ uid: d.uid, name: d.displayName || d.uid, predictions: d.predictions || {}, score: 0 }));
  // Reset UI state
  uiState.measuredMatchHeight = 70;
  uiState.measuredRoundWidths = [];
  uiState.hiddenRounds = new Set();
}

// Sauvegarde le bracket tableau de l'utilisateur courant (son doc uniquement).
export function saveMyTableau(player) {
  if (!state.currentTournamentId || !player || !player.uid) return;
  saveMyTableauPred(state.currentTournamentId, player.uid, {
    displayName: player.name,
    predictions: player.predictions,
    locked: !!player.locked,
  }).catch(console.error);
}

// Sauvegarde les pronos match de l'utilisateur courant (son doc uniquement).
export function saveMyMatch(player) {
  if (!state.currentTournamentId || !player || !player.uid) return;
  saveMyMatchPred(state.currentTournamentId, player.uid, {
    displayName: player.name,
    predictions: player.predictions,
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
