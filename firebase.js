import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASVJaQSTIe2h6zRa1CIaZucvteYEv59cY",
  authDomain: "listsfortheshop.firebaseapp.com",
  projectId: "listsfortheshop",
  storageBucket: "listsfortheshop.firebasestorage.app",
  messagingSenderId: "254608048125",
  appId: "1:254608048125:web:5c18924ca38fa565c0e394",
};

const HOUSEHOLD_ID = "NqzkJ_wy0X82dwhybYzXmM6tyOL-u-au";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/*
 * Authentication remains invisible to the user. Each browser installation
 * receives a persistent anonymous Firebase identity. Household access is now
 * granted only through an existing membership or a private invitation link;
 * this file deliberately does not create its own household membership.
 */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    return;
  }

  try {
    await signInAnonymously(auth);
  } catch (error) {
    console.error("Anonymous sign-in failed:", error);
  }
});

export { auth, db, firebaseApp, HOUSEHOLD_ID };
