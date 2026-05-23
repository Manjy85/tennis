import { state, uiState, save, ensurePlayerPredictions, getPlayerMetaParts, splitDisplayName } from './state.js';

function getRoundPlayers(roundIndex) {
  if (roundIndex === 0) return state.initialPlayers;
  const prevResults = state.officialResults[`round${roundIndex - 1}`] || [];
  return prevResults.map(result => (result && result.winner) ? result.winner : null);
}

function normalizeScore(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^0-9]/g, '');
}

function getScoreParts(entry) {
  if (!entry) return { score1: '', score2: '' };
  if (entry.score1 !== undefined || entry.score2 !== undefined) {
    return {
      score1: entry.score1 ? String(entry.score1) : '',
      score2: entry.score2 ? String(entry.score2) : ''
    };
  }
  const match = String(entry.score || '').match(/^(\d+)-(\d+)$/);
  if (!match) return { score1: '', score2: '' };
  return { score1: match[1], score2: match[2] };
}

function isValidScore(value) {
  return /^\d-\d$/.test(value);
}

export function updateMatchDimensions(rerender) {
  const bracketEl = document.querySelector('#content .bracket');
  if (!bracketEl) return;

  bracketEl.classList.add('auto-height', 'auto-size');
  const matches = bracketEl.querySelectorAll('.match');
  const roundEls = bracketEl.querySelectorAll('.round');
  let maxHeight = 0;
  matches.forEach((match) => {
    const rect = match.getBoundingClientRect();
    if (rect.height > maxHeight) maxHeight = rect.height;
  });

  const nextRoundWidths = Array.from(roundEls).map((roundEl, index) => {
    if (roundEl.classList.contains('collapsed')) {
      return uiState.measuredRoundWidths[index] || 220;
    }
    const roundMatches = roundEl.querySelectorAll('.match');
    let roundMaxWidth = 0;
    roundMatches.forEach((match) => {
      const rect = match.getBoundingClientRect();
      if (rect.width > roundMaxWidth) roundMaxWidth = rect.width;
    });
    return Math.max(200, Math.round(roundMaxWidth) + 16);
  });
  bracketEl.classList.remove('auto-height', 'auto-size');

  const nextHeight = Math.max(70, Math.round(maxHeight));
  const heightChanged = Math.abs(nextHeight - uiState.measuredMatchHeight) >= 2;
  const widthChanged = nextRoundWidths.some((width, i) => {
    const prev = uiState.measuredRoundWidths[i] || 0;
    return Math.abs(width - prev) >= 2;
  }) || uiState.measuredRoundWidths.length !== nextRoundWidths.length;
  if (heightChanged || widthChanged) {
    uiState.measuredMatchHeight = nextHeight;
    uiState.measuredRoundWidths = nextRoundWidths;
    rerender();
  }
}

export function getBracketMinHeight() {
  if (uiState.hiddenRounds.size === 0) {
    return Math.max(500, state.initialPlayers.length * 45);
  }

  let firstVisibleRoundIndex = 0;
  while (uiState.hiddenRounds.has(firstVisibleRoundIndex) && firstVisibleRoundIndex < state.rounds.length) {
    firstVisibleRoundIndex += 1;
  }

  if (firstVisibleRoundIndex >= state.rounds.length) {
    return Math.max(320, state.initialPlayers.length * 28);
  }

  const visiblePlayers = state.rounds[firstVisibleRoundIndex].matches * 2;
  return Math.max(320, visiblePlayers * 45);
}

export function toggleRound(roundIndex, contextPlayer = null) {
  if (uiState.hiddenRounds.has(roundIndex)) {
    uiState.hiddenRounds.delete(roundIndex);
  } else {
    uiState.hiddenRounds.add(roundIndex);
  }

  if (contextPlayer === 'ADMIN') window.showAdmin();
  else window.showBracket(contextPlayer);
}

export function newPlayer() {
  document.getElementById('content').innerHTML = `
    <h2>Nouveau joueur</h2>
    <input id="playerName" placeholder="Ton pseudo" />
    <button class="green" onclick="createPlayer()">Creer mon prono</button>
  `;
}

export function createPlayer() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) return alert('Entre un pseudo');
  if (state.players.find(p => p.name === name)) return alert('Pseudo deja utilise');

  const player = { name, score: 0, predictions: {} };
  ensurePlayerPredictions(player);

  state.players.push(player);
  save();
  showBracket(player.name);
}

export function selectWinner(playerName, roundIndex, matchIndex, winner) {
  const player = state.players.find(p => p.name === playerName);
  if (!player) return;
  ensurePlayerPredictions(player);

  const roundPlayers = getRoundPlayers(roundIndex);
  const p1 = roundPlayers[matchIndex * 2];
  const p2 = roundPlayers[matchIndex * 2 + 1];
  if (!p1 || !p2) return;

  const official = state.officialResults[`round${roundIndex}`][matchIndex];
  if (official && official.winner) return;

  const entry = player.predictions[`round${roundIndex}`][matchIndex];
  entry.winner = winner;
  save();
  showBracket(playerName);
}

export function setScorePrediction(playerName, roundIndex, matchIndex, side, value) {
  const player = state.players.find(p => p.name === playerName);
  if (!player) return;
  ensurePlayerPredictions(player);

  const roundPlayers = getRoundPlayers(roundIndex);
  const p1 = roundPlayers[matchIndex * 2];
  const p2 = roundPlayers[matchIndex * 2 + 1];
  if (!p1 || !p2) return;

  const official = state.officialResults[`round${roundIndex}`][matchIndex];
  if (official && official.winner) return;

  const entry = player.predictions[`round${roundIndex}`][matchIndex];
  if (side === 1) entry.score1 = normalizeScore(value);
  if (side === 2) entry.score2 = normalizeScore(value);
  if (entry.score1 && entry.score2) {
    entry.score = `${entry.score1}-${entry.score2}`;
  } else {
    entry.score = '';
  }
  save();
  const skipRerender = window.skipScoreBlurRerender === true;
  if (skipRerender) {
    window.skipScoreBlurRerender = false;
    return;
  }
  showBracket(playerName);
}

export function showBracket(playerName) {
  const player = state.players.find(p => p.name === playerName);
  if (!player) return;
  ensurePlayerPredictions(player);

  let html = `<div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>Tableau de ${player.name}</h2>
                <span style="color:#0c6b2f; font-weight:bold;">Prono match par match</span>
              </div>`;

  const minHeight = getBracketMinHeight();
  const matchBoxHeight = uiState.measuredMatchHeight;
  html += `<div class="bracket" style="min-height: ${minHeight}px; --match-height:${matchBoxHeight}px;">`;

  let firstVisibleRoundIndex = 0;
  while (uiState.hiddenRounds.has(firstVisibleRoundIndex) && firstVisibleRoundIndex < state.rounds.length) {
    firstVisibleRoundIndex += 1;
  }

  state.rounds.forEach((round, roundIndex) => {
    const roundPlayers = getRoundPlayers(roundIndex);
    const isCollapsed = uiState.hiddenRounds.has(roundIndex);
    const visibleRoundIndex = Math.max(0, roundIndex - firstVisibleRoundIndex);
    const gapFactor = uiState.hiddenRounds.size > 0 ? 0.7 : 1;
    const baseGap = Math.max(8, Math.round(16 * gapFactor));
    const step = matchBoxHeight + baseGap;
    const roundGap = Math.pow(2, visibleRoundIndex) * step - matchBoxHeight;
    const roundOffset = ((Math.pow(2, visibleRoundIndex) - 1) * step) / 2;

    const roundWidth = uiState.measuredRoundWidths[roundIndex] || 220;
    html += `<div class="round ${isCollapsed ? 'collapsed' : ''}" title="Cliquer pour afficher" style="--match-width:${roundWidth}px;">
               <div class="vertical-title" onclick="toggleRound(${roundIndex}, '${player.name}')">${round.name}</div>

               <div class="round-header">
                 <h2>${round.name} <br><small>${state.settings.pointsWinner}pt gagnant / ${state.settings.pointsExact}pts score</small></h2>
                 <button class="toggle-btn" onclick="toggleRound(${roundIndex}, '${player.name}')">Masquer</button>
               </div>

               <div class="match-container" style="--round-gap:${roundGap}px; --round-offset:${roundOffset}px;">`;

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];
      const official = state.officialResults[`round${roundIndex}`][i];
      const entry = player.predictions[`round${roundIndex}`][i] || { winner: null, score: '', score1: '', score2: '' };
      const isOpen = Boolean(p1 && p2);
      const isLocked = Boolean(official && official.winner);
      const scoreParts = getScoreParts(entry);
      const normalizedScore = normalizeScore(entry.score);
      const scoreExact = official
        && official.score
        && normalizedScore
        && entry.winner === official.winner
        && normalizeScore(official.score) === normalizedScore;

      if (!p1 && !p2) {
        html += `<div class="match empty"><span style="color:#aaa; text-align:center; padding:10px;">En attente...</span></div>`;
      } else {
        html += `<div class="match">
                   <div class="match-body">
                     <div class="match-players">`;
        [p1, p2].forEach(p => {
          if (!p) return;
          const meta = getPlayerMetaParts(p);
          const nameParts = splitDisplayName(p);
          const userSelected = entry.winner === p;
          let btnClass = 'player-btn';
          if (userSelected) {
            btnClass += ' selected';
            if (isLocked) {
              if (official.winner === p) btnClass += ' correct';
              else btnClass += ' incorrect';
            }
          }
          const disabledAttr = (!isOpen || isLocked) ? 'disabled' : '';
          html += `<button class="${btnClass}" onclick="selectWinner('${player.name}', ${roundIndex}, ${i}, '${p}')" ${disabledAttr}>
                     <span class="player-label">
                       <span class="player-seed">${meta.seed || ''}</span>
                       <span class="player-name">
                         <span>${nameParts.lastName}</span>
                         <span>${nameParts.firstName}</span>
                       </span>
                       <span class="player-nat">${meta.nat || ''}</span>
                     </span>
                   </button>`;
        });

        let scoreClass = 'score-input';
        if (isLocked && normalizedScore) {
          scoreClass += scoreExact ? ' correct' : ' incorrect';
        }
        const scoreDisabled = (!isOpen || isLocked) ? 'disabled' : '';
        html += `</div>
                 <div class="match-score">
                   <input class="${scoreClass}" type="text" value="${scoreParts.score1}" placeholder="0" ${scoreDisabled}
                     onblur="setScorePrediction('${player.name}', ${roundIndex}, ${i}, 1, this.value)"
                     onkeydown="handleScoreKey(event)" />
                   <input class="${scoreClass}" type="text" value="${scoreParts.score2}" placeholder="0" ${scoreDisabled}
                     onblur="setScorePrediction('${player.name}', ${roundIndex}, ${i}, 2, this.value)"
                     onkeydown="handleScoreKey(event)" />
                 </div>
               </div>
             </div>`;
      }
    }
    html += `</div></div>`;
  });
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
  updateMatchDimensions(() => showBracket(playerName));
}
