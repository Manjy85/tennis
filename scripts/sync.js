// Synchronisation automatique (pensée pour tourner en cron / GitHub Actions).
//
// Deux modes selon l'entrée de tracked-tournaments.json :
//
// 1. { "wikipediaPage": "...", "name": "...", "tournamentId": "..." }
//    -> tableau COMPLET depuis Wikipedia (Grand Chelem) : joueurs aux vraies
//       positions du tirage, têtes de série, nationalités, et résultats des
//       deux modes (Prono Tableau + Prono Match).
//
// 2. { "type": "atp"|"wta", "seasonid": N, "name": "..." }
//    -> mode Prono Match uniquement, via l'API RapidAPI (cette API ne fournit
//       pas les positions du tirage, donc pas de bracket fiable).
//
// Dans les deux cas la synchro est additive : elle ne touche jamais aux
// pronostics déjà saisis par les joueurs (sous-collections + rg_players).
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { importMatches } = require('./tennis-api');
const { importWikipediaDraw } = require('./wikipedia-draw');
const { detectReplacements, reopenBranch, applyToOfficial } = require('./replacements');
const { discoverAtpDraws } = require('./discover');

// Journal du run : toutes les lignes loggées sont aussi capturées, puis écrites
// dans app/syncStatus en fin de run (affiché dans l'admin avec le timer).
const runLog = [];
for (const level of ['log', 'warn']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => { runLog.push(args.map(String).join(' ').trim()); orig(...args); };
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function roundName(matches) {
  if (matches === 1) return 'Finale';
  if (matches === 2) return 'Demi-finales';
  if (matches === 4) return 'Quarts';
  if (matches === 8) return 'Huitièmes';
  return `Tour des ${matches * 2}`;
}

function makeRounds(size) {
  const numRounds = Math.log2(size);
  if (!Number.isInteger(numRounds) || numRounds < 1) return null;
  const rounds = [];
  for (let i = 0; i < numRounds; i++) {
    const matches = size / Math.pow(2, i + 1);
    rounds.push({ name: roundName(matches), matches, points: (i + 1) * 5 });
  }
  return rounds;
}

// ── Mode Wikipedia : tableau complet ────────────────────────────────────────

// Dérive pm_matches du bracket (même logique que syncMatchesFromBracket côté
// admin) : un slot stable r{round}_m{index}, inclus quand les 2 joueurs sont
// connus, avec le résultat {winner, score} si le match est joué.
function buildBracketData(draw) {
  const size = draw.initialPlayers.length;
  const rounds = makeRounds(size);
  if (!rounds) throw new Error(`Taille de tableau invalide (${size} joueurs).`);

  // rg_results : tableau de NOMS de vainqueurs par round (format de l'appli).
  const officialResults = {};
  rounds.forEach((r, i) => {
    officialResults[`round${i}`] = Array(r.matches).fill(null).map((_, mi) => draw.results[i]?.[mi]?.winnerName || null);
  });

  const pmMatches = [];
  rounds.forEach((round, roundIndex) => {
    const roundPlayers = roundIndex === 0 ? draw.initialPlayers : officialResults[`round${roundIndex - 1}`];
    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      if (!p1 || !p2) continue;
      const res = draw.results[roundIndex]?.[i];
      const result = res && res.winnerName
        ? { winner: res.winnerName === p1 ? 'player1' : 'player2', score: res.score }
        : null;
      pmMatches.push({ id: `r${roundIndex}_m${i}`, round: round.name, player1: p1, player2: p2, result });
    }
  });

  return { rounds, officialResults, pmMatches };
}

async function syncWikipedia(db, tournamentId, name, page) {
  console.log(`\n${name} (wikipedia: ${page}) -> tournaments/${tournamentId}`);

  const ref = db.collection('tournaments').doc(tournamentId);
  const snap = await ref.get();

  // Tournoi déjà terminé en base (finale connue) : plus rien à synchroniser,
  // on s'épargne le re-parsing complet de la page Wikipedia à chaque run.
  if (snap.exists) {
    const d = snap.data();
    const nRounds = (d.rg_rounds || []).length;
    if (nRounds && ((d.rg_results || {})[`round${nRounds - 1}`] || [])[0]) {
      console.log(`  [terminé] finale déjà en base — synchro arrêtée pour ce tournoi.`);
      return;
    }
  }

  let draw;
  try {
    draw = await importWikipediaDraw(page);
  } catch (e) {
    console.warn(`  [erreur Wikipedia] ${e.message}`);
    return;
  }
  draw.warnings.forEach(w => console.warn(`  [avertissement] ${w}`));

  const { rounds, officialResults, pmMatches } = buildBracketData(draw);

  if (!snap.exists) {
    // Catégorie (barème du classement général) : bo5 = Grand Chelem, 64+ =
    // Masters 1000, sinon ATP 250 par défaut (les 500 se corrigent dans l'admin).
    const category = draw.format === 'bo5' ? 'gs' : draw.initialPlayers.length >= 64 ? 'm1000' : 'atp250';
    await ref.set({
      name,
      createdAt: new Date().toISOString(),
      category,
      wikipediaPage: page,
      rg_initialPlayers: draw.initialPlayers,
      rg_rounds: rounds,
      rg_results: officialResults,
      rg_players: [],
      rg_playerMeta: draw.playerMeta,
      pm_format: draw.format,
      pm_matches: pmMatches,
      pm_players: [],
    });
    const played = Object.values(officialResults).flat().filter(Boolean).length;
    console.log(`  [créé] ${draw.initialPlayers.length} joueurs (seeds + nationalités), format=${draw.format}, ${played} résultat(s).`);
    return;
  }

  const existing = snap.data();

  // Mémorise la page Wikipedia sur le doc : permet à la découverte automatique
  // de reconnaître un tournoi existant au lieu d'en recréer un double.
  if (existing.wikipediaPage !== page) {
    await ref.set({ wikipediaPage: page }, { merge: true });
  }

  // Garde-fou : si le tirage stocké ne correspond plus (autre tournoi, tableau
  // modifié à la main), on ne touche à rien.
  const stored = existing.rg_initialPlayers || [];
  if (stored.length !== draw.initialPlayers.length) {
    console.warn(`  [ignoré] taille du tableau stockée (${stored.length}) différente de Wikipedia (${draw.initialPlayers.length}) — vérifie manuellement.`);
    return;
  }

  // Remplacements de joueurs (lucky loser, qualifié révélé...) : mise à jour
  // du tableau officiel + réouverture de la branche touchée chez chaque
  // pronostiqueur (voir replacements.js). Au-delà d'1/8 du tableau qui change,
  // on suppose une mauvaise page et on ne touche à rien.
  const changes = detectReplacements(stored, draw.initialPlayers);
  if (changes.length > stored.length / 8) {
    console.warn(`  [ignoré] ${changes.length} positions du 1er tour diffèrent de Wikipedia — mauvais tournoi ? Vérifie manuellement.`);
    return;
  }
  let reopenedCount = 0;
  if (changes.length > 0) {
    changes.forEach(c => console.log(`  [remplacement] position ${c.position} : ${c.oldName || '(vide)'} -> ${c.newName}${c.reveal ? ' (révélation, pas de branche à rouvrir)' : ''}`));

    // Données officielles : nouveaux noms + méta, résultats de l'ancien nom purgés.
    const official = {
      rg_initialPlayers: [...stored],
      rg_playerMeta: { ...(existing.rg_playerMeta || {}) },
      rg_results: Object.fromEntries(Object.entries(existing.rg_results || {}).map(([k, v]) => [k, [...v]])),
    };
    applyToOfficial(official, changes);
    changes.forEach(c => {
      if (draw.playerMeta[c.newName]) official.rg_playerMeta[c.newName] = draw.playerMeta[c.newName];
      // set(..., {merge:true}) fusionne les maps sans effacer les clés absentes :
      // la méta de l'ancien joueur doit être supprimée explicitement.
      if (c.oldName && c.oldName !== 'Bye') official.rg_playerMeta[c.oldName] = admin.firestore.FieldValue.delete();
    });

    // Matchs "Prono Match" touchés : toute affiche impliquant un joueur sorti
    // (les pronostics posés dessus sont remis à zéro si le match n'est pas joué).
    const outgoing = new Set(changes.filter(c => !c.reveal).map(c => c.oldName));
    const affectedIds = new Set(changes.map(c => `r0_m${Math.floor(c.position / 2)}`));
    (existing.pm_matches || []).forEach(m => {
      if (!m.result && (outgoing.has(m.player1) || outgoing.has(m.player2))) affectedIds.add(m.id);
    });

    // Réouverture des branches chez chaque pronostiqueur tableau — y compris
    // pour les révélations (slot vide qui se remplit) : le match du 1er tour
    // doit redevenir remplissable sur un tableau verrouillé (reopenBranch ne
    // supprime aucun pick dans ce cas, il ne fait que rouvrir le slot).
    const tPredsSnap = await ref.collection('tableauPreds').get();
    for (const doc of tPredsSnap.docs) {
      const pred = doc.data();
      let touched = false;
      changes.forEach(c => { if (reopenBranch(pred, rounds, c)) touched = true; });
      if (touched) {
        await doc.ref.set({ predictions: pred.predictions, reopened: pred.reopened }, { merge: true });
        reopenedCount++;
      }
    }
    // Remise à zéro des pronos match posés sur les affiches modifiées.
    const mPredsSnap = await ref.collection('matchPreds').get();
    for (const doc of mPredsSnap.docs) {
      const pred = doc.data();
      const predictions = pred.predictions || {};
      let touched = false;
      affectedIds.forEach(id => { if (predictions[id]) { predictions[id] = {}; touched = true; } });
      if (touched) await doc.ref.set({ predictions }, { merge: true });
    }

    await ref.set({
      rg_initialPlayers: official.rg_initialPlayers,
      rg_playerMeta: official.rg_playerMeta,
      rg_results: official.rg_results,
    }, { merge: true });
    existing.rg_initialPlayers = official.rg_initialPlayers;
    existing.rg_results = official.rg_results;
    console.log(`  [remplacement] ${changes.length} position(s) mise(s) à jour, ${reopenedCount} tableau(x) de pronostiqueur rouvert(s) sur la branche touchée.`);
  }

  // Fusion additive des résultats : Wikipedia remplit, ne vide jamais.
  const prevResults = existing.rg_results || {};
  let added = 0;
  const mergedResults = {};
  rounds.forEach((r, i) => {
    const key = `round${i}`;
    const prev = prevResults[key] || Array(r.matches).fill(null);
    mergedResults[key] = prev.map((v, mi) => {
      const wiki = officialResults[key][mi];
      if (!v && wiki) { added++; return wiki; }
      return v || null;
    });
  });

  // pm_matches recalculés à partir des résultats fusionnés, en conservant les
  // résultats déjà posés sur les mêmes affiches.
  const prevPmById = {};
  (existing.pm_matches || []).forEach(m => { prevPmById[m.id] = m; });
  const mergedDraw = { ...draw, results: rounds.map((r, i) => mergedResults[`round${i}`].map((wn, mi) => {
    if (!wn) return null;
    const wiki = draw.results[i]?.[mi];
    return { winnerName: wn, score: wiki && wiki.winnerName === wn ? wiki.score : (prevPmById[`r${i}_m${mi}`]?.result?.score || '?') };
  })) };
  const rebuilt = buildBracketData(mergedDraw);

  // Après un remplacement, pm_matches doit être réécrit même sans nouveau
  // résultat : les affiches contiennent les noms des joueurs.
  if (added === 0 && changes.length === 0) {
    console.log(`  [inchangé] aucun nouveau résultat.`);
    return;
  }

  await ref.set({ rg_results: mergedResults, pm_matches: rebuilt.pmMatches }, { merge: true });
  console.log(`  [mis à jour] ${added} nouveau(x) résultat(s)${changes.length ? ', affiches pm_matches resynchronisées' : ''}.`);
}

// ── Mode RapidAPI : Prono Match uniquement ──────────────────────────────────

async function syncRapidApi(db, tournamentId, name, type, seasonid) {
  console.log(`\n${name} (${type} seasonid=${seasonid}) -> tournaments/${tournamentId}`);

  let matches, format;
  try {
    ({ matches, format } = await importMatches(type, seasonid));
  } catch (e) {
    console.warn(`  [erreur API] ${e.message}`);
    return;
  }

  const ref = db.collection('tournaments').doc(tournamentId);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      name,
      createdAt: new Date().toISOString(),
      rg_initialPlayers: [],
      rg_rounds: [],
      rg_results: {},
      rg_players: [],
      rg_playerMeta: {},
      pm_format: format,
      pm_matches: matches,
      pm_players: [],
    });
    console.log(`  [créé] format=${format}, ${matches.length} match(s) importé(s), ${matches.filter(m => m.result).length} déjà joué(s).`);
    return;
  }

  const existing = snap.data();
  const prevById = {};
  (existing.pm_matches || []).forEach(m => { prevById[m.id] = m; });

  let added = 0, updated = 0;
  matches.forEach(m => {
    const prev = prevById[m.id];
    if (!prev) added++;
    else if (JSON.stringify(prev.result) !== JSON.stringify(m.result)) updated++;
  });

  // Corrige le format seulement s'il diffère ET qu'aucun joueur n'a encore
  // pronostiqué (les pronos sont dans la sous-collection matchPreds) — pour ne
  // jamais changer les règles de scoring en cours de route.
  let fixFormat = false;
  if (existing.pm_format !== format) {
    const preds = await ref.collection('matchPreds').limit(1).get();
    fixFormat = preds.empty;
    if (!preds.empty) {
      console.warn(`  [avertissement] format réel = ${format} mais des joueurs ont déjà pronostiqué en ${existing.pm_format} — format inchangé, à arbitrer manuellement.`);
    }
  }

  if (added === 0 && updated === 0 && !fixFormat) {
    console.log(`  [inchangé] aucun nouveau match ni résultat.`);
    return;
  }

  const patch = { pm_matches: matches };
  if (fixFormat) patch.pm_format = format;
  await ref.set(patch, { merge: true });
  console.log(`  [mis à jour] ${added} nouveau(x) match(s), ${updated} résultat(s) mis à jour${fixFormat ? `, format corrigé -> ${format}` : ''}.`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const configPath = path.join(__dirname, 'tracked-tournaments.json');
  const tracked = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  // Un fichier vide n'arrête PAS le run : la découverte automatique alimente
  // la liste toute seule (le fichier ne sert plus qu'aux ajouts manuels).

  admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
  const db = admin.firestore();

  // Espacement adaptatif : le workflow tourne souvent (cron 15 min) et c'est
  // ici qu'on décide de taper ou non sur les sources, d'après le timestamp de
  // la dernière synchro stocké dans app/syncStatus.
  //  - RapidAPI (quota 50 appels/jour, ~2 appels/tournoi/run) : 75 min entre
  //    deux runs PAR tournoi suivi via l'API (1 tournoi -> 1h15, 2 -> 2h30...).
  //  - Wikipedia (pas de quota) : espacement de courtoisie d'1h.
  // FORCE_SYNC=1 (bouton "Run workflow" manuel) court-circuite l'espacement.
  const now = Date.now();
  const force = process.env.FORCE_SYNC === '1';
  const statusRef = db.collection('app').doc('syncStatus');
  const status = (await statusRef.get()).data() || {};
  const apiCount = tracked.filter(t => !t.wikipediaPage && t.type && t.seasonid).length;
  const apiIntervalMin = 75 * apiCount;
  const apiDue = force || !status.lastRapidApiAt || now - Date.parse(status.lastRapidApiAt) >= apiIntervalMin * 60000;
  const wikiDue = force || !status.lastWikipediaAt || now - Date.parse(status.lastWikipediaAt) >= 60 * 60000;

  // Découverte automatique des tournois ATP de la saison (voir discover.js) :
  // les tournois dont le tirage vient d'être publié sur Wikipedia s'ajoutent
  // tout seuls, sans toucher à tracked-tournaments.json.
  if (wikiDue) {
    const discoveryRef = db.collection('app').doc('autoDiscovery');
    const discoveryData = (await discoveryRef.get()).data() || {};
    const year = new Date(now).getUTCFullYear();
    const { entries, newStatus, log } = await discoverAtpDraws(discoveryData, year, now);
    log.forEach(l => console.log(l));
    await discoveryRef.set(newStatus);

    // Jamais de doublon : un tournoi découvert est rattaché au doc existant
    // s'il y en a un pour la même page Wikipedia ou le même nom (créé à la
    // main dans l'admin, ou listé dans tracked-tournaments.json).
    const already = new Set(tracked.map(t => t.wikipediaPage || `${t.type}:${t.seasonid}`));
    const docsSnap = await db.collection('tournaments').select('name', 'wikipediaPage').get();
    const pageToId = {}, nameSlugToId = {};
    docsSnap.forEach(d => {
      const v = d.data();
      if (v.wikipediaPage) pageToId[v.wikipediaPage] = d.id;
      nameSlugToId[slugify(v.name || d.id)] = d.id;
    });
    entries.forEach(e => {
      if (already.has(e.wikipediaPage)) return;
      const existingId = pageToId[e.wikipediaPage] || nameSlugToId[slugify(e.name)];
      if (existingId && existingId !== e.tournamentId) {
        console.log(`[découverte] ${e.name} : tournoi existant (${existingId}) — synchronisé sans recréation.`);
        e.tournamentId = existingId;
      }
      tracked.push(e);
    });
  }

  let ranApi = false, ranWiki = false;
  for (const t of tracked) {
    const tournamentId = t.tournamentId || `${slugify(t.name)}${t.seasonid ? `-${t.seasonid}` : ''}`;
    if (t.wikipediaPage) {
      if (!wikiDue) continue;
      ranWiki = true;
      await syncWikipedia(db, tournamentId, t.name, t.wikipediaPage);
    } else if (t.type && t.seasonid) {
      if (!apiDue) continue;
      ranApi = true;
      await syncRapidApi(db, tournamentId, t.name, t.type, t.seasonid);
    } else {
      console.warn(`\n[config invalide] ${JSON.stringify(t)} — il faut soit "wikipediaPage", soit "type"+"seasonid".`);
    }
  }

  if (!ranApi && !ranWiki) {
    console.log(`Rien à faire : prochaine synchro RapidAPI dans ${Math.max(0, Math.ceil(apiIntervalMin - (now - Date.parse(status.lastRapidApiAt || 0)) / 60000))} min, Wikipedia au prochain run après 1h. (app/syncStatus inchangé)`);
    return;
  }

  console.log('\nTerminé. Pense à ouvrir le tournoi une fois dans l\'admin pour le rendre actif côté joueurs.');

  // Statut du run pour l'admin (dernière synchro + journal).
  const statusPatch = {
    lastRunAt: new Date().toISOString(),
    log: runLog.filter(Boolean).slice(-50),
  };
  // Les échéances "next*" servent à l'affichage admin (le vrai run sera le
  // prochain tick du cron 15 min après l'échéance).
  if (ranApi) {
    statusPatch.lastRapidApiAt = new Date(now).toISOString();
    statusPatch.nextRapidApiAt = new Date(now + apiIntervalMin * 60000).toISOString();
  }
  if (ranWiki) {
    statusPatch.lastWikipediaAt = new Date(now).toISOString();
    statusPatch.nextWikipediaAt = new Date(now + 60 * 60000).toISOString();
  }
  await statusRef.set(statusPatch, { merge: true });
}

main().catch(e => { console.error('Erreur :', e.message); process.exit(1); });
