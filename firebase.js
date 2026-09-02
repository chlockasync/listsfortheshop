import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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

/*
 * Lists for the Shop is deliberately offline-first on trusted household
 * devices. Firestore's web SDK otherwise uses a memory-only cache, which is
 * lost when the page/app is closed. IndexedDB persistence keeps the catalogue,
 * current wanted list and locally queued writes available across restarts and
 * synchronises them automatically when connectivity returns.
 *
 * Multi-tab persistence avoids the old single-tab lockout when the installed
 * app and a browser tab happen to be open together. Memory cache is retained as
 * a fallback for browsers that cannot provide IndexedDB persistence.
 */
let db;

try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (error) {
  console.warn(
    "Persistent Firestore cache is unavailable; using memory cache instead:",
    error,
  );
  db = initializeFirestore(firebaseApp, {
    localCache: memoryLocalCache(),
  });
}

/*
 * Authentication remains invisible to the user. Each browser installation
 * receives a persistent anonymous Firebase identity. Firebase Auth restores a
 * previously signed-in identity from local storage even while offline; a new
 * anonymous identity needs connectivity the first time it is created.
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
