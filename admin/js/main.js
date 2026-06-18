import { state, loadState, switchTournament, createTournament, saveTableau, savePmMatch, ensurePlayerMeta, syncMatchesFromBracket } from './state.js';
import { deleteTournament } from './firebase.js';

// ── Tab routing ────────────────────────────────────────────────────────────

let currentTab = 'tournois';

// Vainqueur pressenti en attente d'un score, dans la vue Résultats.
// Forme : { key: `${roundIndex}_${matchIndex}`, side: 'player1'|'player2' } | null
let pendingPick = null;

export function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tab-tournois');
  if (btn) btn.classList.add('active');
  const builders = {
    'tournois':  buildTournois,
    'config':    buildConfig,
    'joueurs':   buildJoueurs,
    'resultats': buildResultats,
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

// ── Tournois (hub) ───────────────────────────────────────────────────────────

function buildTournois() {
  let html = `<h2 class="page-title">🏆 Tournois</h2>`;

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

// ── Actions ────────────────────────────────────────────────────────────────

window.showTab = showTab;

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

// ── Init ───────────────────────────────────────────────────────────────────

(async () => {
  await loadState();
  showTab('tournois');
})();
