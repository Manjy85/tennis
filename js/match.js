import { state, saveMatch, getScores } from './state.js';

// ── Calcul des scores ──────────────────────────────────────────────────────

function calcScore(player) {
  let score = 0;
  state.matches.forEach(match => {
    if (!match.result) return;
    const pred = (player.predictions || {})[match.id] || {};
    if (!pred.winner) return;
    const okWinner = pred.winner === match.result.winner;
    const okScore  = okWinner && pred.score === match.result.score;
    if (okScore)       score += 3;
    else if (okWinner) score += 1;
  });
  return score;
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export function showMatchDashboard() {
  state.mPlayers.forEach(p => { p.score = calcScore(p); });
  const sorted = [...state.mPlayers].sort((a, b) => b.score - a.score);
  const playedCount = state.matches.filter(m => m.result).length;

  let html = `<h2>Prono Match — ${state.tournamentName || 'Aucun tournoi'}</h2>
    <p style="color:#666;">${playedCount} / ${state.matches.length} matchs joués</p>
    <div class="dashboard">`;

  sorted.forEach((player, i) => {
    const lockedCount  = state.matches.filter(m => ((player.predictions || {})[m.id] || {}).locked).length;
    const pendingCount = state.matches.filter(m => {
      const pred = (player.predictions || {})[m.id] || {};
      return !pred.locked && (!pred.winner || !pred.score);
    }).length;
    const badge = pendingCount > 0
      ? `<span class="badge-pending">⚡ ${pendingCount} à pronostiquer</span>`
      : `<span class="badge-done">✅ Tout verrouillé</span>`;

    html += `<div class="player-card" onclick="showPredict('${player.name}')">
      <h3>${i + 1}. ${player.name}</h3>
      <div class="player-card-score">${player.score} pts</div>
      <div style="font-size:13px; color:#888;">🔒 ${lockedCount} / ${state.matches.length} verrouillés</div>
      ${badge}
    </div>`;
  });

  if (!state.mPlayers.length) html += `<p>Aucun joueur. Cliquez sur "+ Nouveau joueur".</p>`;
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}

// ── Classement ─────────────────────────────────────────────────────────────

export function showMatchRanking() {
  state.mPlayers.forEach(p => { p.score = calcScore(p); });
  const sorted = [...state.mPlayers].sort((a, b) => b.score - a.score);
  const played = state.matches.filter(m => m.result);

  let html = `<h2>Classement Matchs — ${state.tournamentName || ''}</h2>
    <p style="color:#666;">${played.length} / ${state.matches.length} matchs joués</p>
    <table><thead><tr><th>#</th><th>Joueur</th><th>Bon vainqueur</th><th>Score exact</th><th>Points</th></tr></thead><tbody>`;

  sorted.forEach((p, i) => {
    let okWinner = 0, okScore = 0;
    played.forEach(match => {
      const pred = (p.predictions || {})[match.id] || {};
      if (!pred.winner) return;
      if (pred.winner === match.result.winner) {
        okWinner++;
        if (pred.score === match.result.score) okScore++;
      }
    });
    html += `<tr>
      <td>${i + 1}</td>
      <td><strong>${p.name}</strong></td>
      <td>${okWinner} / ${played.length}</td>
      <td>${okScore} / ${played.length}</td>
      <td style="font-weight:bold; color:#0c6b2f;">${p.score} pts</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('content').innerHTML = html;
}

// ── Nouveau joueur ─────────────────────────────────────────────────────────

export function newMatchPlayer() {
  if (!state.currentTournamentId) {
    document.getElementById('content').innerHTML = `<p style="color:#888;">Aucun tournoi actif.</p>`;
    return;
  }
  const name = prompt('Ton pseudo pour Prono Match :');
  if (!name?.trim()) return;
  const trimmed = name.trim();
  if (state.mPlayers.find(p => p.name === trimmed)) return alert('Pseudo déjà utilisé');
  state.mPlayers.push({ name: trimmed, predictions: {}, score: 0 });
  saveMatch();
  showMatchDashboard();
}

// ── Vue bracket de pronostics ──────────────────────────────────────────────

export function showPredict(playerName) {
  const player = state.mPlayers.find(p => p.name === playerName);
  if (!player) return;
  const scores = getScores();
  const rounds = [...new Set(state.matches.map(m => m.round))];

  const pendingCount = state.matches.filter(m => {
    const pred = (player.predictions || {})[m.id] || {};
    return !pred.locked && (!pred.winner || !pred.score);
  }).length;

  let html = `<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px;">
    <button onclick="showMatchDashboard()">← Retour</button>
    <h2 style="margin:0;">Pronostics de ${playerName}</h2>
    ${pendingCount > 0
      ? `<span style="background:#f57c00;color:white;padding:5px 12px;border-radius:20px;font-size:13px;font-weight:bold;">⚡ ${pendingCount} à compléter</span>`
      : `<span style="background:#e8f5e9;color:#0c6b2f;padding:5px 12px;border-radius:20px;font-size:13px;font-weight:bold;">✅ Tout complété</span>`
    }
  </div>
  <p style="color:#888; font-size:13px; margin-bottom:12px;">Choisissez vainqueur + score, puis verrouillez chaque match.</p>`;

  if (!state.matches.length) {
    html += `<p style="color:#888;">Aucun match disponible pour ce tournoi.</p>`;
    document.getElementById('content').innerHTML = html;
    return;
  }

  html += `<div class="bracket-view">`;

  rounds.forEach(round => {
    const roundMatches = state.matches.filter(m => m.round === round);
    html += `<div class="bracket-col">
      <div class="bracket-col-header"><strong>${round}</strong><br><small>${roundMatches.length} match(s)</small></div>
      <div class="bracket-col-matches">`;

    roundMatches.forEach(match => {
      const pred    = (player.predictions || {})[match.id] || {};
      const result  = match.result;
      const isLocked = !!pred.locked;
      const hasFull  = !!pred.winner && !!pred.score;

      let cardClass = 'pending';
      let statusIcon = '';
      if (result && pred.winner) {
        const okWinner = pred.winner === result.winner;
        const okScore  = okWinner && pred.score === result.score;
        if (okScore)       { cardClass = 'correct';   statusIcon = '✅ +3 pts'; }
        else if (okWinner) { cardClass = 'partial';   statusIcon = '🟡 +1 pt'; }
        else               { cardClass = 'incorrect'; statusIcon = '❌ 0 pt'; }
      } else if (isLocked) { cardClass = 'locked'; }
      else if (hasFull)    { cardClass = 'done'; }

      html += `<div class="bracket-match-card ${cardClass}">
        <div class="match-players">
          <span class="match-player ${pred.winner === 'player1' ? 'match-player-picked' : ''}">${match.player1}</span>
          <span class="match-vs">vs</span>
          <span class="match-player ${pred.winner === 'player2' ? 'match-player-picked' : ''}">${match.player2}</span>
        </div>`;

      if (result) {
        const wName = result.winner === 'player1' ? match.player1 : match.player2;
        html += `<div class="match-result">✔ ${wName} ${result.score}</div>`;
      }

      if (isLocked) {
        const wName = pred.winner === 'player1' ? match.player1 : match.player2;
        html += `<div class="pred-locked">🔒 ${wName} ${pred.score || '?'}</div>`;
      } else {
        html += `<div class="pick-winner">
          <button class="pick-btn ${pred.winner === 'player1' ? 'selected' : ''}"
            onclick="pickWinner('${playerName}','${match.id}','player1')">${match.player1}</button>
          <button class="pick-btn ${pred.winner === 'player2' ? 'selected' : ''}"
            onclick="pickWinner('${playerName}','${match.id}','player2')">${match.player2}</button>
        </div>`;
        if (pred.winner) {
          const wName = pred.winner === 'player1' ? match.player1 : match.player2;
          html += `<div class="pick-score">
            <span class="pick-score-label">${wName} gagne :</span><div>`;
          scores.forEach(s => {
            html += `<button class="score-btn ${pred.score === s ? 'selected' : ''}"
              onclick="pickScore('${playerName}','${match.id}','${s}')">${s}</button>`;
          });
          html += `</div></div>`;
        }
        if (hasFull) {
          html += `<button class="lock-match-btn" onclick="lockMatch('${playerName}','${match.id}')">🔒 Verrouiller</button>`;
        }
      }

      if (statusIcon) html += `<div class="status-icon">${statusIcon}</div>`;
      html += `</div>`;
    });
    html += `</div></div>`;
  });

  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}

export function pickWinner(playerName, matchId, winner) {
  const player = state.mPlayers.find(p => p.name === playerName);
  if (!player) return;
  if (!player.predictions) player.predictions = {};
  const existing = player.predictions[matchId] || {};
  if (existing.locked) return;
  player.predictions[matchId] = { winner, score: existing.winner === winner ? existing.score : null, locked: false };
  saveMatch();
  showPredict(playerName);
}

export function pickScore(playerName, matchId, score) {
  const player = state.mPlayers.find(p => p.name === playerName);
  if (!player) return;
  if (!player.predictions) player.predictions = {};
  const existing = player.predictions[matchId] || {};
  if (existing.locked || !existing.winner) return;
  player.predictions[matchId] = { ...existing, score };
  saveMatch();
  showPredict(playerName);
}

export function lockMatch(playerName, matchId) {
  const player = state.mPlayers.find(p => p.name === playerName);
  if (!player) return;
  const pred = (player.predictions || {})[matchId];
  if (!pred?.winner || !pred?.score) return alert('Complétez le pronostic avant de verrouiller.');
  pred.locked = true;
  saveMatch();
  showPredict(playerName);
}
