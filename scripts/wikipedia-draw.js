// Récupère le tableau COMPLET d'un tournoi (Grand Chelem 128 joueurs) depuis
// Wikipedia : positions réelles du tirage, têtes de série, nationalités et
// résultats de chaque match. Les pages "draw" de Wikipedia (ex :
// "2026 Wimbledon Championships – Men's singles") contiennent des templates
// de bracket ({{16TeamBracket-Compact-Tennis5}}) où la position de chaque
// joueur EST celle du tirage officiel — ce qu'aucune des APIs testées ne
// fournissait avant le début du tournoi.
//
// Structure attendue de la page (standard pour les Grands Chelems) :
//   - une section "Finals"  : 8TeamBracket  -> quarts, demis, finale
//   - huit sections "Section 1".."Section 8" : 16TeamBracket -> tours 1 à 4
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'prono-tableau-sync/1.0 (jeu de pronostics entre amis)';

async function wikiGet(params, attempt = 1) {
  const url = `${WIKI_API}?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 429 && attempt <= 3) {
    // Throttling temporaire : on attend et on retente (rien ne presse en cron).
    const wait = attempt * 60000;
    console.warn(`  [Wikipedia 429] attente ${wait / 1000}s avant nouvelle tentative (${attempt}/3)...`);
    await new Promise(r => setTimeout(r, wait));
    return wikiGet(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikipedia ${res.status} : ${await res.text()}`);
  const data = await res.json();
  if (data.error) throw new Error(`Wikipedia : ${data.error.info}`);
  return data;
}

// ── Parsing du wikitext ─────────────────────────────────────────────────────

// Extrait les paramètres "| clé = valeur" d'un template de bracket (un par ligne).
function parseParams(wikitext) {
  const params = {};
  for (const line of wikitext.split('\n')) {
    const m = line.match(/^\s*\|\s*([\w-]+)\s*=\s*(.*)$/);
    if (m) params[m[1]] = m[2].trim();
  }
  return params;
}

// Décode une valeur RDx-teamYY : nom complet (cible du wikilien), nationalité
// (flagicon), vainqueur (texte en gras '''...''').
// Un {{bye}} explicite est distingué d'un slot simplement vide/inconnu (TBD) :
// le bye donne une qualification automatique, le slot inconnu non.
function parseTeam(value) {
  if (value && /{{\s*bye\s*}}/i.test(value)) return { bye: true };
  if (!value) return null;
  const winner = value.includes("'''");
  const natMatch = value.match(/{{\s*flagicon\s*\|\s*([A-Za-z]*)\s*}}/);
  const nat = natMatch ? natMatch[1].toUpperCase() : '';
  const linkMatch = value.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/);
  if (!linkMatch) return null;
  // "Tommy Paul (tennis)" -> "Tommy Paul" ; "Jordan Thompson (tennis)" idem.
  const name = linkMatch[1].replace(/\s*\((?:tennis|tennis player)[^)]*\)\s*$/i, '').trim();
  return { name, nat, winner };
}

// Valeur numérique d'un score de set ("'''7<sup>7</sup>'''" -> 7). null si vide/non numérique.
function parseSetScore(value) {
  if (!value) return null;
  const clean = value.replace(/'''/g, '').replace(/<sup>.*?<\/sup>/g, '').trim();
  const m = clean.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Extrait d'un template de bracket tous ses matchs : { round, matchIndex,
// team1, team2, sets1, sets2, walkover }. Les numéros de slot peuvent être
// "1" ou "01" selon le template.
function parseBracket(wikitext) {
  const params = parseParams(wikitext);
  const teams = new Map(); // "r:slot" -> team
  const scores = new Map(); // "r:slot" -> [set1, set2, ...]
  const retired = new Set(); // "r:slot" ayant un marqueur d'abandon <sup>r</sup>

  for (const [key, value] of Object.entries(params)) {
    let m = key.match(/^RD(\d+)-team0*(\d+)$/);
    if (m) { teams.set(`${m[1]}:${m[2]}`, parseTeam(value)); continue; }
    m = key.match(/^RD(\d+)-score0*(\d+)-(\d+)$/);
    if (m) {
      const k = `${m[1]}:${m[2]}`;
      if (!scores.has(k)) scores.set(k, []);
      scores.get(k)[parseInt(m[3], 10) - 1] = parseSetScore(value);
      // Wikipedia marque l'abandon par <sup>r</sup> sur le dernier set du joueur qui abandonne.
      if (/<sup>\s*r\s*<\/sup>/i.test(value)) retired.add(k);
    }
  }

  const seeds = new Map(); // "r:slot" -> seed
  for (const [key, value] of Object.entries(params)) {
    const m = key.match(/^RD(\d+)-seed0*(\d+)$/);
    if (m) seeds.set(`${m[1]}:${m[2]}`, value.replace(/'''/g, '').trim());
  }

  // Géométrie FIXE déduite de la taille du template ({{16TeamBracket...}} ->
  // RD1 = 16 slots, RD2 = 8...) plutôt que des slots observés : les templates
  // "-Byes" (Masters 1000) omettent simplement les slots des byes au 1er tour,
  // et un slot absent ne doit pas décaler les positions des suivants.
  const sizeMatch = wikitext.match(/{{\s*(\d+)TeamBracket/);
  const numRounds = Math.max(0, ...[...teams.keys()].map(k => parseInt(k.split(':')[0], 10)));
  const bracketSize = sizeMatch ? parseInt(sizeMatch[1], 10) : Math.pow(2, numRounds);

  const matches = [];
  for (let r = 1; r <= numRounds; r++) {
    const slotsInRound = bracketSize / Math.pow(2, r - 1);
    for (let slot = 1; slot + 1 <= slotsInRound; slot += 2) {
      matches.push({
        round: r,
        matchIndex: (slot - 1) / 2,
        team1: teams.get(`${r}:${slot}`) || null,
        team2: teams.get(`${r}:${slot + 1}`) || null,
        seed1: seeds.get(`${r}:${slot}`) || '',
        seed2: seeds.get(`${r}:${slot + 1}`) || '',
        sets1: scores.get(`${r}:${slot}`) || [],
        sets2: scores.get(`${r}:${slot + 1}`) || [],
        retired: retired.has(`${r}:${slot}`) || retired.has(`${r}:${slot + 1}`),
      });
    }
  }
  // getTeam(r, slot) permet de résoudre les byes : un match du 1er tour sans
  // aucun joueur correspond à une tête de série qui entre directement au 2e tour.
  return { matches, getTeam: (r, slot) => teams.get(`${r}:${slot}`) || null };
}

// Score "sets vainqueur - sets perdant" d'un match, au format de l'appli
// ("3-1", "2-0"...), ou "WO"/"AB" si le match ne s'est pas joué / terminé.
function matchScore(match, winnerSide, bestOf) {
  if (match.retired) return 'AB';
  let s1 = 0, s2 = 0, played = 0;
  const nSets = Math.max(match.sets1.length, match.sets2.length);
  for (let k = 0; k < nSets; k++) {
    const a = match.sets1[k], b = match.sets2[k];
    if (a == null || b == null) continue;
    played++;
    if (a > b) s1++; else if (b > a) s2++;
  }
  if (played === 0) return 'WO'; // vainqueur connu sans aucun set joué : forfait
  const winnerSets = winnerSide === 'player1' ? s1 : s2;
  const loserSets  = winnerSide === 'player1' ? s2 : s1;
  const needed = Math.ceil(bestOf / 2);
  if (winnerSets < needed) return 'AB'; // vainqueur sans majorité de sets : abandon en cours de match
  return `${winnerSets}-${loserSets}`;
}

// ── Assemblage du tableau complet ───────────────────────────────────────────

// Récupère la liste des sections de la page pour trouver "Finals" et les
// portions du tableau : "Section 1..N" (Grand Chelem, Masters 1000) ou
// "Top half"/"Bottom half" (ATP 250/500).
async function fetchDrawStructure(page) {
  const data = await wikiGet({ action: 'parse', page, prop: 'sections' });
  const sections = data.parse.sections;
  const finals = sections.find(s => /^finals$/i.test(s.line.trim()));

  let parts = sections
    .filter(s => /^section\s+\d+$/i.test(s.line.trim()))
    .sort((a, b) => parseInt(a.line.match(/\d+/)[0], 10) - parseInt(b.line.match(/\d+/)[0], 10));
  if (parts.length === 0) {
    const top = sections.find(s => /^top\s+half$/i.test(s.line.trim()));
    const bottom = sections.find(s => /^bottom\s+half$/i.test(s.line.trim()));
    if (top && bottom) parts = [top, bottom];
  }

  if (!finals || parts.length === 0) {
    throw new Error(`Structure de tableau non reconnue sur la page "${page}" (sections Finals + Section N / Top half + Bottom half introuvables).`);
  }
  return { finalsIndex: finals.index, sectionIndexes: parts.map(s => s.index) };
}

async function fetchSectionWikitext(page, sectionIndex) {
  const data = await wikiGet({ action: 'parse', page, prop: 'wikitext', section: sectionIndex });
  return data.parse.wikitext['*'];
}

// Importe le tableau complet : initialPlayers (128, positions réelles),
// playerMeta {seed, nat}, results[roundIndex][matchIndex] = { winnerName, score },
// format (bo3/bo5).
async function importWikipediaDraw(page) {
  const { finalsIndex, sectionIndexes } = await fetchDrawStructure(page);

  // Requêtes séquentielles avec un léger délai : l'API Wikipedia limite les
  // rafales parallèles (429), et rien ne presse pour un cron.
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const finalsText = await fetchSectionWikitext(page, finalsIndex);
  const sectionTexts = [];
  for (const i of sectionIndexes) {
    await pause(1000);
    sectionTexts.push(await fetchSectionWikitext(page, i));
  }

  const bestOf = /Tennis5/.test(sectionTexts[0]) ? 5 : 3;
  const nSections = sectionTexts.length;
  const warnings = [];

  const initialPlayers = [];
  const playerMeta = {};
  // results[appRound][matchIndex] = { winnerName, score } | null
  const results = [];

  const setResult = (appRound, matchIndex, value) => {
    if (!results[appRound]) results[appRound] = [];
    results[appRound][matchIndex] = value;
  };

  // Résultat d'un match dont les deux équipes sont connues, ou d'un bye
  // (au 1er tour uniquement : un {{bye}} qualifie l'adversaire d'office, WO).
  const matchResult = (m, isFirstRound) => {
    const t1 = m.team1, t2 = m.team2;
    if (isFirstRound) {
      if (t1 && !t1.bye && t2?.bye) return { winnerName: t1.name, score: 'WO' };
      if (t2 && !t2.bye && t1?.bye) return { winnerName: t2.name, score: 'WO' };
    }
    if (!t1 || !t2 || t1.bye || t2.bye) return null;
    const winnerSide = t1.winner && !t2.winner ? 'player1' : t2.winner && !t1.winner ? 'player2' : null;
    if (!winnerSide) return null;
    const winnerName = winnerSide === 'player1' ? t1.name : t2.name;
    return { winnerName, score: matchScore(m, winnerSide, bestOf) };
  };

  let byes = 0;

  // Sections ("Section 1..8" ou "Top half"/"Bottom half") : premiers tours du tableau.
  sectionTexts.forEach((text, s) => {
    const bracket = parseBracket(text);
    const matches = bracket.matches;
    const rd1Count = matches.filter(m => m.round === 1).length; // 8 pour une section de 16

    matches.forEach(m => {
      const appRound = m.round - 1;
      const perSection = rd1Count / Math.pow(2, m.round - 1);
      const globalIndex = s * perSection + m.matchIndex;

      if (m.round === 1) {
        // Bye "implicite" (templates -Byes des Masters 1000) : le match du 1er
        // tour n'a aucun joueur, la tête de série entre directement au 2e tour.
        if (!m.team1 && !m.team2) {
          const advancing = bracket.getTeam(2, m.matchIndex + 1);
          if (advancing && !advancing.bye && advancing.name) {
            initialPlayers.push(advancing.name, 'Bye');
            byes++;
            const seed = bracket.matches.find(x => x.round === 2 && x.matchIndex === Math.floor(m.matchIndex / 2));
            const seedVal = seed ? (m.matchIndex % 2 === 0 ? seed.seed1 : seed.seed2) : '';
            playerMeta[advancing.name] = { seed: seedVal || '', nat: advancing.nat || '' };
            setResult(appRound, globalIndex, { winnerName: advancing.name, score: 'WO' });
            return;
          }
        }

        // Positions réelles du tirage + méta (seed, nationalité). Un {{bye}}
        // explicite occupe son slot sous le nom "Bye".
        [['team1', 'seed1'], ['team2', 'seed2']].forEach(([tk, sk]) => {
          const t = m[tk];
          if (t?.bye) { initialPlayers.push('Bye'); byes++; return; }
          initialPlayers.push(t ? t.name : '');
          if (t) playerMeta[t.name] = { seed: m[sk] || '', nat: t.nat || '' };
        });
      }

      setResult(appRound, globalIndex, matchResult(m, m.round === 1));
    });
  });

  const size = initialPlayers.length;
  const totalRounds = Math.log2(size);

  // Finals : les derniers tours. Selon le tournoi, la Finals peut chevaucher le
  // dernier tour des sections (ex : ATP 500, demi-finales présentes des deux
  // côtés) — dans ce cas on ne remplace jamais un résultat déjà posé par du vide.
  const finalsMatches = parseBracket(finalsText).matches;
  const finalsRounds = Math.max(...finalsMatches.map(m => m.round));
  finalsMatches.forEach(m => {
    const appRound = totalRounds - finalsRounds + (m.round - 1);
    const value = matchResult(m, false);
    if (value || !(results[appRound] && results[appRound][m.matchIndex])) {
      setResult(appRound, m.matchIndex, value);
    }
  });

  if ((size & (size - 1)) !== 0 || size === 0) {
    warnings.push(`Tableau de ${size} joueurs (pas une puissance de 2) — vérifier la page.`);
  }
  const missing = initialPlayers.filter(n => !n).length;
  if (missing > 0) {
    warnings.push(`${missing} position(s) du 1er tour sans joueur identifié (qualifiés non encore connus ou page incomplète).`);
  }
  if (byes > 0) {
    console.log(`  [info] ${byes} bye(s) au 1er tour (têtes de série exemptées) — qualifiés d'office (WO).`);
  }

  return { initialPlayers, playerMeta, results, format: bestOf === 5 ? 'bo5' : 'bo3', warnings };
}

module.exports = { importWikipediaDraw };
