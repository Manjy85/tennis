import { state, save } from './state.js';
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
  showAdmin,
  showAdminConfig,
  changeBracketSize,
  savePoints,
  savePlayersList,
  savePlayerMeta,
  updatePlayerMetaField
} from './admin.js';
import { showRanking, showDashboard } from './ranking.js';

export function resetData() {
  if (confirm('⚠️ HARD RESET : Effacer toute la configuration (joueurs, bareme) et revenir a zero ?')) {
    localStorage.clear();
    location.reload();
  }
}

export function resetTournament() {
  if (confirm('🔄 RESET TOURNOI : Effacer les scores, les tableaux des participants et les vrais resultats, mais GARDER la configuration (taille du tableau, joueurs) ?')) {
    state.officialResults = {};
    state.rounds.forEach((r, i) => state.officialResults[`round${i}`] = Array(r.matches).fill(null));

    state.players.forEach(p => {
      p.predictions = {};
      p.locked = false;
      p.score = 0;
      state.rounds.forEach((r, i) => p.predictions[`round${i}`] = Array(r.matches).fill(null));
    });

    save();
    showDashboard();
    alert('Le tournoi a ete reinitialise ! Les participants peuvent remplir leurs nouveaux tableaux.');
  }
}

export function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      rg_players: state.players,
      rg_results: state.officialResults,
      rg_rounds: state.rounds,
      rg_initialPlayers: state.initialPlayers,
      rg_playerMeta: state.playerMeta
    }
  };

  const json = JSON.stringify(payload, null, 2);
  localStorage.setItem('rg_lastBackup', json);

  fetch('http://localhost:5177/save-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json
  })
    .then((res) => {
      if (!res.ok) throw new Error('export_failed');
      return res.json();
    })
    .then((data) => {
      alert(`Backup ecrit dans le repo: ${data.path}`);
    })
    .catch(() => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'roland-garros.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      alert('Serveur local non disponible, fichier telecharge.');
    });
}

export function triggerImport() {
  const backup = localStorage.getItem('rg_lastBackup');
  if (backup) {
    if (!confirm('Importer la derniere sauvegarde locale va remplacer les donnees actuelles. Continuer ?')) return;
    try {
      const parsed = JSON.parse(backup);
      if (!parsed || !parsed.data) throw new Error('Format invalide');
      const data = parsed.data;

      if (data.rg_players) localStorage.setItem('rg_players', JSON.stringify(data.rg_players));
      if (data.rg_results) localStorage.setItem('rg_results', JSON.stringify(data.rg_results));
      if (data.rg_rounds) localStorage.setItem('rg_rounds', JSON.stringify(data.rg_rounds));
      if (data.rg_initialPlayers) localStorage.setItem('rg_initialPlayers', JSON.stringify(data.rg_initialPlayers));
      if (data.rg_playerMeta) localStorage.setItem('rg_playerMeta', JSON.stringify(data.rg_playerMeta));

      location.reload();
      return;
    } catch (err) {
      alert('Sauvegarde locale invalide.');
    }
  }

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

      if (data.rg_players) localStorage.setItem('rg_players', JSON.stringify(data.rg_players));
      if (data.rg_results) localStorage.setItem('rg_results', JSON.stringify(data.rg_results));
      if (data.rg_rounds) localStorage.setItem('rg_rounds', JSON.stringify(data.rg_rounds));
      if (data.rg_initialPlayers) localStorage.setItem('rg_initialPlayers', JSON.stringify(data.rg_initialPlayers));
      if (data.rg_playerMeta) localStorage.setItem('rg_playerMeta', JSON.stringify(data.rg_playerMeta));

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
window.lockBracket = lockBracket;
window.selectWinner = selectWinner;
window.showBracket = showBracket;
window.adminSelect = adminSelect;
window.changeBracketSize = changeBracketSize;
window.savePoints = savePoints;
window.savePlayersList = savePlayersList;
window.savePlayerMeta = savePlayerMeta;
window.updatePlayerMetaField = updatePlayerMetaField;
window.toggleRound = toggleRound;

window.updateMatchDimensions = updateMatchDimensions;
window.getBracketMinHeight = getBracketMinHeight;

showDashboard();
