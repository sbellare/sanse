# Sanse website and inquiry API on Vercel

The website and API deploy as **one Vercel project** from this repository's
root. Deploying only `artifacts/sanse-consulting` publishes the website but
leaves `/api/inquiries` unavailable.

## 1. Project settings

In the Vercel project serving `www.sansesolutions.com`, set:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (leave empty / select `.`) |
| Framework Preset | Other |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build:vercel` |
| Output Directory | `artifacts/sanse-consulting/dist/public` |
| Node.js | A supported Node.js version, 22 or newer |

The root `vercel.json` contains these build settings and routes all `/api/*`
requests to `api/index.mjs`. It exports the prebuilt Express app without
starting a server or an in-process retry timer.

Remove older dashboard overrides that build only the frontend or treat the
API source directory as a separate Express project. Redeploy **this code**
after updating the root and environment settings. Do not deploy with a
different Vercel configuration that omits the API function.

## 2. Production environment variables

Add these under **Vercel → Project → Settings → Environment Variables** for
**Production**, then redeploy:

| Name | Purpose |
| --- | --- |
| `RESEND_API_KEY` | A sending-enabled key from the Resend account where `sansesolutions.com` is verified. It must permit this sender domain. |
| `DATABASE_URL` | Your intended production PostgreSQL connection string, reachable from Vercel. Prefer your database provider's pooled connection string and required TLS settings. |
| `CRON_SECRET` | A new, random secret of at least 32 characters for the external retry scheduler. |

Enter values directly in Vercel's secure settings. Do not put keys, database
passwords, or scheduler secrets in source code, chat, or `VITE_` variables.
Setting them in Replit does **not** set them in Vercel. `VERCEL=1` and
`NODE_ENV=production` are supplied by Vercel.

Do not copy a development database into production automatically or replace
an existing database. Reuse the intended production database if it is
externally reachable. If you need a new database, provision it deliberately
with your chosen provider first.

### Database tables

The inquiry API needs `inquiry_deliveries` and `inquiry_rate_limits`.
If your existing production database already has these tables, keep them.
For a new database, run `deployment/inquiries.sql` in that database provider's
SQL console before enabling the form. This creates only the inquiry tables
and indexes; it does not delete or replace existing data.

## 3. Resend and Squarespace

In **Resend → Domains**, confirm sending for `sansesolutions.com` is verified.
Keep its DNS records in Squarespace exactly as Resend shows them. Switching
website hosting to Vercel does not itself require new sending DNS records.
Do not replace existing mailbox MX records: `info@sansesolutions.com` must
also have a functioning inbox or forwarding destination.

Both the team notification and immediate visitor acknowledgment use the same
server-side email transport:

- From: `Sanse Solutions <info@sansesolutions.com>`
- Team recipient: `info@sansesolutions.com`
- Reply-To on the team notification: the visitor's submitted email
- Team message: name, email, project type, stage, and message

On Vercel the app calls Resend directly with `RESEND_API_KEY`. In Replit,
without that key, the existing managed Resend connection continues to work.
A Vercel deployment without a key rejects valid submissions instead of
claiming an inquiry was sent.

## 4. Automatic retries on Vercel Hobby

Immediate delivery is attempted during every valid submission. A temporary
provider failure is saved in PostgreSQL and shown as pending, not delivered.
Do not rely on `setInterval` or work after the HTTP response: a Vercel
function may stop as soon as its response completes.

The protected retry endpoint is:

```text
GET https://www.sansesolutions.com/api/cron/inquiries
Authorization: Bearer <the same value you stored as CRON_SECRET>
```

Configure a trusted external scheduler to make this authenticated GET request
**once per minute**. Store the authorization header in its secure settings,
not in the URL. Ensure it calls the exact `www` URL above without relying on
a redirect to forward the authorization header. Enable failure alerts in
that scheduler so failed retry runs are visible.

**Required for queued delivery:** configure and enable the external scheduler.
Without it, immediate sending works but queued inquiries will not be retried
automatically. Pending inquiries remain stored in PostgreSQL.

The repository intentionally has no built-in Vercel cron schedule:
[Hobby permits only daily built-in cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).
A daily cycle is too slow for the existing retry intervals, and waiting beyond
the email provider's idempotency window can risk duplicate delivery after an
uncertain provider response. Do not substitute a daily schedule.

On Pro, you can instead add this to the root `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/inquiries", "schedule": "* * * * *" }
  ]
}
```

Merge that property into the existing configuration; do not replace the file.
Vercel adds `Authorization: Bearer <CRON_SECRET>` to its cron requests.

The retry endpoint processes saved team notifications. As before, a visitor
acknowledgment is attempted only when the team notification is delivered
during the original submission.

## 5. Check the deployment

1. `https://www.sansesolutions.com/api/healthz` must return
   `{"status":"ok"}` (not Vercel 404 or the website's HTML).
   This confirms API routing, **not** database or Resend credentials.
2. An unauthenticated GET to `/api/cron/inquiries` must return `401` after the
   secret is configured (`503` means the scheduler secret is missing/too short).
3. Configure the scheduler and check its authenticated request returns `200`.
4. Submit one inquiry with recognizable test details, then confirm it arrives
   in `info@sansesolutions.com` with every detail and the correct Reply-To.
5. If delivery fails, inspect Vercel function logs and Resend's email activity.
   A `202` response means queued, not sent. A `503` may indicate missing email
   configuration, unavailable PostgreSQL, missing tables, or provider rejection.

No live test email is sent by the repository's automated verification. A real
test submission is still needed after the external settings are configured.
