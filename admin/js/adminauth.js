import { app, loadAdminConfig, saveAdminConfig, addAdminUid } from './firebase.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updatePassword, updateProfile, signOut,
  EmailAuthProvider, reauthenticateWithCredential,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Compte Firebase « sous le capot » : email fixe, l'identifiant tapé par l'admin
// est un username de façade stocké dans app/adminConfig.username (modifiable).
const ADMIN_EMAIL = 'admin@prono-tableau.web.app';
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin';

const auth = getAuth(app);

export function onAuth(cb) { return onAuthStateChanged(auth, cb); }
export function currentUser() { return auth.currentUser; }

// Seul le compte admin interne est autorisé dans le panneau.
export function isAdminAccount(user) {
  return !!user && user.email === ADMIN_EMAIL;
}

export async function getUsername() {
  const cfg = await loadAdminConfig();
  return (cfg && cfg.username) || DEFAULT_USERNAME;
}

export async function adminConfigExists() {
  return !!(await loadAdminConfig());
}

// Première configuration : crée le compte Firebase admin/admin et l'enregistre.
export async function initAdmin(username = DEFAULT_USERNAME, password = DEFAULT_PASSWORD) {
  let user;
  try {
    const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, password);
    user = cred.user;
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      // Le compte existe déjà : on se connecte avec le mot de passe fourni.
      const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
      user = cred.user;
    } else {
      throw err;
    }
  }
  await updateProfile(user, { displayName: username }).catch(() => {});
  await addAdminUid(user.uid);
  await saveAdminConfig({ username });
  return user;
}

// Connexion : vérifie le username de façade puis ouvre la session Firebase.
export async function login(username, password) {
  const expected = await getUsername();
  if (username !== expected) {
    const e = new Error('bad-username'); e.code = 'admin/bad-username'; throw e;
  }
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  return cred.user;
}

export function logout() { return signOut(auth); }

// Changer l'identifiant (façade) — purement cosmétique côté login.
export async function changeUsername(newUsername) {
  if (!newUsername || !newUsername.trim()) throw new Error('Identifiant vide.');
  await saveAdminConfig({ username: newUsername.trim() });
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: newUsername.trim() }).catch(() => {});
}

// Changer le mot de passe (ré-authentification avec l'ancien d'abord).
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non connecté.');
  const cred = EmailAuthProvider.credential(ADMIN_EMAIL, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

export function authErrorMessage(err) {
  const code = (err && err.code) || '';
  switch (code) {
    case 'admin/bad-username':          return "Identifiant incorrect.";
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':         return "Identifiant ou mot de passe incorrect.";
    case 'auth/weak-password':          return "Mot de passe trop court (6 caractères min).";
    case 'auth/too-many-requests':      return "Trop de tentatives, réessaie plus tard.";
    case 'auth/operation-not-allowed':  return "Active Email/Mot de passe dans Firebase Authentication.";
    case 'auth/network-request-failed': return "Problème réseau.";
    default:                            return (err && err.message) || "Erreur d'authentification.";
  }
}
