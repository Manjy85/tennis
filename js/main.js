import { state, loadState, switchTournament, setMe } from './state.js';
import { loadTournament, loadTableauPreds, loadMatchPreds } from './firebase.js';
import { tabRoundStats, tabScore, tabMax, matchStats, generalRanking, categoryOf, CATEGORY_LABELS, tournamentStarted, tournamentFinished } from './ranking.js';
import { ensureMyTableau, showBracket, selectWinner, lockBracket, toggleRound } from './tableau.js';
import { ensureMyMatch, showMatchsRestants, showRecap, toggleRecapRound, pickWinner, pickScore, lockMatch } from './match.js';
import {
  onAuth, displayNameOf, signUpEmail, signInEmail, signInGoogle, logout, authErrorMessage,
} from './auth.js';

// ── État de navigation ─────────────────────────────────────────────────────

let activeNav  = 'home';     // 'home' (tournois) | 'general' | 'pronos'
let pronosTab  = 'tableau';  // 'tableau' | 'restants' | 'recap'

// Affiche/masque la navigation principale.
function setNavVisible(visible) {
  const el = document.getElementById('mainnav');
  if (el) el.hidden = !visible;
}

function renderWelcome() {
  setNavVisible(false);
  document.getElementById('content').innerHTML = `
    <div class="welcome">
      <div class="welcome-emoji">🎾</div>
      <h2>Bienvenue sur Tennis Pronostics</h2>
      <p>Connecte-toi pour découvrir les tournois et faire tes pronostics.</p>
      <div class="welcome-actions">
        <button class="btn-primary" onclick="openAuthModal('signin')">Se connecter</button>
        <button class="btn-ghost" onclick="openAuthModal('signup')">Créer un compte</button>
      </div>
    </div>`;
}

function renderApp(user) {
  if (user) { setNavVisible(true); runActiveView(); }
  else      { renderWelcome(); }
}

// ── Navigation principale (Classement / Mes Pronostics) ─────────────────────

function setActiveNav(name) {
  activeNav = name;
  const map = { home: 'nav-home', general: 'nav-general', pronos: 'nav-pronos' };
  Object.values(map).forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById(map[name])?.classList.add('active');
}

function runActiveView() {
  if (activeNav === 'pronos' && state.me) { setActiveNav('pronos'); showMesPronos(); }
  else if (activeNav === 'general') { setActiveNav('general'); showGeneral(); }
  else { setActiveNav('home'); showClassement(); }
}

window.goHome = () => { setActiveNav('home'); showClassement(); };
window.goGeneral = () => { setActiveNav('general'); showGeneral(); };
window.goMesPronos = () => {
  if (!state.me) return window.requireLogin();
  setActiveNav('pronos');
  showMesPronos();
};

// ── Classement : toutes les tables empilées (Tableau + mini Match) ──────────

// Charge en parallèle les données complètes de chaque tournoi.
async function loadBundles() {
  return Promise.all(state.tournamentList.map(async t => {
    const [doc, tPreds, mPreds] = await Promise.all([
      loadTournament(t.id), loadTableauPreds(t.id), loadMatchPreds(t.id),
    ]);
    return { t, doc: doc || {}, tPreds, mPreds };
  }));
}

// ── Classement général (onglet dédié) : points ATP par tournoi selon la place ──

async function showGeneral() {
  const content = document.getElementById('content');
  if (!state.tournamentList.length) {
    content.innerHTML = `<p style="color:#888; padding:24px;">Aucun tournoi disponible pour le moment.</p>`;
    return;
  }
  content.innerHTML = `<p style="text-align:center;padding:40px;color:#666;">Chargement du classement général...</p>`;
  const bundles = await loadBundles();

  const tGeneralInput = [], mGeneralInput = [];
  bundles.forEach(({ t, doc, tPreds, mPreds }) => {
    const category = categoryOf(doc);
    const bracketSize = (doc.rg_initialPlayers || []).length || null;
    const finished = tournamentFinished(doc.rg_rounds, doc.rg_results);
    tGeneralInput.push({ name: t.name, category, bracketSize, finished,
      rows: tPreds.map(p => ({ uid: p.uid, name: p.displayName || p.uid,
        pts: tabScore(doc.rg_rounds || [], doc.rg_results || {}, p.predictions || {}) })) });
    mGeneralInput.push({ name: t.name, category, bracketSize, finished,
      rows: mPreds.map(p => ({ uid: p.uid, name: p.displayName || p.uid,
        pts: matchStats(doc.pm_matches || [], p.predictions || {}, doc.pm_format || 'bo3').pts })) });
  });

  const renderGeneral = (title, ranking) => {
    if (!ranking.length) return '';
    let h = `<section class="ranking-block general">
      <div class="ranking-title-row"><h3 class="ranking-title">${title}</h3></div>
      <div class="table-scroll"><table class="ranking-table"><thead><tr>
        <th>#</th><th>Joueur</th><th title="Points des tournois terminés">Réel</th>
        <th title="Réel + place actuelle des tournois en cours">Virtuel</th><th>Détail</th></tr></thead><tbody>`;
    ranking.forEach((r, i) => {
      const me = state.me && r.uid === state.me.uid;
      const detail = r.details.map(d => `${d.tournament} : ${d.rank}ᵉ (+${d.atp}${d.finished ? '' : ', en cours'})`).join(' · ');
      h += `<tr class="${me ? 'is-me-row' : ''}">
        <td>${i + 1}</td>
        <td><strong>${r.name}</strong>${me ? ' <span class="mine-tag">toi</span>' : ''}</td>
        <td class="pts">${r.real} pts</td>
        <td class="max">${r.virtual} pts</td>
        <td style="font-size:12px; color:#777;">${detail}</td>
      </tr>`;
    });
    return h + `</tbody></table></div></section>`;
  };

  let html = `<h2>Classement général</h2>
    <p style="color:#888; font-size:13px; margin:4px 0 16px;">
      Comme au tennis : ta place dans chaque tournoi te rapporte les points ATP de sa catégorie
      (Grand Chelem : 2000 au 1ᵉʳ… ATP 250 : 250), et 5 pts de participation au-delà de la taille du tableau.<br>
      <strong>Réel</strong> = tournois terminés uniquement · <strong>Virtuel</strong> = réel + ta place actuelle dans les tournois en cours.
    </p>`;
  html += renderGeneral('🏆 Général — Prono Tableau', generalRanking(tGeneralInput));
  html += renderGeneral('🥎 Général — Prono Match', generalRanking(mGeneralInput));
  if (!tGeneralInput.some(x => x.rows.length) && !mGeneralInput.some(x => x.rows.length)) {
    html += `<p style="color:#888; padding:24px;">Aucun participant pour l'instant.</p>`;
  }
  content.innerHTML = html;
}

// ── Classement des tournois ──────────────────────────────────────────────────

async function showClassement() {
  const content = document.getElementById('content');
  if (!state.tournamentList.length) {
    content.innerHTML = `<p style="color:#888; padding:24px;">Aucun tournoi disponible pour le moment.</p>`;
    return;
  }
  content.innerHTML = `<p style="text-align:center;padding:40px;color:#666;">Chargement des classements...</p>`;
  const bundles = await loadBundles();

  let html = `<h2>Tournois</h2>`;
  let myRemaining = 0;

  // Tournoi terminé (tous les résultats rentrés = la finale a un vainqueur) :
  // archivé à l'affichage, mais compte toujours dans les classements généraux.
  const isFinished = ({ doc }) => tournamentFinished(doc.rg_rounds, doc.rg_results);

  const renderBlock = ({ t, doc, tPreds, mPreds }, archived) => {
    let html = '';
    const rounds = doc.rg_rounds || [];
    const results = doc.rg_results || {};
    const initialPlayers = doc.rg_initialPlayers || [];
    const matches = doc.pm_matches || [];
    const category = categoryOf(doc);
    // Tournoi commencé = au moins un vrai résultat (les WO des byes ne comptent pas).
    const started = tournamentStarted(rounds, results, initialPlayers, matches);

    const iAmIn = state.me && (tPreds.some(p => p.uid === state.me.uid) || mPreds.some(p => p.uid === state.me.uid));
    html += `<section class="ranking-block">
      <div class="ranking-title-row">
        <h3 class="ranking-title">🎾 ${t.name} <span class="cat-badge">${CATEGORY_LABELS[category]}</span></h3>
        ${archived ? `<span class="closed-tag">🏁 Terminé</span>` : ''}
        ${!archived && state.me && !iAmIn && !started ? `<button class="btn-join-small" onclick="joinFromRanking('${t.id}')">🙋 Participer</button>` : ''}
        ${!archived && state.me && !iAmIn && started ? `<span class="closed-tag" title="Le tournoi a commencé, on ne peut plus s'inscrire">🔒 Inscriptions closes</span>` : ''}
        ${!archived && iAmIn ? `<span class="participating-tag">✓ Tu participes</span>` : ''}
      </div>`;

    // ── Table Tableau (détail par round + Max) ──
    const tRows = tPreds.map(p => {
      const rs = tabRoundStats(rounds, results, p.predictions || {});
      return {
        name: p.displayName || p.uid, locked: !!p.locked, roundStats: rs,
        total: rs.reduce((a, b) => a + b.pts, 0),
        max: tabMax(rounds, results, initialPlayers, p.predictions || {}),
        uid: p.uid,
      };
    }).sort((a, b) => b.total - a.total || b.max - a.max);

    if (!tRows.length) {
      html += `<p class="ranking-empty">Aucun pronostic tableau pour ce tournoi.</p>`;
    } else {
      html += `<div class="table-scroll"><table class="ranking-table"><thead><tr>
        <th>#</th><th>Joueur</th><th>Statut</th>`;
      rounds.forEach((r, i) => { html += `<th title="${r.name}">R${i + 1}</th>`; });
      html += `<th>Points</th><th>Max</th></tr></thead><tbody>`;
      tRows.forEach((r, i) => {
        const me = state.me && r.uid === state.me.uid;
        html += `<tr class="${me ? 'is-me-row' : ''}">
          <td>${i + 1}</td>
          <td><a href="#" class="player-link" title="Voir son tableau (les matchs non joués restent masqués)"
            onclick="event.preventDefault(); viewBracket('${t.id}','${r.uid}')"><strong>${r.name}</strong></a>${me ? ' <span class="mine-tag">toi</span>' : ''}</td>
          <td>${r.locked ? '🔒 Prêt' : '✏️ En cours'}</td>
          ${r.roundStats.map(s => `<td>${s.pts}${s.played ? `<br><small class="round-pct">(${Math.round(100 * s.correct / s.played)}%)</small>` : ''}</td>`).join('')}
          <td class="pts">${r.total} pts</td>
          <td class="max">${r.max} pts</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Mini-table Match ──
    const mRows = mPreds.map(p => {
      const s = matchStats(matches, p.predictions || {}, doc.pm_format || 'bo3');
      return { name: p.displayName || p.uid, uid: p.uid, ...s };
    }).filter(r => r.bons || r.exacts || r.pts || true).sort((a, b) => b.pts - a.pts || b.exacts - a.exacts);

    if (mRows.length && matches.length) {
      const played = matches.filter(m => m.result).length;
      html += `<div class="mini-rank-head">🥎 Pronostics matchs <small>(${played}/${matches.length} joués)</small></div>
        <div class="table-scroll"><table class="ranking-table mini"><thead><tr>
        <th>#</th><th>Joueur</th><th>Bons vainqueurs</th><th>Scores exacts</th><th>Points</th></tr></thead><tbody>`;
      mRows.forEach((r, i) => {
        const me = state.me && r.uid === state.me.uid;
        html += `<tr class="${me ? 'is-me-row' : ''}">
          <td>${i + 1}</td>
          <td><strong>${r.name}</strong>${me ? ' <span class="mine-tag">toi</span>' : ''}</td>
          <td>${r.bons} / ${played}</td>
          <td>${r.exacts} / ${played}</td>
          <td class="pts">${r.pts} pts</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    html += `</section>`;

    // Comptage des pronostics restants de l'utilisateur (pour le bandeau) —
    // uniquement dans les tournois actifs auxquels il participe.
    if (state.me && !archived) {
      const myT = tPreds.find(p => p.uid === state.me.uid);
      const myM = mPreds.find(p => p.uid === state.me.uid);
      if (myT) {
        // Tableau : seules les cases encore pronosticables comptent (pas de
        // résultat officiel connu, pas un slot de bye).
        rounds.forEach((r, ri) => {
          for (let mi = 0; mi < r.matches; mi++) {
            if (((results[`round${ri}`] || [])[mi])) continue;
            if (ri === 0 && (initialPlayers[mi * 2] === 'Bye' || initialPlayers[mi * 2 + 1] === 'Bye')) continue;
            if (!((myT.predictions || {})[`round${ri}`] || [])[mi]) myRemaining++;
          }
        });
      }
      if (myM) {
        // Match : un match joué sans prono verrouillé n'est plus « restant ».
        myRemaining += matches.filter(m => !m.result && !((myM.predictions || {})[m.id] || {}).locked).length;
      }
    }
    return html;
  };

  bundles.filter(b => !isFinished(b)).forEach(b => { html += renderBlock(b, false); });
  const archivedBundles = bundles.filter(isFinished);
  if (archivedBundles.length) {
    html += `<details class="archive-block">
      <summary>🗄️ Tournois terminés (${archivedBundles.length})</summary>`;
    archivedBundles.forEach(b => { html += renderBlock(b, true); });
    html += `</details>`;
  }

  // Bandeau d'appel à l'action en tête.
  let banner = '';
  if (state.me && myRemaining > 0) {
    banner = `<div class="cta-banner">
      <span>🎯 Il te reste <strong>${myRemaining}</strong> pronostic${myRemaining > 1 ? 's' : ''} à compléter.</span>
      <button class="btn-primary" onclick="goMesPronos()">Compléter mes pronostics</button>
    </div>`;
  } else if (state.me) {
    banner = `<div class="cta-banner done"><span>✅ Tous tes pronostics sont complétés.</span>
      <button class="btn-ghost" onclick="goMesPronos()">Voir / modifier</button></div>`;
  }

  content.innerHTML = banner + html;
}

// ── Mes Pronostics : sélecteur tournoi + 3 sous-onglets ─────────────────────

// Participe-t-il déjà à ce tournoi ? (un doc de pronostic existe)
function isParticipating() {
  if (!state.me) return false;
  return state.tPlayers.some(p => p.uid === state.me.uid) || state.mPlayers.some(p => p.uid === state.me.uid);
}

function showMesPronos() {
  const content = document.getElementById('content');
  if (!state.currentTournamentId) {
    content.innerHTML = `<p style="color:#888; padding:24px;">Aucun tournoi disponible.</p>`;
    return;
  }

  const selector = state.tournamentList.length > 1
    ? `<select class="tournament-select" onchange="pronosSwitchTournament(this.value)">
        ${state.tournamentList.map(t => `<option value="${t.id}" ${t.id === state.currentTournamentId ? 'selected' : ''}>${t.name}</option>`).join('')}
       </select>`
    : `<span class="tournament-name">🎾 ${state.tournamentName}</span>`;

  // Participation explicite : consulter un tournoi n'inscrit pas — on ne crée
  // les docs de pronostic qu'au clic sur "Je participe".
  if (!isParticipating()) {
    const started = currentTournamentStarted();
    content.innerHTML = `
      <div class="pronos-head">
        <h2>Mes Pronostics</h2>
        ${selector}
      </div>
      <div class="join-card">
        <div class="join-emoji">${started ? '🔒' : '🎾'}</div>
        <h3>${state.tournamentName}</h3>
        ${started
          ? `<p>Le tournoi a commencé : les inscriptions sont closes.<br>
             Tu pourras rejoindre le prochain tournoi dès son ouverture.</p>`
          : `<p>Tu ne participes pas encore à ce tournoi.<br>
             Un seul clic t'inscrit aux deux jeux (Tableau + Matchs) — jusqu'au premier match joué.</p>
             <button class="btn-primary" onclick="joinTournament()">🙋 Je participe à ce tournoi</button>`}
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="pronos-head">
      <h2>Mes Pronostics</h2>
      ${selector}
    </div>
    <div class="subtabs">
      <button class="subtab" id="sub-tableau"  onclick="setPronosTab('tableau')">🏆 Tableau</button>
      <button class="subtab" id="sub-restants" onclick="setPronosTab('restants')">🎾 Matchs restants</button>
      <button class="subtab" id="sub-recap"    onclick="setPronosTab('recap')">📋 Récap</button>
    </div>
    <div id="pp-body"></div>`;

  renderPronosBody();
}

// Le tournoi courant a-t-il commencé ? (au moins un vrai résultat, hors byes)
function currentTournamentStarted() {
  return tournamentStarted(state.rounds, state.officialResults, state.initialPlayers, state.matches);
}

window.joinTournament = () => {
  if (!state.me) return window.requireLogin();
  if (currentTournamentStarted()) return alert('Le tournoi a commencé, les inscriptions sont closes.');
  ensureMyTableau();
  ensureMyMatch();
  showMesPronos();
};

// Voir le tableau d'un autre joueur depuis le classement (lecture seule ;
// ses picks sur les matchs non joués sont masqués par showBracket).
window.viewBracket = async (tournamentId, uid) => {
  const content = document.getElementById('content');
  if (tournamentId !== state.currentTournamentId) {
    content.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">Chargement...</p>';
    await switchTournament(tournamentId);
  }
  content.innerHTML = `
    <a href="#" class="back-link" style="display:inline-block;margin-bottom:12px;"
      onclick="event.preventDefault(); goHome();">← Retour au classement</a>
    <div id="view-bracket-body"></div>`;
  showBracket(uid, 'view-bracket-body');
};

// Rejoindre un tournoi depuis la page Classement : bascule dessus puis ouvre
// directement "Mes Pronostics" avec la carte de participation validée.
window.joinFromRanking = async (id) => {
  if (!state.me) return window.requireLogin();
  if (id !== state.currentTournamentId) await switchTournament(id);
  if (currentTournamentStarted()) {
    alert('Le tournoi a commencé, les inscriptions sont closes.');
    return showClassement();
  }
  ensureMyTableau();
  ensureMyMatch();
  setActiveNav('pronos');
  showMesPronos();
};

function renderPronosBody() {
  const uid = state.me.uid;
  ['tableau', 'restants', 'recap'].forEach(t =>
    document.getElementById(`sub-${t}`)?.classList.toggle('active', t === pronosTab));

  if (pronosTab === 'tableau')       showBracket(uid, 'pp-body');
  else if (pronosTab === 'restants') showMatchsRestants(uid, 'pp-body');
  else                               showRecap(uid, 'pp-body');
}

window.setPronosTab = (t) => { pronosTab = t; renderPronosBody(); };

window.pronosSwitchTournament = async (id) => {
  if (id === state.currentTournamentId) return;
  document.getElementById('pp-body').innerHTML = '<p style="text-align:center;padding:40px;color:#666;">Chargement...</p>';
  await switchTournament(id);
  showMesPronos();
};

// ── Authentification : zone header ─────────────────────────────────────────

function renderAuthZone(user) {
  const el = document.getElementById('auth-zone');
  if (!el) return;
  if (user) {
    el.innerHTML = `<span class="auth-hello">👋 ${displayNameOf(user)}</span>
      <button class="auth-btn-ghost" onclick="doLogout()">Déconnexion</button>`;
  } else {
    el.innerHTML = `<button class="auth-btn-ghost" onclick="openAuthModal('signin')">Se connecter</button>`;
  }
}

// ── Authentification : modale ──────────────────────────────────────────────

window.requireLogin = () => openAuthModal('signin');
window.openAuthModal = (tab = 'signin') => renderAuthModal(tab);

window.closeAuthModal = () => {
  const m = document.getElementById('auth-modal');
  m.hidden = true;
  m.querySelector('#auth-modal-card').innerHTML = '';
};

window.switchAuthTab = (tab) => renderAuthModal(tab);

function renderAuthModal(tab, errorMsg = '') {
  const m = document.getElementById('auth-modal');
  const card = document.getElementById('auth-modal-card');
  const isSignup = tab === 'signup';
  card.innerHTML = `
    <button class="auth-close" onclick="closeAuthModal()" aria-label="Fermer">×</button>
    <h3 class="auth-title">${isSignup ? 'Créer un compte' : 'Se connecter'}</h3>
    <div class="auth-tabs">
      <button class="auth-tab ${!isSignup ? 'active' : ''}" onclick="switchAuthTab('signin')">Connexion</button>
      <button class="auth-tab ${isSignup ? 'active' : ''}" onclick="switchAuthTab('signup')">Inscription</button>
    </div>
    ${errorMsg ? `<p class="auth-error">${errorMsg}</p>` : ''}
    <form onsubmit="submitAuth(event, '${tab}')">
      ${isSignup ? `<input id="auth-name" type="text" placeholder="Pseudo affiché" autocomplete="nickname" />` : ''}
      <input id="auth-email" type="email" placeholder="Adresse e-mail" autocomplete="email" required />
      <input id="auth-pwd" type="password" placeholder="Mot de passe" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required />
      <button class="auth-submit" type="submit">${isSignup ? "S'inscrire" : 'Se connecter'}</button>
    </form>
    <div class="auth-sep"><span>ou</span></div>
    <button class="auth-google" onclick="googleSignIn()">
      <span class="g-logo">G</span> Continuer avec Google
    </button>`;
  m.hidden = false;
}

window.submitAuth = async (event, tab) => {
  event.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const pwd   = document.getElementById('auth-pwd').value;
  try {
    if (tab === 'signup') {
      const name = (document.getElementById('auth-name').value || '').trim();
      await signUpEmail(email, pwd, name);
    } else {
      await signInEmail(email, pwd);
    }
    window.closeAuthModal();
  } catch (err) {
    renderAuthModal(tab, authErrorMessage(err));
  }
};

window.googleSignIn = async () => {
  try {
    await signInGoogle();
    window.closeAuthModal();
  } catch (err) {
    renderAuthModal('signin', authErrorMessage(err));
  }
};

window.doLogout = async () => { await logout(); };

// ── Window bindings ────────────────────────────────────────────────────────

window.showBracket  = showBracket;
window.selectWinner = selectWinner;
window.lockBracket  = lockBracket;
window.toggleRound  = toggleRound;
window.toggleRecapRound = toggleRecapRound;
window.pickWinner   = pickWinner;
window.pickScore    = pickScore;
window.lockMatch    = lockMatch;

// ── Init ───────────────────────────────────────────────────────────────────

(async () => {
  document.getElementById('content').innerHTML = '<p style="text-align:center;padding:40px;color:#666;">Chargement...</p>';
  await loadState();

  onAuth((user) => {
    setMe(user ? { uid: user.uid, name: displayNameOf(user) } : null);
    renderAuthZone(user);
    renderApp(user);
  });
})();
