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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Partage la même collection que prono_tableau
export async function loadPmConfig() {
  const snap = await getDoc(doc(db, 'app', 'config'));
  return snap.exists() ? snap.data() : {};
}

export function savePmConfig(data) {
  return setDoc(doc(db, 'app', 'config'), data, { merge: true });
}

export async function loadAllPmTournaments() {
  const snap = await getDocs(collection(db, 'tournaments'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function loadPmTournament(id) {
  const snap = await getDoc(doc(db, 'tournaments', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function savePmTournament(id, data) {
  // merge:true pour ne pas écraser les données prono_tableau (rg_*)
  return setDoc(doc(db, 'tournaments', id), data, { merge: true });
}

export function deletePmTournament(id) {
  return deleteDoc(doc(db, 'tournaments', id));
}
