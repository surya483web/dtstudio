import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { StudioContent, Inquiry } from "../types";

// ---------------------------------------------------------------------------
// Firebase app initialization
//
// Credentials are read from Vite environment variables. Create a `.env`
// file at the project root (see `.env.example`) with your own Firebase
// project's web app config, or set the same variables in your Netlify
// site's "Environment variables" settings before deploying.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

function assertFirebaseConfigured() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    // eslint-disable-next-line no-console
    console.error(
      "Firebase is not configured. Please set VITE_FIREBASE_* environment variables. " +
        "See .env.example for the required keys."
    );
  }
}
assertFirebaseConfigured();

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// ---------------------------------------------------------------------------
// 1. File uploads -> Firebase Storage (direct binary upload, NO base64)
// ---------------------------------------------------------------------------

// Client-side image resize/compression before upload, using an object URL
// (never converts the file to a base64 data URI).
async function compressAndOptimizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<File>((resolve) => {
      const img = new Image();

      img.onload = () => {
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          } else {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const targetFormat = "image/webp";
        const fallbackFormat = "image/jpeg";
        const quality = 0.82;

        const handleBlob = (blob: Blob | null, isFallback = false) => {
          if (blob) {
            const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || "image";
            const ext = isFallback ? "jpg" : "webp";
            const formatType = isFallback ? fallbackFormat : targetFormat;
            resolve(
              new File([blob], `${baseName}_optimized.${ext}`, {
                type: formatType,
                lastModified: Date.now(),
              })
            );
          } else if (!isFallback) {
            canvas.toBlob((fallbackBlob) => handleBlob(fallbackBlob, true), fallbackFormat, quality);
          } else {
            resolve(file);
          }
        };

        canvas.toBlob((blob) => handleBlob(blob, false), targetFormat, quality);
      };

      img.onerror = () => resolve(file);
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/**
 * Uploads a file directly to Firebase Storage as binary data (uploadBytesResumable)
 * and returns its public download URL. Images are compressed client-side first.
 */
export async function uploadToFirebaseStorage(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  let fileToUpload = file;

  if (file.type.startsWith("image/") && file.type !== "image/gif") {
    try {
      fileToUpload = await compressAndOptimizeImage(file);
    } catch (e) {
      console.warn("Client-side image compression failed, uploading original file", e);
    }
  }

  const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const path = `uploads/${uniquePrefix}-${sanitizeFileName(fileToUpload.name)}`;
  const fileRef = storageRef(storage, path);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, fileToUpload, {
      contentType: fileToUpload.type || "application/octet-stream",
    });

    task.on(
      "state_changed",
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (error) => {
        console.error("Firebase Storage upload failed:", error);
        reject(new Error(error.message || "Failed to upload file to Firebase Storage."));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          if (onProgress) onProgress(100);
          resolve(url);
        } catch (err: any) {
          reject(err);
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 2. Site content -> Firestore document `settings/content`
// ---------------------------------------------------------------------------
const CONTENT_DOC_REF = doc(db, "settings", "content");

export async function getSettingsFromFirebase(): Promise<StudioContent | null> {
  const snap = await getDoc(CONTENT_DOC_REF);
  return snap.exists() ? (snap.data() as StudioContent) : null;
}

export async function saveSettingsToFirebase(content: StudioContent): Promise<void> {
  await setDoc(CONTENT_DOC_REF, content, { merge: false });
}

/**
 * Subscribes to real-time updates of the site content document. Returns an
 * unsubscribe function. Enables the live site to instantly reflect admin
 * panel changes without needing a manual refresh.
 */
export function subscribeToSettings(
  onData: (content: StudioContent | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    CONTENT_DOC_REF,
    (snap) => onData(snap.exists() ? (snap.data() as StudioContent) : null),
    (err) => {
      console.error("Firestore content subscription error:", err);
      onError?.(err);
    }
  );
}

// ---------------------------------------------------------------------------
// 3. Booking inquiries -> Firestore collection `inquiries`
// ---------------------------------------------------------------------------
const inquiriesCollectionRef = collection(db, "inquiries");

export async function submitInquiryToFirebase(inquiry: Inquiry): Promise<void> {
  const { id, ...rest } = inquiry;
  await addDoc(inquiriesCollectionRef, {
    ...rest,
    createdAt: rest.createdAt || new Date().toISOString(),
    createdAtServer: serverTimestamp(),
  });
}

export async function getInquiriesFromFirebase(): Promise<Inquiry[]> {
  const q = query(inquiriesCollectionRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Omit<Inquiry, "id">;
    return { id: d.id, ...data };
  });
}

export async function updateInquiryStatusInFirebase(id: string, status: "new" | "read"): Promise<void> {
  await updateDoc(doc(db, "inquiries", id), { status });
}

// ---------------------------------------------------------------------------
// 4. Admin authentication -> Firebase Auth (email / password)
// ---------------------------------------------------------------------------
export async function loginAdmin(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutAdmin(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAdminAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}
