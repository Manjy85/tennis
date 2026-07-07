import { state, save, getScores } from './state.js';
import { renderContent } from './render.js';

export function showAdminPanel(tab = 'tournois') {
  const tabs = [
    { id: 'tournois',  label: '🏆 Tournois' },
    { id: 'config',    label: '⚙️ Configuration' },
    { id: 'matchs',    label: '🎾 Matchs' },
    { id: 'resultats', label: '🛠️ Résultats' },
  ];

  let html = `<h2>Administration</h2>
    <div style="display:flex; gap:8px; margin-bottom:24px; flex-wrap:wrap;">`;
  tabs.forEach(t => {
    html += `<button class="${tab === t.id ? 'blue' : ''}" onclick="showAdminPanel('${t.id}')">${t.label}</button>`;
  });
  html += `</div>`;

  if (tab === 'tournois')  html += buildTournoisHTML();
  if (tab === 'config')    html += buildConfigHTML();
  if (tab === 'matchs')    html += buildMatchsHTML();
  if (tab === 'resultats') html += buildResultatsHTML();

  renderContent(html, `admin:${tab}`);
}

// ── Onglet Tournois ────────────────────────────────────────────────────────

function buildTournoisHTML() {
  let html = `<div class="admin-box">
    <h3>Créer un nouveau tournoi</h3>
    <input id="newTournamentName" placeholder="Nom du tournoi (ex: Roland-Garros 2026)" style="width:320px; margin-right:10px;" />
    <button class="green" onclick="adminCreateTournament()">Créer</button>
  </div>`;

  html += `<div class="admin-box"><h3>Tournois existants</h3>`;
  if (state.tournamentList.length === 0) {
    html += `<p style="color:#888;">Aucun tournoi. Créez-en un ci-dessus.</p>`;
  } else {
    html += `<table><tr><th>Nom</th><th>Matchs</th><th>Participants</th><th>Statut</th><th>Actions</th></tr>`;
    state.tournamentList.forEach(t => {
      const isActive = t.id === state.currentTournamentId;
      html += `<tr>
        <td><strong>${t.name}</strong></td>
        <td>${isActive ? state.matches.length : '—'}</td>
        <td>${isActive ? state.players.length : '—'}</td>
        <td>${isActive ? '<span style="color:#0c6b2f; font-weight:bold;">🟢 Actif</span>' : ''}</td>
        <td style="display:flex; gap:6px;">
          ${!isActive ? `<button onclick="adminActivateTournament('${t.id}')">Activer</button>` : ''}
          <button class="red" onclick="adminDeleteTournament('${t.id}')">Supprimer</button>
        </td>
      </tr>`;
    });
    html += `</table>`;
  }
  html += `</div>`;
  return html;
}

// ── Onglet Configuration ───────────────────────────────────────────────────

function buildConfigHTML() {
  if (!state.currentTournamentId) {
    return `<p style="color:#888;">Aucun tournoi actif. Créez-en un dans l'onglet Tournois.</p>`;
  }
  return `
    <div class="admin-box">
      <h3>Nom du tournoi</h3>
      <input id="tournamentNameInput" value="${state.tournamentName}" style="width:320px; margin-right:10px;" />
      <button class="blue" onclick="adminSaveTournamentName()">Renommer</button>
    </div>
    <div class="admin-box">
      <h3>Format des matchs</h3>
      <select id="formatInput" style="margin-right:10px;">
        <option value="bo3" ${state.format === 'bo3' ? 'selected' : ''}>Best of 3 — scores : 2-0, 2-1</option>
        <option value="bo5" ${state.format === 'bo5' ? 'selected' : ''}>Best of 5 — scores : 3-0, 3-1, 3-2</option>
      </select>
      <button class="blue" onclick="adminSaveFormat()">Sauvegarder</button>
      <p style="color:#888; font-size:13px; margin-top:8px;">⚠️ Changer le format après des pronostics peut rendre les scores incohérents.</p>
    </div>`;
}

// ── Onglet Matchs ──────────────────────────────────────────────────────────

function buildMatchsHTML() {
  if (!state.currentTournamentId) {
    return `<p style="color:#888;">Aucun tournoi actif.</p>`;
  }

  const hasBracket = state.bracketPlayers.length > 0 && state.bracketRounds.length > 0;
  let html = '';

  if (hasBracket) {
    html += `<div class="admin-box" style="border-left:4px solid #0c6b2f;">
      <h3 style="color:#0c6b2f;">🔗 Import depuis Prono Tableau</h3>
      <p style="color:#555; font-size:14px; margin-top:0;">
        Le tournoi <strong>${state.tournamentName}</strong> a un tableau de
        <strong>${state.bracketPlayers.length} joueurs</strong> configuré dans Prono Tableau.<br>
        Cliquez ci-dessous pour générer automatiquement les matchs à pronostiquer.
      </p>
      <button class="green" onclick="adminSyncFromBracket()">⬇️ Générer les matchs depuis le tableau</button>
    </div>`;
  }

  html += `<div class="admin-box">
    <h3>Ajouter un match manuellement</h3>
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <input id="matchRound"   placeholder="Round (ex: 1/4 de finale)" style="width:200px;" />
      <input id="matchPlayer1" placeholder="Joueur 1" style="width:150px;" />
      <span style="font-weight:bold;">vs</span>
      <input id="matchPlayer2" placeholder="Joueur 2" style="width:150px;" />
      <button class="green" onclick="adminAddMatch()">Ajouter</button>
    </div>
  </div>`;

  html += `<div class="admin-box"><h3>Matchs du tournoi (${state.matches.length})</h3>`;
  if (state.matches.length === 0) {
    html += `<p style="color:#888;">Aucun match ajouté.</p>`;
  } else {
    html += `<table><tr><th>Round</th><th>Match</th><th>Résultat</th><th>Action</th></tr>`;
    state.matches.forEach(m => {
      const resultStr = m.result
        ? `${m.result.winner === 'player1' ? m.player1 : m.player2} ${m.result.score}`
        : '—';
      html += `<tr>
        <td>${m.round}</td>
        <td>${m.player1} vs ${m.player2}</td>
        <td>${resultStr}</td>
        <td><button class="red" onclick="adminDeleteMatch('${m.id}')">Supprimer</button></td>
      </tr>`;
    });
    html += `</table>`;
  }
  html += `</div>`;
  return html;
}

// ── Onglet Résultats ───────────────────────────────────────────────────────

function buildResultatsHTML() {
  if (!state.currentTournamentId) {
    return `<p style="color:#888;">Aucun tournoi actif.</p>`;
  }
  if (state.matches.length === 0) {
    return `<div class="admin-box"><p style="color:#888;">Aucun match. Ajoutez-en dans l'onglet Matchs.</p></div>`;
  }

  const scores = getScores(state.format);
  const rounds = [...new Set(state.matches.map(m => m.round))];
  let html = '';

  rounds.forEach(round => {
    html += `<div class="admin-box">
      <h3>${round}</h3>`;
    state.matches.filter(m => m.round === round).forEach(match => {
      html += `<div style="border:1px solid #eee; border-radius:8px; padding:14px; margin-bottom:10px;">
        <div style="font-weight:bold; margin-bottom:8px;">${match.player1} vs ${match.player2}</div>`;

      if (match.result) {
        const winnerName = match.result.winner === 'player1' ? match.player1 : match.player2;
        html += `<span style="color:#0c6b2f;">✅ <strong>${winnerName} ${match.result.score}</strong></span>
          <button class="orange" style="margin-left:12px; padding:6px 12px;" onclick="adminClearResult('${match.id}')">Modifier</button>`;
      } else {
        html += `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
          <span style="font-size:13px; color:#555;">Vainqueur :</span>
          <button class="green" style="padding:8px 12px;" onclick="adminPickWinner('${match.id}', 'player1')">${match.player1}</button>
          <button class="green" style="padding:8px 12px;" onclick="adminPickWinner('${match.id}', 'player2')">${match.player2}</button>
        </div>`;
        if (match._pendingWinner) {
          const winnerName = match._pendingWinner === 'player1' ? match.player1 : match.player2;
          html += `<div style="font-size:13px; color:#555; margin-bottom:6px;">Score de victoire pour <strong>${winnerName}</strong> :</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">`;
          scores.forEach(s => {
            html += `<button class="blue" style="padding:8px 14px;" onclick="adminSetResult('${match.id}', '${match._pendingWinner}', '${s}')">${s}</button>`;
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

// ── Exports ────────────────────────────────────────────────────────────────

export function adminSaveTournamentName() {
  const name = document.getElementById('tournamentNameInput').value.trim();
  if (!name) return;
  state.tournamentName = name;
  const t = state.tournamentList.find(t => t.id === state.currentTournamentId);
  if (t) t.name = name;
  save();
  showAdminPanel('config');
}

export function adminSaveFormat() {
  state.format = document.getElementById('formatInput').value;
  save();
  showAdminPanel('config');
}

export function adminAddMatch() {
  const round   = document.getElementById('matchRound').value.trim();
  const player1 = document.getElementById('matchPlayer1').value.trim();
  const player2 = document.getElementById('matchPlayer2').value.trim();
  if (!round || !player1 || !player2) return alert('Remplissez tous les champs.');
  state.matches.push({ id: `m_${Date.now()}`, round, player1, player2, result: null });
  save();
  showAdminPanel('matchs');
}

export function adminDeleteMatch(id) {
  if (!confirm('Supprimer ce match ? Les pronostics liés seront perdus.')) return;
  state.matches = state.matches.filter(m => m.id !== id);
  state.players.forEach(p => { if (p.predictions) delete p.predictions[id]; });
  save();
  showAdminPanel('matchs');
}

export function adminPickWinner(matchId, winner) {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  state.matches.forEach(m => { delete m._pendingWinner; });
  match._pendingWinner = winner;
  showAdminPanel('resultats');
}

export function adminSetResult(matchId, winner, score) {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  delete match._pendingWinner;
  match.result = { winner, score };
  save();
  showAdminPanel('resultats');
}

export function adminSyncFromBracket() {
  const { bracketPlayers: players, bracketRounds: rounds, bracketResults: results } = state;

  if (!players.length || !rounds.length) {
    alert('Aucun tableau configuré dans Prono Tableau pour ce tournoi.');
    return;
  }

  let added = 0;

  rounds.forEach((round, roundIndex) => {
    for (let matchIdx = 0; matchIdx < round.matches; matchIdx++) {
      let player1, player2;

      if (roundIndex === 0) {
        player1 = players[matchIdx * 2];
        player2 = players[matchIdx * 2 + 1];
      } else {
        const prevResults = (results[`round${roundIndex - 1}`] || []);
        player1 = prevResults[matchIdx * 2]     || null;
        player2 = prevResults[matchIdx * 2 + 1] || null;
      }

      if (!player1 || !player2) continue;

      const exists = state.matches.some(
        m => m.round === round.name && m.player1 === player1 && m.player2 === player2
      );
      if (exists) continue;

      state.matches.push({
        id: `m_${roundIndex}_${matchIdx}_${Date.now()}`,
        round: round.name,
        player1,
        player2,
        result: null,
      });
      added++;
    }
  });

  if (added > 0) {
    save();
    alert(`${added} match(s) importé(s) depuis le tableau.`);
  } else {
    alert('Tous les matchs disponibles sont déjà présents.');
  }
  showAdminPanel('matchs');
}

export function adminClearResult(matchId) {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return;
  match.result = null;
  save();
  showAdminPanel('resultats');
}
