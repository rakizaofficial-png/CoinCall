import * as Clipboard from 'expo-clipboard';
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithCredential,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { getFirebaseAuth, getFirebaseDb, isFirebaseReady } from '../lib/firebase';
import { loadHostProfile } from './authService';
import type { User } from '../types/models';

let phoneConfirmation: ConfirmationResult | null = null;

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    grecaptcha?: { reset: (id?: number) => void };
  }
}

function ensureRecaptcha(containerId = 'recaptcha-container') {
  if (typeof window === 'undefined') {
    throw new Error('Phone OTP is available on web. Use email on native for now.');
  }
  const auth = getFirebaseAuth();
  if (!window.recaptchaVerifier) {
    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = containerId;
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
    });
  }
  return window.recaptchaVerifier;
}

export async function sendPhoneOtp(phone: string): Promise<{ verificationId?: string }> {
  if (!isFirebaseReady()) {
    throw new Error('Firebase is required for phone login.');
  }
  const normalized = phone.trim();
  if (!normalized.startsWith('+') || normalized.length < 10) {
    throw new Error('Enter phone in international format, e.g. +9715xxxxxxx');
  }

  const auth = getFirebaseAuth();
  const verifier = ensureRecaptcha();
  phoneConfirmation = await signInWithPhoneNumber(auth, normalized, verifier);
  return { verificationId: phoneConfirmation.verificationId };
}

export async function confirmPhoneOtp(otp: string): Promise<User> {
  if (!isFirebaseReady()) throw new Error('Firebase is required for phone login.');
  if (!phoneConfirmation) {
    throw new Error('Send the OTP code first.');
  }
  const cred = await phoneConfirmation.confirm(otp.trim());
  phoneConfirmation = null;
  if (!cred.user) throw new Error('Phone verification failed.');

  const profile = await loadHostProfile(cred.user);
  if (!profile.phone) {
    await set(ref(getFirebaseDb(), `hosts/${cred.user.uid}/phone`), cred.user.phoneNumber || '');
  }
  return { ...profile, phone: cred.user.phoneNumber || profile.phone };
}

export async function confirmPhoneOtpWithId(verificationId: string, otp: string): Promise<User> {
  if (!isFirebaseReady()) throw new Error('Firebase is required for phone login.');
  const auth = getFirebaseAuth();
  const credential = PhoneAuthProvider.credential(verificationId, otp.trim());
  const cred = await signInWithCredential(auth, credential);
  const profile = await loadHostProfile(cred.user);
  return { ...profile, phone: cred.user.phoneNumber || profile.phone };
}

export async function copyInviteCode(code: string) {
  await Clipboard.setStringAsync(code);
  return code;
}
