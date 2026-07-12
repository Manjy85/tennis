import { app } from './firebase.js';
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, updateProfile,
  updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const auth = getAuth(app);
auth.useDeviceLanguage();

const googleProvider = new GoogleAuthProvider();

// Notifie à chaque changement d'état (connexion / déconnexion).
export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export function currentUser() {
  return auth.currentUser;
}

// Nom affiché : displayName du compte, sinon partie locale de l'email.
export function displayNameOf(user) {
  if (!user) return '';
  return user.displayName || (user.email ? user.email.split('@')[0] : 'Joueur');
}

export async function signUpEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

export function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password).then(c => c.user);
}

export function signInGoogle() {
  return signInWithPopup(auth, googleProvider).then(c => c.user);
}

export function logout() {
  return signOut(auth);
}

// ── Profil ──────────────────────────────────────────────────────────────────

// Compte e-mail/mot de passe ? (sinon Google : e-mail/mdp gérés chez Google)
export function isPasswordAccount(user) {
  return !!user && (user.providerData || []).some(p => p.providerId === 'password');
}

export async function changeDisplayName(name) {
  await updateProfile(auth.currentUser, { displayName: name });
}

// Les opérations sensibles exigent une reconnexion récente : on ré-authentifie
// avec le mot de passe actuel juste avant.
async function reauth(currentPassword) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, currentPassword));
}

export async function changeEmail(newEmail, currentPassword) {
  await reauth(currentPassword);
  await updateEmail(auth.currentUser, newEmail);
}

export async function changePassword(newPassword, currentPassword) {
  await reauth(currentPassword);
  await updatePassword(auth.currentUser, newPassword);
}

// Messages d'erreur Firebase Auth → français lisible.
export function authErrorMessage(err) {
  const code = (err && err.code) || '';
  switch (code) {
    case 'auth/invalid-email':         return "Adresse e-mail invalide.";
    case 'auth/missing-password':      return "Renseigne un mot de passe.";
    case 'auth/weak-password':         return "Mot de passe trop court (6 caractères minimum).";
    case 'auth/email-already-in-use':  return "Cette adresse a déjà un compte. Connecte-toi.";
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':        return "E-mail ou mot de passe incorrect.";
    case 'auth/popup-closed-by-user':  return "Fenêtre Google fermée avant la fin.";
    case 'auth/operation-not-allowed': return "Méthode de connexion non activée côté Firebase.";
    case 'auth/requires-recent-login': return "Reconnecte-toi puis réessaie (session trop ancienne).";
    default:                           return (err && err.message) || "Erreur d'authentification.";
  }
}
