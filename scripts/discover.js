// Découverte automatique des tournois ATP sur Wikipedia : plus besoin
// d'ajouter chaque tournoi à la main dans tracked-tournaments.json.
//
// Une recherche Wikipedia (catégorie "<année> ATP Tour" + titre "Singles" +
// présence d'un template de bracket) liste toutes les pages de tirage de la
// saison. Pour chaque page inconnue, on tente d'importer le tirage :
//   - tirage rempli et tournoi PAS terminé  -> ajouté (synchronisé ensuite à
//     chaque run, comme s'il était dans tracked-tournaments.json)
//   - tirage vide/incomplet (page créée avant le tirage au sort) -> "pending",
//     revérifié au plus toutes les RECHECK_HOURS heures
//   - tournoi déjà terminé (finale jouée) -> "ignored" définitivement (évite
//     de créer les tournois passés de la saison et de les re-parser à chaque run)
//
// L'état vit dans Firestore (app/autoDiscovery), géré par sync.js — ici tout
// est pur : on reçoit l'état, on rend l'état mis à jour + les entrées à suivre.
const { importWikipediaDraw, wikiGet } = require('./wikipedia-draw');

const RECHECK_HOURS = 6;

// Les tailles/formats de templates de bracket utilisés par les pages de tirage
// ATP (250/500 : 16+Byes ou 32 ; Masters : 32/64+Byes ; Grand Chelem : 16-Tennis5).
const BRACKET_TEMPLATES = [
  '16TeamBracket-Compact-Tennis3', '16TeamBracket-Compact-Tennis3-Byes',
  '32TeamBracket-Compact-Tennis3', '32TeamBracket-Compact-Tennis3-Byes',
  '64TeamBracket-Compact-Tennis3', '64TeamBracket-Compact-Tennis3-Byes',
  '16TeamBracket-Compact-Tennis5',
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Toutes les pages de tirage simple messieurs de la saison (une requête par
// template ; l'API search ne permet pas de OR fiable entre hastemplate).
async function searchDrawPages(year) {
  const titles = new Set();
  for (const tpl of BRACKET_TEMPLATES) {
    const data = await wikiGet({
      action: 'query', list: 'search', srlimit: '50',
      srsearch: `incategory:"${year} ATP Tour" intitle:singles hastemplate:"${tpl}"`,
    });
    (data.query?.search || []).forEach(r => titles.add(r.title));
    await new Promise(r => setTimeout(r, 500));
  }
  // Pages qualifications exclues ; les doubles le sont déjà par intitle:singles.
  return [...titles].filter(t => !/qualifying/i.test(t));
}

// statusData = contenu de app/autoDiscovery : { known: { [page]: { status, lastCheckedAt, tournamentId, name } } }
// Retourne { entries, newStatus, log } — entries au format tracked-tournaments.
async function discoverAtpDraws(statusData, year, now = Date.now()) {
  const known = { ...(statusData?.known || {}) };
  const log = [];

  let pages;
  try {
    pages = await searchDrawPages(year);
  } catch (e) {
    log.push(`[découverte] recherche Wikipedia impossible : ${e.message}`);
    return { entries: entriesFromKnown(known), newStatus: { known }, log };
  }

  for (const page of pages) {
    const k = known[page];
    if (k && (k.status === 'added' || k.status === 'ignored')) continue;
    if (k && k.lastCheckedAt && now - Date.parse(k.lastCheckedAt) < RECHECK_HOURS * 3600000) continue;

    let draw;
    try {
      console.log(`[découverte] examen de "${page}"...`);
      // Pause entre pages : l'examen complet d'une page fait ~10 requêtes,
      // et l'API Wikipedia rend des 429 quand on enchaîne trop vite.
      await new Promise(r => setTimeout(r, 3000));
      draw = await importWikipediaDraw(page);
    } catch (e) {
      log.push(`[découverte] ${page} : structure non reconnue (${e.message}) — nouvel essai dans ${RECHECK_HOURS}h.`);
      known[page] = { status: 'pending', lastCheckedAt: new Date(now).toISOString() };
      continue;
    }

    const size = draw.initialPlayers.length;
    const missing = draw.initialPlayers.filter(n => !n).length;
    const lastRound = draw.results[draw.results.length - 1] || [];
    const finished = !!lastRound[0];

    if (finished) {
      known[page] = { status: 'ignored', reason: 'tournoi terminé', lastCheckedAt: new Date(now).toISOString() };
      log.push(`[découverte] ${page} : tournoi déjà terminé — ignoré définitivement.`);
    } else if (size >= 16 && missing <= size / 4) {
      const name = page.replace(/\s*–.*$/, '').trim();
      known[page] = { status: 'added', name, tournamentId: slugify(name), lastCheckedAt: new Date(now).toISOString() };
      log.push(`[découverte] ${page} : tirage disponible (${size - missing}/${size} joueurs) — tournoi ajouté !`);
    } else {
      known[page] = { status: 'pending', lastCheckedAt: new Date(now).toISOString() };
      log.push(`[découverte] ${page} : tirage pas encore rempli (${size - missing}/${size || '?'} joueurs) — nouvel essai dans ${RECHECK_HOURS}h.`);
    }
  }

  return { entries: entriesFromKnown(known), newStatus: { known }, log };
}

function entriesFromKnown(known) {
  return Object.entries(known)
    .filter(([, v]) => v.status === 'added')
    .map(([page, v]) => ({ name: v.name, tournamentId: v.tournamentId, wikipediaPage: page }));
}

module.exports = { discoverAtpDraws };
