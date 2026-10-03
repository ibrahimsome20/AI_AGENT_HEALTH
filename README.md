# HealTrip AI Patient Decision Assistant

Prototype for a full-stack AI patient decision assistant. The goal is not diagnosis; it is to show a clean architecture for symptom intake, clarifying questions, safe next-step routing, and provider lookup without hallucinating unavailable providers.

## Stack

- Frontend: Next.js / React / TypeScript
- Backend: Express.js on Node.js / TypeScript
- Data: in-memory mock database in `server/src/data/index.ts`
- Agent design: deterministic tool-calling flow in `server/src/agent/index.ts`

## Backend Structure

```text
server/src
  index.ts                 # process entrypoint only
  app.ts                   # Express app and route mounting
  agent/
    agent.schema.ts        # Zod chat request validation
    agent.test.ts          # focused triage and response-guard tests
    agent.routes.ts        # agent HTTP routes
    agent.service.ts       # decision assistant orchestration
    conversation.store.ts   # Redis-backed conversation history
    index.ts               # agent module exports
    types.ts               # agent request/response types
  data/
    index.ts               # mock provider database
    types.ts               # provider and conversation types
  middlewares/
    error-handler.middleware.ts
    not-found.middleware.ts
  providers/
    providers.routes.ts
  tools/
    index.ts               # triage and provider-search tools
    patient-text.ts        # Arabic digit normalization and age extraction
    types.ts               # tool input/output types
```

## Run Locally

```bash
cd server
npm install
npm run dev
```

Optional Redis-backed conversation memory:

```bash
REDIS_URL=redis://localhost:6379 npm run dev
```

If `REDIS_URL` is not set or Redis is unavailable, the prototype falls back to in-memory conversation storage.

LLM configuration:

```bash
OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=gemma3:4b npm run dev
```

The LLM writes the normal chat reply after receiving triage and verified provider results. The backend can replace an unsafe or out-of-scope reply with a short guarded response. If the LLM is unavailable, `/api/agent/chat` returns `503`.

Run the backend regression tests with `cd server && npm test`.

## Run With Docker

From the repository root:

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Redis: `localhost:6379`

The Docker backend uses:

```env
REDIS_URL=redis://redis:6379
CLIENT_ORIGIN=http://localhost:3000
LOG_LEVEL=info
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=gemma3:4b
```

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:3000`. The client calls `http://localhost:4000` by default. Override with `NEXT_PUBLIC_API_URL` if needed.

## API Architecture

```text
React Chat UI
  -> POST /api/agent/chat
    -> validate + trim input with Zod (100 characters max)
    -> Agent
      -> tool: triage_symptoms
      -> tool: search_providers
    -> structured response
  -> UI renders answer, clarifying questions, tool calls, and database-backed provider cards
```

Endpoints:

- `GET /health`
- `GET /api/providers`
- `POST /api/agent/chat`

Request:

```json
{
  "conversationId": "optional-existing-session-id",
  "message": "I have chest pain. Should I go to the ER?",
  "locale": "en"
}
```

Response includes:

- `reply`
- `conversationId`
- `recommendation`
- `nextQuestions`
- `toolCalls`
- `safety`

## Database Structure

The mock provider database models the minimum fields needed for decision support:

- `id`
- `name`, `nameAr`
- `type`: hospital, clinic, or telehealth
- `specialties`
- `city`
- `acceptsSecondOpinions`
- `emergencyDepartment`
- `languages`
- `nextAvailable`
- `notes`

This can be moved to PostgreSQL with tables such as:

- `providers`
- `provider_specialties`
- `provider_languages`
- `availability_slots`

## Agent Design

The prototype uses explicit tools instead of free-form generation:

- `triage_symptoms`: classifies urgency, detects red flags, identifies likely specialty, and returns missing information.
- `search_providers`: filters only the mock database using specialty, emergency capability, city, second-opinion support, and language.

The agent response is built from tool outputs. Provider names are checked against the current search results. If no matching provider exists, the assistant should ask for clarification or say no match is available rather than fabricate one.

Arabic free-text replies, including Arabic-Indic digits such as `٢٦`, are read with prior patient turns. Lung/chest pain with reported blood or breathing difficulty is routed to emergency care before further clarification. The response guard prevents asking again for an age or pain location already supplied. The backend tests cover these cases and ensure the city name `الدمام` is not mistaken for the word `دم`.

## Safety And Security Notes

- This is not a medical diagnosis system.
- Emergency symptoms are routed to emergency care first.
- Free-text input is validated with Zod and rejected above 100 characters; suggested questions do not restrict answers.
- CORS is limited by `CLIENT_ORIGIN`.
- Provider recommendations are database-backed and returned in `toolCalls`; the UI renders matching provider cards.
- Production expansion should add authentication, audit logs, rate limits, PHI handling, encrypted storage, and clinical review of triage rules.

## Assumptions

- The patient's city is unknown until they provide one; the assistant cannot verify the nearest facility without live location data.
- Arabic and English are supported at the interface and response level.
- Triage and provider search are deterministic; chat wording comes from Ollama with backend safety and provider guards.
