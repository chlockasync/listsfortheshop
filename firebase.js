import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASVJaQSTIe2h6zRa1CIaZucvteYEv59cY",
  authDomain: "listsfortheshop.firebaseapp.com",
  projectId: "listsfortheshop",
  storageBucket: "listsfortheshop.firebasestorage.app",
  messagingSenderId: "254608048125",
  appId: "1:254608048125:web:5c18924ca38fa565c0e394"
};

const HOUSEHOLD_ID = "NqzkJ_wy0X82dwhybYzXmM6tyOL-u-au";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Anonymous sign-in failed:", error);
    }

    return;
  }

  console.log("Signed in anonymously:", user.uid);

  try {
    const householdRef = doc(
      db,
      "households",
      HOUSEHOLD_ID
    );

    const memberRef = doc(
      db,
      "households",
      HOUSEHOLD_ID,
      "members",
      user.uid
    );

    await setDoc(
      householdRef,
      {
        name: "Our household",
        active: true,
        schemaVersion: 1,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    await setDoc(
      memberRef,
      {
        role: "editor",
        lastSeenAt: serverTimestamp()
      },
      { merge: true }
    );

    console.log("Household connection successful");
  } catch (error) {
    console.error("Household connection failed:", error);
  }
});

export { auth, db, HOUSEHOLD_ID };