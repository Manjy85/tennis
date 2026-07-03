// Gestion des remplacements de joueurs dans un tableau (lucky loser entrant
// après un forfait avant le 1er match, qualifié révélé tardivement...).
//
// Quand Wikipedia change un nom à une position du 1er tour :
//  - le tableau officiel est mis à jour (rg_initialPlayers, rg_playerMeta) ;
//  - pour chaque pronostiqueur, la BRANCHE touchée est rouverte : ses picks
//    qui désignaient l'ancien joueur sont effacés, et les slots correspondants
//    sont listés dans `reopened` (["r0_m12", "r1_m6", ...]) — le front les rend
//    à nouveau éditables même si le tableau est verrouillé ;
//  - le match du 1er tour concerné est rouvert même si le pick visait
//    l'adversaire (l'affiche a changé, le pronostiqueur doit pouvoir revoir).
// Le reste du tableau n'est jamais touché.

// Compare l'ancien et le nouveau 1er tour. Renvoie la liste des remplacements
// { position, oldName, newName } ; les slots vides/Bye qui se remplissent sont
// des révélations (reveal: true), pas des remplacements.
function detectReplacements(storedPlayers, wikiPlayers) {
  const changes = [];
  for (let i = 0; i < storedPlayers.length; i++) {
    const oldName = storedPlayers[i] || '';
    const newName = wikiPlayers[i] || '';
    if (oldName === newName) continue;
    if (!newName) continue; // Wikipedia a "perdu" un joueur : on ne détruit rien
    changes.push({ position: i, oldName, newName, reveal: !oldName || oldName === 'Bye' });
  }
  return changes;
}

// Applique un remplacement au doc pronostic d'UN joueur : efface les picks qui
// désignaient l'ancien joueur, rouvre la branche. Modifie `pred` en place et
// renvoie true si quelque chose a changé.
function reopenBranch(pred, rounds, change) {
  const { position, oldName } = change;
  const predictions = pred.predictions || {};
  const reopened = new Set(pred.reopened || []);
  let touched = false;

  const firstMatch = Math.floor(position / 2);

  // Le match du 1er tour est rouvert dans tous les cas : l'affiche a changé.
  if (!reopened.has(`r0_m${firstMatch}`)) { reopened.add(`r0_m${firstMatch}`); touched = true; }

  // Les picks de l'ancien joueur, à tous les tours, sont effacés + rouverts.
  if (oldName && oldName !== 'Bye') {
    rounds.forEach((round, r) => {
      const arr = predictions[`round${r}`] || [];
      arr.forEach((winner, i) => {
        if (winner === oldName) {
          arr[i] = null;
          reopened.add(`r${r}_m${i}`);
          touched = true;
        }
      });
    });
  }

  if (touched) {
    pred.predictions = predictions;
    pred.reopened = [...reopened];
  }
  return touched;
}

// Applique les remplacements aux données officielles du tournoi (en place).
function applyToOfficial(data, changes) {
  changes.forEach(({ position, oldName, newName }) => {
    data.rg_initialPlayers[position] = newName;
    if (oldName && data.rg_playerMeta && data.rg_playerMeta[oldName]) {
      delete data.rg_playerMeta[oldName];
    }
    // Si l'ancien nom avait déjà des résultats officiels (ne devrait pas
    // arriver pour un lucky loser), on les efface pour resynchroniser.
    Object.keys(data.rg_results || {}).forEach(key => {
      data.rg_results[key] = data.rg_results[key].map(w => (w === oldName ? null : w));
    });
  });
}

module.exports = { detectReplacements, reopenBranch, applyToOfficial };
