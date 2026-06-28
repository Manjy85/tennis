import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyD3EJBfXapeDICZhbrI9myqJpKbeaKfuL8",
  authDomain: "prono-tableau.firebaseapp.com",
  projectId: "prono-tableau",
  storageBucket: "prono-tableau.firebasestorage.app",
  messagingSenderId: "500004119616",
  appId: "1:500004119616:web:5702f502f3797041deaba5"
};

// Instance Firebase NOMMÉE ('admin') : la session d'authentification admin est
// ainsi totalement isolée de celle du jeu (même domaine, mais clé de session
// distincte). Se connecter au jeu n'affecte plus l'admin, et inversement.
export const app = initializeApp(firebaseConfig, 'admin');
export const db = getFirestore(app);

export const loadConfig       = async () => { const s = await getDoc(doc(db, 'app', 'config')); return s.exists() ? s.data() : {}; };
export const saveConfig       = (data) => setDoc(doc(db, 'app', 'config'), data, { merge: true });

// Compte admin (façade username) + liste des uids admins pour les règles
export const loadAdminConfig  = async () => { const s = await getDoc(doc(db, 'app', 'adminConfig')); return s.exists() ? s.data() : null; };
export const saveAdminConfig  = (data) => setDoc(doc(db, 'app', 'adminConfig'), data, { merge: true });
export const loadAdmins       = async () => { const s = await getDoc(doc(db, 'app', 'admins')); return s.exists() ? s.data() : null; };
export const addAdminUid      = (uid) => setDoc(doc(db, 'app', 'admins'), { uids: arrayUnion(uid) }, { merge: true });
export const loadAllTournaments = async () => { const s = await getDocs(collection(db, 'tournaments')); return s.docs.map(d => ({ id: d.id, ...d.data() })); };
export const loadTournament   = async (id) => { const s = await getDoc(doc(db, 'tournaments', id)); return s.exists() ? { id: s.id, ...s.data() } : null; };
export const saveTournament   = (id, data) => setDoc(doc(db, 'tournaments', id), data, { merge: true });
export const deleteTournament = (id) => deleteDoc(doc(db, 'tournaments', id));

// Pronostics des utilisateurs (sous-collections, 1 doc par uid)
const predsCol = (tid, kind) => collection(db, 'tournaments', tid, kind);
export const loadTableauPreds = async (tid) => { const s = await getDocs(predsCol(tid, 'tableauPreds')); return s.docs.map(d => ({ uid: d.id, ...d.data() })); };
export const loadMatchPreds   = async (tid) => { const s = await getDocs(predsCol(tid, 'matchPreds'));   return s.docs.map(d => ({ uid: d.id, ...d.data() })); };
export const deleteTableauPred = (tid, uid) => deleteDoc(doc(db, 'tournaments', tid, 'tableauPreds', uid));
export const deleteMatchPred   = (tid, uid) => deleteDoc(doc(db, 'tournaments', tid, 'matchPreds', uid));
