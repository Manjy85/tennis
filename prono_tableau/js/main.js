import { state, loadState, switchTournament, createTournament } from './state.js';
import { deleteTournament } from './firebase.js';
import {
  updateMatchDimensions,
  getBracketMinHeight,
  toggleRound,
  newPlayer,
  createPlayer,
  lockBracket,
  selectWinner,
  showBracket
} from './bracket.js';
import {
  adminSelect,
  showAdminPanel,
  showAdmin,
  showAdminConfig,
  changeBracketSize,
  savePoints,
  savePlayersList,
  savePlayerMeta,
  updatePlayerMetaField,
  adminSaveTournamentName
} from './admin.js';
import { showRanking, showDashboard } from './ranking.js';

// ── Navigation par tournoi ─────────────────────────────────────────────────

window.switchTournamentView = async (id, view) => {
  if (id === state.currentTournamentId) return;
  document.getElementById('content').innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Chargement...</p>';
  await switchTournament(id);
  if (view === 'ranking') showRanking();
  else showDashboard();
};

// ── Actions tournoi (appelées depuis le panneau admin) ─────────────────────

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
  if (!confirm(`Supprimer le tournoi "${t ? t.name : id}" ? Cette action est irreversible.`)) return;
  await deleteTournament(id);
  state.tournamentList = state.tournamentList.filter(t => t.id !== id);
  if (state.currentTournamentId === id) {
    state.currentTournamentId = null;
    state.tournamentName = '';
    if (state.tournamentList.length > 0) {
      await switchTournament(state.tournamentList[0].id);
    }
  }
  showAdminPanel('tournois');
};

// ── Bindings window ────────────────────────────────────────────────────────

window.showDashboard = showDashboard;
window.newPlayer = newPlayer;
window.showRanking = showRanking;
window.showAdminPanel = showAdminPanel;
window.showAdmin = showAdmin;
window.showAdminConfig = showAdminConfig;
window.createPlayer = createPlayer;
window.lockBracket = lockBracket;
window.selectWinner = selectWinner;
window.showBracket = showBracket;
window.adminSelect = adminSelect;
window.changeBracketSize = changeBracketSize;
window.savePoints = savePoints;
window.savePlayersList = savePlayersList;
window.savePlayerMeta = savePlayerMeta;
window.updatePlayerMetaField = updatePlayerMetaField;
window.adminSaveTournamentName = adminSaveTournamentName;
window.toggleRound = toggleRound;
window.updateMatchDimensions = updateMatchDimensions;
window.getBracketMinHeight = getBracketMinHeight;

// ── Init ───────────────────────────────────────────────────────────────────

(async () => {
  document.getElementById('content').innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Chargement...</p>';
  await loadState();
  showDashboard();
})();
