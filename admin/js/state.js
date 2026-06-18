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
  state.tournamentList = all.map(t => ({
    id: t.id,
    name: t.name || t.id,
    playersCount:  (t.rg_initialPlayers || []).length,
    bracketsCount: (t.rg_players || []).length,
    matchsCount:   (t.pm_matches || []).length,
  }));
}

function refreshTournamentSummary() {
  const t = state.tournamentList.find(t => t.id === state.currentTournamentId);
  if (!t) return;
  t.name = state.tournamentName;
  t.playersCount  = state.initialPlayers.length;
  t.bracketsCount = state.rg_players.length;
  t.matchsCount   = state.matches.length;
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
  syncMatchesFromBracket();
  refreshTournamentSummary();
  saveTournament(state.currentTournamentId, {
    name: state.tournamentName,
    rg_initialPlayers: state.initialPlayers,
    rg_rounds: state.rounds,
    rg_results: state.officialResults,
    rg_players: state.rg_players,
    rg_playerMeta: state.playerMeta,
    pm_matches: state.matches,
  }).catch(console.error);
}

// Dérive state.matches du bracket : un slot stable r{round}_m{index} par match,
// inclus uniquement quand les deux joueurs sont connus. Les résultats déjà saisis
// sont conservés par id ; les joueurs/round sont resynchronisés à chaque appel.
export function syncMatchesFromBracket() {
  const prevById = {};
  state.matches.forEach(m => { prevById[m.id] = m; });

  const next = [];
  state.rounds.forEach((round, roundIndex) => {
    const roundPlayers = roundIndex === 0
      ? state.initialPlayers
      : (state.officialResults[`round${roundIndex - 1}`] || []);

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      if (!p1 || !p2) continue;
      const id = `r${roundIndex}_m${i}`;
      const prev = prevById[id];
      // On garde le résultat seulement s'il concerne toujours les mêmes joueurs.
      const keepResult = prev && prev.result && prev.player1 === p1 && prev.player2 === p2
        ? prev.result
        : null;
      next.push({ id, round: round.name, player1: p1, player2: p2, result: keepResult });
    }
  });
  state.matches = next;
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
