import { state, save, getScores } from './state.js';

export function showPredict(playerName) {
  const player = state.players.find(p => p.name === playerName);
  if (!player) return;
  const scores = getScores(state.format);
  const rounds = [...new Set(state.matches.map(m => m.round))];

  // Compte les matchs en attente (sans prono complet et non verrouillés)
  const pendingCount = state.matches.filter(m => {
    const pred = (player.predictions || {})[m.id] || {};
    return !pred.locked && (!pred.winner || !pred.score);
  }).length;

  let html = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
      <button onclick="showDashboard()">← Retour</button>
      <h2 style="margin:0;">Pronostics de ${playerName}</h2>
      ${pendingCount > 0
        ? `<span style="background:#f57c00; color:white; padding:6px 12px; border-radius:20px; font-size:13px; font-weight:bold;">
             ${pendingCount} match(s) à pronostiquer
           </span>`
        : `<span style="background:#e8f5e9; color:#0c6b2f; padding:6px 12px; border-radius:20px; font-size:13px; font-weight:bold;">
             ✅ Tout est complété
           </span>`
      }
    </div>
    <p style="color:#888; font-size:13px; margin-bottom:8px;">
      🔒 Verrouillez chaque match une fois votre pronostic définitif — vous ne pourrez plus le modifier.
    </p>`;

  if (state.matches.length === 0) {
    html += `<p style="color:#888;">Aucun match disponible pour ce tournoi.</p>`;
    document.getElementById('content').innerHTML = html;
    return;
  }

  html += `<div class="bracket-view">`;

  rounds.forEach(round => {
    const roundMatches = state.matches.filter(m => m.round === round);

    html += `<div class="bracket-col">
      <div class="bracket-col-header">
        <strong>${round}</strong><br>
        <small>${roundMatches.length} match(s)</small>
      </div>
      <div class="bracket-col-matches">`;

    roundMatches.forEach(match => {
      const pred    = (player.predictions || {})[match.id] || {};
      const result  = match.result;
      const isLocked = !!pred.locked;
      const hasWinner = !!pred.winner;
      const hasFull   = hasWinner && !!pred.score;

      // Statut de la carte
      let cardClass = 'pending'; // orange = à faire
      let statusIcon = '';
      if (result && hasWinner) {
        const correctWinner = pred.winner === result.winner;
        const correctScore  = correctWinner && pred.score === result.score;
        if (correctScore)       { cardClass = 'correct';   statusIcon = '✅ +3 pts'; }
        else if (correctWinner) { cardClass = 'partial';   statusIcon = '🟡 +1 pt'; }
        else                    { cardClass = 'incorrect'; statusIcon = '❌ 0 pt'; }
      } else if (isLocked)   { cardClass = 'locked'; }
      else if (hasFull)      { cardClass = 'done'; }

      html += `<div class="bracket-match-card ${cardClass}">`;

      // Noms des joueurs
      html += `<div class="match-players">
        <span class="match-player ${pred.winner === 'player1' ? 'match-player-picked' : ''}">${match.player1}</span>
        <span class="match-vs">vs</span>
        <span class="match-player ${pred.winner === 'player2' ? 'match-player-picked' : ''}">${match.player2}</span>
      </div>`;

      // Résultat officiel
      if (result) {
        const winnerName = result.winner === 'player1' ? match.player1 : match.player2;
        html += `<div class="match-result">✔ ${winnerName} ${result.score}</div>`;
      }

      // Pronostic verrouillé → lecture seule
      if (isLocked) {
        const predWinnerName = pred.winner === 'player1' ? match.player1 : match.player2;
        html += `<div class="pred-locked">🔒 ${predWinnerName} ${pred.score || '?'}</div>`;
      } else {
        // Sélection du vainqueur
        html += `<div class="pick-winner">
          <button class="pick-btn ${pred.winner === 'player1' ? 'selected' : ''}"
            onclick="pickWinner('${playerName}', '${match.id}', 'player1')">${match.player1}</button>
          <button class="pick-btn ${pred.winner === 'player2' ? 'selected' : ''}"
            onclick="pickWinner('${playerName}', '${match.id}', 'player2')">${match.player2}</button>
        </div>`;

        // Sélection du score (si vainqueur choisi)
        if (hasWinner) {
          const winnerName = pred.winner === 'player1' ? match.player1 : match.player2;
          html += `<div class="pick-score">
            <span class="pick-score-label">${winnerName} gagne :</span>
            <div>`;
          scores.forEach(s => {
            html += `<button class="score-btn ${pred.score === s ? 'selected' : ''}"
              onclick="pickScore('${playerName}', '${match.id}', '${s}')">${s}</button>`;
          });
          html += `</div></div>`;
        }

        // Bouton verrouiller (si prono complet)
        if (hasFull) {
          html += `<button class="lock-match-btn" onclick="lockMatchPrediction('${playerName}', '${match.id}')">
            🔒 Verrouiller ce pronostic
          </button>`;
        }
      }

      if (statusIcon) html += `<div class="status-icon">${statusIcon}</div>`;
      html += `</div>`; // bracket-match-card
    });

    html += `</div></div>`; // bracket-col-matches + bracket-col
  });

  html += `</div>`; // bracket-view
  document.getElementById('content').innerHTML = html;
}

export function pickWinner(playerName, matchId, winner) {
  const player = state.players.find(p => p.name === playerName);
  if (!player) return;
  if (!player.predictions) player.predictions = {};
  const existing = player.predictions[matchId] || {};
  if (existing.locked) return;
  const sameWinner = existing.winner === winner;
  player.predictions[matchId] = { winner, score: sameWinner ? existing.score : null, locked: false };
  save();
  showPredict(playerName);
}

export function pickScore(playerName, matchId, score) {
  const player = state.players.find(p => p.name === playerName);
  if (!player) return;
  if (!player.predictions) player.predictions = {};
  const existing = player.predictions[matchId] || {};
  if (existing.locked || !existing.winner) return;
  player.predictions[matchId] = { ...existing, score };
  save();
  showPredict(playerName);
}

export function lockMatchPrediction(playerName, matchId) {
  const player = state.players.find(p => p.name === playerName);
  if (!player) return;
  const pred = (player.predictions || {})[matchId];
  if (!pred || !pred.winner || !pred.score) {
    alert('Complétez votre pronostic (vainqueur + score) avant de le verrouiller.');
    return;
  }
  pred.locked = true;
  save();
  showPredict(playerName);
}
