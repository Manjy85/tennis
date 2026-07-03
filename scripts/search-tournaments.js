// Usage : node search-tournaments.js <atp|wta> <year>
const { searchTournaments } = require('./tennis-api');

async function main() {
  const [type, year] = process.argv.slice(2);
  if (!['atp', 'wta'].includes(type) || !/^\d{4}$/.test(String(year))) {
    console.error('Usage : node search-tournaments.js <atp|wta> <year>');
    process.exit(1);
  }

  const tournaments = await searchTournaments(type, year);
  if (!tournaments.length) {
    console.log('Aucun tournoi trouvé.');
    return;
  }
  console.log(`\n${tournaments.length} tournoi(s) trouvé(s) :\n`);
  tournaments.forEach(t => {
    console.log(`  seasonid=${t.id}\t${(t.date || '').slice(0, 10)}\t${t.tier || ''}\t${t.name}`);
  });
  console.log('\nAjoute le type/seasonid/name voulu dans tracked-tournaments.json puis lance sync.js.');
}

main().catch(e => { console.error('Erreur :', e.message); process.exit(1); });
