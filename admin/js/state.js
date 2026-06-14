import { loadConfig, saveConfig, loadAllTournaments, loadTournament, saveTournament } from './firebase.js';

const defaultRounds = [
  { name: 'Huitiemes',  matches: 8, points: 6  },
  { name: 'Quarts',     matches: 4, points: 10 },
  { name: 'Demis',      matches: 2, points: 15 },
  { name: 'Finale',     matches: 1, points: 40 },
];

export const state = {
  currentTournamentId: null,
  tournamentName: '',
  tournamentList: [],
  // Prono Tableau
  initialPlayers: [],
  rounds: [],
  officialResults: {},
  rg_players: [],
  playerMeta: {},
  // Prono Match
  format: 'bo3',
  matches: [],
  pm_players: [],
};

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
  state.tournamentName = data.name || id;
  // Prono Tableau
  state.initialPlayers  = data.rg_initialPlayers || Array(16).fill('').map((_, i) => `Joueur ${i + 1}`);
  state.rounds          = data.rg_rounds         || defaultRounds.map(r => ({ ...r }));
  state.officialResults = data.rg_results        || makeDefaultResults(state.rounds);
  state.rg_players      = data.rg_players        || [];
  state.playerMeta      = data.rg_playerMeta     || {};
  // Prono Match
  state.format     = data.pm_format  || 'bo3';
  state.matches    = data.pm_matches || [];
  state.pm_players = data.pm_players || [];
  saveConfig({ activeTournamentId: id }).catch(() => {});
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
    rg_playerMeta: {},
    pm_format: 'bo3',
    pm_matches: [],
    pm_players: [],
  });
  state.tournamentList.push({ id, name });
  await switchTournament(id);
  return id;
}

export function saveTableau() {
  if (!state.currentTournamentId) return;
  saveTournament(state.currentTournamentId, {
    name: state.tournamentName,
    rg_initialPlayers: state.initialPlayers,
    rg_rounds: state.rounds,
    rg_results: state.officialResults,
    rg_players: state.rg_players,
    rg_playerMeta: state.playerMeta,
  }).catch(console.error);
}

export function savePmMatch() {
  if (!state.currentTournamentId) return;
  saveTournament(state.currentTournamentId, {
    pm_format:  state.format,
    pm_matches: state.matches,
    pm_players: state.pm_players,
  }).catch(console.error);
}

function makeDefaultResults(rounds) {
  const r = {};
  rounds.forEach((round, i) => { r[`round${i}`] = Array(round.matches).fill(null); });
  return r;
}

export function ensurePlayerMeta() {
  const next = {};
  state.initialPlayers.forEach(name => {
    if (!name) return;
    const existing = state.playerMeta[name] || {};
    next[name] = { seed: existing.seed || '', nat: existing.nat || '' };
  });
  state.playerMeta = next;
}
