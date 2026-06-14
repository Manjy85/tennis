import { state, loadState, switchTournament, createTournament, saveTableau, savePmMatch, ensurePlayerMeta } from './state.js';
import { deleteTournament } from './firebase.js';

// ── Tab routing ────────────────────────────────────────────────────────────

let currentTab = 'tournois';

export function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tab-${tab}`);
  if (btn) btn.classList.add('active');
  const builders = {
    'tournois':    buildTournois,
    'config':      buildConfig,
    'joueurs':     buildJoueurs,
    'res-tableau': buildResTableau,
    'matchs':      buildMatchs,
    'res-matchs':  buildResMatchs,
  };
  document.getElementById('content').innerHTML = (builders[tab] || (() => ''))();
}

function requireTournament() {
  if (!state.currentTournamentId) {
    return `<p style="color:#888; margin-top:32px;">Aucun tournoi actif. Créez-en un dans <strong>🏆 Tournois</strong>.</p>`;
  }
  return null;
}

function updateSidebarTournament() {
  const el = document.getElementById('tournamentLabel');
  if (el) el.textContent = state.tournamentName || '—';
}

// ── Tournois ───────────────────────────────────────────────────────────────

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
    html += `<table><thead><tr><th>Nom</th><th>Joueurs tableau</th><th>Matchs</th><th>Statut</th><th>Actions</th></tr></thead><tbody>`;
    state.tournamentList.forEach(t => {
      const isActive = t.id === state.currentTournamentId;
      html += `<tr>
        <td><strong>${t.name}</strong></td>
        <td>${isActive ? state.initialPlayers.length : '—'}</td>
        <td>${isActive ? state.matches.length : '—'}</td>
        <td>${isActive ? '<span class="badge badge-active">🟢 Actif</span>' : ''}</td>
        <td style="display:flex; gap:6px;">
          ${!isActive ? `<button class="btn-blue" onclick="adminActivateTournament('${t.id}')">Activer</button>` : ''}
          <button class="btn-red" onclick="adminDeleteTournament('${t.id}')">Supprimer</button>
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
  const err = requireTournament();
  if (err) return `<h2 class="page-title">⚙️ Configuration</h2>${err}`;

  let html = `<h2 class="page-title">⚙️ Configuration — ${state.tournamentName}</h2>`;

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
  const err = requireTournament();
  if (err) return `<h2 class="page-title">👥 Joueurs & Têtes de série</h2>${err}`;

  let html = `<h2 class="page-title">👥 Joueurs & Têtes de série — ${state.tournamentName}</h2>`;

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

  return html;
}

// ── Résultats Tableau ──────────────────────────────────────────────────────

function buildResTableau() {
  const err = requireTournament();
  if (err) return `<h2 class="page-title">🛠️ Résultats Tableau</h2>${err}`;

  let html = `<h2 class="page-title">🛠️ Résultats Tableau — ${state.tournamentName}</h2>`;
  html += `<p style="color:#888; font-size:13px; margin-bottom:20px;">Cliquez sur un joueur pour le définir comme vainqueur du match.</p>`;
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
      const winner = (state.officialResults[`round${roundIndex}`] || [])[i];

      html += `<div class="results-match">`;
      if (!p1 && !p2) {
        html += `<div class="results-player-btn waiting">En attente...</div>
                 <div class="results-player-btn waiting">En attente...</div>`;
      } else {
        [p1, p2].forEach(p => {
          if (!p) {
            html += `<div class="results-player-btn waiting">—</div>`;
          } else {
            const isWinner = winner === p;
            html += `<button class="results-player-btn ${isWinner ? 'winner' : ''}"
              onclick="adminSelectWinner(${roundIndex}, ${i}, '${p.replace(/'/g, "\\'")}')">
              ${p}
            </button>`;
          }
        });
      }
      html += `</div>`;
    }
    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

// ── Matchs (Prono Match) ───────────────────────────────────────────────────

function buildMatchs() {
  const err = requireTournament();
  if (err) return `<h2 class="page-title">🎾 Matchs</h2>${err}`;

  const hasBracket = state.initialPlayers.length > 0 && state.rounds.length > 0;
  let html = `<h2 class="page-title">🎾 Matchs — ${state.tournamentName}</h2>`;

  if (hasBracket) {
    html += `<div class="box box-green">
      <h3>Import depuis le tableau Prono Tableau</h3>
      <p style="font-size:14px; color:#555; margin-top:0;">
        Tableau de <strong>${state.initialPlayers.length} joueurs</strong> configuré.
        Générez automatiquement les matchs à partir des joueurs et des résultats disponibles.
      </p>
      <button class="btn-green" onclick="adminSyncFromBracket()">⬇️ Générer les matchs depuis le tableau</button>
    </div>`;
  }

  html += `<div class="box">
    <h3>Ajouter un match manuellement</h3>
    <div class="form-row">
      <input id="matchRound"   type="text" placeholder="Round (ex: 1/4 de finale)" style="width:200px;" />
      <input id="matchPlayer1" type="text" placeholder="Joueur 1" style="width:150px;" />
      <span style="font-weight:bold; color:#888;">vs</span>
      <input id="matchPlayer2" type="text" placeholder="Joueur 2" style="width:150px;" />
      <button class="btn-green" onclick="adminAddMatch()">Ajouter</button>
    </div>
  </div>`;

  html += `<div class="box"><h3>Matchs configurés (${state.matches.length})</h3>`;
  if (state.matches.length === 0) {
    html += `<p style="color:#888;">Aucun match. Utilisez l'import ou ajoutez manuellement.</p>`;
  } else {
    const rounds = [...new Set(state.matches.map(m => m.round))];
    rounds.forEach(round => {
      html += `<p style="font-weight:bold; color:#0c6b2f; margin:16px 0 6px;">${round}</p>`;
      html += `<table><thead><tr><th>Match</th><th>Résultat</th><th></th></tr></thead><tbody>`;
      state.matches.filter(m => m.round === round).forEach(m => {
        const res = m.result
          ? `${m.result.winner === 'player1' ? m.player1 : m.player2} ${m.result.score}`
          : '<span style="color:#bbb;">—</span>';
        html += `<tr>
          <td>${m.player1} <span style="color:#bbb;">vs</span> ${m.player2}</td>
          <td>${res}</td>
          <td><button class="btn-red" style="padding:6px 12px; font-size:12px;" onclick="adminDeleteMatch('${m.id}')">Supprimer</button></td>
        </tr>`;
      });
      html += `</tbody></table>`;
    });
  }
  html += `</div>`;

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

// ── Résultats Matchs ───────────────────────────────────────────────────────

function buildResMatchs() {
  const err = requireTournament();
  if (err) return `<h2 class="page-title">🛠️ Résultats Matchs</h2>${err}`;

  const scores = state.format === 'bo5' ? ['3-0', '3-1', '3-2'] : ['2-0', '2-1'];
  const rounds = [...new Set(state.matches.map(m => m.round))];
  let html = `<h2 class="page-title">🛠️ Résultats Matchs — ${state.tournamentName}</h2>`;
  html += `<p style="color:#888; font-size:13px; margin-bottom:20px;">Format : ${state.format === 'bo5' ? 'Best of 5' : 'Best of 3'}</p>`;

  if (state.matches.length === 0) {
    return html + `<div class="box"><p style="color:#888;">Aucun match configuré. Allez dans <strong>🎾 Matchs</strong> pour en ajouter.</p></div>`;
  }

  rounds.forEach(round => {
    html += `<div class="box">
      <h3>${round}</h3>`;
    state.matches.filter(m => m.round === round).forEach(match => {
      const hasResult = !!match.result;
      html += `<div class="match-result-row ${hasResult ? 'has-result' : ''}">
        <div class="match-result-players">${match.player1} <span style="color:#bbb;">vs</span> ${match.player2}</div>`;

      if (hasResult) {
        const wName = match.result.winner === 'player1' ? match.player1 : match.player2;
        html += `<div style="color:#0c6b2f; font-weight:bold; margin-bottom:8px;">✅ ${wName} ${match.result.score}</div>
          <button class="btn-orange" style="font-size:12px; padding:6px 12px;" onclick="adminClearResult('${match.id}')">Modifier</button>`;
      } else {
        html += `<div class="match-result-btns">
          <span style="font-size:13px; color:#555; align-self:center;">Vainqueur :</span>
          <button class="btn-green" style="font-size:13px; padding:8px 14px;" onclick="adminPickWinner('${match.id}', 'player1')">${match.player1}</button>
          <button class="btn-green" style="font-size:13px; padding:8px 14px;" onclick="adminPickWinner('${match.id}', 'player2')">${match.player2}</button>
        </div>`;
        if (match._pendingWinner) {
          const wName = match._pendingWinner === 'player1' ? match.player1 : match.player2;
          html += `<div style="margin-top:10px; font-size:13px; color:#555;">Score de victoire pour <strong>${wName}</strong> :</div>
            <div class="match-result-btns" style="margin-top:6px;">`;
          scores.forEach(s => {
            html += `<button class="score-chip" onclick="adminSetResult('${match.id}', '${match._pendingWinner}', '${s}')">${s}</button>`;
          });
          html += `</div>`;
        }
      }
      html += `</div>`;
    });
    html += `</div>`;
  });

  return html;
}

// ── Actions ────────────────────────────────────────────────────────────────

window.showTab = showTab;

window.adminCreateTournament = async () => {
  const name = document.getElementById('newTournamentName').value.trim();
  if (!name) return alert('Entrez un nom de tournoi.');
  await createTournament(name);
  updateSidebarTournament();
  showTab('tournois');
};

window.adminActivateTournament = async (id) => {
  await switchTournament(id);
  updateSidebarTournament();
  showTab('tournois');
};

window.adminDeleteTournament = async (id) => {
  const t = state.tournamentList.find(t => t.id === id);
  if (!confirm(`Supprimer "${t ? t.name : id}" ? Irréversible.`)) return;
  const { deleteTournament } = await import('./firebase.js');
  await deleteTournament(id);
  state.tournamentList = state.tournamentList.filter(t => t.id !== id);
  if (state.currentTournamentId === id) {
    state.currentTournamentId = null;
    state.tournamentName = '';
    if (state.tournamentList.length > 0) await switchTournament(state.tournamentList[0].id);
    updateSidebarTournament();
  }
  showTab('tournois');
};

window.adminSaveName = () => {
  const name = document.getElementById('tournamentNameInput').value.trim();
  if (!name) return;
  state.tournamentName = name;
  const t = state.tournamentList.find(t => t.id === state.currentTournamentId);
  if (t) t.name = name;
  saveTableau();
  updateSidebarTournament();
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

window.adminSelectWinner = (roundIndex, matchIndex, winner) => {
  if (!state.officialResults[`round${roundIndex}`]) {
    state.officialResults[`round${roundIndex}`] = Array(state.rounds[roundIndex].matches).fill(null);
  }
  state.officialResults[`round${roundIndex}`][matchIndex] = winner;
  // Clear results of subsequent rounds (they may change)
  for (let r = roundIndex + 1; r < state.rounds.length; r++) {
    state.officialResults[`round${r}`] = Array(state.rounds[r].matches).fill(null);
  }
  saveTableau();
  showTab('res-tableau');
};

window.adminAddMatch = () => {
  const round   = document.getElementById('matchRound').value.trim();
  const player1 = document.getElementById('matchPlayer1').value.trim();
  const player2 = document.getElementById('matchPlayer2').value.trim();
  if (!round || !player1 || !player2) return alert('Remplissez tous les champs.');
  state.matches.push({ id: `m_${Date.now()}`, round, player1, player2, result: null });
  savePmMatch();
  showTab('matchs');
};

window.adminDeleteMatch = (id) => {
  if (!confirm('Supprimer ce match ? Les pronostics liés seront perdus.')) return;
  state.matches = state.matches.filter(m => m.id !== id);
  state.pm_players.forEach(p => { if (p.predictions) delete p.predictions[id]; });
  savePmMatch();
  showTab('matchs');
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
  showTab('matchs');
};

window.adminSyncFromBracket = () => {
  let added = 0;
  state.rounds.forEach((round, roundIndex) => {
    const roundPlayers = roundIndex === 0
      ? state.initialPlayers
      : (state.officialResults[`round${roundIndex - 1}`] || []);

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      if (!p1 || !p2) continue;
      const exists = state.matches.some(m => m.round === round.name && m.player1 === p1 && m.player2 === p2);
      if (!exists) {
        state.matches.push({ id: `m_${roundIndex}_${i}_${Date.now()}`, round: round.name, player1: p1, player2: p2, result: null });
        added++;
      }
    }
  });
  if (added > 0) { savePmMatch(); alert(`${added} match(s) importé(s).`); }
  else alert('Tous les matchs disponibles sont déjà présents.');
  showTab('matchs');
};

window.adminPickWinner = (matchId, winner) => {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  state.matches.forEach(m => delete m._pendingWinner);
  match._pendingWinner = winner;
  showTab('res-matchs');
};

window.adminSetResult = (matchId, winner, score) => {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  delete match._pendingWinner;
  match.result = { winner, score };
  savePmMatch();
  showTab('res-matchs');
};

window.adminClearResult = (matchId) => {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  match.result = null;
  savePmMatch();
  showTab('res-matchs');
};

// ── Init ───────────────────────────────────────────────────────────────────

(async () => {
  await loadState();
  updateSidebarTournament();
  showTab('tournois');
})();
