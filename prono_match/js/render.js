// Rend le HTML dans #content en préservant la position de scroll (page et
// conteneurs à défilement interne, ex. bracket horizontal) quand on re-rend
// la même vue — évite le retour en haut/à gauche à chaque clic.
// Un changement de vue repart en haut de page.
let lastViewKey = null;

export function renderContent(html, viewKey) {
  const content = document.getElementById('content');
  const sameView = viewKey != null && viewKey === lastViewKey;
  lastViewKey = viewKey;

  let scrolled = [];
  if (sameView) {
    scrolled = [...content.querySelectorAll('*')]
      .map((el, i) => ({ i, left: el.scrollLeft, top: el.scrollTop }))
      .filter(s => s.left || s.top);
  }
  const x = window.scrollX, y = window.scrollY;

  content.innerHTML = html;

  if (sameView) {
    const els = content.querySelectorAll('*');
    scrolled.forEach(s => {
      const el = els[s.i];
      if (el) { el.scrollLeft = s.left; el.scrollTop = s.top; }
    });
    window.scrollTo(x, y);
  } else {
    window.scrollTo(0, 0);
  }
}
