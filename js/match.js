import { state, saveMyMatch, isMine, getScores } from './state.js';

// ── Calcul des scores ──────────────────────────────────────────────────────

export function matchScoreOf(player) { return calcScore(player); }

// Nombre de matchs avec un pronostic complet (vainqueur + score) / total.
export function matchFilledOf(player) {
  const total = state.matches.length;
  const filled = state.matches.filter(m => {
    const pred = (player.predictions || {})[m.id] || {};
    return pred.winner && pred.score;
  }).length;
  return { filled, total };
}

function calcScore(player) {
  let score = 0;
  state.matches.forEach(match => {
    if (!match.result) return;
    const pred = (player.predictions || {})[match.id] || {};
    if (!pred.winner) return;
    const okWinner = pred.winner === match.result.winner;
    const okScore  = okWinner && pred.score === match.result.score;
    if (okScore)       score += 3;
    else if (okWinner) score += 1;
  });
  return score;
}

// Garantit que l'utilisateur courant a un doc pronos match (le crée si besoin), sans rendu.
export function ensureMyMatch() {
  if (!state.me || !state.currentTournamentId) return null;
  let player = state.mPlayers.find(p => p.uid === state.me.uid);
  if (!player) {
    player = { uid: state.me.uid, name: state.me.name, predictions: {}, score: 0 };
    state.mPlayers.push(player);
    saveMyMatch(player);
  }
  return player;
}

// ── Pronostics matchs : carte réutilisable ──────────────────────────────────

// Contexte de re-render courant (rappelé après chaque action de pronostic).
let predictCtx = { render: null };

function matchCardHtml(match, pred, editable, scores, uid) {
  const result = match.result;
  const isLocked = !!pred.locked;
  const hasFull = !!pred.winner && !!pred.score;

  let cardClass = 'pending', statusIcon = '';
  if (result && pred.winner) {
    const okWinner = pred.winner === result.winner;
    const okScore  = okWinner && pred.score === result.score;
    if (okScore)       { cardClass = 'correct';   statusIcon = '✅ +3 pts'; }
    else if (okWinner) { cardClass = 'partial';   statusIcon = '🟡 +1 pt'; }
    else               { cardClass = 'incorrect'; statusIcon = '❌ 0 pt'; }
  } else if (isLocked) { cardClass = 'locked'; }
  else if (hasFull)    { cardClass = 'done'; }

  let h = `<div class="bracket-match-card ${cardClass}">
    <div class="card-round">${match.round}</div>
    <div class="match-players">
      <span class="match-player ${pred.winner === 'player1' ? 'match-player-picked' : ''}">${match.player1}</span>
      <span class="match-vs">vs</span>
      <span class="match-player ${pred.winner === 'player2' ? 'match-player-picked' : ''}">${match.player2}</span>
    </div>`;

  if (result) {
    const wName = result.winner === 'player1' ? match.player1 : match.player2;
    h += `<div class="match-result">✔ ${wName} ${result.score}</div>`;
  }

  if (isLocked) {
    const wName = pred.winner === 'player1' ? match.player1 : match.player2;
    h += `<div class="pred-locked" title="Pronostic verrouillé — modification impossible">🔒 ${wName} ${pred.score || '?'}</div>`;
  } else if (!editable) {
    if (pred.winner) {
      const wName = pred.winner === 'player1' ? match.player1 : match.player2;
      h += `<div class="pred-locked">${wName} ${pred.score || '—'}</div>`;
    } else {
      h += `<div style="color:#bbb; font-size:12px;">Pas encore pronostiqué</div>`;
    }
  } else {
    h += `<div class="pick-winner">
      <button class="pick-btn ${pred.winner === 'player1' ? 'selected' : ''}"
        onclick="pickWinner('${uid}','${match.id}','player1')">${match.player1}</button>
      <button class="pick-btn ${pred.winner === 'player2' ? 'selected' : ''}"
        onclick="pickWinner('${uid}','${match.id}','player2')">${match.player2}</button>
    </div>`;
    if (pred.winner) {
      const wName = pred.winner === 'player1' ? match.player1 : match.player2;
      h += `<div class="pick-score"><span class="pick-score-label">${wName} gagne :</span><div>`;
      scores.forEach(s => {
        h += `<button class="score-btn ${pred.score === s ? 'selected' : ''}"
          onclick="pickScore('${uid}','${match.id}','${s}')">${s}</button>`;
      });
      h += `</div></div>`;
    }
    if (hasFull) {
      h += `<button class="lock-match-btn" title="Verrouille ce pronostic : il ne sera plus modifiable" onclick="lockMatch('${uid}','${match.id}')">🔒 Verrouiller</button>`;
    }
  }

  if (statusIcon) h += `<div class="status-icon">${statusIcon}</div>`;
  h += `</div>`;
  return h;
}

// ── Section B : Matchs restants (non verrouillés) ───────────────────────────

export function showMatchsRestants(uid, containerId = 'content') {
  predictCtx = { render: () => showMatchsRestants(uid, containerId) };
  const player = state.mPlayers.find(p => p.uid === uid);
  if (!player) return;
  const editable = isMine(player);
  const scores = getScores();

  // Restants = matchs PAS encore joués et NON verrouillés. Un match déjà joué
  // sort de cette liste (anti-triche : on ne pronostique pas après coup).
  const remaining = state.matches.filter(m => !m.result && !((player.predictions || {})[m.id] || {}).locked);
  const target = document.getElementById(containerId);

  if (!state.matches.length) {
    target.innerHTML = `<p style="color:#888;">Aucun match disponible pour ce tournoi.</p>`;
    return;
  }
  if (!remaining.length) {
    target.innerHTML = `<div class="empty-state">🎉 Tous tes matchs sont verrouillés. Retrouve-les dans <strong>Récap</strong>.</div>`;
    return;
  }

  let html = '';
  if (editable) html += `<p style="color:#888; font-size:13px; margin:0 0 16px;">Choisissez vainqueur + score, puis verrouillez chaque match. Un match verrouillé bascule dans « Récap ».</p>`;

  // Toutes les cartes ensemble dans une grille (style feed).
  html += `<div class="match-grid">`;
  remaining.forEach(m => { html += matchCardHtml(m, (player.predictions || {})[m.id] || {}, editable, scores, uid); });
  html += `</div>`;
  target.innerHTML = html;
}

// ── Section C : Récap — arbre de bracket qui se construit au fil des résultats ─

// Score affiché pour CE joueur :
//  - si l'utilisateur a pronostiqué → son nombre de manches ('2' / '0')
//  - sinon, si le match est joué (résultat saisi) → '-'
//  - sinon → rien (vide)
function recapSetScore(side, pred, result) {
  if (pred.winner && pred.score) {
    const parts = String(pred.score).split('-');
    if (parts.length === 2) return pred.winner === side ? parts[0] : parts[1];
  }
  return result ? '-' : '';
}

// Une ligne « joueur | score » d'une cellule (style identique au Tableau).
function recapRow(side, name, pred, result) {
  if (!name) return `<div class="player-btn recap-row"><span class="player-name">—</span><span class="rscore"></span></div>`;
  const picked = pred.winner === side;
  let cls = 'player-btn recap-row';
  if (picked) {
    cls += ' selected';
    if (result) cls += (result.winner === side ? ' correct' : ' incorrect');
  }
  return `<div class="${cls}"><span class="player-name">${name}</span><span class="rscore">${recapSetScore(side, pred, result)}</span></div>`;
}

// Hauteur de cellule mesurée dynamiquement (comme le Tableau), pour ne rien rogner.
let recapMatchH = 78;

export function showRecap(uid, containerId = 'content') {
  const player = state.mPlayers.find(p => p.uid === uid);
  if (!player) return;
  const target = document.getElementById(containerId);
  const rounds = state.rounds || [];

  if (!rounds.length) {
    target.innerHTML = `<div class="empty-state">Aucun tableau configuré pour ce tournoi.</div>`;
    return;
  }

  const H = recapMatchH;
  const minH = Math.max(420, (rounds[0]?.matches || 1) * 2 * 45);
  let html = `<div class="bracket recap-bracket" style="min-height:${minH}px; --match-height:${H}px;">`;

  rounds.forEach((round, ri) => {
    // Joueurs de ce tour : tirés de la STRUCTURE du tableau (comme le Tableau),
    // pas de state.matches → l'arbre s'affiche dès le 1er tour et se remplit
    // ensuite via les résultats officiels.
    const roundPlayers = ri === 0
      ? (state.initialPlayers || [])
      : (state.officialResults[`round${ri - 1}`] || []);

    const baseGap = 16;
    const step = H + baseGap;
    const roundGap = Math.pow(2, ri) * step - H;
    const roundOffset = ((Math.pow(2, ri) - 1) * step) / 2;
    const roundWidth = 210; // largeur fixe : laisse la place au nom + score étroit

    html += `<div class="round" style="--match-width:${roundWidth}px;">
      <div class="round-header"><h2>${round.name}</h2></div>
      <div class="match-container" style="--round-gap:${roundGap}px; --round-offset:${roundOffset}px;">`;

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      if (!p1 || !p2) { html += `<div class="match empty"><span style="color:#aaa;">En attente…</span></div>`; continue; }

      const id = `r${ri}_m${i}`;
      const m = state.matches.find(x => x.id === id);
      const pred = (player.predictions || {})[id] || {};
      const result = m ? m.result : null;
      // Estompé tant qu'aucun pronostic ni résultat.
      const has = !!(pred.winner || result);
      html += `<div class="match recap-cell ${has ? '' : 'faint'}">
        ${recapRow('player1', p1, pred, result)}
        ${recapRow('player2', p2, pred, result)}
      </div>`;
    }
    html += `</div></div>`;
  });
  html += `</div>`;
  target.innerHTML = html;

  // Auto-dimensionnement : on mesure la cellule la plus haute et on re-rend
  // si besoin (même principe que le bracket du Tableau).
  requestAnimationFrame(() => {
    const el = document.querySelector(`#${containerId} .recap-bracket`);
    if (!el) return;
    el.classList.add('auto-height');
    let maxH = 0;
    el.querySelectorAll('.match').forEach(m => {
      const h = m.getBoundingClientRect().height;
      if (h > maxH) maxH = h;
    });
    el.classList.remove('auto-height');
    const newH = Math.max(56, Math.round(maxH));
    if (Math.abs(newH - recapMatchH) >= 3) {
      recapMatchH = newH;
      showRecap(uid, containerId);
    }
  });
}

export function pickWinner(uid, matchId, winner) {
  const player = state.mPlayers.find(p => p.uid === uid);
  if (!player || !isMine(player)) return;
  const _m = state.matches.find(x => x.id === matchId);
  if (_m && _m.result) return; // match déjà joué : pronostic figé (anti-triche)
  if (!player.predictions) player.predictions = {};
  const existing = player.predictions[matchId] || {};
  if (existing.locked) return;
  player.predictions[matchId] = { winner, score: existing.winner === winner ? existing.score : null, locked: false };
  saveMyMatch(player);
  predictCtx.render && predictCtx.render();
}

export function pickScore(uid, matchId, score) {
  const player = state.mPlayers.find(p => p.uid === uid);
  if (!player || !isMine(player)) return;
  const _m = state.matches.find(x => x.id === matchId);
  if (_m && _m.result) return; // match déjà joué : pronostic figé (anti-triche)
  if (!player.predictions) player.predictions = {};
  const existing = player.predictions[matchId] || {};
  if (existing.locked || !existing.winner) return;
  player.predictions[matchId] = { ...existing, score };
  saveMyMatch(player);
  predictCtx.render && predictCtx.render();
}

export function lockMatch(uid, matchId) {
  const player = state.mPlayers.find(p => p.uid === uid);
  if (!player || !isMine(player)) return;
  const _m = state.matches.find(x => x.id === matchId);
  if (_m && _m.result) return; // match déjà joué : pronostic figé (anti-triche)
  const pred = (player.predictions || {})[matchId];
  if (!pred?.winner || !pred?.score) return alert('Complétez le pronostic avant de verrouiller.');
  pred.locked = true;
  saveMyMatch(player);
  predictCtx.render && predictCtx.render();
}
