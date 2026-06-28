// Scoring « pur » : travaille sur des données passées en argument (pas l'état
// global), pour pouvoir classer plusieurs tournois sur la même page.

// Points par round pour un pronostic tableau.
export function tabRoundScores(rounds, results, predictions) {
  return rounds.map((round, ri) => {
    let pts = 0;
    (predictions[`round${ri}`] || []).forEach((w, mi) => {
      if (w && w === (results[`round${ri}`] || [])[mi]) pts += round.points;
    });
    return pts;
  });
}

export function tabScore(rounds, results, predictions) {
  return tabRoundScores(rounds, results, predictions).reduce((a, b) => a + b, 0);
}

// Score maximal théorique encore atteignable (pour le suspense).
export function tabMax(rounds, results, initialPlayers, predictions) {
  const getPossible = (ri, mi) => {
    const off = (results[`round${ri}`] || [])[mi];
    if (off) return [off];
    if (ri === 0) return [initialPlayers[mi * 2], initialPlayers[mi * 2 + 1]].filter(Boolean);
    return [...new Set([...getPossible(ri - 1, mi * 2), ...getPossible(ri - 1, mi * 2 + 1)])];
  };
  let score = 0;
  rounds.forEach((round, ri) => {
    (predictions[`round${ri}`] || []).forEach((w, mi) => {
      if (!w) return;
      const off = (results[`round${ri}`] || [])[mi];
      if (off === w) { score += round.points; return; }
      if (off !== null && off !== undefined) return;
      if (getPossible(ri, mi).includes(w)) score += round.points;
    });
  });
  return score;
}

// Stats pronostics match : bons vainqueurs, scores exacts, points (3 / 1).
export function matchStats(matches, predictions) {
  let bons = 0, exacts = 0, pts = 0;
  matches.forEach(m => {
    if (!m.result) return;
    const pred = (predictions || {})[m.id];
    if (!pred || !pred.winner) return;
    if (pred.winner === m.result.winner) {
      bons++;
      if (pred.score === m.result.score) { exacts++; pts += 3; } else { pts += 1; }
    }
  });
  return { bons, exacts, pts };
}
