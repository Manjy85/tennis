import { state, uiState, saveMyTableau, isMine, getPlayerMetaParts, splitDisplayName } from './state.js';

// ── Calcul des scores ──────────────────────────────────────────────────────

export function tableauScoreOf(player) { return calcScore(player); }

function calcScore(player) {
  let score = 0;
  state.rounds.forEach((round, ri) => {
    (player.predictions[`round${ri}`] || []).forEach((winner, mi) => {
      if (winner && winner === (state.officialResults[`round${ri}`] || [])[mi]) score += round.points;
    });
  });
  return score;
}

export function countFilled(player) {
  let filled = 0, total = 0;
  state.rounds.forEach((round, ri) => {
    total += round.matches;
    (player.predictions[`round${ri}`] || []).forEach(w => { if (w) filled++; });
  });
  return { filled, total };
}

// ── Mes Pronostics (CTA basé sur le compte) ────────────────────────────────

// Garantit que l'utilisateur courant a un bracket (le crée si besoin), sans rendu.
export function ensureMyTableau() {
  if (!state.me || !state.currentTournamentId) return null;
  let player = state.tPlayers.find(p => p.uid === state.me.uid);
  if (!player) {
    player = { uid: state.me.uid, name: state.me.name, score: 0, locked: false, reopened: [], predictions: {} };
    state.rounds.forEach((r, i) => { player.predictions[`round${i}`] = Array(r.matches).fill(null); });
    state.tPlayers.push(player);
    saveMyTableau(player);
  }
  return player;
}

export function openMyTableau() {
  if (!state.me) { window.requireLogin && window.requireLogin(); return; }
  if (!state.currentTournamentId) {
    document.getElementById('content').innerHTML = `<p style="color:#888;">Aucun tournoi actif.</p>`;
    return;
  }
  const player = ensureMyTableau();
  showBracket(player.uid);
}

// ── Bracket ────────────────────────────────────────────────────────────────

export function lockBracket(uid) {
  const player = state.tPlayers.find(p => p.uid === uid);
  if (!player || !isMine(player)) return;
  if (!confirm("Verrouiller définitivement ton tableau ?")) return;
  player.locked = true;
  saveMyTableau(player);
  showBracket(uid, bracketCtx);
}

// Un slot rouvert (remplacement de joueur : lucky loser...) reste éditable
// malgré le verrou, tant que le résultat officiel du match n'est pas connu.
export function isSlotReopened(player, roundIndex, matchIndex) {
  if (!(player.reopened || []).includes(`r${roundIndex}_m${matchIndex}`)) return false;
  const off = (state.officialResults[`round${roundIndex}`] || [])[matchIndex];
  return off === null || off === undefined;
}

export function selectWinner(uid, roundIndex, matchIndex, winner) {
  const player = state.tPlayers.find(p => p.uid === uid);
  if (!player || !isMine(player)) return;
  if (player.locked && !isSlotReopened(player, roundIndex, matchIndex)) {
    return alert('Ton tableau est verrouillé !');
  }
  const old = player.predictions[`round${roundIndex}`][matchIndex];
  player.predictions[`round${roundIndex}`][matchIndex] = winner;
  if (old && old !== winner) {
    for (let r = roundIndex + 1; r < state.rounds.length; r++) {
      const mi = Math.floor(matchIndex / Math.pow(2, r - roundIndex));
      if (player.predictions[`round${r}`][mi] === old) {
        player.predictions[`round${r}`][mi] = null;
        // Sur un tableau verrouillé, un slot vidé en cascade depuis un slot
        // rouvert doit rester remplissable : on le rouvre aussi.
        if (player.locked) {
          player.reopened = player.reopened || [];
          if (!player.reopened.includes(`r${r}_m${mi}`)) player.reopened.push(`r${r}_m${mi}`);
        }
      }
    }
  }
  saveMyTableau(player);
  showBracket(uid, bracketCtx);
}

export function toggleRound(roundIndex, uid) {
  if (uiState.hiddenRounds.has(roundIndex)) uiState.hiddenRounds.delete(roundIndex);
  else uiState.hiddenRounds.add(roundIndex);
  showBracket(uid, bracketCtx);
}

// Conteneur de rendu courant du bracket (pour re-render après une action).
let bracketCtx = 'content';

export function showBracket(uid, containerId = 'content') {
  bracketCtx = containerId;
  const player = state.tPlayers.find(p => p.uid === uid);
  if (!player) return;
  const editable = isMine(player) && !player.locked;

  let firstVisible = 0;
  while (uiState.hiddenRounds.has(firstVisible) && firstVisible < state.rounds.length) firstVisible++;

  const minH = uiState.hiddenRounds.size === 0
    ? Math.max(500, state.initialPlayers.length * 45)
    : Math.max(320, (state.rounds[firstVisible]?.matches || 1) * 2 * 45);

  const H = uiState.measuredMatchHeight;

  let html = `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
    <h2 style="margin:0;">Tableau de ${player.name}</h2>`;
  if (!isMine(player)) html += `<span style="color:#888; font-weight:bold;" title="Tableau d'un autre joueur — ses pronostics n'apparaissent que sur les matchs déjà joués">👁️ Lecture seule — picks visibles après chaque match joué</span>`;
  else if (!player.locked) html += `<button class="red" title="Verrouille définitivement ton tableau : plus aucune modification possible ensuite" onclick="lockBracket('${player.uid}')">🔒 Verrouiller</button>`;
  else html += `<span style="color:#0c6b2f; font-weight:bold;" title="Tableau verrouillé — modification impossible">🔒 Verrouillé</span>`;
  html += `</div>`;

  // Bandeau : des slots ont été rouverts suite à un changement de joueur
  // (lucky loser...) et attendent un nouveau pronostic.
  if (isMine(player)) {
    const pending = (player.reopened || []).filter(key => {
      const m = key.match(/^r(\d+)_m(\d+)$/);
      return m && isSlotReopened(player, parseInt(m[1], 10), parseInt(m[2], 10));
    });
    if (pending.length > 0) {
      html += `<div class="reopened-banner">🔁 <strong>Changement de joueur dans le tableau !</strong>
        ${pending.length} match${pending.length > 1 ? 's ont été rouverts' : ' a été rouvert'} pour toi (surligné${pending.length > 1 ? 's' : ''} en orange) — tu peux repronostiquer cette branche même si ton tableau est verrouillé.</div>`;
    }
  }

  html += `<div class="bracket" style="min-height:${minH}px; --match-height:${H}px;">`;

  // Anti-triche : sur le tableau d'un autre joueur, l'arbre est construit à
  // partir des résultats OFFICIELS (pas de ses picks), et ses picks ne sont
  // révélés que sur les matchs dont le résultat est connu.
  const owner = isMine(player);

  state.rounds.forEach((round, ri) => {
    const roundPlayers = ri === 0 ? state.initialPlayers
      : owner ? (player.predictions[`round${ri - 1}`] || [])
      : (state.officialResults[`round${ri - 1}`] || []);
    const isCollapsed  = uiState.hiddenRounds.has(ri);
    const visIdx       = Math.max(0, ri - firstVisible);
    const baseGap      = Math.max(8, Math.round(16 * (uiState.hiddenRounds.size > 0 ? 0.7 : 1)));
    const step         = H + baseGap;
    const roundGap     = Math.pow(2, visIdx) * step - H;
    const roundOffset  = ((Math.pow(2, visIdx) - 1) * step) / 2;
    const roundWidth   = uiState.measuredRoundWidths[ri] || 220;

    html += `<div class="round ${isCollapsed ? 'collapsed' : ''}" style="--match-width:${roundWidth}px;">
      <div class="vertical-title" onclick="toggleRound(${ri}, '${player.uid}')">${round.name}</div>
      <div class="round-header">
        <h2>${round.name}<br><small>${round.points} pts</small></h2>
        <button class="toggle-btn" onclick="toggleRound(${ri}, '${player.uid}')">👁️ Masquer</button>
      </div>
      <div class="match-container" style="--round-gap:${roundGap}px; --round-offset:${roundOffset}px;">`;

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      // Slot rouvert (changement de joueur) : éditable malgré le verrou.
      const reopenedSlot = isMine(player) && isSlotReopened(player, ri, i);
      const slotEditable = editable || reopenedSlot;
      if (!p1 && !p2) {
        html += `<div class="match empty"><span style="color:#aaa;">En attente...</span></div>`;
      } else {
        html += `<div class="match${reopenedSlot ? ' reopened' : ''}">`;
        [p1, p2].forEach(p => {
          if (!p) return;
          const meta  = getPlayerMetaParts(p);
          const parts = splitDisplayName(p);
          const off   = (state.officialResults[`round${ri}`] || [])[i];
          const played = off !== null && off !== undefined;
          // Pick visible : toujours pour soi, seulement si le match est joué pour les autres.
          const sel   = (player.predictions[`round${ri}`] || [])[i] === p && (owner || played);
          let cls = 'player-btn' + (sel ? ' selected' : '');
          if (sel && off !== null && off !== undefined) cls += (off === p ? ' correct' : ' incorrect');
          html += `<button class="${cls}" onclick="selectWinner('${player.uid}',${ri},${i},'${p.replace(/'/g,"\\'")}')" ${slotEditable ? '' : 'disabled'}>
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
  document.getElementById(containerId).innerHTML = html;

  // Auto-ajustement des dimensions
  requestAnimationFrame(() => {
    const bracketEl = document.querySelector(`#${containerId} .bracket`);
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
      showBracket(uid, containerId);
    }
  });
}
