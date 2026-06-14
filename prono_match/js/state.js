import { loadPmConfig, savePmConfig, loadAllPmTournaments, loadPmTournament, savePmTournament } from './firebase.js';

export const state = {
  currentTournamentId: null,
  tournamentName: '',
  tournamentList: [],
  // Données prono_match
  format: 'bo3',
  matches: [],
  players: [],
  // Données prono_tableau (lecture seule, pour import)
  bracketPlayers: [],
  bracketRounds: [],
  bracketResults: {},
};

export function getScores(format) {
  return format === 'bo5' ? ['3-0', '3-1', '3-2'] : ['2-0', '2-1'];
}

export async function loadState() {
  const [config, allTournaments] = await Promise.all([loadPmConfig(), loadAllPmTournaments()]);
  state.tournamentList = allTournaments.map(t => ({ id: t.id, name: t.name || t.id }));

  const activeId = (config.activeTournamentId && allTournaments.find(t => t.id === config.activeTournamentId))
    ? config.activeTournamentId
    : (allTournaments.length > 0 ? allTournaments[0].id : null);

  if (activeId) await switchTournament(activeId);
}

export async function switchTournament(id) {
  const data = await loadPmTournament(id);
  if (!data) return;
  state.currentTournamentId = id;
  state.tournamentName = data.name || id;
  // Données prono_match
  state.format   = data.pm_format  || 'bo3';
  state.matches  = data.pm_matches || [];
  state.players  = data.pm_players || [];
  // Données prono_tableau (pour import)
  state.bracketPlayers = data.rg_initialPlayers || [];
  state.bracketRounds  = data.rg_rounds         || [];
  state.bracketResults = data.rg_results         || {};
  savePmConfig({ activeTournamentId: id }).catch(() => {});
}

export async function createTournament(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const id = `pm-${slug}-${Date.now()}`;
  await savePmTournament(id, {
    name,
    pm_format: 'bo3',
    pm_matches: [],
    pm_players: [],
    createdAt: new Date().toISOString(),
  });
  state.tournamentList.push({ id, name });
  await switchTournament(id);
  return id;
}

export function save() {
  if (!state.currentTournamentId) return;
  savePmTournament(state.currentTournamentId, {
    pm_format:  state.format,
    pm_matches: state.matches,
    pm_players: state.players,
  }).catch(err => console.error('Erreur sauvegarde:', err));
}
