import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyD3EJBfXapeDICZhbrI9myqJpKbeaKfuL8",
  authDomain: "prono-tableau.firebaseapp.com",
  projectId: "prono-tableau",
  storageBucket: "prono-tableau.firebasestorage.app",
  messagingSenderId: "500004119616",
  appId: "1:500004119616:web:5702f502f3797041deaba5"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

export const loadConfig         = async ()      => { const s = await getDoc(doc(db, 'app', 'config')); return s.exists() ? s.data() : {}; };
export const saveConfig         = (data)        => setDoc(doc(db, 'app', 'config'), data, { merge: true });
export const loadAllTournaments = async ()      => { const s = await getDocs(collection(db, 'tournaments')); return s.docs.map(d => ({ id: d.id, ...d.data() })); };
export const loadTournament     = async (id)   => { const s = await getDoc(doc(db, 'tournaments', id)); return s.exists() ? { id: s.id, ...s.data() } : null; };
export const saveTournament     = (id, data)   => setDoc(doc(db, 'tournaments', id), data, { merge: true });
export const deleteTournament   = (id)         => deleteDoc(doc(db, 'tournaments', id));

// ── Pronostics par utilisateur (sous-collections, 1 doc par uid) ────────────

const predsCol = (tid, kind) => collection(db, 'tournaments', tid, kind);

async function loadPreds(tid, kind) {
  const s = await getDocs(predsCol(tid, kind));
  return s.docs.map(d => ({ uid: d.id, ...d.data() }));
}
const saveMyPred = (tid, kind, uid, data) =>
  setDoc(doc(db, 'tournaments', tid, kind, uid), { ...data, updatedAt: new Date().toISOString() }, { merge: true });

export const loadTableauPreds   = (tid)              => loadPreds(tid, 'tableauPreds');
export const saveMyTableauPred  = (tid, uid, data)   => saveMyPred(tid, 'tableauPreds', uid, data);
export const loadMatchPreds     = (tid)              => loadPreds(tid, 'matchPreds');
export const saveMyMatchPred    = (tid, uid, data)   => saveMyPred(tid, 'matchPreds', uid, data);
