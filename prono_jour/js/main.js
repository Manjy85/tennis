import { state, save, ensureOfficialResults, ensureAllPlayersPredictions } from './state.js';
import {
  updateMatchDimensions,
  getBracketMinHeight,
  toggleRound,
  newPlayer,
  createPlayer,
  selectWinner,
  setScorePrediction,
  showBracket
} from './bracket.js';
import {
  adminSelect,
  adminSetScore,
  showAdmin,
  showAdminConfig,
  changeBracketSize,
  savePoints,
  savePlayersList,
  savePlayerMeta,
  updatePlayerMetaField
} from './admin.js';
import { showRanking, showDashboard } from './ranking.js';

const STORAGE_PREFIX = 'rg_live_';

export function resetData() {
  if (confirm('ATTENTION : effacer toute la configuration et repartir a zero ?')) {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX))
      .forEach(key => localStorage.removeItem(key));
    location.reload();
  }
}

export function resetTournament() {
  if (confirm('Reset tournoi : effacer les pronos et resultats, garder la config ?')) {
    state.officialResults = {};
    ensureOfficialResults();

    state.players.forEach(p => {
      p.predictions = {};
    });
    ensureAllPlayersPredictions();

    save();
    showDashboard();
    alert('Le tournoi a ete reinitialise.');
  }
}

export function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      [`${STORAGE_PREFIX}players`]: state.players,
      [`${STORAGE_PREFIX}results`]: state.officialResults,
      [`${STORAGE_PREFIX}rounds`]: state.rounds,
      [`${STORAGE_PREFIX}initialPlayers`]: state.initialPlayers,
      [`${STORAGE_PREFIX}playerMeta`]: state.playerMeta,
      [`${STORAGE_PREFIX}settings`]: state.settings
    }
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  link.href = url;
  link.download = `roland-garros-prono-live-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function triggerImport() {
  const input = document.getElementById('importFile');
  input.value = '';
  input.click();
}

export function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !parsed.data) throw new Error('Format invalide');
      const data = parsed.data;

      if (!confirm('Importer ce fichier va remplacer les donnees actuelles. Continuer ?')) return;

      Object.keys(data).forEach((key) => {
        localStorage.setItem(key, JSON.stringify(data[key]));
      });

      location.reload();
    } catch (err) {
      alert('Impossible d\'importer ce fichier JSON.');
    }
  };
  reader.readAsText(file);
}

window.showDashboard = showDashboard;
window.newPlayer = newPlayer;
window.showRanking = showRanking;
window.showAdmin = showAdmin;
window.showAdminConfig = showAdminConfig;
window.resetTournament = resetTournament;
window.exportData = exportData;
window.triggerImport = triggerImport;
window.importData = importData;
window.resetData = resetData;
window.createPlayer = createPlayer;
window.selectWinner = selectWinner;
window.setScorePrediction = setScorePrediction;
window.showBracket = showBracket;
window.adminSelect = adminSelect;
window.adminSetScore = adminSetScore;
window.changeBracketSize = changeBracketSize;
window.savePoints = savePoints;
window.savePlayersList = savePlayersList;
window.savePlayerMeta = savePlayerMeta;
window.updatePlayerMetaField = updatePlayerMetaField;
window.toggleRound = toggleRound;

window.updateMatchDimensions = updateMatchDimensions;
window.getBracketMinHeight = getBracketMinHeight;

window.handleScoreKey = (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  window.skipScoreBlurRerender = true;
  const inputs = Array.from(document.querySelectorAll('.score-input:not(:disabled)'));
  const currentIndex = inputs.indexOf(event.target);
  if (currentIndex === -1) return;
  const nextInput = inputs[currentIndex + 1];
  if (nextInput) {
    nextInput.focus();
    nextInput.select();
  }
};

showDashboard();
