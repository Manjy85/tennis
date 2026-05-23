import { state, uiState, save, getPlayerMetaParts, splitDisplayName } from './state.js';

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

  const nextHeight = Math.max(56, Math.round(maxHeight));
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
    <button class="green" onclick="createPlayer()">Creer mon bracket</button>
  `;
}

export function createPlayer() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) return alert('Entre un pseudo');
  if (state.players.find(p => p.name === name)) return alert('Pseudo deja utilise');

  const player = { name, score: 0, locked: false, predictions: {} };
  state.rounds.forEach((r, i) => player.predictions[`round${i}`] = Array(r.matches).fill(null));

  state.players.push(player);
  save();
  showBracket(player.name);
}

export function lockBracket(playerName) {
  if (!confirm("Une fois verrouille, tu ne pourras plus modifier tes pronostics. C'est ton dernier mot ?")) return;
  const player = state.players.find(p => p.name === playerName);
  player.locked = true;
  save();
  showBracket(playerName);
}

export function selectWinner(playerName, roundIndex, matchIndex, winner) {
  const player = state.players.find(p => p.name === playerName);
  if (player.locked) return alert('Ton tableau est verrouille, tu ne peux plus le modifier !');

  const oldWinner = player.predictions[`round${roundIndex}`][matchIndex];
  player.predictions[`round${roundIndex}`][matchIndex] = winner;

  if (oldWinner && oldWinner !== winner) {
    for (let r = roundIndex + 1; r < state.rounds.length; r++) {
      const nextMatchIndex = Math.floor(matchIndex / Math.pow(2, r - roundIndex));
      if (player.predictions[`round${r}`][nextMatchIndex] === oldWinner) {
        player.predictions[`round${r}`][nextMatchIndex] = null;
      }
    }
  }

  save();
  showBracket(playerName);
}

export function showBracket(playerName) {
  const player = state.players.find(p => p.name === playerName);
  let html = `<div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>Tableau de ${player.name}</h2>`;
  if (!player.locked) html += `<button class="red" onclick="lockBracket('${player.name}')">🔒 Verrouiller mon tableau</button>`;
  else html += `<span style="color:#0c6b2f; font-weight:bold;">🔒 Tableau verrouille</span>`;
  html += `</div>`;

  const minHeight = getBracketMinHeight();
  const matchBoxHeight = uiState.measuredMatchHeight;
  html += `<div class="bracket" style="min-height: ${minHeight}px; --match-height:${matchBoxHeight}px;">`;

  let firstVisibleRoundIndex = 0;
  while (uiState.hiddenRounds.has(firstVisibleRoundIndex) && firstVisibleRoundIndex < state.rounds.length) {
    firstVisibleRoundIndex += 1;
  }

  state.rounds.forEach((round, roundIndex) => {
    const roundPlayers = roundIndex === 0 ? state.initialPlayers : player.predictions[`round${roundIndex - 1}`];
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
                 <h2>${round.name} <br><small>${round.points} pts</small></h2>
                 <button class="toggle-btn" onclick="toggleRound(${roundIndex}, '${player.name}')">👁️ Masquer</button>
               </div>

               <div class="match-container" style="--round-gap:${roundGap}px; --round-offset:${roundOffset}px;">`;

    for (let i = 0; i < round.matches; i++) {
      const p1 = roundPlayers[i * 2];
      const p2 = roundPlayers[i * 2 + 1];

      if (!p1 && !p2) {
        html += `<div class="match empty"><span style="color:#aaa; text-align:center; padding:10px;">En attente...</span></div>`;
      } else {
        html += `<div class="match">`;
        [p1, p2].forEach(p => {
          if (!p) return;
          const meta = getPlayerMetaParts(p);
          const nameParts = splitDisplayName(p);
          const userSelected = player.predictions[`round${roundIndex}`][i] === p;
          const officialWinner = state.officialResults[`round${roundIndex}`][i];
          let btnClass = 'player-btn';
          if (userSelected) {
            btnClass += ' selected';
            if (officialWinner !== null) {
              if (officialWinner === p) btnClass += ' correct';
              else btnClass += ' incorrect';
            }
          }
          html += `<button class="${btnClass}" onclick="selectWinner('${player.name}', ${roundIndex}, ${i}, '${p}')" ${player.locked ? 'disabled' : ''}>
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
        html += `</div>`;
      }
    }
    html += `</div></div>`;
  });
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
  updateMatchDimensions(() => showBracket(playerName));
}
