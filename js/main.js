import { state, loadState, switchTournament } from './state.js';
import {
  showTableauDashboard, showTableauRanking,
  newTableauPlayer, createTableauPlayer,
  showBracket, selectWinner, lockBracket, toggleRound,
} from './tableau.js';
import {
  showMatchDashboard, showMatchRanking,
  newMatchPlayer, showPredict,
  pickWinner, pickScore, lockMatch,
} from './match.js';

// ── État de navigation ─────────────────────────────────────────────────────

let mode = 'tableau'; // 'tableau' | 'match'

// ── Onglets tournois ───────────────────────────────────────────────────────

function renderTournamentTabs() {
  const el = document.getElementById('tournament-tabs');
  if (!state.tournamentList.length) {
    el.innerHTML = `<span class="tournament-tab-empty">Aucun tournoi — créez-en un dans <a href="admin/">l'admin</a></span>`;
    return;
  }
  el.innerHTML = state.tournamentList.map(t => {
    const active = t.id === state.currentTournamentId ? 'active' : '';
    return `<button class="tournament-tab ${active}" onclick="userSwitchTournament('${t.id}')">${t.name}</button>`;
  }).join('');
}

window.userSwitchTournament = async (id) => {
  if (id === state.currentTournamentId) return;
  document.getElementById('content').innerHTML = '<p style="text-align:center;padding:40px;color:#666;">Chargement...</p>';
  await switchTournament(id);
  renderTournamentTabs();
  showCurrentDashboard();
};

// ── Onglets mode ───────────────────────────────────────────────────────────

export function switchMode(newMode) {
  mode = newMode;
  document.getElementById('mode-tab-tableau').classList.toggle('active', mode === 'tableau');
  document.getElementById('mode-tab-match').classList.toggle('active', mode === 'match');
  renderSubmenu();
  showCurrentDashboard();
}

function showCurrentDashboard() {
  if (mode === 'tableau') showTableauDashboard();
  else                    showMatchDashboard();
}

function renderSubmenu() {
  const el = document.getElementById('submenu');
  if (mode === 'tableau') {
    el.innerHTML = `
      <button class="green" onclick="showTableauDashboard()">Accueil</button>
      <button class="green" onclick="newTableauPlayer()">+ Nouveau joueur</button>
      <button class="black" onclick="showTableauRanking()">Classement</button>`;
  } else {
    el.innerHTML = `
      <button class="green" onclick="showMatchDashboard()">Accueil</button>
      <button class="green" onclick="newMatchPlayer()">+ Nouveau joueur</button>
      <button class="black" onclick="showMatchRanking()">Classement</button>`;
  }
}

// ── Window bindings ────────────────────────────────────────────────────────

window.switchMode = switchMode;

// Tableau
window.showTableauDashboard = showTableauDashboard;
window.showTableauRanking   = showTableauRanking;
window.newTableauPlayer     = newTableauPlayer;
window.createTableauPlayer  = createTableauPlayer;
window.showBracket          = showBracket;
window.selectWinner         = selectWinner;
window.lockBracket          = lockBracket;
window.toggleRound          = toggleRound;

// Match
window.showMatchDashboard = showMatchDashboard;
window.showMatchRanking   = showMatchRanking;
window.newMatchPlayer     = newMatchPlayer;
window.showPredict        = showPredict;
window.pickWinner         = pickWinner;
window.pickScore          = pickScore;
window.lockMatch          = lockMatch;

// ── Init ───────────────────────────────────────────────────────────────────

(async () => {
  document.getElementById('content').innerHTML = '<p style="text-align:center;padding:40px;color:#666;">Chargement...</p>';
  await loadState();
  renderTournamentTabs();
  renderSubmenu();
  showCurrentDashboard();
})();
