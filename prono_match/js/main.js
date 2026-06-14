import { state, loadState, save, switchTournament, createTournament } from './state.js';
import { deletePmTournament } from './firebase.js';
import { showDashboard, showRanking } from './ranking.js';
import { showPredict, pickWinner, pickScore, lockMatchPrediction } from './predict.js';
import {
  showAdminPanel,
  adminSaveTournamentName,
  adminSaveFormat,
  adminAddMatch,
  adminDeleteMatch,
  adminPickWinner,
  adminSetResult,
  adminClearResult,
  adminSyncFromBracket,
} from './admin.js';

// ── Nouveau participant ────────────────────────────────────────────────────

function newPlayer() {
  const name = prompt('Nom du joueur (participant) :');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (state.players.find(p => p.name === trimmed)) return alert('Ce joueur existe déjà.');
  state.players.push({ name: trimmed, predictions: {}, locked: false });
  save();
  showDashboard();
}

// ── Window bindings ────────────────────────────────────────────────────────

window.showDashboard = showDashboard;
window.showRanking   = showRanking;
window.showAdminPanel = showAdminPanel;
window.showPredict          = showPredict;
window.pickWinner           = pickWinner;
window.pickScore            = pickScore;
window.lockMatchPrediction  = lockMatchPrediction;
window.newPlayer     = newPlayer;

window.adminSaveTournamentName = adminSaveTournamentName;
window.adminSaveFormat   = adminSaveFormat;
window.adminAddMatch     = adminAddMatch;
window.adminDeleteMatch  = adminDeleteMatch;
window.adminPickWinner   = adminPickWinner;
window.adminSetResult    = adminSetResult;
window.adminClearResult     = adminClearResult;
window.adminSyncFromBracket = adminSyncFromBracket;

window.adminCreateTournament = async () => {
  const name = document.getElementById('newTournamentName').value.trim();
  if (!name) return alert('Donne un nom au tournoi.');
  await createTournament(name);
  showAdminPanel('tournois');
};

window.adminActivateTournament = async (id) => {
  await switchTournament(id);
  showAdminPanel('tournois');
};

window.adminDeleteTournament = async (id) => {
  const t = state.tournamentList.find(t => t.id === id);
  if (!confirm(`Supprimer le tournoi "${t ? t.name : id}" ? Cette action est irréversible.`)) return;
  await deletePmTournament(id);
  state.tournamentList = state.tournamentList.filter(t => t.id !== id);
  if (state.currentTournamentId === id) {
    state.currentTournamentId = null;
    state.tournamentName = '';
    state.matches = [];
    state.players = [];
    if (state.tournamentList.length > 0) await switchTournament(state.tournamentList[0].id);
  }
  showAdminPanel('tournois');
};

// ── Init ───────────────────────────────────────────────────────────────────

(async () => {
  document.getElementById('content').innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Chargement...</p>';
  await loadState();
  showDashboard();
})();
