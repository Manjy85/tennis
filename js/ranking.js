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

// ── Classement général (points ATP) ─────────────────────────────────────────

// Barème ATP réel par palier de profondeur : vainqueur, finaliste, demi,
// quart, huitièmes... (le dernier palier utilisé = « 1er tour »).
const ATP_POINTS = {
  gs:     [2000, 1300, 800, 400, 200, 100, 50, 10],
  m1000:  [1000, 650, 400, 200, 100, 50, 30, 10],
  atp500: [500, 330, 200, 100, 50, 25, 13],
  atp250: [250, 165, 100, 50, 25, 13],
};
export const CATEGORY_LABELS = { gs: 'Grand Chelem', m1000: 'Masters 1000', atp500: 'ATP 500', atp250: 'ATP 250' };
const PARTICIPATION_POINTS = 5;

// Catégorie d'un tournoi : champ explicite si présent, sinon heuristique
// (bo5/128 joueurs = Grand Chelem, 64+ = Masters 1000, sinon ATP 250 —
// les ATP 500 se règlent dans l'admin, indiscernables d'un 250 par la taille).
export function categoryOf(doc) {
  if (doc.category && ATP_POINTS[doc.category]) return doc.category;
  const size = (doc.rg_initialPlayers || []).length;
  if (doc.pm_format === 'bo5' || size >= 128) return 'gs';
  if (size >= 64) return 'm1000';
  return 'atp250';
}

// Points ATP gagnés pour un rang donné dans un tournoi :
//  rang 1 -> vainqueur, 2 -> finaliste, 3-4 -> demis, 5-8 -> quarts...
//  au-delà du nombre de paliers -> points du 1er tour ;
//  au-delà de la taille du tableau -> points de participation (5).
export function atpPointsForRank(rank, category, bracketSize) {
  if (bracketSize && rank > bracketSize) return PARTICIPATION_POINTS;
  const scale = ATP_POINTS[category] || ATP_POINTS.atp250;
  const numRounds = bracketSize ? Math.log2(bracketSize) : scale.length - 1;
  const tiers = Math.min(scale.length, numRounds + 1);
  const tier = rank === 1 ? 0 : Math.floor(Math.log2(rank - 1)) + 1;
  return scale[Math.min(tier, tiers - 1)];
}

// Agrège un classement général à partir de listes par tournoi.
// perTournament : [{ category, bracketSize, rows: [{ uid, name, pts }] }]
// Retourne [{ uid, name, atp, details: [{tournament, rank, atp}] }] trié.
export function generalRanking(perTournament) {
  const acc = {};
  perTournament.forEach(({ name: tName, category, bracketSize, rows }) => {
    // Rang « compétition » : à égalité de points, même rang.
    const sorted = [...rows].sort((a, b) => b.pts - a.pts);
    sorted.forEach(r => {
      const rank = 1 + sorted.filter(x => x.pts > r.pts).length;
      const atp = atpPointsForRank(rank, category, bracketSize);
      if (!acc[r.uid]) acc[r.uid] = { uid: r.uid, name: r.name, atp: 0, details: [] };
      acc[r.uid].atp += atp;
      acc[r.uid].details.push({ tournament: tName, rank, atp });
    });
  });
  return Object.values(acc).sort((a, b) => b.atp - a.atp);
}

// Points d'un score exact selon le format : 2 en bo3 (2 scores possibles),
// 3 en bo5 (3 scores possibles, plus dur). Bon vainqueur seul : 1 pt.
export function exactScorePoints(format) {
  return format === 'bo5' ? 3 : 2;
}

// Stats pronostics match : bons vainqueurs, scores exacts, points.
export function matchStats(matches, predictions, format = 'bo3') {
  const exactPts = exactScorePoints(format);
  let bons = 0, exacts = 0, pts = 0;
  matches.forEach(m => {
    if (!m.result) return;
    const pred = (predictions || {})[m.id];
    if (!pred || !pred.winner) return;
    if (pred.winner === m.result.winner) {
      bons++;
      if (pred.score === m.result.score) { exacts++; pts += exactPts; } else { pts += 1; }
    }
  });
  return { bons, exacts, pts };
}
