# Task Manager API

Task Manager API is a production-ready SaaS platform for team task management, built with NestJS and deployed on Oracle Cloud. It features a full AI-powered chat assistant — users can ask natural language questions about their projects and tasks and get context-aware answers in real time. The entire AI pipeline runs asynchronously through message queues, keeping the API fast and independently scalable. Built as a portfolio-grade project with 97%+ test coverage and live at **[tasks.solutlabs.com.br](https://tasks.solutlabs.com.br)**.

---

## What makes this project stand out

Most task managers store data. This one lets you **talk to it**.

Beyond the standard CRUD operations, Task Manager ships with a full **RAG (Retrieval-Augmented Generation)** pipeline that indexes every project, task, and comment as vector embeddings in PostgreSQL. Users can ask natural language questions — "What are my high priority tasks this week?", "Is anyone working on the frontend?" — and get intelligent, context-aware answers grounded in real data, not hallucinations.

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

Full task lifecycle with status tracking (TODO / IN_PROGRESS / DONE), priority levels (LOW / MEDIUM / HIGH / URGENT), due dates, assignees, and ordering support. Every mutation dispatches an embedding update automatically.

### Collaboration

Task-level comments with author attribution. Comment content is indexed as its own embedding chunk, so the AI can answer questions like "What did the team say about the authentication task?" with precision.

### File Uploads

Avatar upload support via Cloudinary with automatic URL management.

### Asynchronous Email Processing

Queue-based email delivery via RabbitMQ. Forgot-password requests return immediately — the actual email is dispatched by a consumer in the background.

### API Documentation

Full Swagger/OpenAPI documentation auto-generated and served at `/api`.

---

## Tech Stack

**Backend:** NestJS · TypeScript · Prisma · PostgreSQL · pgvector

**AI:** OpenAI API (`text-embedding-3-small` · `gpt-4o-mini`)

**Infrastructure:** Oracle Cloud Infrastructure · PM2 · RabbitMQ

**External Services:** Cloudinary · SMTP

**Tooling:** Swagger · Jest · Biome · PNPM

---

## Architecture

### Queue-Based Processing

All three queues follow the same async pattern — the API emits an event and returns immediately, while consumers handle the heavy lifting independently:

```
email_queue      → MailConsumer      → SMTP delivery
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
├── modules/
│   ├── auth/
│   ├── users/
│   ├── projects/
│   ├── tasks/
│   ├── collaborators/
│   ├── comments/
│   ├── mail/
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

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_password
SMTP_FROM=no-reply@example.com

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

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 97.74% | 80.16% | 97.61% | 98.33% |

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
- [ ] Rate limiting on auth and chat routes
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