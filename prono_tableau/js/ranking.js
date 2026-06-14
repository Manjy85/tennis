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

export function calculateScoreByRound(player) {
  return state.rounds.map((round, roundIndex) => {
    let roundScore = 0;
    player.predictions[`round${roundIndex}`].forEach((winner, matchIndex) => {
      if (winner && winner === state.officialResults[`round${roundIndex}`][matchIndex]) {
        roundScore += round.points;
      }
    });
    return roundScore;
  });
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

export function calculateAccuracyByRound(player) {
  return state.rounds.map((round, roundIndex) => {
    let totalPlayed = 0;
    let totalCorrect = 0;
    player.predictions[`round${roundIndex}`].forEach((winner, matchIndex) => {
      const officialWinner = state.officialResults[`round${roundIndex}`][matchIndex];
      if (officialWinner === null) return;
      totalPlayed += 1;
      if (winner && winner === officialWinner) totalCorrect += 1;
    });

    if (totalPlayed === 0) return { percent: 0, totalCorrect: 0, totalPlayed: 0 };
    const percent = Math.round((totalCorrect / totalPlayed) * 100);
    return { percent, totalCorrect, totalPlayed };
  });
}

function buildTournamentSelector(view) {
  if (state.tournamentList.length <= 1) {
    return state.currentTournamentId
      ? `<p style="color:#666; margin-bottom:16px;">Tournoi : <strong>${state.tournamentName}</strong></p>`
      : '';
  }
  let html = `<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
    <span style="font-weight:bold; color:#444;">Tournoi :</span>
    <select style="padding:6px 10px; border-radius:8px; border:1px solid #ccc;" onchange="switchTournamentView(this.value, '${view}')">`;
  state.tournamentList.forEach(t => {
    html += `<option value="${t.id}" ${t.id === state.currentTournamentId ? 'selected' : ''}>${t.name}</option>`;
  });
  html += `</select></div>`;
  return html;
}

export function showRanking() {
  state.players.forEach(p => p.score = calculateScore(p));
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  let html = buildTournamentSelector('ranking');
  html += `<h2>Classement — ${state.tournamentName || 'Tournoi'}</h2>
    <table><tr><th>#</th><th>Joueur</th><th>Statut</th>`;
  state.rounds.forEach((round, roundIndex) => {
    html += `<th title="${round.name}">R${roundIndex + 1}</th>`;
  });
  html += `<th>Points</th><th>Max possible</th><th>Precision</th></tr>`;
  sorted.forEach((p, index) => {
    const maxPossible = calculateMaxPossibleScore(p);
    const accuracy = calculateAccuracy(p);
    const accuracyLabel = accuracy.totalPlayed === 0 ? '-' : `${accuracy.percent}% (${accuracy.totalCorrect}/${accuracy.totalPlayed})`;
    const roundScores = calculateScoreByRound(p);
    const roundAccuracies = calculateAccuracyByRound(p);
    html += `<tr><td>${index + 1}</td><td><strong>${p.name}</strong></td><td>${p.locked ? '🔒 Pret' : '✏️ En cours'}</td>`;
    roundScores.forEach((score, roundIndex) => {
      const roundAccuracy = roundAccuracies[roundIndex];
      const percentLabel = roundAccuracy.totalPlayed === 0
        ? '-'
        : `${roundAccuracy.percent}% (${roundAccuracy.totalCorrect}/${roundAccuracy.totalPlayed})`;
      html += `<td>${score} pts<br><small>${percentLabel}</small></td>`;
    });
    html += `<td style="font-weight:bold; color:#0c6b2f;">${p.score} pts</td><td>${maxPossible} pts</td><td>${accuracyLabel}</td></tr>`;
  });
  html += `</table>`;
  document.getElementById('content').innerHTML = html;
}

export function showDashboard() {
  state.players.forEach(p => p.score = calculateScore(p));
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  let html = buildTournamentSelector('dashboard');
  html += `<h2>Tableaux des participants — ${state.tournamentName || 'Tournoi'}</h2><div class="dashboard">`;
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
