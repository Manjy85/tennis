import { state, loadState, switchTournament, createTournament, saveTableau, savePmMatch, ensurePlayerMeta, syncMatchesFromBracket } from './state.js';
import { deleteTournament, deleteTableauPred, deleteMatchPred, loadSyncStatus } from './firebase.js';
import {
  onAuth, currentUser, getUsername, adminConfigExists, initAdmin, login, logout,
  changeUsername, changePassword, authErrorMessage, isAdminAccount,
} from './adminauth.js';

// ── Tab routing ────────────────────────────────────────────────────────────

let currentTab = 'tournois';

// Vainqueur pressenti en attente d'un score, dans la vue Résultats.
// Forme : { key: `${roundIndex}_${matchIndex}`, side: 'player1'|'player2' } | null
let pendingPick = null;

export function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  // Onglets « per-tournoi » (config/joueurs/resultats) restent rattachés à Tournois.
  const navId = (tab === 'compte') ? 'tab-compte' : 'tab-tournois';
  const btn = document.getElementById(navId);
  if (btn) btn.classList.add('active');
  const builders = {
    'tournois':     buildTournois,
    'config':       buildConfig,
    'joueurs':      buildJoueurs,
    'resultats':    buildResultats,
    'participants': buildParticipants,
    'user':         buildUserPronos,
    'compte':       buildCompte,
  };
  document.getElementById('content').innerHTML = (builders[tab] || buildTournois)();
}

function requireTournament(title) {
  if (!state.currentTournamentId) {
    return `<h2 class="page-title">${title}</h2>
      <p style="color:#888; margin-top:32px;">Aucun tournoi sélectionné. Revenez aux <strong>🏆 Tournois</strong>.</p>`;
  }
  return null;
}

function backLink() {
  return `<a href="#" class="back-link" style="display:inline-block; margin-bottom:16px;"
    onclick="event.preventDefault(); showTab('tournois');">← Retour aux tournois</a>`;
}

// ── Synchronisation automatique : statut + compte à rebours ────────────────

// Le cron GitHub Actions tourne toutes les 4h aux heures UTC fixes (0h, 4h...).
function nextSyncDate() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    (Math.floor(now.getUTCHours() / 4) + 1) * 4, 0, 0));
  return next;
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'imminente';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : m > 0 ? `${m}min ${String(s).padStart(2, '0')}s` : `${s}s`;
}

let syncTimerInterval = null;

async function renderSyncStatus() {
  const box = document.getElementById('sync-status-box');
  if (!box) return;
  const status = await loadSyncStatus().catch(() => null);

  let lastHtml;
  if (status && status.lastRunAt) {
    const last = new Date(status.lastRunAt);
    const ago = Date.now() - last.getTime();
    const agoTxt = ago < 3600000 ? `il y a ${Math.max(1, Math.floor(ago / 60000))} min` : `il y a ${Math.floor(ago / 3600000)}h${String(Math.floor((ago % 3600000) / 60000)).padStart(2, '0')}`;
    lastHtml = `Dernière synchro : <strong>${agoTxt}</strong> <span style="color:#888;">(${last.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})</span>`;
  } else {
    lastHtml = `<span style="color:#b71c1c;">Aucune synchro enregistrée pour l'instant</span> <span style="color:#888;">(le workflow GitHub n'a pas encore tourné)</span>`;
  }

  const logHtml = status && status.log && status.log.length
    ? `<details style="margin-top:8px;"><summary style="cursor:pointer; color:#0c6b2f; font-size:13px;">Journal du dernier passage</summary>
        <pre style="font-size:12px; background:#f6f8f7; border-radius:8px; padding:10px; overflow-x:auto; margin:8px 0 0;">${status.log.join('\n')}</pre>
      </details>`
    : '';

  // Rendu complet une seule fois ; seul le compte à rebours est rafraîchi
  // chaque seconde (sinon le <details> ouvert se refermerait à chaque tick).
  box.innerHTML = `<h3>🔄 Synchronisation automatique</h3>
    <p style="margin:6px 0;">${lastHtml}</p>
    <p style="margin:6px 0;">Prochaine synchro : <strong style="color:#0c6b2f;">dans <span id="sync-countdown">…</span></strong>
      <span style="color:#888;" id="sync-next-at"></span></p>
    ${logHtml}`;

  const tick = () => {
    const cd = document.getElementById('sync-countdown');
    if (!cd) { clearInterval(syncTimerInterval); syncTimerInterval = null; return; }
    const next = nextSyncDate();
    cd.textContent = fmtCountdown(next - Date.now());
    const at = document.getElementById('sync-next-at');
    if (at) at.textContent = `(vers ${next.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, toutes les 4h)`;
  };

  if (syncTimerInterval) clearInterval(syncTimerInterval);
  tick();
  syncTimerInterval = setInterval(tick, 1000);
}

// ── Tournois (hub) ───────────────────────────────────────────────────────────

function buildTournois() {
  let html = `<h2 class="page-title">🏆 Tournois</h2>`;

  html += `<div class="box" id="sync-status-box">
    <h3>🔄 Synchronisation automatique</h3>
    <p style="color:#888; margin:4px 0;">Chargement du statut...</p>
  </div>`;
  queueMicrotask(renderSyncStatus);

  html += `<div class="box">
    <h3>Créer un tournoi</h3>
    <div class="form-row">
      <input id="newTournamentName" type="text" placeholder="Nom du tournoi (ex: Roland-Garros 2026)" style="width:320px;" />
      <button class="btn-green" onclick="adminCreateTournament()">Créer</button>
    </div>
  </div>`;

  html += `<div class="box"><h3>Tournois existants</h3>`;
  if (state.tournamentList.length === 0) {
    html += `<p style="color:#888;">Aucun tournoi. Créez-en un ci-dessus.</p>`;
  } else {
    html += `<table><thead><tr><th>Nom</th><th>Joueurs tableau</th><th>Pronos tableau</th><th>Matchs</th><th>Actions</th></tr></thead><tbody>`;
    state.tournamentList.forEach(t => {
      const nameEsc = t.id.replace(/'/g, "\\'");
      html += `<tr>
        <td><a href="#" style="font-weight:bold; color:#0c6b2f; text-decoration:none;"
          onclick="event.preventDefault(); openTournament('${nameEsc}', 'resultats');">${t.name}</a></td>
        <td>${t.playersCount ?? '—'}</td>
        <td>${t.bracketsCount ?? '—'}</td>
        <td>${t.matchsCount ?? '—'}</td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn-blue"  onclick="openTournament('${nameEsc}', 'config')">⚙️ Configurer</button>
          <button class="btn-blue"  onclick="openTournament('${nameEsc}', 'joueurs')">👥 Joueurs & Têtes</button>
          <button class="btn-blue"  onclick="openTournament('${nameEsc}', 'participants')">🧑‍🤝‍🧑 Participants</button>
          <button class="btn-green" onclick="openTournament('${nameEsc}', 'resultats')">🛠️ Résultats</button>
          <button class="btn-red"   onclick="adminDeleteTournament('${nameEsc}')">🗑️ Supprimer</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;
  return html;
}

// ── Configuration ──────────────────────────────────────────────────────────

function buildConfig() {
  const err = requireTournament('⚙️ Configuration');
  if (err) return err;

  let html = backLink();
  html += `<h2 class="page-title">⚙️ Configuration — ${state.tournamentName}</h2>`;

  html += `<div class="box">
    <h3>Nom du tournoi</h3>
    <div class="form-row">
      <input id="tournamentNameInput" type="text" value="${state.tournamentName}" style="width:280px;" />
      <button class="btn-blue" onclick="adminSaveName()">Renommer</button>
    </div>
  </div>`;

  html += `<div class="box">
    <h3>Taille du tableau (Prono Tableau)</h3>
    <div class="form-row">
      <select id="bracketSizeInput">
        <option value="8"   ${state.initialPlayers.length ===   8 ? 'selected' : ''}>8 joueurs — Quarts</option>
        <option value="16"  ${state.initialPlayers.length ===  16 ? 'selected' : ''}>16 joueurs — Huitièmes</option>
        <option value="32"  ${state.initialPlayers.length ===  32 ? 'selected' : ''}>32 joueurs — 16es</option>
        <option value="64"  ${state.initialPlayers.length ===  64 ? 'selected' : ''}>64 joueurs — 32es</option>
        <option value="128" ${state.initialPlayers.length === 128 ? 'selected' : ''}>128 joueurs — Roland-Garros</option>
      </select>
      <button class="btn-red" onclick="adminChangeBracketSize()">Régénérer le tableau ⚠️</button>
    </div>
    <p style="font-size:13px; color:#b71c1c; margin:4px 0 0;">⚠️ Réinitialise tous les pronostics du tableau.</p>
  </div>`;

  html += `<div class="box">
    <h3>Barème de points (Prono Tableau)</h3>
    <table><thead><tr>`;
  state.rounds.forEach(r => { html += `<th>${r.name}</th>`; });
  html += `</tr></thead><tbody><tr>`;
  state.rounds.forEach((r, i) => {
    html += `<td><input type="number" id="pts_r${i}" value="${r.points}" style="width:70px;" /> pts</td>`;
  });
  html += `</tr></tbody></table>
    <br><button class="btn-blue" onclick="adminSavePoints()">Sauvegarder le barème</button>
  </div>`;

  html += `<div class="box">
    <h3>Format des matchs (Prono Match)</h3>
    <div class="form-row">
      <select id="formatInput">
        <option value="bo3" ${state.format === 'bo3' ? 'selected' : ''}>Best of 3 — scores : 2-0, 2-1</option>
        <option value="bo5" ${state.format === 'bo5' ? 'selected' : ''}>Best of 5 — scores : 3-0, 3-1, 3-2</option>
      </select>
      <button class="btn-blue" onclick="adminSaveFormat()">Sauvegarder</button>
    </div>
  </div>`;

  return html;
}

// ── Joueurs & Têtes de série ───────────────────────────────────────────────

function buildJoueurs() {
  const err = requireTournament('👥 Joueurs & Têtes de série');
  if (err) return err;

  let html = backLink();
  html += `<h2 class="page-title">👥 Joueurs & Têtes de série — ${state.tournamentName}</h2>`;

  html += `<div class="box">
    <h3>Liste des joueurs (${state.initialPlayers.length} joueurs)</h3>
    <p style="font-size:13px; color:#888; margin-top:0;">Un joueur par ligne, dans l'ordre du tableau.</p>
    <textarea id="playersListInput" style="width:100%; height:260px;">${state.initialPlayers.join('\n')}</textarea>
    <br><br>
    <button class="btn-green" onclick="adminSavePlayers()">Mettre à jour les noms</button>
  </div>`;

  html += `<div class="box">
    <h3>Pronostics tableau (${state.rg_players.length} participants)</h3>`;
  if (state.rg_players.length === 0) {
    html += `<p style="color:#888;">Aucun pronostic tableau pour ce tournoi.</p>`;
  } else {
    html += `<table><thead><tr><th>Pseudo</th><th>Statut</th><th>Score</th><th></th></tr></thead><tbody>`;
    state.rg_players.forEach(p => {
      html += `<tr>
        <td><strong>${p.name}</strong></td>
        <td>${p.locked ? '🔒 Verrouillé' : '✏️ En cours'}</td>
        <td>${p.score || 0} pts</td>
        <td><button class="btn-red" style="padding:6px 12px; font-size:12px;" onclick="adminDeleteTableauPlayer('${p.name.replace(/'/g, "\\'")}')">Supprimer</button></td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;

  html += `<div class="box">
    <h3>Têtes de série & Nationalités</h3>
    <table>
      <thead><tr><th>#</th><th>Joueur</th><th>Tête de série</th><th>Nat. (3 lettres)</th></tr></thead>
      <tbody>`;
  state.initialPlayers.forEach((name, i) => {
    const meta = state.playerMeta[name] || {};
    html += `<tr>
      <td style="color:#aaa;">${i + 1}</td>
      <td><strong>${name || '(vide)'}</strong></td>
      <td><input type="text" id="seed_${i}" value="${meta.seed || ''}" style="width:70px;"
            oninput="adminUpdateMeta(${i}, 'seed', this.value)" /></td>
      <td><input type="text" id="nat_${i}" value="${meta.nat || ''}" maxlength="3" style="width:70px; text-transform:uppercase;"
            oninput="adminUpdateMeta(${i}, 'nat', this.value)" /></td>
    </tr>`;
  });
  html += `</tbody></table>
    <br><button class="btn-blue" onclick="adminSaveMeta()">Sauvegarder têtes & nats</button>
  </div>`;

  if (state.pm_players.length > 0) {
    html += `<div class="box">
      <h3>Pronostics match (${state.pm_players.length} participants)</h3>
      <table><thead><tr><th>Pseudo</th><th>Matchs pronostiqués</th><th></th></tr></thead><tbody>`;
    state.pm_players.forEach(p => {
      const count = Object.keys(p.predictions || {}).length;
      html += `<tr>
        <td><strong>${p.name}</strong></td>
        <td>${count}</td>
        <td><button class="btn-red" style="padding:6px 12px; font-size:12px;" onclick="adminDeleteMatchPlayer('${p.name.replace(/'/g, "\\'")}')">Supprimer</button></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  return html;
}

// ── Participants (comptes + pronos réels via sous-collections) ──────────────

let viewingUid = null;

function participantsByUid() {
  const byUid = new Map();
  state.tableauPreds.forEach(p => byUid.set(p.uid, { uid: p.uid, name: p.displayName || p.uid, t: p, m: null }));
  state.matchPreds.forEach(p => {
    const e = byUid.get(p.uid) || { uid: p.uid, name: p.displayName || p.uid, t: null, m: null };
    e.m = p; if (p.displayName) e.name = p.displayName;
    byUid.set(p.uid, e);
  });
  return [...byUid.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildParticipants() {
  const err = requireTournament('🧑‍🤝‍🧑 Participants');
  if (err) return err;

  let html = backLink();
  html += `<h2 class="page-title">🧑‍🤝‍🧑 Participants — ${state.tournamentName}</h2>`;

  const users = participantsByUid();
  const tTotal = state.rounds.reduce((a, r) => a + r.matches, 0);

  html += `<div class="box"><h3>Comptes ayant pronostiqué (${users.length})</h3>`;
  if (!users.length) {
    html += `<p style="color:#888;">Aucun participant pour ce tournoi pour l'instant.</p>`;
  } else {
    html += `<table><thead><tr><th>Pseudo</th><th>UID (compte)</th><th>Tableau</th><th>Matchs verrouillés</th><th>Actions</th></tr></thead><tbody>`;
    users.forEach(u => {
      const tFilled = u.t ? Object.values(u.t.predictions || {}).flat().filter(Boolean).length : 0;
      const tStatus = u.t ? `${u.t.locked ? '🔒 Verrouillé' : '✏️ En cours'} (${tFilled}/${tTotal})` : '—';
      const mLocked = u.m ? Object.values(u.m.predictions || {}).filter(x => x && x.locked).length : 0;
      const uidEsc = u.uid.replace(/'/g, "\\'");
      html += `<tr>
        <td><strong>${u.name}</strong></td>
        <td style="font-size:11px; color:#999; font-family:monospace;">${u.uid}</td>
        <td>${tStatus}</td>
        <td>${u.m ? `${mLocked}/${state.matches.length}` : '—'}</td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn-blue" onclick="adminViewUser('${uidEsc}')">👁️ Voir les pronos</button>
          <button class="btn-red" style="padding:6px 12px; font-size:12px;" onclick="adminDeleteUserPreds('${uidEsc}')">Supprimer</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;
  return html;
}

// Bracket d'un utilisateur en lecture seule (réutilise le layout des résultats).
function renderUserBracket(tp) {
  let html = `<div class="results-bracket">`;
  state.rounds.forEach((round, ri) => {
    const roundPlayers = ri === 0 ? state.initialPlayers : (state.officialResults[`round${ri - 1}`] || []);
    html += `<div class="results-round"><div class="results-round-header">${round.name}</div>`;
    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      const pick = ((tp.predictions || {})[`round${ri}`] || [])[i];
      const off  = (state.officialResults[`round${ri}`] || [])[i];
      html += `<div class="results-match">`;
      [p1, p2].forEach(p => {
        if (!p) { html += `<div class="results-player-btn waiting">—</div>`; return; }
        let cls = 'results-player-btn';
        if (pick === p) { cls += (off === null || off === undefined) ? ' picked' : (off === p ? ' winner' : ' lost'); }
        html += `<div class="${cls}">${p}</div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  return html;
}

function buildUserPronos() {
  const err = requireTournament('Pronos');
  if (err) return err;
  const uid = viewingUid;
  const tp = state.tableauPreds.find(p => p.uid === uid);
  const mp = state.matchPreds.find(p => p.uid === uid);
  const name = (tp && tp.displayName) || (mp && mp.displayName) || uid || '—';

  let html = `<a href="#" class="back-link" style="display:inline-block; margin-bottom:16px;"
    onclick="event.preventDefault(); showTab('participants');">← Retour aux participants</a>`;
  html += `<h2 class="page-title">Pronos de ${name}</h2>`;
  html += `<p style="font-size:12px; color:#999; font-family:monospace; margin-top:-8px;">UID : ${uid}</p>`;

  html += `<div class="box"><h3>🏆 Tableau ${tp && tp.locked ? '🔒' : ''}</h3>`;
  html += tp ? renderUserBracket(tp) : `<p style="color:#888;">Aucun pronostic tableau.</p>`;
  html += `</div>`;

  html += `<div class="box"><h3>🎾 Pronostics matchs</h3>`;
  if (!mp || !state.matches.length) {
    html += `<p style="color:#888;">Aucun pronostic match.</p>`;
  } else {
    html += `<table><thead><tr><th>Tour</th><th>Match</th><th>Vainqueur pronostiqué</th><th>Score</th><th>Verrouillé</th><th>Résultat officiel</th></tr></thead><tbody>`;
    state.matches.forEach(m => {
      const pred = (mp.predictions || {})[m.id] || {};
      const myName = pred.winner ? (pred.winner === 'player1' ? m.player1 : m.player2) : '<span style="color:#bbb;">—</span>';
      const res = m.result ? `${m.result.winner === 'player1' ? m.player1 : m.player2} ${m.result.score}` : '<span style="color:#bbb;">—</span>';
      html += `<tr>
        <td style="color:#888;">${m.round}</td>
        <td>${m.player1} <span style="color:#bbb;">vs</span> ${m.player2}</td>
        <td>${myName}</td>
        <td>${pred.score || '<span style="color:#bbb;">—</span>'}</td>
        <td>${pred.locked ? '🔒' : ''}</td>
        <td>${res}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;
  return html;
}

// ── Résultats (bracket fusionné tableau + matchs) ───────────────────────────

function buildResultats() {
  const err = requireTournament('🛠️ Résultats');
  if (err) return err;

  const scores = state.format === 'bo5' ? ['3-0', '3-1', '3-2'] : ['2-0', '2-1'];

  let html = backLink();
  html += `<h2 class="page-title">🛠️ Résultats — ${state.tournamentName}</h2>`;
  html += `<p style="color:#888; font-size:13px; margin-bottom:20px;">
    Choisissez le vainqueur de chaque match puis son score. Le vainqueur monte automatiquement au tour suivant.
    Utilisez <strong>WO</strong> (forfait) ou <strong>Abandon</strong> si le match ne va pas à son terme.
    Format : ${state.format === 'bo5' ? 'Best of 5' : 'Best of 3'}.</p>`;
  html += `<div class="results-bracket">`;

  state.rounds.forEach((round, roundIndex) => {
    const roundPlayers = roundIndex === 0
      ? state.initialPlayers
      : (state.officialResults[`round${roundIndex - 1}`] || []);

    html += `<div class="results-round">
      <div class="results-round-header">${round.name}</div>`;

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      const winnerName = (state.officialResults[`round${roundIndex}`] || [])[i];
      const match = state.matches.find(m => m.id === `r${roundIndex}_m${i}`);
      const result = match && match.result;

      html += `<div class="results-match">`;

      if (!p1 || !p2) {
        html += `<div class="results-player-btn waiting">${p1 || 'En attente...'}</div>
                 <div class="results-player-btn waiting">${p2 || 'En attente...'}</div>`;
      } else if (result) {
        // Résultat saisi → affichage + bouton Modifier
        const wName = result.winner === 'player1' ? p1 : p2;
        const scoreLabel = result.score === 'WO' ? 'WO' : result.score === 'AB' ? 'Abandon' : result.score;
        [p1, p2].forEach(p => {
          const isW = p === wName;
          html += `<div class="results-player-btn ${isW ? 'winner' : 'loser'}">${p}</div>`;
        });
        html += `<div class="results-score-line">✅ ${wName} <strong>${scoreLabel}</strong>
          <button class="btn-orange" style="font-size:11px; padding:4px 10px; margin-left:8px;"
            onclick="adminClearBracketResult(${roundIndex}, ${i})">Modifier</button></div>`;
      } else {
        // En attente d'une saisie
        const key = `${roundIndex}_${i}`;
        const pending = pendingPick && pendingPick.key === key ? pendingPick.side : null;
        [['player1', p1], ['player2', p2]].forEach(([side, p]) => {
          const sel = pending === side;
          html += `<button class="results-player-btn ${sel ? 'pending' : ''}"
            onclick="adminPickBracketWinner(${roundIndex}, ${i}, '${side}')">${p}</button>`;
        });
        if (pending) {
          const wName = pending === 'player1' ? p1 : p2;
          html += `<div class="results-score-line">
            <span style="font-size:12px; color:#555;">${wName} gagne :</span>
            <div class="results-score-chips">`;
          scores.forEach(s => {
            html += `<button class="score-chip" onclick="adminSetBracketResult(${roundIndex}, ${i}, '${pending}', '${s}')">${s}</button>`;
          });
          html += `<button class="score-chip wo" onclick="adminSetBracketResult(${roundIndex}, ${i}, '${pending}', 'WO')">WO</button>
            <button class="score-chip ab" onclick="adminSetBracketResult(${roundIndex}, ${i}, '${pending}', 'AB')">Abandon</button>
          </div></div>`;
        }
      }

      html += `</div>`;
    }
    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

// ── Compte admin ─────────────────────────────────────────────────────────────

function buildCompte() {
  const uname = (currentUser() && currentUser().displayName) || '';
  let html = `<h2 class="page-title">🔐 Compte admin</h2>`;

  html += `<div class="box">
    <h3>Identifiant de connexion</h3>
    <p style="font-size:13px; color:#888; margin-top:0;">Le nom que tu saisis pour te connecter.</p>
    <div class="form-row">
      <input id="adminUsernameInput" type="text" value="${uname}" style="width:240px;" />
      <button class="btn-blue" onclick="adminChangeUsername()">Changer l'identifiant</button>
    </div>
  </div>`;

  html += `<div class="box">
    <h3>Mot de passe</h3>
    <div class="form-row" style="flex-wrap:wrap; gap:10px;">
      <input id="adminPwdCurrent" type="password" placeholder="Mot de passe actuel" style="width:200px;" />
      <input id="adminPwdNew"     type="password" placeholder="Nouveau mot de passe" style="width:200px;" />
      <button class="btn-blue" onclick="adminChangePassword()">Changer le mot de passe</button>
    </div>
    <p style="font-size:13px; color:#888; margin:6px 0 0;">6 caractères minimum.</p>
  </div>`;

  return html;
}

// ── Actions ────────────────────────────────────────────────────────────────

window.showTab = showTab;

window.adminChangeUsername = async () => {
  const v = document.getElementById('adminUsernameInput').value.trim();
  if (!v) return alert("Identifiant vide.");
  try {
    await changeUsername(v);
    document.getElementById('adminUserLabel').textContent = v;
    alert('Identifiant mis à jour.');
  } catch (err) { alert(authErrorMessage(err)); }
};

window.adminChangePassword = async () => {
  const cur = document.getElementById('adminPwdCurrent').value;
  const next = document.getElementById('adminPwdNew').value;
  if (!cur || !next) return alert('Remplis les deux champs.');
  if (next.length < 6) return alert('Nouveau mot de passe trop court (6 min).');
  try {
    await changePassword(cur, next);
    alert('Mot de passe mis à jour.');
    showTab('compte');
  } catch (err) { alert(authErrorMessage(err)); }
};

window.adminLogout = async () => { await logout(); };

window.adminViewUser = (uid) => { viewingUid = uid; showTab('user'); };

window.adminDeleteUserPreds = async (uid) => {
  const u = participantsByUid().find(x => x.uid === uid);
  if (!confirm(`Supprimer tous les pronostics de "${u ? u.name : uid}" sur ce tournoi ? Irréversible.`)) return;
  await Promise.all([
    deleteTableauPred(state.currentTournamentId, uid).catch(console.error),
    deleteMatchPred(state.currentTournamentId, uid).catch(console.error),
  ]);
  state.tableauPreds = state.tableauPreds.filter(p => p.uid !== uid);
  state.matchPreds = state.matchPreds.filter(p => p.uid !== uid);
  showTab('participants');
};

window.openTournament = async (id, view) => {
  pendingPick = null;
  if (id !== state.currentTournamentId) await switchTournament(id);
  showTab(view);
};

window.adminCreateTournament = async () => {
  const name = document.getElementById('newTournamentName').value.trim();
  if (!name) return alert('Entrez un nom de tournoi.');
  await createTournament(name);
  showTab('tournois');
};

window.adminDeleteTournament = async (id) => {
  const t = state.tournamentList.find(t => t.id === id);
  if (!confirm(`Supprimer "${t ? t.name : id}" ? Irréversible.`)) return;
  await deleteTournament(id);
  state.tournamentList = state.tournamentList.filter(t => t.id !== id);
  if (state.currentTournamentId === id) {
    state.currentTournamentId = null;
    state.tournamentName = '';
  }
  showTab('tournois');
};

window.adminSaveName = () => {
  const name = document.getElementById('tournamentNameInput').value.trim();
  if (!name) return;
  state.tournamentName = name;
  saveTableau();
  alert('Nom mis à jour.');
};

window.adminChangeBracketSize = () => {
  const size = parseInt(document.getElementById('bracketSizeInput').value, 10);
  if (!confirm('⚠️ Cela va réinitialiser tous les pronostics du tableau. Continuer ?')) return;
  const numRounds = Math.log2(size);
  const nextRounds = [];
  for (let i = 0; i < numRounds; i++) {
    const matches = size / Math.pow(2, i + 1);
    const name = matches === 1 ? 'Finale' : matches === 2 ? 'Demi-finales' : matches === 4 ? 'Quarts' : matches === 8 ? 'Huitièmes' : `Tour des ${matches * 2}`;
    nextRounds.push({ name, matches, points: (i + 1) * 5 });
  }
  state.rounds = nextRounds;
  state.initialPlayers = Array(size).fill('').map((_, i) => `Joueur ${i + 1}`);
  state.officialResults = {};
  state.rounds.forEach((r, i) => { state.officialResults[`round${i}`] = Array(r.matches).fill(null); });
  ensurePlayerMeta();
  state.rg_players.forEach(p => {
    p.predictions = {};
    p.locked = false;
    state.rounds.forEach((r, i) => { p.predictions[`round${i}`] = Array(r.matches).fill(null); });
  });
  saveTableau();
  showTab('config');
};

window.adminSavePoints = () => {
  state.rounds.forEach((r, i) => {
    const v = parseInt(document.getElementById(`pts_r${i}`).value, 10);
    r.points = isNaN(v) ? r.points : v;
  });
  saveTableau();
  alert('Barème mis à jour.');
};

window.adminSaveFormat = () => {
  state.format = document.getElementById('formatInput').value;
  savePmMatch();
  alert('Format mis à jour.');
};

window.adminSavePlayers = () => {
  const lines = document.getElementById('playersListInput').value
    .split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length !== state.initialPlayers.length) {
    return alert(`Le tableau attend ${state.initialPlayers.length} joueurs, vous en avez saisi ${lines.length}.`);
  }
  const metaByIndex = state.initialPlayers.map(n => state.playerMeta[n] || {});
  state.initialPlayers = lines;
  const next = {};
  lines.forEach((name, i) => {
    if (!name) return;
    next[name] = metaByIndex[i] || { seed: '', nat: '' };
  });
  state.playerMeta = next;
  saveTableau();
  alert('Liste des joueurs mise à jour.');
};

window.adminUpdateMeta = (index, field, value) => {
  const name = state.initialPlayers[index];
  if (!name) return;
  const meta = state.playerMeta[name] || {};
  meta[field] = field === 'nat' ? value.toUpperCase() : value;
  state.playerMeta[name] = meta;
  saveTableau();
};

window.adminSaveMeta = () => {
  const next = {};
  state.initialPlayers.forEach((name, i) => {
    if (!name) return;
    next[name] = {
      seed: (document.getElementById(`seed_${i}`) || {}).value?.trim() || '',
      nat:  (document.getElementById(`nat_${i}`)  || {}).value?.trim().toUpperCase() || '',
    };
  });
  state.playerMeta = next;
  saveTableau();
  alert('Têtes de série et nationalités sauvegardées.');
};

window.adminDeleteTableauPlayer = (name) => {
  if (!confirm(`Supprimer le pronostic tableau de "${name}" ? Irréversible.`)) return;
  state.rg_players = state.rg_players.filter(p => p.name !== name);
  saveTableau();
  showTab('joueurs');
};

window.adminDeleteMatchPlayer = (name) => {
  if (!confirm(`Supprimer les pronostics match de "${name}" ? Irréversible.`)) return;
  state.pm_players = state.pm_players.filter(p => p.name !== name);
  savePmMatch();
  showTab('joueurs');
};

// ── Résultats : sélection vainqueur + score ─────────────────────────────────

window.adminPickBracketWinner = (roundIndex, matchIndex, side) => {
  pendingPick = { key: `${roundIndex}_${matchIndex}`, side };
  showTab('resultats');
};

window.adminSetBracketResult = (roundIndex, matchIndex, winnerSide, score) => {
  const roundPlayers = roundIndex === 0
    ? state.initialPlayers
    : (state.officialResults[`round${roundIndex - 1}`] || []);
  const winnerName = winnerSide === 'player1'
    ? roundPlayers[matchIndex * 2]
    : roundPlayers[matchIndex * 2 + 1];
  if (!winnerName) return;

  if (!state.officialResults[`round${roundIndex}`]) {
    state.officialResults[`round${roundIndex}`] = Array(state.rounds[roundIndex].matches).fill(null);
  }
  state.officialResults[`round${roundIndex}`][matchIndex] = winnerName;
  // Le vainqueur change la suite : on purge les rounds suivants.
  for (let r = roundIndex + 1; r < state.rounds.length; r++) {
    state.officialResults[`round${r}`] = Array(state.rounds[r].matches).fill(null);
  }

  // Pose le résultat (vainqueur + score) sur le slot de match correspondant.
  syncMatchesFromBracket();
  const match = state.matches.find(m => m.id === `r${roundIndex}_m${matchIndex}`);
  if (match) match.result = { winner: winnerSide, score };

  pendingPick = null;
  saveTableau();
  showTab('resultats');
};

window.adminClearBracketResult = (roundIndex, matchIndex) => {
  if (state.officialResults[`round${roundIndex}`]) {
    state.officialResults[`round${roundIndex}`][matchIndex] = null;
  }
  for (let r = roundIndex + 1; r < state.rounds.length; r++) {
    state.officialResults[`round${r}`] = Array(state.rounds[r].matches).fill(null);
  }
  pendingPick = null;
  saveTableau();
  showTab('resultats');
};

// ── Authentification (gate) ──────────────────────────────────────────────────

let appLoaded = false;

function showGate(html) {
  document.getElementById('admin-layout').hidden = true;
  const gate = document.getElementById('admin-gate');
  gate.hidden = false;
  document.getElementById('admin-gate-card').innerHTML = html;
}

function hideGate() {
  document.getElementById('admin-gate').hidden = true;
  document.getElementById('admin-layout').hidden = false;
}

async function renderLoginScreen(errorMsg = '') {
  const firstTime = !(await adminConfigExists());
  const uname = firstTime ? 'admin' : await getUsername();
  showGate(`
    <h1 class="admin-gate-title">⚙️ Administration</h1>
    ${firstTime
      ? `<p class="admin-gate-info">Première configuration : un compte admin va être créé
         (identifiant <strong>admin</strong>, mot de passe <strong>admin</strong>). Pense à le changer ensuite.</p>`
      : ''}
    ${errorMsg ? `<p class="admin-gate-error">${errorMsg}</p>` : ''}
    <form onsubmit="adminLoginSubmit(event, ${firstTime})">
      <input id="adminLoginUser" type="text" placeholder="Identifiant" value="${uname}" autocomplete="username" />
      <input id="adminLoginPwd"  type="password" placeholder="Mot de passe" autocomplete="current-password" required />
      <button class="admin-gate-btn" type="submit">${firstTime ? 'Créer & se connecter' : 'Se connecter'}</button>
    </form>
    <a href="../" class="admin-gate-back">← Retour au jeu</a>
  `);
}

window.adminLoginSubmit = async (event, firstTime) => {
  event.preventDefault();
  const user = document.getElementById('adminLoginUser').value.trim();
  const pwd  = document.getElementById('adminLoginPwd').value;
  try {
    if (firstTime) await initAdmin(user || 'admin', pwd || 'admin');
    else           await login(user, pwd);
    // onAuth prend le relais pour charger l'app.
  } catch (err) {
    renderLoginScreen(authErrorMessage(err));
  }
};

// ── Init ───────────────────────────────────────────────────────────────────

onAuth(async (user) => {
  // Aucun compte, ou un compte qui n'est PAS l'admin → on reste sur le login.
  if (!user) {
    appLoaded = false;
    renderLoginScreen();
    return;
  }
  if (!isAdminAccount(user)) {
    appLoaded = false;
    await logout();            // referme toute session non-admin → onAuth(null)
    return;
  }
  hideGate();
  const label = document.getElementById('adminUserLabel');
  if (label) label.textContent = user.displayName || 'admin';
  if (!appLoaded) {
    appLoaded = true;
    try {
      await loadState();
      showTab('tournois');
    } catch (err) {
      document.getElementById('content').innerHTML =
        `<div class="box"><p style="color:#b71c1c;">Erreur de chargement : ${err.message}</p>
         <button class="btn-blue" onclick="location.reload()">Recharger</button></div>`;
    }
  }
});
