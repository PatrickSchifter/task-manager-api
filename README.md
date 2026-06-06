<div align="center">

# 🗂️ Task Manager

### A task management SaaS you can actually *talk to*

[![Live Demo](https://img.shields.io/badge/live-tasks.solutlabs.com.br-2ea44f?style=flat-square)](https://tasks.solutlabs.com.br)
[![Tests](https://img.shields.io/badge/tests-272%20passing-brightgreen?style=flat-square)](#tests)
[![Coverage](https://img.shields.io/badge/coverage-93%25-brightgreen?style=flat-square)](#tests)
[![NestJS](https://img.shields.io/badge/NestJS-11-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#license)

**🔗 Live in production → [tasks.solutlabs.com.br](https://tasks.solutlabs.com.br)**

</div>

---

## 👋 Overview

Most task managers just *store* your work. This one lets you **have a conversation with it.**

Task Manager is a full SaaS platform where teams organize projects, tasks, and comments — but the part that makes it special is the built-in **AI assistant**. Instead of clicking through filters, you can simply ask:

> *"What are my high-priority tasks this week?"*
> *"What did the team say about the login bug?"*
> *"Create a task to review the Q4 report in the Marketing project"*
> *"Invite ana@acme.com to the Backend project"*

…and get a real, accurate answer — or have it **done for you** — based on **your actual data**, not a generic chatbot guess.

It's **live in production**, runs on cloud infrastructure with automated deployments, and is backed by **272 automated tests (~93% coverage)**.

### Why this project is interesting

| | |
|---|---|
| 🤖 **Talk to your data** | A real AI assistant that answers questions about your own projects and tasks — grounded in your data, with zero made-up answers. |
| ⚡ **Built to scale** | Heavy AI work runs in the background through message queues, so the app stays instant and responsive no matter what the AI is doing. |
| ☁️ **Actually shipped** | Not a toy demo — it's deployed, monitored, and reachable at a real domain with automated build-and-deploy on every push. |
| 🧪 **Engineered carefully** | 272 tests covering ~93% of the codebase. The business logic that matters is tested end to end. |
| 🔒 **Secure by design** | Every answer respects who you are — you can never see data from projects you're not part of, even by accident. |

### What this project demonstrates

A complete, production-grade backend built from scratch and shipped to real users — covering **API design**, **authentication & access control**, **AI/LLM integration (RAG + agentic tool-use)**, **event-driven architecture**, **database design with vector search**, **automated testing**, and **cloud deployment with CI/CD**. It's the kind of system that shows not just *writing code*, but *delivering a working product*.

> 💡 **In one line:** a task manager with a ChatGPT-style assistant that actually knows your projects — designed, built, tested, and deployed end to end.

<br>

---

<br>

# 🛠️ Technical Documentation

Everything below is the engineering deep-dive: architecture, the AI pipeline, the stack, and how to run it locally.

## What makes this project stand out (technically)

Beyond standard CRUD, Task Manager ships with a full **RAG (Retrieval-Augmented Generation)** pipeline that indexes every project, task, and comment as vector embeddings in PostgreSQL — wrapped in an **agentic chat assistant** that runs a tool-use loop with Claude. The assistant doesn't just answer questions grounded in real data; it can also *act* — creating projects, tasks, and comments or inviting collaborators — all within the user's permissions.

The entire pipeline is **end-to-end asynchronous**: from the moment a user sends a message to the moment the answer is ready, every step runs through RabbitMQ queues — decoupled, observable, and independently scalable.

---

## Features

### AI-Powered Chat Assistant (Agentic Tool-Use)

The chat layer is the most technically ambitious part of this project. It's not a plain "embed and search" chatbot — it's an **agentic assistant** running a tool-use loop with **Claude (Anthropic)**. Turn by turn, the model decides whether to *answer* a question (by searching your data) or *act* on your behalf — create a project, create a task, comment, invite a collaborator — all grounded in your data and strictly scoped to your permissions.

> *"What are my high-priority tasks this week?"* → answers from your data
> *"Create a task 'Fix login bug' in the Marketing project"* → resolves the project by name, then creates it
> *"Invite ana@acme.com to the Backend project as editor"* → adds the collaborator

#### How a message flows through the system

When a user sends a message to `POST /v1/chat`, this is what happens under the hood:

**Stage 0 — Enqueue**

The message is immediately persisted to the database with status `QUEUED` and dispatched as an event to the `chat_queue` on RabbitMQ. The API responds instantly — the user doesn't wait for any AI processing.

```
POST /v1/chat { "message": "What tasks are still pending?" }
  → Saved to DB (status: QUEUED)
  → Event emitted to chat_queue
  → Returns { id, status: "QUEUED", ... } immediately
```

**Stage 1 — Conversational Context**

Before any model call, the system loads the last few delivered messages from the user's history and replays them as alternating `user` / `assistant` turns. This lets the agent resolve follow-up questions and implicit references ("those tasks", "the previous one", "now only the critical ones") across turns without the user repeating context.

```
USER: What tasks are still pending?
ASSISTANT: You have 3 pending tasks: ...

USER: Now only the high priority ones
```

The message is marked `PROCESSING` and the transition is pushed to the client.

**Stage 2 — Agentic Tool-Use Loop (Claude)**

The `AgentConsumer` hands the message to the `AgentService`, which runs a bounded loop against the configured LLM — **OpenAI `gpt-4o-mini`** by default, or **Anthropic `claude-sonnet-4-6`**, selected via `AGENT_PROVIDER` (the tool catalog and `ToolExecutorService` are provider-agnostic; only the wire format differs). On each turn the model either returns a final answer or requests one or more tool calls; the system executes them, feeds the results back, and lets the model continue until it's done (capped at 10 iterations):

```
model → tool_use → ToolExecutor.execute → tool_result → model → … → end_turn
```

A single loop — no brittle "is this a question or a command?" classifier. The model is handed every tool, including the search tool, and decides for itself whether to *answer* or *act*.

| Tool | What it does |
|---|---|
| `search_knowledge_base` | Semantic search over the user's tasks / projects / comments (the RAG pipeline below), with optional `status` / `priority` / `projectId` / `sourceType` filters the model chooses |
| `find_project_by_name` | Resolve a project name → UUID within the user's accessible projects |
| `find_task` | Resolve a task title → UUID |
| `create_project` | Create a project (the caller becomes owner) |
| `create_task` | Create a task in a project (resolving `projectId` first) |
| `add_comment` | Add a comment to a task |
| `invite_collaborator` | Add an existing user as a collaborator (owner-only) |

**Read tools are grounded in the RAG pipeline; write tools are authorized per-actor.** Each write tool re-checks ownership/collaboration on the target before mutating — the request-scoped HTTP guards don't run inside the queue, so every domain service self-authorizes from the `actorId` carried on the message.

**Stage 2a — Hybrid Search (inside `search_knowledge_base`)**

When the model calls `search_knowledge_base`, it runs the two-part retrieval that grounds every answer. First, a relational query against `Task` / `Comment` / `Project` applies the model-chosen filters and returns the matching `sourceId`s — scoped to projects the user can access. Then a `pgvector` similarity search runs **only** over the embeddings in that filtered set, instead of the whole table — both faster and more precise.

```sql
SELECT sourceType, sourceId, content,
       1 - (vector <=> $query_vector) AS similarity
FROM "Embedding"
WHERE (sourceType, sourceId) IN (/* filtered, access-checked IDs */)
ORDER BY similarity DESC
LIMIT 5
```

**Stage 3 — Persist & deliver**

When the model finishes, its answer is persisted with status `DELIVERED`, together with a structured `actions[]` record of every tool the agent ran (tool name, input, result). The model is instructed to answer **only** from the retrieved context — no invented data — and the `actions[]` trail lets the client render "✅ Task created" affordances and keeps a full audit of what the assistant did on the user's behalf.

**Real-time delivery (WebSocket) — with polling fallback**

Processing is async, so the result is pushed to the client **the moment it's ready**. A **Socket.IO gateway** (`ChatGateway`) runs on the same NestJS server: every status transition (`PROCESSING → DELIVERED`/`FAILED`) persisted by `ChatService` is emitted as a `chat:status` event to that user's private room (`user:<id>`), carrying the full message record. No client-side polling loop in the happy path.

The socket handshake is authenticated with a **short-lived ticket** rather than the session JWT: the client calls `POST /v1/chat/ws-ticket` (bearer-authenticated) to mint a 60s, single-purpose token, then connects with it (`io(url, { auth: { ticket } })`). The gateway verifies the ticket on connection and drops the socket if it's missing, expired, or has the wrong purpose.

```
WS connect  → auth: { ticket }          (gateway validates → joins room user:<id>)
event chat:status  → { id, status: "PROCESSING", ... }
event chat:status  → { id, status: "DELIVERED", response: "You have 3 pending tasks: ..." }
```

**Polling stays as an automatic fallback.** If the client can't establish the socket (or it drops while a message is pending), it transparently falls back to polling `GET /v1/chat/:messageId` until the answer is `DELIVERED`/`FAILED` — so the REST endpoint below remains fully supported.

```
GET /v1/chat/:messageId
  → { status: "DELIVERED", response: "You have 3 pending tasks: ..." }
```

#### Message lifecycle

```
QUEUED → PROCESSING → DELIVERED
                    ↘ FAILED (on any error)
```

Every state transition is persisted to the `chat_messages` table, giving full observability into the pipeline. If any step fails, the message is marked `FAILED` and the error is logged — the user can retry rather than getting a silent failure.

#### Why this architecture matters

| Design choice | Why it matters |
|---|---|
| **Async queue** | The API never blocks on model calls. A slow LLM response doesn't affect other users or endpoints |
| **Real-time push** | Status transitions are emitted over a WebSocket the instant they're persisted — no client polling loop in the happy path, with HTTP polling kept as a transparent fallback |
| **Single agentic loop** | One tool-use loop lets the model decide between answering (search) and acting (create/comment/invite) — no fragile separate intent classifier |
| **Hybrid search** | Relational pre-filtering eliminates irrelevant embeddings before vector comparison, improving both precision and performance |
| **Conversational context** | Recent delivered messages are replayed into the agent loop, enabling multi-turn interactions and implicit references without polluting the vector search query |
| **Per-actor access control** | Read tools scope results to the user; write tools re-check ownership/collaboration inside the queue, where HTTP guards don't run — a user can never read or mutate data from projects they don't belong to |
| **Action audit trail** | Every tool the agent runs is persisted on the message as a structured `actions[]` record, alongside the full state history |
| **Graceful failure** | Any exception marks the message as `FAILED` instead of crashing the consumer |

#### Full pipeline diagram

```
POST /v1/chat
      │
      ├── Persist message (QUEUED)
      └── Emit → chat_queue (RabbitMQ)
                      │
                      ▼
              AgentConsumer.handleProcessMessage()
                      │
                      ▼
              Load recent history → user/assistant turns
              Persist PROCESSING (push to client)
                      │
                      ▼
         ┌──────────────────────────────────────────┐
         │      Agentic loop (Claude, ≤10 turns)     │
         │                                           │
         │   model ──▶ end_turn ──────────────┐      │
         │     │                              │      │
         │     └─▶ tool_use                   │      │
         │           │                        │      │
         │           ▼                        │      │
         │   ToolExecutor.execute(actorId)    │      │
         │   • search_knowledge_base (RAG)    │      │
         │   • find_project_by_name / find_task      │
         │   • create_project / create_task   │      │
         │   • add_comment / invite_collaborator     │
         │           │                        │      │
         │           ▼  tool_result           │      │
         │        (loop back to model) ───────┘      │
         └──────────────────┬───────────────────────┘
                            │
       search_knowledge_base│ runs the hybrid retrieval:
                            ▼
         ┌────────────────────────────┐
         │   Relational Pre-filter    │
         │  Task / Comment / Project  │
         │  model-chosen filters +    │
         │  per-actor access check    │
         └──────────────┬─────────────┘
                        │ filtered sourceIds
                        ▼
         ┌────────────────────────────┐
         │     pgvector Search        │
         │  WHERE (sourceType,        │
         │    sourceId) IN (ids)      │
         │  ORDER BY similarity DESC  │
         └──────────────┬─────────────┘
                        │ top-K chunks → tool_result
                        ▼
              Persist response + actions[] (DELIVERED)
                        │
                        ▼
              ChatGateway emits chat:status → room user:<id>   ← real-time push (Socket.IO)

WS  chat:status          ← client receives status in real time (primary)
GET /v1/chat/:messageId  ← client polls for result (fallback if socket is down)
GET /v1/chat?limit=20    ← client fetches conversation history
```

### Embedding Pipeline

When a project, task, or comment is created or updated, an event is emitted to the `embedding_queue`. A dedicated `EmbeddingConsumer` picks it up, builds a rich text representation of the entity (including title, description, status, priority, assignee, project name, and due date), generates a 1536-dimension vector via OpenAI's `text-embedding-3-small` model, and upserts it into PostgreSQL using the `pgvector` extension.

Key design decisions:

- The embedding table is **polymorphic** — projects, tasks, and comments all live in a single `Embedding` table with a `sourceType` discriminator, making it trivially extensible to new entity types
- Embeddings carry a `metadata` JSON field (`projectId`, `assigneeId`, `status`, `priority`, `dueDate`, and `parentId` / `parentTitle` for subtasks) enabling pre-filter queries without extra JOINs. The indexed text also includes the parent link on a subtask and a subtask summary (`Subtasks (3/5 done): ...`) on a parent, so the assistant can answer "what's left on task X?"
- Deletes are **cascade-aware** — removing a project cleans up all related task and comment embeddings in a single query via metadata filtering
- The pipeline is **fully async** — embedding generation never adds latency to the API response

### User Authentication

JWT-based auth with refresh token support, role-based access control (USER / ADMIN), and a full password recovery flow with async email delivery via RabbitMQ.

### Project Management

Create projects, invite collaborators, and assign permission roles per user (VIEWER / EDITOR / OWNER). Projects are the top-level workspace unit — everything scopes down from here.

### Task Management

Full task lifecycle with status tracking (TODO / IN_PROGRESS / DONE), priority levels (LOW / MEDIUM / HIGH), due dates, assignees, and drag-and-drop ordering powered by **fractional indexing** (lexicographic order keys, so reordering a task updates a single row instead of renumbering the whole list). Every mutation dispatches an embedding update automatically.

### Subtasks

Tasks can be broken down into **subtasks** — modeled as a single-level self-relation on `Task` (`parentId`), not a separate entity, so a subtask has its own status, priority, assignee, due date, and fractional ordering just like any task. The one-level rule (a subtask can't have subtasks) is validated on creation, and deleting a parent cascades to its subtasks. Top-level listings (Kanban board, dashboard) filter to `parentId IS NULL`, so subtasks never show up as standalone cards — each parent instead carries a `subtaskProgress` counter (e.g. `3/5`), and the subtasks themselves are managed from the task detail page. Ordering is scoped per parent via a composite unique index `(projectId, status, parentId, order)` with `NULLS NOT DISTINCT`, which keeps the top-level guarantee intact in PostgreSQL.

### Tags

Per-user tag catalog reused across projects, with deterministic auto-assigned colors. A find-or-create flow resolves tag names to IDs when creating or editing tasks, and ownership is enforced so users only ever touch their own tags.

### Dashboard

An aggregated summary endpoint returning active / completed / in-progress task counts, recent projects with task progress, and upcoming deadlines — all scoped to projects the user owns or collaborates on, computed in parallel queries. Counts cover only top-level tasks (`parentId IS NULL`); subtasks are internal units of work and don't inflate the metrics.

### Collaboration

Task-level comments with author attribution. Comment content is indexed as its own embedding chunk, so the AI can answer questions like "What did the team say about the authentication task?" with precision.

### File Uploads

Avatar upload support via Cloudinary with automatic URL management.

### Asynchronous Email Processing

Queue-based email delivery via RabbitMQ. Forgot-password requests return immediately — the actual email is dispatched by a consumer in the background.

### Rate Limiting

Per-user throttling on authenticated routes (and per-IP on public ones), implemented with a custom `ThrottlerGuard` that extracts the user from the bearer token before the auth guard runs — so users behind the same NAT/proxy don't share a limit.

### API Documentation

Full Swagger/OpenAPI documentation auto-generated and served at `/api`.

---

## Tech Stack

**Backend:** NestJS · TypeScript · Prisma · PostgreSQL · pgvector

**Real-time:** WebSockets (`@nestjs/websockets` · `@nestjs/platform-socket.io` · Socket.IO) — ticket-authenticated chat delivery

**AI:** Pluggable agent provider — **OpenAI `gpt-4o-mini`** (default) or **Anthropic Claude `claude-sonnet-4-6`**, selected via `AGENT_PROVIDER`, with optional per-action escalation · OpenAI (`text-embedding-3-small`) for embeddings

**Infrastructure:** Oracle Cloud Infrastructure · PM2 · RabbitMQ

**External Services:** Cloudinary · Resend

**Tooling:** Swagger · Jest · Biome · PNPM

---

## Architecture

### Queue-Based Processing

All three queues follow the same async pattern — the API emits an event and returns immediately, while consumers handle the heavy lifting independently:

```
email_queue      → MailConsumer      → Resend delivery
embedding_queue  → EmbeddingConsumer → OpenAI embeddings    → pgvector upsert
chat_queue       → AgentConsumer     → Claude tool-use loop → response + actions persisted
```

This keeps API latency low and makes each concern independently scalable and fault-isolated.

### Real-time Delivery (WebSocket)

Chat answers are delivered to the client in real time over **Socket.IO**, with HTTP polling kept as a fallback. Because the `AgentConsumer` and the `ChatGateway` live in the **same NestJS process**, status updates are pushed directly when they're persisted — no extra notification queue is needed:

```
ChatService.setProcessing / setDelivered / setFailed   (called by AgentConsumer)
        │  persist transition to DB
        ▼
ChatGateway.emitStatus(userId, message)
        │  Socket.IO → room "user:<id>"
        ▼
Connected client receives `chat:status` event
```

Connections are authenticated with a **short-lived, single-purpose ticket** (60s, `purpose: "ws"`) minted at `POST /v1/chat/ws-ticket` from the session JWT — so the long-lived JWT never has to be exposed to client JavaScript for the handshake. Each socket joins a private `user:<id>` room, so events are scoped per user.

### Production Deployment

Deployed on Oracle Cloud Infrastructure with an automated CI/CD pipeline. Pushes to the main branch trigger a build and deploy via PM2 with zero-downtime reloads.

---

## Project Structure

```
src/
├── app.module.ts
├── main.ts
├── consts.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── common/                  # guards, interceptors, decorators, shared services
├── utils/                   # fractional indexing, tag colors, pagination
├── modules/
│   ├── auth/
│   ├── users/
│   ├── projects/
│   ├── tasks/
│   ├── tags/
│   ├── collaborators/
│   ├── comments/
│   ├── dashboard/
│   ├── mail/
│   ├── embedding/
│   │   ├── embedding.consumer.ts
│   │   ├── embedding.service.ts
│   │   └── embedding.module.ts
│   ├── rag/                     # embedding dispatchers (consumed by domain services)
│   │   ├── rag.service.ts
│   │   └── rag.module.ts
│   ├── agent/                   # agentic chat — Claude tool-use loop
│   │   ├── agent.consumer.ts        # listens on chat_queue
│   │   ├── agent.service.ts         # model → tool_use → tool_result loop
│   │   ├── tool-executor.service.ts # maps tools → domain services (per-actor auth)
│   │   ├── tool-definitions.ts      # the tool catalog (JSON Schema)
│   │   └── agent.module.ts
│   └── chat/
│       ├── chat.controller.ts
│       ├── chat.service.ts
│       ├── chat.gateway.ts      # Socket.IO gateway — real-time chat:status push
│       ├── chat.dto.ts
│       └── chat.module.ts
└── generated/
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL with pgvector extension
- RabbitMQ
- OpenAI API key (embeddings)
- Anthropic API key (chat agent)
- Cloudinary account
- PNPM

### Installation

```bash
git clone https://github.com/PatrickSchifter/task-manager.git
cd task-manager
pnpm install
cp .env.example .env
```

### Local Infrastructure (Docker)

```bash
docker-compose up -d
```

This starts PostgreSQL with pgvector and RabbitMQ with the management UI available at `http://localhost:15672` (user: `admin`, password: `admin`).

### Environment Variables

```env
# App
APP_PORT=3000

# Database
DATABASE_URL="postgresql://admin:admin@localhost:5432/task-manager?schema=public"

# JWT
JWT_SECRET=your_secret
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your_refresh_secret

# RabbitMQ
RMQ_URL=amqp://admin:admin@localhost:5672
EMAIL_QUEUE=email_queue
EMBEDDING_QUEUE=embedding_queue
CHAT_QUEUE=chat_queue

# OpenAI (embeddings — text-embedding-3-small)
OPENAI_API_KEY=your_openai_api_key

# Anthropic (chat agent — alternative provider / escalation target)
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-sonnet-4-6

# Agent routing
AGENT_PROVIDER=openai            # openai (gpt-4o-mini, default) | anthropic (claude-sonnet-4-6)
OPENAI_AGENT_MODEL=gpt-4o-mini
AGENT_ESCALATE_INVITES=false     # route collaborator-invite messages to Anthropic Sonnet

# Google OAuth (social login) — callback URL must match the Google Cloud Console config
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3030/v1/auth/google/callback

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email
RESEND_API_KEY=re_7...
EMAIL_FROM=no.reply@...

# Frontend
FRONTEND_URL=http://localhost:3000
```

### Database Setup

```bash
# Enable pgvector extension (run once)
psql -d task-manager -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations
pnpm migrate:dev

# Generate Prisma client
pnpm prisma:generate
```

### Running

```bash
pnpm start:dev
```

API docs available at `http://localhost:3000/api`

---

## Chat API Usage

```bash
# Send a message (returns immediately)
POST /v1/chat
{ "message": "What are my high priority tasks this week?" }
→ { "id": "uuid", "status": "QUEUED", ... }

# Mint a short-lived ticket for the WebSocket handshake (bearer-authenticated)
POST /v1/chat/ws-ticket
→ { "ticket": "<jwt>", "expiresIn": 60 }

# Receive the result in real time (primary): connect with the ticket and listen
WS connect  → auth: { ticket }
event "chat:status"  → { "id": "uuid", "status": "DELIVERED", "response": "You have 2 high priority tasks: ..." }

# Poll for the result (fallback, if the socket is unavailable)
GET /v1/chat/:id
→ { "status": "DELIVERED", "response": "You have 2 high priority tasks: ..." }

# Fetch conversation history
GET /v1/chat?limit=20
→ [{ id, content, response, status, createdAt }, ...]
```

---

## Available Scripts

```bash
pnpm start:dev        # development with watch
pnpm start:prod       # production
pnpm build            # compile
pnpm lint             # Biome lint
pnpm format           # Biome format
pnpm test             # Jest unit tests
pnpm test:cov         # coverage report
pnpm migrate:dev      # run migrations
pnpm migrate:deploy   # deploy migrations (production)
pnpm prisma:generate  # regenerate Prisma client
```

---

## Tests

```bash
pnpm test:cov
```

**272 tests across 39 suites — all passing.**

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 92.9% | 75.8% | 93.3% | 93.8% |

The full business logic (auth, tasks, projects, comments, collaborators, tags, dashboard, embedding, the chat agent loop + tool executor, the chat WebSocket gateway, mail, guards) is covered with unit and integration tests. Controllers are tested end to end with `supertest` against the real Nest application.

---

## API Highlights

```
POST   /v1/auth/register
POST   /v1/auth/login

GET    /v1/projects
POST   /v1/projects
DELETE /v1/projects/:id

GET    /v1/tasks
POST   /v1/tasks                  ← pass parentId to create a subtask
PATCH  /v1/tasks/:id
DELETE /v1/tasks/:id              ← cascades to subtasks
GET    /v1/tasks/:id/subtasks     ← subtasks of a task

GET    /v1/tags
POST   /v1/tags
DELETE /v1/tags/:id

GET    /v1/dashboard/summary

POST   /v1/tasks/:id/comments
DELETE /v1/comments/:id

POST   /v1/chat              ← enqueue message
POST   /v1/chat/ws-ticket    ← mint short-lived WebSocket ticket
GET    /v1/chat/:messageId   ← poll for result (fallback)
GET    /v1/chat              ← conversation history

WS     chat:status           ← real-time delivery (primary), room user:<id>
```

Full Swagger documentation at `/api` after starting the server.

---

## Roadmap

- [x] Agentic chat: act on your data (create project/task/comment, invite collaborator) via a Claude tool-use loop
- [ ] Confirmation step for destructive/irreversible chat actions (preview → confirm → execute)
- [ ] Separate RabbitMQ consumer process (independent scaling)
- [x] WebSocket delivery of chat status (primary path; HTTP polling kept as fallback)
- [ ] Health checks with `@nestjs/terminus`
- [x] Rate limiting on auth and chat routes
- [ ] Correlation ID tracing across async flows
- [ ] Dead letter queue strategy for failed embeddings and chat messages
- [ ] Intelligent task recommendations based on user patterns
- [ ] Full collaborator permission guards on all routes

---

## License

MIT

---

## Contact

Patrick Schifter · [schiftercorp@outlook.com](mailto:schiftercorp@outlook.com) · [GitHub](https://github.com/PatrickSchifter)
