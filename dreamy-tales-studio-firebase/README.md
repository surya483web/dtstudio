# DT Dreamy Tales Studio — Website + Admin Panel

A fully static React + Vite site with a live-editable Admin Panel, backed
entirely by **Firebase** (Firestore for content/data, Firebase Storage for
media uploads, Firebase Auth for the admin login). There is no custom
backend server — everything runs client-side, which makes this project a
plain static site that deploys cleanly to **Netlify**.

No file is ever converted to Base64. All media uploads (images/videos) go
straight to Firebase Storage as binary data via `uploadBytesResumable`, and
only their public download URL is stored in Firestore.

---

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com and create a new project.
2. **Add a Web App** (the `</>` icon) to the project. Copy the `firebaseConfig`
   values shown — you'll need them in step 3.
3. **Enable Firestore Database**: Build -> Firestore Database -> Create
   database (production mode is fine, we ship our own rules).
4. **Enable Storage**: Build -> Storage -> Get started (default bucket is fine).
5. **Enable Authentication**: Build -> Authentication -> Get started ->
   Sign-in method -> enable **Email/Password**.
6. **Create your admin user**: Authentication -> Users -> Add user. Enter the
   email/password you want to use to log into `/DTSTUDIO` (the Admin Panel).
   This is the only account that will be able to edit content or view
   inquiries — there is no separate hardcoded password anymore.

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the values from your Firebase web
app config:

```bash
cp .env.example .env
```

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Deploy the Firestore & Storage security rules

Install the Firebase CLI once if you don't have it:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project, give it an alias
firebase deploy --only firestore:rules,storage:rules
```

The rules in `firestore.rules` / `storage.rules` are already wired up so:
- Anyone can **read** the site content (`settings/content`) — needed for the
  public website to load.
- Only a **signed-in admin** (the account you created in step 1.6) can
  **write** content, read/update inquiries, or upload/delete media.
- Anyone can **submit** a new inquiry from the Contact form, but only the
  admin can read the list of submitted inquiries.

## 4. Run locally

```bash
npm install
npm run dev
```

The first time the site loads with an empty Firestore database, it will
automatically seed `settings/content` with the default studio content
(from `src/defaultContent.ts`) so the site isn't blank.

Visit `/DTSTUDIO` (or `#dtstudio`) to open the Admin Panel and sign in with
the admin account you created in Firebase Authentication.

## 5. Deploy to Netlify (or Vercel)

This is a plain static Vite build with no backend server, so it deploys the
same way to either Netlify or Vercel.

### Netlify

1. Push this project to a Git repository (GitHub/GitLab/Bitbucket).
2. In Netlify: **Add new site -> Import an existing project**, pick the repo.
3. Build settings (already defined in `netlify.toml`, Netlify will detect
   them automatically):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add the same `VITE_FIREBASE_*` variables from your `.env` file under
   **Site settings -> Environment variables**.
5. Deploy. Netlify serves the static `dist/` output; all data reads/writes
   go directly from the visitor's browser to Firebase.

### Vercel

1. Push this project to a Git repository.
2. In Vercel: **Add New -> Project**, import the repo. Vercel auto-detects
   Vite; `vercel.json` (included) sets the build command, output directory,
   and a rewrite so client-side routes like `/DTSTUDIO` and `/gallery`
   correctly fall back to `index.html` instead of 404ing.
3. Add the `VITE_FIREBASE_*` variables under **Project Settings ->
   Environment Variables** (apply to Production, Preview, and Development).
4. Deploy.

## How the pieces fit together

| Feature | Where it lives |
|---|---|
| Site content (hero, about, portfolio, services, stats, reviews, philosophy gallery) | Firestore document `settings/content`, live-synced to the site via `onSnapshot` |
| Booking/reservation inquiries | Firestore collection `inquiries` |
| Uploaded photos/videos | Firebase Storage, under `uploads/` |
| Admin login | Firebase Authentication (Email/Password) |
| Admin Panel route | `/DTSTUDIO` or `#dtstudio` |

All of the Firebase logic lives in `src/lib/firebase.ts`.

## Notes

- The **Samaro gallery** integration (`src/lib/samaro.ts`) fetches directly
  from the public `events.samaro.ai` API client-side — no proxy server
  required.
- To change the admin password, use the Firebase Console (Authentication ->
  Users) or have the admin use "Forgot password" if you enable that flow.
- To add more admin accounts, add more users under Firebase Authentication.
