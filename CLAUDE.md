# LibreChat

## Project Overview

LibreChat is a monorepo with the following key workspaces:

| Workspace | Language | Side | Dependency | Purpose |
|---|---|---|---|---|
| `/api` | JS (legacy) | Backend | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server — minimize changes here |
| `/packages/api` | **TypeScript** | Backend | `packages/data-schemas`, `packages/data-provider` | New backend code lives here (TS only, consumed by `/api`) |
| `/packages/data-schemas` | TypeScript | Backend | `packages/data-provider` | Database models/schemas, shareable across backend projects |
| `/packages/data-provider` | TypeScript | Shared | — | Shared API types, endpoints, data-service — used by both frontend and backend |
| `/client` | TypeScript/React | Frontend | `packages/data-provider`, `packages/client` | Frontend SPA |
| `/packages/client` | TypeScript | Frontend | `packages/data-provider` | Shared frontend utilities |

The source code for `@librechat/agents` (major backend dependency, same team) is at `/home/danny/agentus`.

---

## Workspace Boundaries

- **All new backend code must be TypeScript** in `/packages/api`.
- Keep `/api` changes to the absolute minimum (thin JS wrappers calling into `/packages/api`).
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic (endpoints, types, data-service) goes in `/packages/data-provider`.
- Build data-provider from project root: `npm run build:data-provider`.

---

## Code Style

### Naming and File Organization

- **Single-word file names** whenever possible (e.g., `permissions.ts`, `capabilities.ts`, `service.ts`).
- When multiple words are needed, prefer grouping related modules under a **single-word directory** rather than using multi-word file names (e.g., `admin/capabilities.ts` not `adminCapabilities.ts`).
- The directory already provides context — `app/service.ts` not `app/appConfigService.ts`.

### Structure and Clarity

- **Never-nesting**: early returns, flat code, minimal indentation. Break complex operations into well-named helpers.
- **Functional first**: pure functions, immutable data, `map`/`filter`/`reduce` over imperative loops. Only reach for OOP when it clearly improves domain modeling or state encapsulation.
- **No dynamic imports** unless absolutely necessary.

### DRY

- Extract repeated logic into utility functions.
- Reusable hooks / higher-order components for UI patterns.
- Parameterized helpers instead of near-duplicate functions.
- Constants for repeated values; configuration objects over duplicated init code.
- Shared validators, centralized error handling, single source of truth for business rules.
- Shared typing system with interfaces/types extending common base definitions.
- Abstraction layers for external API interactions.

### Iteration and Performance

- **Minimize looping** — especially over shared data structures like message arrays, which are iterated frequently throughout the codebase. Every additional pass adds up at scale.
- Consolidate sequential O(n) operations into a single pass whenever possible; never loop over the same collection twice if the work can be combined.
- Choose data structures that reduce the need to iterate (e.g., `Map`/`Set` for lookups instead of `Array.find`/`Array.includes`).
- Avoid unnecessary object creation; consider space-time tradeoffs.
- Prevent memory leaks: careful with closures, dispose resources/event listeners, no circular references.

### Backend Database Performance

- On request startup and first page load paths, watch for serial database reads.
  Multiple round trips to MongoDB can add significant latency when the database
  is far from the app server.
- Prefer passing already-loaded request/user/config data through helper
  functions instead of re-reading the same user, role, tenant, or principal data.
- When two reads are independent, start them in parallel and gate the response
  on the authorization or validation result before returning data.
- Keep authorization, permission, and tenant checks semantically identical when
  parallelizing reads. Speculative reads must remain scoped to the authenticated
  user or tenant and must not write to the response before validation succeeds.

### Type Safety

- **Never use `any`**. Explicit types for all parameters, return values, and variables.
- **Limit `unknown`** — avoid `unknown`, `Record<string, unknown>`, and `as unknown as T` assertions. A `Record<string, unknown>` almost always signals a missing explicit type definition.
- **Don't duplicate types** — before defining a new type, check whether it already exists in the project (especially `packages/data-provider`). Reuse and extend existing types rather than creating redundant definitions.
- Use union types, generics, and interfaces appropriately.
- All TypeScript and ESLint warnings/errors must be addressed — do not leave unresolved diagnostics.

### Comments and Documentation

- Write self-documenting code; no inline comments narrating what code does.
- JSDoc only for complex/non-obvious logic or intellisense on public APIs.
- Single-line JSDoc for brief docs, multi-line for complex cases.
- Avoid standalone `//` comments unless absolutely necessary.

### Import Order

Imports are organized into three sections:

1. **Package imports** — sorted shortest to longest line length (`react` always first).
2. **`import type` imports** — sorted longest to shortest (package types first, then local types; length resets between sub-groups).
3. **Local/project imports** — sorted longest to shortest.

Multi-line imports count total character length across all lines. Consolidate value imports from the same module. Always use standalone `import type { ... }` — never inline `type` inside value imports.

### JS/TS Loop Preferences

- **Limit looping as much as possible.** Prefer single-pass transformations and avoid re-iterating the same data.
- `for (let i = 0; ...)` for performance-critical or index-dependent operations.
- `for...of` for simple array iteration.
- `for...in` only for object property enumeration.

---

## Frontend Rules (`client/src/**/*`)

### Localization

- All user-facing text must use `useLocalize()`.
- Only update English keys in `client/src/locales/en/translation.json` (other languages are automated externally).
- Semantic key prefixes: `com_ui_`, `com_assistants_`, etc.

### Components

- TypeScript for all React components with proper type imports.
- Semantic HTML with ARIA labels (`role`, `aria-label`) for accessibility.
- Group related components in feature directories (e.g., `SidePanel/Memories/`).
- Use index files for clean exports.

### Data Management

- Feature hooks: `client/src/data-provider/[Feature]/queries.ts` → `[Feature]/index.ts` → `client/src/data-provider/index.ts`.
- React Query (`@tanstack/react-query`) for all API interactions; proper query invalidation on mutations.
- QueryKeys and MutationKeys in `packages/data-provider/src/keys.ts`.

### Data-Provider Integration

- Endpoints: `packages/data-provider/src/api-endpoints.ts`
- Data service: `packages/data-provider/src/data-service.ts`
- Types: `packages/data-provider/src/types/queries.ts`
- Use `encodeURIComponent` for dynamic URL parameters.

### Performance

- Prioritize memory and speed efficiency at scale.
- Cursor pagination for large datasets.
- Proper dependency arrays to avoid unnecessary re-renders.
- Leverage React Query caching and background refetching.

---

## Development Commands

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps (if lockfile changed) + build via Turborepo |
| `npm run reinstall` | Clean install — wipe `node_modules` and reinstall from scratch |
| `npm run backend` | Start the backend server |
| `npm run backend:dev` | Start backend with file watching (development) |
| `npm run build` | Build all compiled code via Turborepo (parallel, cached) |
| `npm run frontend` | Build all compiled code sequentially (legacy fallback) |
| `npm run frontend:dev` | Start frontend dev server with HMR (port 3090, requires backend running) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes |

- Node.js: v24.16.0
- Database: MongoDB
- Backend runs on `http://localhost:3080/`; frontend dev server on `http://localhost:3090/`

---

## Testing

- Framework: **Jest**, run per-workspace.
- Run tests from their workspace directory: `cd api && npx jest <pattern>`, `cd packages/api && npx jest <pattern>`, etc.
- Frontend tests: `__tests__` directories alongside components; use `test/layout-test-utils` for rendering.
- Cover loading, success, and error states for UI/data flows.

### Philosophy

- **Real logic over mocks.** Exercise actual code paths with real dependencies. Mocking is a last resort.
- **Spies over mocks.** Assert that real functions are called with expected arguments and frequency without replacing underlying logic.
- **MongoDB**: use `mongodb-memory-server` for a real in-memory MongoDB instance. Test actual queries and schema validation, not mocked DB calls.
- **MCP**: use real `@modelcontextprotocol/sdk` exports for servers, transports, and tool definitions. Mirror real scenarios, don't stub SDK internals.
- Only mock what you cannot control: external HTTP APIs, rate-limited services, non-deterministic system calls.
- Heavy mocking is a code smell, not a testing strategy.

---

## Formatting

Fix all formatting lint errors (trailing spaces, tabs, newlines, indentation) using auto-fix when available. All TypeScript/ESLint warnings and errors **must** be resolved.

# PromptBlocks Projekt-Kontext

# PromptBlocks — Projekt-Kontext für Claude Code

Diese Datei wird von Claude Code automatisch gelesen, wenn du im Projektordner arbeitest.
Sie beschreibt, was das Projekt ist, was schon gebaut wurde, und wie hier gearbeitet wird.

## Was ist das Projekt

PromptBlocks ist ein Feature, das auf LibreChat aufgebaut wird. Es ist Teil einer
Bachelorarbeit an der TU Dortmund / LMU München (Titel: "Strukturierte Visualisierung
und Verwaltung von Prompts für Large Language Models"). Betreuer wird als "hoca"
bezeichnet, gehört zur GitHub-Organisation `haiigroup`.

Die Grundidee: LibreChat erkennt automatisch thematische Blöcke innerhalb von Chats.
Der Chat selbst bleibt ganz normal, keine Unterbrechung im Hauptfenster. Nur wenn der
User ein Panel öffnet, sieht er die erkannten Blöcke — mit Zeitstempel, Titel,
Nachrichtenanzahl. Klickt er auf einen Block, sieht er eine Detailansicht mit:
Zusammenfassung generieren, Alle Nachrichten, Alle Prompts, History, und einen Button
"Fokussierte Block-Chat erstellen" (öffnet einen neuen Chat zu diesem Thema).

## Setup

- Fork: `batuhanbaharr/LibreChat` (origin), zusätzlicher remote `repo` zeigt auf
  `haiigroup/promptstack` (das ist die eigentliche Projekt-Repo vom Betreuer)
- Branch: `promptblocks-feature` — alle Arbeit passiert hier, nie auf `main`
- Lokaler Pfad: `~/Desktop/LibreChat`
- MongoDB: Atlas Cloud (kostenlos), Connection String in `.env` unter `MONGO_URI`
- LLM Provider: Google Gemini API (kostenlose Stufe, kein Kreditkarte hinterlegt),
  Key in `.env` unter `GOOGLE_KEY`
- Backend läuft auf Port 3080 (`npm run backend:dev`)
- Frontend läuft auf Port 3090 mit Vite Hot-Reload (`npm run frontend:dev`)
- Node Version: v26 (LibreChat braucht mindestens v24)

## Was schon gebaut ist

### Frontend

- `client/src/components/SidePanel/PromptBlocks/PromptBlocksPanel.tsx` — kleines Panel
  in der SidePanel-Leiste (registriert in `client/src/hooks/Nav/useSideNavLinks.ts`
  mit Icon `Layers` aus lucide-react)
- `client/src/components/Blocks/BlocksView.tsx` — Vollbild-Ansicht aller Blöcke,
  Route `/blocks`
- `client/src/components/Blocks/BlockDetailView.tsx` — Detailansicht für einen Block,
  Route `/blocks/:blockId`, hat die 4 Buttons + "Fokussierte Block-Chat erstellen"
- `client/src/components/Blocks/useBlocks.ts` — Hook, der `/api/blocks` über axios
  abruft (NICHT fetch verwenden, siehe wichtige Notiz unten)
- `client/src/components/Blocks/blocksData.ts` — alte Dummy-Daten, wird nicht mehr
  gebraucht sobald useBlocks überall verwendet wird, evtl. aufräumen
- Routen registriert in `client/src/routes/index.tsx`

### Backend

- `api/server/services/embeddingService.js` — ruft Gemini Embedding API auf
  (`gemini-embedding-001`, NICHT `text-embedding-004`, das ist deprecated),
  hat auch `cosineSimilarity()` Funktion
- `api/server/routes/blocks.js` — Route `GET /api/blocks`, geschützt mit
  `requireJwtAuth`. Holt alle Conversations eines Users, dann alle Messages pro
  Conversation, berechnet Embeddings für jede User-Nachricht, vergleicht mit
  cosineSimilarity. Wenn Ähnlichkeit unter `SIMILARITY_THRESHOLD` (aktuell 0.75)
  fällt, beginnt ein neuer Block.
- Registriert in `api/server/routes/index.js` (require + export) und in
  `api/server/index.js` (`app.use('/api/blocks', routes.blocks)`)

## Wichtige Learnings (nicht nochmal falsch machen)

1. **Axios statt fetch im Frontend.** LibreChat setzt den Auth-Token global auf die
   axios-Instanz (`packages/data-provider/src/request.ts`, Funktion `setTokenHeader`).
   Eigener Code MUSS `import axios from 'axios'` benutzen, nicht `fetch()` — sonst
   kommt "No auth token" (401), weil der Token nicht automatisch mitgeschickt wird.

2. **Gemini Embedding Model Name.** `text-embedding-004` ist nicht mehr verfügbar.
   Aktuelles Modell: `gemini-embedding-001`. Falls das wieder einen 404 gibt, in
   Google AI Studio nachschauen welches Modell aktuell ist.

3. **MongoDB Atlas IP Whitelist.** Für lokale Entwicklung ist "Allow Access from
   Anywhere" (`0.0.0.0/0`) unter Network Access eingetragen, damit es nicht bei
   jedem IP-Wechsel (anderes WLAN etc.) einen Verbindungsfehler gibt.

4. **Threshold ist noch nicht fein justiert.** `SIMILARITY_THRESHOLD = 0.75` in
   `blocks.js` ist ein erster Schätzwert. Bei Tests wurden Folgefragen zum selben
   Thema teilweise als eigene Blöcke erkannt, obwohl sie zusammengehören sollten.
   Das braucht mehr Testdaten und iteratives Anpassen — kein Grund zur Sorge, ist
   erwarteter nächster Schritt.

5. **Zwei Remotes.** `git push origin promptblocks-feature` UND
   `git push repo promptblocks-feature` — beide pushen, origin ist der eigene Fork,
   repo ist die Betreuer-Repo. Immer beide aktuell halten.

## Code-Stil

- Variablen- und Funktionsnamen, Kommentare: einfaches Englisch oder einfaches
  Deutsch, keine komplizierten Wörter, wie ein Student schreiben würde — nicht wie
  eine KI, die alles perfekt dokumentiert. Wenig Kommentare, nur wo es später beim
  Wiederlesen hilft.
- Kleine, einfache Funktionen bevorzugen, keine übertriebene Abstraktion.
- Deutsche UI-Texte (Zusammenfassung generieren, Alle Nachrichten, usw.), da die
  Bachelorarbeit auf Deutsch geschrieben wird.

## Nächste Schritte (grob, noch nicht fest geplant)

- Threshold der Block-Erkennung feinjustieren
- Alte Dummy-Daten (`blocksData.ts`) aufräumen, wo nicht mehr gebraucht
- "Zusammenfassung generieren" Button an echten LLM-Call anbinden (aktuell nur
  Platzhalter-Text oder noch gar nicht verbunden — prüfen)
- Evtl. Vollbild-Panel und kleines SidePanel besser synchronisieren (aktuell zwei
  leicht unterschiedliche Implementierungen mit teils altem Dummy-Code)
- Nutzerstudie ist noch NICHT durchgeführt — im Thesis-Text immer Futur/Konjunktiv
  verwenden für Study Design, Results, Discussion, nie Vergangenheitsform