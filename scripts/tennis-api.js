const RAPIDAPI_HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';

async function callTennisApi(path) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('Variable d\'environnement RAPIDAPI_KEY manquante. Fais : export RAPIDAPI_KEY=ta_cle');

  const res = await fetch(`https://${RAPIDAPI_HOST}${path}`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST },
  });
  if (!res.ok) throw new Error(`Tennis API ${res.status} : ${await res.text()}`);
  return res.json();
}

async function searchTournaments(type, year) {
  const data = await callTennisApi(`/tennis/v2/${type}/tournament/calendar/${year}`);
  return (data.data || []).map(t => ({ id: t.id, name: t.name, date: t.date, tier: t.tier }));
}

// Compte, pour une liste de sets "6-3", combien en a gagné chacun des 2 joueurs
// tels que listés dans le champ "result" (toujours dans l'ordre player1/player2).
function countSetsWon(resultStr) {
  if (!resultStr) return null;
  const sets = String(resultStr).trim().split(/\s+/);
  let p1 = 0, p2 = 0;
  for (const set of sets) {
    const clean = set.replace(/\(.*?\)/g, '');
    const m = clean.match(/^(\d+)-(\d+)$/);
    if (!m) continue;
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a > b) p1++; else if (b > a) p2++;
  }
  if (p1 === 0 && p2 === 0) return null;
  return { p1, p2 };
}

// Un match de double a des noms composés "Joueur A/Joueur B". L'appli ne gère
// que le simple : on écarte ces matchs.
function isDoubles(m) {
  return (m.player1?.name || '').includes('/') || (m.player2?.name || '').includes('/');
}

// Clé stable d'un match = paire de joueurs (ids triés). Deux joueurs ne se
// rencontrent qu'une fois par tournoi, donc cette clé est fiable ET identique
// que le match vienne de "fixtures" (à venir) ou de "results" (terminé) — ce
// qui n'est PAS le cas de l'id de l'API (espaces d'ids différents entre les
// deux endpoints). C'est cette clé qui devient l'id du match côté appli, pour
// que le pronostic d'un joueur reste rattaché au match quand il passe de
// "à venir" à "terminé".
function matchKey(m) {
  const a = m.player1Id, b = m.player2Id;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `p_${lo}_${hi}`;
}

function resultFromCompleted(m) {
  if (m.match_winner == null) return null;
  const winnerSide = m.match_winner === m.player1Id ? 'player1' : m.match_winner === m.player2Id ? 'player2' : null;
  if (!winnerSide) return null;
  let score = 'AB'; // par défaut si le match ne va pas à son terme (retired, walkover...)
  if (m.result_type === 'completed') {
    const sets = countSetsWon(m.result);
    if (sets) {
      const winnerSets = winnerSide === 'player1' ? sets.p1 : sets.p2;
      const loserSets  = winnerSide === 'player1' ? sets.p2 : sets.p1;
      score = `${winnerSets}-${loserSets}`;
    }
  }
  return { winner: winnerSide, score };
}

function labelRoundsByCount(matchesByRoundId) {
  const sorted = [...matchesByRoundId.entries()].sort((a, b) => b[1] - a[1]);
  const label = new Map();
  sorted.forEach(([roundId, count]) => {
    const name = count === 1 ? 'Finale' : count === 2 ? 'Demi-finales' : count === 4 ? 'Quarts' : count === 8 ? 'Huitièmes' : `Tour des ${count * 2}`;
    label.set(roundId, name);
  });
  return label;
}

// Fusionne les matchs à venir (fixtures) et terminés (results) d'un tournoi en
// une seule liste "Prono Match", chaque match identifié par sa paire de joueurs.
// Un match terminé (résultat connu) prime toujours sur sa version "à venir".
function mergeMatches(fixtures, results) {
  const byKey = new Map();

  // Étiquettes de tour calculées sur l'ensemble des matchs connus.
  const countByRoundId = new Map();
  [...fixtures, ...results].forEach(m => {
    if (isDoubles(m)) return;
    countByRoundId.set(m.roundId, (countByRoundId.get(m.roundId) || 0) + 1);
  });
  const roundLabels = labelRoundsByCount(countByRoundId);

  const toEntry = (m, result) => ({
    id: matchKey(m),
    round: m.round?.name || roundLabels.get(m.roundId) || String(m.roundId),
    date: m.date || null,
    player1: m.player1?.name || '',
    player2: m.player2?.name || '',
    result,
  });

  // D'abord les matchs à venir (result = null).
  fixtures.forEach(m => {
    if (isDoubles(m)) return;
    byKey.set(matchKey(m), toEntry(m, null));
  });

  // Puis les matchs terminés : ils créent ou remplacent l'entrée (résultat connu).
  results.forEach(m => {
    if (isDoubles(m)) return;
    byKey.set(matchKey(m), toEntry(m, resultFromCompleted(m)));
  });

  return [...byKey.values()];
}

// Déduit le format (bo3/bo5) des résultats : si un vainqueur a gagné 3 sets
// (score "3-x"), c'est un tournoi best-of-5 (Grand Chelem masculin), sinon bo3.
function detectFormat(matches) {
  const won3 = matches.some(m => typeof m.result?.score === 'string' && /^3-\d$/.test(m.result.score));
  return won3 ? 'bo5' : 'bo3';
}

// seasonid et tournamentId ont la même valeur dans cette API (le champ
// tournamentId des matchs = l'id du tournoi dans le calendrier).
async function importMatches(type, tournamentId) {
  const [fxData, rsData] = await Promise.all([
    callTennisApi(`/tennis/v2/${type}/fixtures/tournament/${tournamentId}`).catch(() => ({ data: [] })),
    callTennisApi(`/tennis/v2/${type}/tournament/results/${tournamentId}`),
  ]);
  const fixtures = fxData.data || [];
  const results = (rsData.data && rsData.data.singles) || rsData.singles || [];
  const matches = mergeMatches(fixtures, results);
  if (matches.length === 0) throw new Error("Aucun match trouvé pour ce tournoi (id incorrect ?).");
  return { matches, format: detectFormat(matches) };
}

module.exports = { searchTournaments, importMatches };
