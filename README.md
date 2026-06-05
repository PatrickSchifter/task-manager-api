<div align="center">

# 🗂️ Task Manager

### A task management SaaS you can actually *talk to*

[![Live Demo](https://img.shields.io/badge/live-tasks.solutlabs.com.br-2ea44f?style=flat-square)](https://tasks.solutlabs.com.br)
[![Tests](https://img.shields.io/badge/tests-254%20passing-brightgreen?style=flat-square)](#tests)
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen?style=flat-square)](#tests)
[![NestJS](https://img.shields.io/badge/NestJS-11-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#license)

**🔗 Live in production → [tasks.solutlabs.com.br](https://tasks.solutlabs.com.br)**

</div>

---

## 👋 Overview

Most task managers just *store* your work. This one lets you **have a conversation with it.**

Task Manager is a full SaaS platform where teams organize projects, tasks, and comments — but the part that makes it special is the built-in **AI assistant**. Instead of clicking through filters, you can simply ask:

> *"What are my high-priority tasks this week?"*
> *"Is anyone working on the frontend?"*
> *"What did the team say about the login bug?"*

…and get a real, accurate answer based on **your actual data** — not a generic chatbot guess.

It's **live in production**, runs on cloud infrastructure with automated deployments, and is backed by **254 automated tests (95% coverage)**.

### Why this project is interesting

| | |
|---|---|
| 🤖 **Talk to your data** | A real AI assistant that answers questions about your own projects and tasks — grounded in your data, with zero made-up answers. |
| ⚡ **Built to scale** | Heavy AI work runs in the background through message queues, so the app stays instant and responsive no matter what the AI is doing. |
| ☁️ **Actually shipped** | Not a toy demo — it's deployed, monitored, and reachable at a real domain with automated build-and-deploy on every push. |
| 🧪 **Engineered carefully** | 254 tests covering 95% of the codebase. The business logic that matters is tested end to end. |
| 🔒 **Secure by design** | Every answer respects who you are — you can never see data from projects you're not part of, even by accident. |

### What this project demonstrates

A complete, production-grade backend built from scratch and shipped to real users — covering **API design**, **authentication & access control**, **AI/LLM integration (RAG)**, **event-driven architecture**, **database design with vector search**, **automated testing**, and **cloud deployment with CI/CD**. It's the kind of system that shows not just *writing code*, but *delivering a working product*.

> 💡 **In one line:** a task manager with a ChatGPT-style assistant that actually knows your projects — designed, built, tested, and deployed end to end.

<br>

---

<br>

# 🛠️ Technical Documentation

Everything below is the engineering deep-dive: architecture, the AI pipeline, the stack, and how to run it locally.

## What makes this project stand out (technically)

Beyond standard CRUD, Task Manager ships with a full **RAG (Retrieval-Augmented Generation)** pipeline that indexes every project, task, and comment as vector embeddings in PostgreSQL. Natural language questions are answered with intelligent, context-aware responses grounded in real data — not hallucinations.

The entire pipeline is **end-to-end asynchronous**: from the moment a user sends a message to the moment the answer is ready, every step runs through RabbitMQ queues — decoupled, observable, and independently scalable.

---

## Features

### AI-Powered Chat Assistant (RAG)

The semantic search and chat layer is the most technically ambitious part of this project. It goes beyond a simple "embed and search" implementation — it uses a **two-stage AI pipeline** with structured pre-filtering and conversational context, making answers dramatically more relevant and precise.

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

**Stage 0.5 — Conversational Context**

Before any AI call is made, the system fetches the last 5 delivered messages from the user's conversation history. Each message carries both the original question (`content`) and the assistant's answer (`response`), which are formatted into a structured history block:

```
USER: What tasks are still pending?
ASSISTANT: You have 3 pending tasks: ...

USER: Now only the high priority ones
```

This history is injected into both AI calls — the filter parser and the response generator — enabling the system to resolve follow-up questions, implicit references ("those tasks", "the previous ones", "now only the critical ones"), and multi-turn refinements without the user having to repeat context.

The vector search query itself remains the raw current message — history is intentionally excluded from embedding lookup to avoid noise in similarity scoring.

**Stage 1 — Structured Pre-filtering (1st AI call)**

The `RagConsumer` picks up the event from the queue. Before touching any vector search, it makes a first call to GPT-4o mini with a specialized system prompt that acts as a **query parser**. The model reads both the conversation history and the user's current question, and returns a structured JSON object with filters:

```json
{
  "status": ["TODO", "IN_PROGRESS"],
  "priority": ["HIGH", "URGENT"],
  "sourceTypes": ["TASK", "COMMENT"]
}
```

Because the model has access to the conversation history, it can correctly resolve follow-up messages. For example:

| History | Current message | Extracted filters |
|---|---|---|
| "What tasks are overdue?" | "Now only the high priority ones" | `{ "status": ["TODO"], "priority": ["HIGH"] }` |

These filters are persisted back to the message record (status: `PROCESSING`) and used in the next step. This is what separates this pipeline from a naive RAG implementation — instead of doing a wide vector search over all data and hoping the model figures it out, we narrow down the candidate set *before* computing any similarity scores.

**Stage 2 — Hybrid Search (Relational + Vector)**

With the structured filters in hand, the system runs a two-part query:

First, a standard relational query against the `Task`, `Comment`, and `Project` tables applies the extracted filters (`status`, `priority`, `projectId`). This returns a precise list of `sourceId`s that match the user's intent. Access control is enforced here — only entities belonging to projects the user is a collaborator on are included.

Then, the vector similarity search runs exclusively over the embeddings whose `sourceId`s are in that filtered set. Instead of comparing the user's query against thousands of embeddings, it compares against only the relevant ones — making the search both faster and more accurate.

```sql
SELECT sourceType, sourceId, content,
       1 - (vector <=> $query_vector) AS similarity
FROM "Embedding"
WHERE (sourceType, sourceId) IN (/* filtered IDs from relational query */)
ORDER BY similarity DESC
LIMIT 5
```

**Stage 3 — Response Generation (2nd AI call)**

The top results are assembled into a rich context block and sent to GPT-4o mini alongside the conversation history and the current message. The model receives three clearly separated inputs:

- **Conversation History** — to resolve references like "those", "these", "the previous ones"
- **Retrieved Context** — the actual task/project/comment data from the vector search
- **Current User Message** — the question to answer

The model is instructed to answer **only** based on the provided context — no hallucinations, no invented data. The response is persisted with status `DELIVERED`.

**Polling for the result**

Since processing is async, the client polls `GET /v1/chat/:messageId` to check the status and retrieve the answer when ready.

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
| **Async queue** | The API never blocks on AI calls. A slow OpenAI response doesn't affect other users or endpoints |
| **Two-stage AI** | The first AI call converts vague natural language into precise database filters. The second AI call generates a grounded answer from the right data |
| **Hybrid search** | Relational pre-filtering eliminates irrelevant embeddings before vector comparison, improving both precision and performance |
| **Conversational context** | The last 5 delivered messages are injected into both AI calls, enabling multi-turn interactions and implicit references without polluting the vector search query |
| **Per-user access control** | Enforced at query time — a user can never receive information from projects they don't belong to, regardless of vector similarity |
| **Persistent message state** | Full audit trail of every chat interaction, from enqueue to delivery |
| **Graceful failure** | Any exception marks the message as `FAILED` instead of crashing the consumer |

#### Full pipeline diagram

```
POST /v1/chat
      │
      ├── Persist message (QUEUED)
      └── Emit → chat_queue (RabbitMQ)
                      │
                      ▼
              RagConsumer.handleProcessMessage()
                      │
                      ▼
              Fetch last 5 delivered messages
              Build conversation history block
              (USER: ... / ASSISTANT: ...)
                      │
                      ▼
              1st AI call (GPT-4o mini)
              "Parse this question into filters"
              [receives: history + current message]
                      │
                      ▼
              { status, priority, projectId, sourceTypes }
              Persist filters (PROCESSING)
                      │
                      ▼
         ┌────────────────────────────┐
         │   Relational Pre-filter    │
         │  Task / Comment / Project  │
         │  WHERE status IN (...)     │
         │  AND priority IN (...)     │
         │  AND user has access       │
         └──────────────┬─────────────┘
                        │ filtered sourceIds
                        ▼
         ┌────────────────────────────┐
         │     Vector Search          │
         │  query = current message   │
         │  (history excluded)        │
         │  WHERE (sourceType,        │
         │    sourceId) IN (ids)      │
         │  ORDER BY similarity DESC  │
         └──────────────┬─────────────┘
                        │ top-K chunks
                        ▼
              2nd AI call (GPT-4o mini)
              "Answer based only on this context"
              [receives: history + context + current message]
                        │
                        ▼
              Persist response (DELIVERED)

GET /v1/chat/:messageId  ← client polls for result
GET /v1/chat?limit=20    ← client fetches conversation history
```

### Embedding Pipeline

When a project, task, or comment is created or updated, an event is emitted to the `embedding_queue`. A dedicated `EmbeddingConsumer` picks it up, builds a rich text representation of the entity (including title, description, status, priority, assignee, project name, and due date), generates a 1536-dimension vector via OpenAI's `text-embedding-3-small` model, and upserts it into PostgreSQL using the `pgvector` extension.

Key design decisions:

- The embedding table is **polymorphic** — projects, tasks, and comments all live in a single `Embedding` table with a `sourceType` discriminator, making it trivially extensible to new entity types
- Embeddings carry a `metadata` JSON field (`projectId`, `assigneeId`, `status`, `priority`, `dueDate`) enabling pre-filter queries without extra JOINs
- Deletes are **cascade-aware** — removing a project cleans up all related task and comment embeddings in a single query via metadata filtering
- The pipeline is **fully async** — embedding generation never adds latency to the API response

### User Authentication

JWT-based auth with refresh token support, role-based access control (USER / ADMIN), and a full password recovery flow with async email delivery via RabbitMQ.

### Project Management

Create projects, invite collaborators, and assign permission roles per user (VIEWER / EDITOR / OWNER). Projects are the top-level workspace unit — everything scopes down from here.

### Task Management

Full task lifecycle with status tracking (TODO / IN_PROGRESS / DONE), priority levels (LOW / MEDIUM / HIGH), due dates, assignees, and drag-and-drop ordering powered by **fractional indexing** (lexicographic order keys, so reordering a task updates a single row instead of renumbering the whole list). Every mutation dispatches an embedding update automatically.

### Tags

Per-user tag catalog reused across projects, with deterministic auto-assigned colors. A find-or-create flow resolves tag names to IDs when creating or editing tasks, and ownership is enforced so users only ever touch their own tags.

### Dashboard

An aggregated summary endpoint returning active / completed / in-progress task counts, recent projects with task progress, and upcoming deadlines — all scoped to projects the user owns or collaborates on, computed in parallel queries.

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

**AI:** OpenAI API (`text-embedding-3-small` · `gpt-4o-mini`)

**Infrastructure:** Oracle Cloud Infrastructure · PM2 · RabbitMQ

**External Services:** Cloudinary · Resend

**Tooling:** Swagger · Jest · Biome · PNPM

---

## Architecture

### Queue-Based Processing

All three queues follow the same async pattern — the API emits an event and returns immediately, while consumers handle the heavy lifting independently:

```
email_queue      → MailConsumer      → Resend delivery
embedding_queue  → EmbeddingConsumer → OpenAI embeddings → pgvector upsert
chat_queue       → RagConsumer       → 2x OpenAI calls   → response persisted
```

This keeps API latency low and makes each concern independently scalable and fault-isolated.

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
│   ├── mcp/
│   ├── embedding/
│   │   ├── embedding.consumer.ts
│   │   ├── embedding.service.ts
│   │   └── embedding.module.ts
│   ├── rag/
│   │   ├── rag.consumer.ts
│   │   ├── rag.service.ts
│   │   └── rag.module.ts
│   └── chat/
│       ├── chat.controller.ts
│       ├── chat.service.ts
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
- OpenAI API key
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

# OpenAI
OPENAI_API_KEY=your_openai_api_key

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

# Poll for the result
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

**254 tests across 39 suites — all passing.**

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 95.0% | 77.9% | 96.2% | 95.4% |

The full business logic (auth, tasks, projects, comments, collaborators, tags, dashboard, embedding, RAG, mail, guards) is covered with unit and integration tests. Controllers are tested end to end with `supertest` against the real Nest application.

---

## API Highlights

```
POST   /v1/auth/register
POST   /v1/auth/login

GET    /v1/projects
POST   /v1/projects
DELETE /v1/projects/:id

GET    /v1/tasks
POST   /v1/tasks
PATCH  /v1/tasks/:id
DELETE /v1/tasks/:id

GET    /v1/tags
POST   /v1/tags
DELETE /v1/tags/:id

GET    /v1/dashboard/summary

POST   /v1/tasks/:id/comments
DELETE /v1/comments/:id

POST   /v1/chat              ← enqueue message
GET    /v1/chat/:messageId   ← poll for result
GET    /v1/chat              ← conversation history
```

Full Swagger documentation at `/api` after starting the server.

---

## Roadmap

- [ ] Separate RabbitMQ consumer process (independent scaling)
- [ ] WebSocket notification when chat message is delivered (replace polling)
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
