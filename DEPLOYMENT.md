# Deployment Guide (Free Tier)

This guide explains how to deploy the **Relay Server** for free using **Render** (for the server) and **Neon** (for the database).

## Prerequisites

1.  A GitHub account (you already have the code pushed).
2.  A [Render](https://render.com) account.
3.  A [Neon](https://neon.tech) account.

---

## 1. Set up the Database (Neon)

Since Render's free database expires after 30 days, we'll use Neon for a persistent free PostgreSQL database.

1.  Log in to [Neon Console](https://console.neon.tech).
2.  Create a new **Project** (e.g., `mobifai`).
3.  Once created, copy the **Connection String** from the dashboard. It will look like:
    ```
    postgres://user:password@ep-cool-frog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
    ```
    _Keep this safe, you will need it for the `DATABASE_URL` environment variable._

---

## 2. Deploy Relay Server (Render)

1.  Log in to [Render Dashboard](https://dashboard.render.com).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository `mobifai`.
4.  Configure the service:

    - **Name**: `mobifai-relay` (or similar)
    - **Region**: Choose one close to you (e.g., Frankfurt/London for EU).
    - **Branch**: `master`
    - **Root Directory**: `relay-server` (Important! This tells Render the app is in this subfolder).
    - **Runtime**: `Node`
    - **Build Command**: `npm install && npm run build`
      - _Note: We added a `postinstall` script to run `prisma generate` automatically._
    - **Start Command**: `npm start`
    - **Instance Type**: `Free`

5.  **Environment Variables**:
    Scroll down to "Environment Variables" and add the following:

    | Key                    | Value                                                              |
    | ---------------------- | ------------------------------------------------------------------ |
    | `NODE_ENV`             | `production`                                                       |
    | `DATABASE_URL`         | _(Paste your Neon connection string here)_                         |
    | `JWT_SECRET`           | _(Generate a random string, e.g. `openssl rand -hex 32`)_          |
    | `GOOGLE_CLIENT_ID`     | _(Your Google Client ID)_                                          |
    | `GOOGLE_CLIENT_SECRET` | _(Your Google Client Secret)_                                      |
    | `SERVER_URL`           | `https://<YOUR-RENDER-APP-NAME>.onrender.com`                      |
    | `CORS_ORIGIN`          | `*` (or specific client URL if needed)                             |

6.  Click **Create Web Service**.

Render will now build your app. It might take a few minutes. Watch the logs.
Once "Live", your server URL will be: `https://<YOUR-RENDER-APP-NAME>.onrender.com`.

---

## 3. Configure Database Schema

Your remote database is empty. You need to push your schema to it.

**Option A: Run migration from your local machine (Easiest)**

1.  In your local project, go to `relay-server`.
2.  Create a `.env.production` file (or just temporarily export the variable) with the Neon connection string:
    ```bash
    export DATABASE_URL="postgres://user:password@..."
    ```
3.  Run the push command:
    ```bash
    npx prisma db push
    ```

**Option B: Add a Build Script**
Update the Build Command in Render to:
`npm install && npm run build && npx prisma db push`
_(Note: `db push` is okay for prototypes, but for production `migrate deploy` is safer)._

---

## 4. Update Google Cloud Console

Your Google OAuth is currently configured for `localhost` or `nip.io`. You need to add the production URL.

1.  Go to [Google Cloud Console](https://console.cloud.google.com).
2.  Select your project -> **APIs & Services** -> **Credentials**.
3.  Edit your **OAuth 2.0 Client ID**.
4.  Add to **Authorized redirect URIs**:
    ```
    https://<YOUR-RENDER-APP-NAME>.onrender.com/auth/google/callback
    ```
5.  Save.

---

## 5. Update Clients

Now that the server is live, update your clients to point to it.

### Mac Client (`mac-client/.env`)

```bash
RELAY_SERVER_URL=https://<YOUR-RENDER-APP-NAME>.onrender.com
```

_Restart Mac Client._

### Mobile App (`mobile/.env`)

```bash
RELAY_SERVER_URL=https://<YOUR-RENDER-APP-NAME>.onrender.com
```

_Rebuild Mobile App:_

```bash
cd mobile
npx react-native run-ios
```

---

## 6. Important Notes on Free Tier

- **Spin Down:** Render's free tier sleeps after 15 minutes of inactivity.
  - _Symptom:_ When you open the mobile app after a break, it might take **45-60 seconds** to connect while the server wakes up.
  - _Solution:_ Be patient on the first connect, or upgrade to the $7/mo Starter plan for "Always On".
