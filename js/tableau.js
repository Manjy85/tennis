import { state, uiState, saveTableau, getPlayerMetaParts, splitDisplayName } from './state.js';

// ── Calcul des scores ──────────────────────────────────────────────────────

function calcScore(player) {
  let score = 0;
  state.rounds.forEach((round, ri) => {
    (player.predictions[`round${ri}`] || []).forEach((winner, mi) => {
      if (winner && winner === (state.officialResults[`round${ri}`] || [])[mi]) score += round.points;
    });
  });
  return score;
}

function calcMaxPossible(player) {
  const getPossible = (ri, mi) => {
    const official = (state.officialResults[`round${ri}`] || [])[mi];
    if (official) return [official];
    if (ri === 0) return [state.initialPlayers[mi * 2], state.initialPlayers[mi * 2 + 1]].filter(Boolean);
    const left  = getPossible(ri - 1, mi * 2);
    const right = getPossible(ri - 1, mi * 2 + 1);
    return [...new Set([...left, ...right])];
  };
  let score = 0;
  state.rounds.forEach((round, ri) => {
    (player.predictions[`round${ri}`] || []).forEach((winner, mi) => {
      if (!winner) return;
      const official = (state.officialResults[`round${ri}`] || [])[mi];
      if (official === winner) { score += round.points; return; }
      if (official !== null && official !== undefined) return;
      if (getPossible(ri, mi).includes(winner)) score += round.points;
    });
  });
  return score;
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export function showTableauDashboard() {
  state.tPlayers.forEach(p => { p.score = calcScore(p); });
  const sorted = [...state.tPlayers].sort((a, b) => b.score - a.score);

  let html = `<h2>Prono Tableau — ${state.tournamentName || 'Aucun tournoi'}</h2>
    <div class="dashboard">`;
  sorted.forEach((p, i) => {
    const max = calcMaxPossible(p);
    html += `<div class="player-card" onclick="showBracket('${p.name}')">
      <div class="lock-badge">${p.locked ? '🔒' : '✏️'}</div>
      <h3>${i + 1}. ${p.name}</h3>
      <div class="player-card-score">${p.score} pts</div>
      <div style="font-size:13px; color:#888;">Max possible : ${max} pts</div>
    </div>`;
  });
  if (!state.tPlayers.length) html += `<p>Aucun joueur. Cliquez sur "+ Nouveau joueur".</p>`;
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}

// ── Classement ─────────────────────────────────────────────────────────────

export function showTableauRanking() {
  state.tPlayers.forEach(p => { p.score = calcScore(p); });
  const sorted = [...state.tPlayers].sort((a, b) => b.score - a.score);

  let html = `<h2>Classement Tableau — ${state.tournamentName || ''}</h2>
    <table><thead><tr><th>#</th><th>Joueur</th><th>Statut</th>`;
  state.rounds.forEach((r, i) => { html += `<th title="${r.name}">R${i + 1}</th>`; });
  html += `<th>Points</th><th>Max</th></tr></thead><tbody>`;

  sorted.forEach((p, i) => {
    const max = calcMaxPossible(p);
    html += `<tr><td>${i + 1}</td><td><strong>${p.name}</strong></td>
      <td>${p.locked ? '🔒 Prêt' : '✏️ En cours'}</td>`;
    state.rounds.forEach((round, ri) => {
      let pts = 0;
      (p.predictions[`round${ri}`] || []).forEach((w, mi) => {
        if (w && w === (state.officialResults[`round${ri}`] || [])[mi]) pts += round.points;
      });
      html += `<td>${pts} pts</td>`;
    });
    html += `<td style="font-weight:bold; color:#0c6b2f;">${p.score} pts</td>
      <td>${max} pts</td></tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('content').innerHTML = html;
}

// ── Nouveau joueur ─────────────────────────────────────────────────────────

export function newTableauPlayer() {
  if (!state.currentTournamentId) {
    document.getElementById('content').innerHTML = `<p style="color:#888;">Aucun tournoi actif.</p>`;
    return;
  }
  document.getElementById('content').innerHTML = `
    <h2>Nouveau joueur</h2>
    <p style="color:#666; margin-bottom:12px;">Tournoi : <strong>${state.tournamentName}</strong></p>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <input id="playerName" placeholder="Ton pseudo" />
      <button class="green" onclick="createTableauPlayer()">Créer mon bracket</button>
    </div>`;
}

export function createTableauPlayer() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) return alert('Entre un pseudo');
  if (state.tPlayers.find(p => p.name === name)) return alert('Pseudo déjà utilisé');
  const player = { name, score: 0, locked: false, predictions: {} };
  state.rounds.forEach((r, i) => { player.predictions[`round${i}`] = Array(r.matches).fill(null); });
  state.tPlayers.push(player);
  saveTableau();
  showBracket(player.name);
}

// ── Bracket ────────────────────────────────────────────────────────────────

export function lockBracket(playerName) {
  if (!confirm("Verrouiller définitivement ton tableau ?")) return;
  const player = state.tPlayers.find(p => p.name === playerName);
  player.locked = true;
  saveTableau();
  showBracket(playerName);
}

export function selectWinner(playerName, roundIndex, matchIndex, winner) {
  const player = state.tPlayers.find(p => p.name === playerName);
  if (player.locked) return alert('Ton tableau est verrouillé !');
  const old = player.predictions[`round${roundIndex}`][matchIndex];
  player.predictions[`round${roundIndex}`][matchIndex] = winner;
  if (old && old !== winner) {
    for (let r = roundIndex + 1; r < state.rounds.length; r++) {
      const mi = Math.floor(matchIndex / Math.pow(2, r - roundIndex));
      if (player.predictions[`round${r}`][mi] === old) player.predictions[`round${r}`][mi] = null;
    }
  }
  saveTableau();
  showBracket(playerName);
}

export function toggleRound(roundIndex, playerName) {
  if (uiState.hiddenRounds.has(roundIndex)) uiState.hiddenRounds.delete(roundIndex);
  else uiState.hiddenRounds.add(roundIndex);
  showBracket(playerName);
}

export function showBracket(playerName) {
  const player = state.tPlayers.find(p => p.name === playerName);
  if (!player) return;

  let firstVisible = 0;
  while (uiState.hiddenRounds.has(firstVisible) && firstVisible < state.rounds.length) firstVisible++;

  const minH = uiState.hiddenRounds.size === 0
    ? Math.max(500, state.initialPlayers.length * 45)
    : Math.max(320, (state.rounds[firstVisible]?.matches || 1) * 2 * 45);

  const H = uiState.measuredMatchHeight;

  let html = `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
    <h2 style="margin:0;">Tableau de ${player.name}</h2>`;
  if (!player.locked) html += `<button class="red" onclick="lockBracket('${player.name}')">🔒 Verrouiller</button>`;
  else html += `<span style="color:#0c6b2f; font-weight:bold;">🔒 Verrouillé</span>`;
  html += `</div>
    <div class="bracket" style="min-height:${minH}px; --match-height:${H}px;">`;

  state.rounds.forEach((round, ri) => {
    const roundPlayers = ri === 0 ? state.initialPlayers : (player.predictions[`round${ri - 1}`] || []);
    const isCollapsed  = uiState.hiddenRounds.has(ri);
    const visIdx       = Math.max(0, ri - firstVisible);
    const baseGap      = Math.max(8, Math.round(16 * (uiState.hiddenRounds.size > 0 ? 0.7 : 1)));
    const step         = H + baseGap;
    const roundGap     = Math.pow(2, visIdx) * step - H;
    const roundOffset  = ((Math.pow(2, visIdx) - 1) * step) / 2;
    const roundWidth   = uiState.measuredRoundWidths[ri] || 220;

    html += `<div class="round ${isCollapsed ? 'collapsed' : ''}" style="--match-width:${roundWidth}px;">
      <div class="vertical-title" onclick="toggleRound(${ri}, '${player.name}')">${round.name}</div>
      <div class="round-header">
        <h2>${round.name}<br><small>${round.points} pts</small></h2>
        <button class="toggle-btn" onclick="toggleRound(${ri}, '${player.name}')">👁️ Masquer</button>
      </div>
      <div class="match-container" style="--round-gap:${roundGap}px; --round-offset:${roundOffset}px;">`;

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      if (!p1 && !p2) {
        html += `<div class="match empty"><span style="color:#aaa;">En attente...</span></div>`;
      } else {
        html += `<div class="match">`;
        [p1, p2].forEach(p => {
          if (!p) return;
          const meta  = getPlayerMetaParts(p);
          const parts = splitDisplayName(p);
          const sel   = player.predictions[`round${ri}`][i] === p;
          const off   = (state.officialResults[`round${ri}`] || [])[i];
          let cls = 'player-btn' + (sel ? ' selected' : '');
          if (sel && off !== null && off !== undefined) cls += (off === p ? ' correct' : ' incorrect');
          html += `<button class="${cls}" onclick="selectWinner('${player.name}',${ri},${i},'${p.replace(/'/g,"\\'")}')  " ${player.locked ? 'disabled' : ''}>
            <span class="player-label">
              <span class="player-seed">${meta.seed}</span>
              <span class="player-name"><span>${parts.lastName}</span><span>${parts.firstName}</span></span>
              <span class="player-nat">${meta.nat}</span>
            </span>
          </button>`;
        });
        html += `</div>`;
      }
    }
    html += `</div></div>`;
  });
  html += `</div>`;
  document.getElementById('content').innerHTML = html;

  // Auto-ajustement des dimensions
  requestAnimationFrame(() => {
    const bracketEl = document.querySelector('#content .bracket');
    if (!bracketEl) return;
    bracketEl.classList.add('auto-height', 'auto-size');
    let maxH = 0;
    bracketEl.querySelectorAll('.match').forEach(m => {
      const h = m.getBoundingClientRect().height;
      if (h > maxH) maxH = h;
    });
    const nextWidths = Array.from(bracketEl.querySelectorAll('.round')).map((el, i) => {
      if (el.classList.contains('collapsed')) return uiState.measuredRoundWidths[i] || 220;
      let maxW = 0;
      el.querySelectorAll('.match').forEach(m => { const w = m.getBoundingClientRect().width; if (w > maxW) maxW = w; });
      return Math.max(200, Math.round(maxW) + 16);
    });
    bracketEl.classList.remove('auto-height', 'auto-size');
    const newH = Math.max(56, Math.round(maxH));
    if (Math.abs(newH - uiState.measuredMatchHeight) >= 2 ||
        nextWidths.some((w, i) => Math.abs(w - (uiState.measuredRoundWidths[i] || 0)) >= 2)) {
      uiState.measuredMatchHeight = newH;
      uiState.measuredRoundWidths = nextWidths;
      showBracket(playerName);
    }
  });
}
