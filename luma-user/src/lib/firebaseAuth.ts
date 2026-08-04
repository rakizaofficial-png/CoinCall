import { FirebaseError, getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signOut,
  signInWithPopup,
} from "firebase/auth";
import { apiConfig } from "@/config/apiConfig";

function firebaseApp() {
  return getApps().length
    ? getApp()
    : initializeApp({
        apiKey: apiConfig.firebase.apiKey,
        authDomain: apiConfig.firebase.authDomain,
        projectId: apiConfig.firebase.projectId,
        storageBucket: apiConfig.firebase.storageBucket,
        messagingSenderId: apiConfig.firebase.messagingSenderId,
        appId: apiConfig.firebase.appId,
      });
}

export async function signOutFirebaseUser(): Promise<void> {
  if (!getApps().length) return;
  try {
    await signOut(getAuth(getApp()));
  } catch {
    // The CoinCall session is still revoked even if Firebase is unreachable.
  }
}

function googleErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return "Google sign-in failed. Please try again.";
  switch (error.code) {
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Allow pop-ups for this site, then try Google sign-in again.";
    case "auth/account-exists-with-different-credential":
      return "This email already uses a different sign-in method.";
    case "auth/network-request-failed":
      return "Network unavailable. Check your connection and try again.";
    case "auth/unauthorized-domain":
      return "Google sign-in is not enabled for this website yet.";
    default:
      return "Google sign-in failed. Please try again.";
  }
}

export async function getGoogleFirebaseIdToken(): Promise<string> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const credential = await signInWithPopup(getAuth(firebaseApp()), provider);
    return await credential.user.getIdToken(true);
  } catch (error) {
    throw new Error(googleErrorMessage(error));
  }
}
