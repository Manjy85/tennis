import { state, ensurePlayerPredictions } from './state.js';

function normalizeScore(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^0-9-]/g, '');
}

function getScoreString(entry) {
  if (!entry) return '';
  if (entry.score) return entry.score;
  if (entry.score1 && entry.score2) return `${entry.score1}-${entry.score2}`;
  return '';
}

function scoreForMatch(prediction, official) {
  if (!official || !official.winner) return 0;
  const predScore = normalizeScore(getScoreString(prediction));
  const officialScore = normalizeScore(getScoreString(official));
  if (prediction.winner && prediction.winner === official.winner && predScore && officialScore && predScore === officialScore) {
    return state.settings.pointsExact;
  }
  if (prediction.winner && prediction.winner === official.winner) {
    return state.settings.pointsWinner;
  }
  return 0;
}

export function calculateScore(player) {
  let score = 0;
  ensurePlayerPredictions(player);
  state.rounds.forEach((round, roundIndex) => {
    player.predictions[`round${roundIndex}`].forEach((prediction, matchIndex) => {
      const official = state.officialResults[`round${roundIndex}`][matchIndex];
      score += scoreForMatch(prediction, official);
    });
  });
  return score;
}

export function calculateMaxPossibleScore(player) {
  let score = 0;
  ensurePlayerPredictions(player);
  state.rounds.forEach((round, roundIndex) => {
    player.predictions[`round${roundIndex}`].forEach((prediction, matchIndex) => {
      const official = state.officialResults[`round${roundIndex}`][matchIndex];
      if (official && official.winner) {
        score += scoreForMatch(prediction, official);
        return;
      }
      if (prediction.score && prediction.winner) score += state.settings.pointsExact;
      else if (prediction.winner) score += state.settings.pointsWinner;
    });
  });
  return score;
}

export function calculateAccuracy(player) {
  let totalPlayed = 0;
  let totalCorrect = 0;
  let totalExact = 0;
  ensurePlayerPredictions(player);
  state.rounds.forEach((round, roundIndex) => {
    player.predictions[`round${roundIndex}`].forEach((prediction, matchIndex) => {
      const official = state.officialResults[`round${roundIndex}`][matchIndex];
      if (!official || !official.winner) return;
      totalPlayed += 1;
      if (prediction.winner && prediction.winner === official.winner) totalCorrect += 1;
      if (prediction.winner
        && prediction.winner === official.winner
        && prediction.score
        && normalizeScore(prediction.score) === normalizeScore(official.score)) {
        totalExact += 1;
      }
    });
  });

  if (totalPlayed === 0) return { percent: 0, totalCorrect: 0, totalPlayed: 0, totalExact: 0 };
  const percent = Math.round((totalCorrect / totalPlayed) * 100);
  return { percent, totalCorrect, totalPlayed, totalExact };
}

export function showRanking() {
  state.players.forEach(p => p.score = calculateScore(p));
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  let html = `<h2>Classement general</h2>
    <table><tr><th>#</th><th>Joueur</th><th>Points</th><th>Max possible</th><th>Vainqueur</th><th>Score exact</th></tr>`;
  sorted.forEach((p, index) => {
    const maxPossible = calculateMaxPossibleScore(p);
    const accuracy = calculateAccuracy(p);
    const winnerLabel = accuracy.totalPlayed === 0 ? '-' : `${accuracy.percent}% (${accuracy.totalCorrect}/${accuracy.totalPlayed})`;
    const exactLabel = accuracy.totalPlayed === 0 ? '-' : `${accuracy.totalExact}/${accuracy.totalPlayed}`;
    html += `<tr><td>${index + 1}</td><td><strong>${p.name}</strong></td><td style="font-weight:bold; color:#0c6b2f;">${p.score} pts</td><td>${maxPossible} pts</td><td>${winnerLabel}</td><td>${exactLabel}</td></tr>`;
  });
  html += `</table>`;
  document.getElementById('content').innerHTML = html;
}

export function showDashboard() {
  state.players.forEach(p => p.score = calculateScore(p));
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  let html = `<h2>Tableaux des participants</h2><div class="dashboard">`;
  sorted.forEach((player, index) => {
    html += `<div class="player-card" onclick="showBracket('${player.name}')">
               <div class="lock-badge">${index + 1}</div>
               <h3>${player.name}</h3>
               <div class="player-card-score">${player.score} pts</div>
             </div>`;
  });
  if (state.players.length === 0) html += `<p>Aucun joueur cree. Commence par cliquer sur "+ Nouveau joueur" !</p>`;
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}
