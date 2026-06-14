import { state } from './state.js';

export function calculateScore(player) {
  let score = 0;
  state.matches.forEach(match => {
    if (!match.result) return;
    const pred = (player.predictions || {})[match.id];
    if (!pred || !pred.winner) return;
    const correctWinner = pred.winner === match.result.winner;
    const correctScore = correctWinner && pred.score === match.result.score;
    if (correctScore)       score += 3;
    else if (correctWinner) score += 1;
  });
  return score;
}

export function showRanking() {
  state.players.forEach(p => { p.score = calculateScore(p); });
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const playedMatches = state.matches.filter(m => m.result);

  let html = `<h2>Classement — ${state.tournamentName || 'Tournoi'}</h2>`;
  html += `<p style="color:#666;">${playedMatches.length} match(s) joué(s) sur ${state.matches.length}</p>`;
  html += `<table>
    <tr><th>#</th><th>Joueur</th><th>Bon vainqueur</th><th>Score exact</th><th>Points</th></tr>`;

  sorted.forEach((p, i) => {
    let correctWinner = 0, correctScore = 0;
    playedMatches.forEach(match => {
      const pred = (p.predictions || {})[match.id];
      if (!pred || !pred.winner) return;
      if (pred.winner === match.result.winner) {
        correctWinner++;
        if (pred.score === match.result.score) correctScore++;
      }
    });
    html += `<tr>
      <td>${i + 1}</td>
      <td><strong>${p.name}</strong> ${p.locked ? '🔒' : '✏️'}</td>
      <td>${correctWinner} / ${playedMatches.length}</td>
      <td>${correctScore} / ${playedMatches.length}</td>
      <td style="font-weight:bold; color:#0c6b2f;">${p.score} pts</td>
    </tr>`;
  });

  html += `</table>`;
  document.getElementById('content').innerHTML = html;
}

export function showDashboard() {
  state.players.forEach(p => { p.score = calculateScore(p); });
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const playedCount = state.matches.filter(m => m.result).length;

  let html = `<h2>Pronostics — ${state.tournamentName || 'Tournoi'}</h2>`;
  html += `<p style="color:#666;">${playedCount} match(s) joué(s) sur ${state.matches.length}</p>`;
  html += `<div class="dashboard">`;

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
      <div class="player-card-sub">🔒 ${lockedCount} / ${state.matches.length} matchs verrouillés</div>
      ${badge}
    </div>`;
  });

  if (state.players.length === 0) {
    html += `<p>Aucun joueur créé. Cliquez sur "+ Nouveau joueur" !</p>`;
  }

  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}
