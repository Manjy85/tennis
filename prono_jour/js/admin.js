import { state, uiState, save, ensurePlayerMeta, ensureOfficialResults, ensureAllPlayersPredictions, getPlayerMetaParts, splitDisplayName } from './state.js';
import { getBracketMinHeight, updateMatchDimensions } from './bracket.js';

function getRoundPlayers(roundIndex) {
  if (roundIndex === 0) return state.initialPlayers;
  const prevResults = state.officialResults[`round${roundIndex - 1}`] || [];
  return prevResults.map(result => (result && result.winner) ? result.winner : null);
}

function normalizeScore(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^0-9]/g, '');
}

function isValidScore(value) {
  return /^\d-\d$/.test(value);
}

export function adminSelect(roundIndex, matchIndex, winner) {
  if (!state.officialResults[`round${roundIndex}`][matchIndex]) {
    state.officialResults[`round${roundIndex}`][matchIndex] = { winner: null, score: '' };
  }
  state.officialResults[`round${roundIndex}`][matchIndex].winner = winner;
  save();
  showAdmin();
}

export function adminSetScore(roundIndex, matchIndex, side, value) {
  const entry = state.officialResults[`round${roundIndex}`][matchIndex];
  if (!entry || !entry.winner) {
    alert('Choisis un vainqueur avant de saisir le score.');
    return;
  }
  if (side === 1) entry.score1 = normalizeScore(value);
  if (side === 2) entry.score2 = normalizeScore(value);
  if (entry.score1 && entry.score2) {
    entry.score = `${entry.score1}-${entry.score2}`;
  } else {
    entry.score = '';
  }
  save();
  const skipRerender = window.skipScoreBlurRerender === true;
  if (skipRerender) {
    window.skipScoreBlurRerender = false;
    return;
  }
  showAdmin();
}

export function showAdmin() {
  let html = `<h2>ADMIN - Resultats officiels</h2>
              <p style="color:#b71c1c; font-weight:bold;">Ici tu valides les resultats qui font avancer le tableau.</p>`;

  const minHeight = getBracketMinHeight();
  const matchBoxHeight = uiState.measuredMatchHeight;
  html += `<div class="bracket" style="min-height: ${minHeight}px; --match-height:${matchBoxHeight}px;">`;

  let firstVisibleRoundIndex = 0;
  while (uiState.hiddenRounds.has(firstVisibleRoundIndex) && firstVisibleRoundIndex < state.rounds.length) {
    firstVisibleRoundIndex += 1;
  }

  state.rounds.forEach((round, roundIndex) => {
    const roundPlayers = getRoundPlayers(roundIndex);
    const isCollapsed = uiState.hiddenRounds.has(roundIndex);
    const visibleRoundIndex = Math.max(0, roundIndex - firstVisibleRoundIndex);
    const gapFactor = uiState.hiddenRounds.size > 0 ? 0.7 : 1;
    const baseGap = Math.max(8, Math.round(16 * gapFactor));
    const step = matchBoxHeight + baseGap;
    const roundGap = Math.pow(2, visibleRoundIndex) * step - matchBoxHeight;
    const roundOffset = ((Math.pow(2, visibleRoundIndex) - 1) * step) / 2;

    const roundWidth = uiState.measuredRoundWidths[roundIndex] || 220;
    html += `<div class="round ${isCollapsed ? 'collapsed' : ''}" style="--match-width:${roundWidth}px;">
               <div class="vertical-title" onclick="toggleRound(${roundIndex}, 'ADMIN')">${round.name}</div>

               <div class="round-header">
                 <h2>${round.name}</h2>
                 <button class="toggle-btn" onclick="toggleRound(${roundIndex}, 'ADMIN')">Masquer</button>
               </div>

               <div class="match-container" style="--round-gap:${roundGap}px; --round-offset:${roundOffset}px;">`;

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      const official = state.officialResults[`round${roundIndex}`][i];
      const isOpen = Boolean(p1 && p2);

      if (!p1 && !p2) {
        html += `<div class="match empty"><span style="color:#aaa; text-align:center; padding:10px;">En attente...</span></div>`;
      } else {
        html += `<div class="match">
                   <div class="match-body">
                     <div class="match-players">`;
        [p1, p2].forEach(p => {
          if (!p) return;
          const meta = getPlayerMetaParts(p);
          const nameParts = splitDisplayName(p);
          const isWinner = official && official.winner === p;
          const disabledAttr = !isOpen ? 'disabled' : '';
          html += `<button class="player-btn ${isWinner ? 'correct' : ''}" onclick="adminSelect(${roundIndex}, ${i}, '${p}')" ${disabledAttr}>
                     <span class="player-label">
                       <span class="player-seed">${meta.seed || ''}</span>
                       <span class="player-name">
                         <span>${nameParts.lastName}</span>
                         <span>${nameParts.firstName}</span>
                       </span>
                       <span class="player-nat">${meta.nat || ''}</span>
                     </span>
                   </button>`;
        });

        const score1 = official && official.score1 ? official.score1 : '';
        const score2 = official && official.score2 ? official.score2 : '';
        html += `</div>
                 <div class="match-score">
                   <input class="score-input" type="text" value="${score1}" placeholder="0" ${!isOpen ? 'disabled' : ''}
                     onblur="adminSetScore(${roundIndex}, ${i}, 1, this.value)"
                     onkeydown="handleScoreKey(event)" />
                   <input class="score-input" type="text" value="${score2}" placeholder="0" ${!isOpen ? 'disabled' : ''}
                     onblur="adminSetScore(${roundIndex}, ${i}, 2, this.value)"
                     onkeydown="handleScoreKey(event)" />
                 </div>
               </div>
             </div>`;
      }
    }
    html += `</div></div>`;
  });
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
  updateMatchDimensions(showAdmin);
}

export function showAdminConfig() {
  let html = `<h2>ADMIN - Configuration du tournoi</h2>`;

  html += `<div class="admin-box">
             <h3>1. Taille du tableau</h3>
             <select id="bracketSizeInput" style="margin-right:10px;">
               <option value="8" ${state.initialPlayers.length === 8 ? 'selected' : ''}>8 Joueurs (Quarts)</option>
               <option value="16" ${state.initialPlayers.length === 16 ? 'selected' : ''}>16 Joueurs (Huitiemes)</option>
               <option value="32" ${state.initialPlayers.length === 32 ? 'selected' : ''}>32 Joueurs (Seiziemes)</option>
               <option value="64" ${state.initialPlayers.length === 64 ? 'selected' : ''}>64 Joueurs (2e Tour)</option>
               <option value="128" ${state.initialPlayers.length === 128 ? 'selected' : ''}>128 Joueurs (Roland-Garros)</option>
             </select>
             <button class="red" onclick="changeBracketSize()">Generer le nouveau tableau</button>
           </div>`;

  html += `<div class="admin-box">
             <h3>2. Points par match</h3>
             <label>Vainqueur</label>
             <input type="number" id="pointsWinner" value="${state.settings.pointsWinner}" style="width:80px; margin-right:10px;" />
             <label>Score exact</label>
             <input type="number" id="pointsExact" value="${state.settings.pointsExact}" style="width:80px;" />
             <br><br>
             <button class="blue" onclick="savePoints()">Sauvegarder les points</button>
           </div>`;

  html += `<div class="admin-box">
             <h3>3. Renseigner les ${state.initialPlayers.length} joueurs</h3>
             <textarea id="playersListInput" style="width:100%; height:300px;" onblur="savePlayersList(true)">${state.initialPlayers.join('\n')}</textarea><br><br>
             <button class="green" onclick="savePlayersList()">Mettre a jour les noms</button>
           </div>`;

  html += `<div class="admin-box">
             <h3>4. Tetes de serie et nationalites</h3>
             <table>
               <tr><th>Joueur</th><th>Tete</th><th>Nat (3 lettres)</th></tr>`;
  state.initialPlayers.forEach((name, index) => {
    const meta = state.playerMeta[name] || {};
    html += `<tr>
               <td><strong>${name || '(vide)'}</strong></td>
               <td><input type="text" id="seed_${index}" value="${meta.seed || ''}" style="width:80px;" oninput="updatePlayerMetaField(${index}, 'seed', this.value)" /></td>
               <td><input type="text" id="nat_${index}" value="${meta.nat || ''}" maxlength="3" style="width:80px; text-transform:uppercase;" oninput="updatePlayerMetaField(${index}, 'nat', this.value)" /></td>
             </tr>`;
  });
  html += `</table>
           <button class="blue" onclick="savePlayerMeta()">Sauvegarder</button>
           </div>`;

  document.getElementById('content').innerHTML = html;
}

export function changeBracketSize() {
  const size = parseInt(document.getElementById('bracketSizeInput').value, 10);
  if (!confirm('Attention : cela va reinitialiser les matchs et les pronos. Continuer ?')) return;

  const numRounds = Math.log2(size);
  const nextRounds = [];

  for (let i = 0; i < numRounds; i++) {
    const matches = size / Math.pow(2, i + 1);
    const rName = matches === 1 ? 'Finale'
      : matches === 2 ? 'Demi-finales'
      : matches === 4 ? 'Quarts'
      : matches === 8 ? 'Huitiemes'
      : `Tour des ${matches * 2}`;
    nextRounds.push({ name: rName, matches });
  }

  state.rounds = nextRounds;
  state.initialPlayers = Array(size).fill('').map((_, i) => `Joueur ${i + 1}`);
  state.officialResults = {};
  ensureOfficialResults();
  ensurePlayerMeta();

  state.players.forEach(p => {
    p.predictions = {};
  });
  ensureAllPlayersPredictions();

  save();
  showAdminConfig();
}

export function savePoints() {
  const nextWinner = parseInt(document.getElementById('pointsWinner').value, 10);
  const nextExact = parseInt(document.getElementById('pointsExact').value, 10);
  state.settings.pointsWinner = Number.isNaN(nextWinner) ? state.settings.pointsWinner : nextWinner;
  state.settings.pointsExact = Number.isNaN(nextExact) ? state.settings.pointsExact : nextExact;
  save();
  alert('Points mis a jour !');
}

export function savePlayersList(silent = false) {
  const lines = document.getElementById('playersListInput').value
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (lines.length !== state.initialPlayers.length) {
    return alert(`Erreur : Le tableau attend ${state.initialPlayers.length} joueurs, mais tu as renseigne ${lines.length} noms.`);
  }

  const metaByIndex = state.initialPlayers.map((name) => state.playerMeta[name] || { seed: '', nat: '' });
  state.initialPlayers = lines;

  const nextMeta = {};
  state.initialPlayers.forEach((name, index) => {
    if (!name) return;
    const metaFromIndex = metaByIndex[index] || { seed: '', nat: '' };
    const metaFromName = state.playerMeta[name] || metaFromIndex;
    nextMeta[name] = { seed: metaFromName.seed || '', nat: metaFromName.nat || '' };
  });
  state.playerMeta = nextMeta;

  save();
  if (!silent) alert('Liste des joueurs enregistree !');
  if (silent) showAdminConfig();
}

export function savePlayerMeta() {
  const nextMeta = {};
  state.initialPlayers.forEach((name, index) => {
    if (!name) return;
    const seedValue = document.getElementById(`seed_${index}`).value.trim();
    const natValue = document.getElementById(`nat_${index}`).value.trim().toUpperCase();
    nextMeta[name] = {
      seed: seedValue,
      nat: natValue
    };
  });
  state.playerMeta = nextMeta;
  save();
  showAdminConfig();
}

export function updatePlayerMetaField(index, field, value) {
  const name = state.initialPlayers[index];
  if (!name) return;
  const meta = state.playerMeta[name] || { seed: '', nat: '' };
  if (field === 'seed') meta.seed = value.trim();
  if (field === 'nat') meta.nat = value.trim().toUpperCase();
  state.playerMeta[name] = meta;
  save();
}
