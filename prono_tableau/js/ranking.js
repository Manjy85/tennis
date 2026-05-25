import { state } from './state.js';

export function calculateScore(player) {
  let score = 0;
  state.rounds.forEach((round, roundIndex) => {
    player.predictions[`round${roundIndex}`].forEach((winner, matchIndex) => {
      if (winner && winner === state.officialResults[`round${roundIndex}`][matchIndex]) {
        score += round.points;
      }
    });
  });
  return score;
}

export function calculateMaxPossibleScore(player) {
  const getPossiblePlayers = (roundIndex, matchIndex) => {
    const officialWinner = state.officialResults[`round${roundIndex}`][matchIndex];
    if (officialWinner) return [officialWinner];

    if (roundIndex === 0) {
      const p1 = state.initialPlayers[matchIndex * 2];
      const p2 = state.initialPlayers[matchIndex * 2 + 1];
      return [p1, p2].filter(Boolean);
    }

    const left = getPossiblePlayers(roundIndex - 1, matchIndex * 2);
    const right = getPossiblePlayers(roundIndex - 1, matchIndex * 2 + 1);
    return Array.from(new Set([...left, ...right]));
  };

  let score = 0;
  state.rounds.forEach((round, roundIndex) => {
    player.predictions[`round${roundIndex}`].forEach((winner, matchIndex) => {
      if (!winner) return;
      const officialWinner = state.officialResults[`round${roundIndex}`][matchIndex];
      if (officialWinner === winner) {
        score += round.points;
        return;
      }
      if (officialWinner !== null) return;

      const possiblePlayers = getPossiblePlayers(roundIndex, matchIndex);
      if (possiblePlayers.includes(winner)) score += round.points;
    });
  });
  return score;
}

export function calculateAccuracy(player) {
  let totalPlayed = 0;
  let totalCorrect = 0;
  state.rounds.forEach((round, roundIndex) => {
    player.predictions[`round${roundIndex}`].forEach((winner, matchIndex) => {
      const officialWinner = state.officialResults[`round${roundIndex}`][matchIndex];
      if (officialWinner === null) return;
      totalPlayed += 1;
      if (winner && winner === officialWinner) totalCorrect += 1;
    });
  });

  if (totalPlayed === 0) return { percent: 0, totalCorrect: 0, totalPlayed: 0 };
  const percent = Math.round((totalCorrect / totalPlayed) * 100);
  return { percent, totalCorrect, totalPlayed };
}

export function showRanking() {
  state.players.forEach(p => p.score = calculateScore(p));
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  let html = `<h2>Classement general</h2>
    <table><tr><th>#</th><th>Joueur</th><th>Statut</th><th>Points</th><th>Max possible</th><th>Precision</th></tr>`;
  sorted.forEach((p, index) => {
    const maxPossible = calculateMaxPossibleScore(p);
    const accuracy = calculateAccuracy(p);
    const accuracyLabel = accuracy.totalPlayed === 0 ? '-' : `${accuracy.percent}% (${accuracy.totalCorrect}/${accuracy.totalPlayed})`;
    html += `<tr><td>${index + 1}</td><td><strong>${p.name}</strong></td><td>${p.locked ? '🔒 Pret' : '✏️ En cours'}</td><td style="font-weight:bold; color:#0c6b2f;">${p.score} pts</td><td>${maxPossible} pts</td><td>${accuracyLabel}</td></tr>`;
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
               <div class="lock-badge">${player.locked ? '🔒' : '✏️'}</div>
               <h3>${index + 1}. ${player.name}</h3>
               <div class="player-card-score">${player.score} pts</div>
             </div>`;
  });
  if (state.players.length === 0) html += `<p>Aucun joueur cree. Commence par cliquer sur "+ Nouveau joueur" !</p>`;
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}
