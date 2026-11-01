# dew

"Hungryroot for my social life." Each week, a short list of hand-picked things to do in New York, and a quick way to decide on them.

I built dew because good events kept selling out before I got around to choosing, and the options were spread across too many apps. It's a personal tool first: I source events by hand, review each week a few weeks ahead, and commit to what I want to do.

## How it works

1. **Source:** events go into a Notion database, which stays the place they're reviewed.
2. **Sync:** a daily job copies the next few weeks of events to Postgres and shrinks their posters. Weeks stay open, so new events keep arriving until something is booked.
3. **Review:** answer No, Maybe or Yes on each event, rank your yeses, and commit to at least one.
4. **Plan:** the saved week shows your plan and backups, and tracks whether each commitment is booked or waitlisted.

Every answer, rank and booking change is kept in an append-only log, which will feed a taste profile later.

## Stack

- Next.js and TypeScript, hosted on Vercel
- Supabase for Postgres, Google sign-in and storage
- Row-level security keeps each user's choices to that user
- Notion API for the catalog

## Run it locally

Sign-in is limited to the addresses in `ALLOWED_EMAILS`. You'll need your own Supabase project, with `supabase/migrations` applied and Google sign-in set up. Copy `.env.example` to `.env.local` and fill it in, then:

```bash
npm install
npm run dev
```

On a Mac, keep the repo outside `~/Documents` and `~/Desktop` if those sync to iCloud, because that can make Next.js commands hang.

## Load events from Notion

Add `SUPABASE_SECRET_KEY` and `NOTION_TOKEN` to `.env.local`, then:

```bash
npm run sync
```

This copies the Tuesday to Thursday events for this week and the next 8, along with any new posters. It's safe to run again, and it only touches the catalog, never anyone's choices. In production, `.github/workflows/sync.yml` runs it daily.

## Test

```bash
npm test
```

`e2e/run.mjs` also drives Chrome through a local build against a real Supabase project, using a temporary account that it removes afterward. Its header has the commands.
