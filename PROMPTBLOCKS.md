# PromptBlocks

PromptBlocks is a feature built on top of LibreChat. It is part of a bachelor
thesis at TU Dortmund / LMU München. The title of the thesis is "Strukturierte
Visualisierung und Verwaltung von Prompts für Large Language Models".

The idea is simple: while you chat, PromptBlocks looks at your messages and
finds groups of messages that belong to the same topic. It calls each group a
"block". The normal chat window does not change at all. You only see the
blocks if you open the PromptBlocks panel. There you can see a list of blocks
with a timestamp, a title, and how many messages are in it. If you click on a
block, you get a detail view with a summary, all messages, all prompts, the
block history, and a button to start a new, focused chat about just that
topic.

This document explains how to set up and run PromptBlocks. It does not
replace the main [README.md](README.md), which has the full LibreChat docs.

## Which branch to use

Use the `promptblocks-reactivation` branch. This is where all PromptBlocks
work happens. Do not work on `main`.

```bash
git checkout promptblocks-reactivation
```

## Environment variables

Add these to your `.env` file (copy from `.env.example` if you don't have one
yet):

- `MONGO_URI` — connection string for your MongoDB database. A free MongoDB
  Atlas cluster works fine for development.
- `GOOGLE_KEY` — API key for the Google Gemini API. Used to create embeddings
  for messages and to ask the LLM for titles, summaries, and topic decisions.
  The free tier is enough for development.

If you use MongoDB Atlas, remember to allow your IP address under Network
Access, or your local server will not be able to connect.

## Install and build

PromptBlocks code lives in three workspaces that need to be built in this
order, because each one depends on the one before it (`data-schemas` needs
`data-provider`, and `api` needs both):

1. `packages/data-provider`
2. `packages/data-schemas`
3. `packages/api`

The easiest way is to just run the smart reinstall script from the repo root.
It installs dependencies (only if the lockfile changed) and builds every
package for you, in the right order:

```bash
npm run smart-reinstall
```

If you want to rebuild the packages by hand instead, run these in order:

```bash
npm run build:data-provider
npm run build:data-schemas
npm run build:api
```

## Start the app

You need two terminals: one for the backend, one for the frontend.

```bash
# terminal 1 — backend, port 3080
npm run backend

# terminal 2 — frontend, port 3090, with hot reload
npm run frontend:dev
```

Note: `npm run backend` does not restart itself when you change code. If you
edit and rebuild something, stop it (Ctrl+C) and run it again.

Open `http://localhost:3090` in your browser. Log in, start chatting, then
open the PromptBlocks panel from the side bar to see the blocks that were
found.

## If something doesn't work

If you change code inside `packages/data-provider`, `packages/data-schemas`,
or `packages/api` and nothing seems to happen, it is probably because that
package was not rebuilt. Editing the source files alone does nothing — the
app runs the built code in each package's `dist` folder, not the source
files, so a change only "counts" after you rebuild it.

This bit us for real once: we changed `packages/api` and rebuilt it, but
`packages/data-schemas` also needed a change and we forgot to rebuild that
one. The app started fine and looked normal, but the feature was silently
still running old code from before the change.

If you are not sure which package needs a rebuild, the safe fix is to
rebuild all three, in order, and then restart the backend:

```bash
npm run build:data-provider
npm run build:data-schemas
npm run build:api
```

Or just run `npm run smart-reinstall` again, which does the same thing.

## Where the code is

A quick map, if you want to look around:

- `client/src/components/Blocks/` — the block views (list, detail, history,
  messages, prompts)
- `client/src/components/SidePanel/PromptBlocks/` — the small panel in the
  side bar
- `packages/api/src/blocks/` — the block detection logic (embeddings,
  scoring, tie-breaker, titles, summaries)
- `packages/data-schemas/` — the database models for blocks
- `api/server/routes/blocks.js` — the API route, thin wrapper around
  `packages/api`
