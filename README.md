# Task Manager API

A production-ready task and project management platform built with NestJS — designed for collaboration, scalability, and intelligent productivity. Built from scratch as a portfolio-grade SaaS application with a full AI-powered assistant layer.

Live at **[tasks.solutlabs.com.br](https://tasks.solutlabs.com.br)** · [GitHub Repository](https://github.com/PatrickSchifter/task-manager)

---

## What makes this project stand out

Most task managers store data. This one lets you **talk to it**.

Beyond the standard CRUD operations, Task Manager ships with a full **RAG (Retrieval-Augmented Generation)** pipeline that indexes every project, task, and comment as vector embeddings in PostgreSQL. Users can ask natural language questions — "What are my high priority tasks this week?", "Is anyone working on the frontend?" — and get intelligent, context-aware answers grounded in real data, not hallucinations.

The entire embedding pipeline is asynchronous, decoupled from the API via RabbitMQ, and scoped per user — so the AI only surfaces information the user actually has access to.

---

## Features

### AI-Powered Assistant (RAG)

The semantic search and chat layer is the most technically ambitious part of this project.

**How it works:**

When a project, task, or comment is created or updated, an event is emitted to a RabbitMQ queue. A dedicated consumer picks it up, builds a rich text representation of the entity, generates a vector embedding via OpenAI's `text-embedding-3-small` model, and stores it in PostgreSQL using the `pgvector` extension.

When a user sends a message to the `/rag/chat` endpoint, the system:

1. Embeds the user's question into the same vector space
2. Runs a cosine similarity search across all embeddings the user has access to
3. Injects the most relevant chunks as context into a GPT-4o mini prompt
4. Returns a grounded, concise answer

**Key design decisions:**

- The embedding table is **polymorphic** — projects, tasks, and comments all live in a single `Embedding` table with a `sourceType` field, making it trivially extensible to new entity types
- Access control is enforced at **query time** — the similarity search filters by `ProjectCollaborator` and `Project.createdById`, so users never see embeddings from projects they don't belong to
- Embeddings are stored with a `metadata` JSON field (projectId, assigneeId, status, priority, dueDate) enabling **pre-filter before vector search** without extra JOINs
- The pipeline is **fully async** — embedding generation never blocks an API response
- Deletes are handled with **cascade-aware cleanup** methods that remove all related embeddings by `metadata.projectId` or `metadata.taskId` in a single query

### User Authentication

JWT-based auth with refresh token support, role-based access control (USER / ADMIN), and a full password recovery flow with async email delivery.

### Project Management

Create projects, invite collaborators, and assign permission roles per user (VIEWER / EDITOR / OWNER). Projects are the top-level workspace unit — everything scopes down from here.

### Task Management

Full task lifecycle with status tracking (TODO / IN_PROGRESS / DONE), priority levels (LOW / MEDIUM / HIGH), due dates, assignees, and drag-and-drop ordering support. Every mutation dispatches an embedding update automatically.

### Collaboration

Task-level comments with author attribution. Comment content is indexed as its own embedding chunk, so the AI can answer questions like "What did the team say about the backend task?" with precision.

### File Uploads

Avatar upload support via Cloudinary with automatic URL management.

### Asynchronous Email Processing

Queue-based email delivery via RabbitMQ. Forgot-password requests return immediately — the actual email is dispatched by a consumer in the background. Same pattern used for embedding generation.

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

### RAG Pipeline

```
API Request (create/update)
        │
        ▼
   RagService.dispatch*()
        │
        ▼
   RabbitMQ (embedding_queue)
        │
        ▼
   EmbeddingConsumer
        │
        ▼
   EmbeddingService.generateFor*()
        │  ├─ Fetch entity + relations from DB
        │  ├─ Build text content + metadata
        │  ├─ OpenAI embeddings API
        │  └─ Upsert into Embedding table (pgvector)
        ▼
   PostgreSQL (pgvector HNSW index)


Chat Request
        │
        ▼
   EmbeddingService.searchSimilar()
        │  ├─ Embed user query
        │  ├─ Cosine similarity search (access-scoped)
        │  └─ Return top-K chunks
        │
        ▼
   RagService.chat()
        │  ├─ Build context from chunks
        │  └─ GPT-4o mini completion
        ▼
   Answer
```

### Queue-Based Processing

Both email delivery and embedding generation follow the same async pattern — the API emits an event and returns immediately, while consumers handle the heavy lifting independently. This keeps API latency low and makes each concern independently scalable and fault-isolated.

### Production Deployment

Deployed on Oracle Cloud Infrastructure with an automated CI/CD pipeline. Pushes to the main branch trigger a build and deploy via PM2, with zero-downtime reloads in production.

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
│   └── rag/
│       ├── embedding.consumer.ts
│       ├── embedding.service.ts
│       ├── embedding-client.module.ts
│       ├── rag.controller.ts
│       ├── rag.dto.ts
│       ├── rag.module.ts
│       └── rag.service.ts
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

### Environment Variables

```env
# App
APP_PORT=3000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/taskmanager?schema=public"

# JWT
JWT_SECRET=your_secret
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your_refresh_secret

# RabbitMQ
RMQ_URL=amqp://guest:guest@localhost:5672
EMAIL_QUEUE=email_queue
EMBEDDING_QUEUE=embedding_queue

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
# Enable pgvector extension (run once on your PostgreSQL instance)
psql -d your_database -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations
pnpm migrate:dev

# Generate Prisma client
pnpm prisma:generate

# Seed with sample data and embeddings
pnpm prisma db seed
```

### Running

```bash
pnpm start:dev
```

API docs available at `http://localhost:3000/api`

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

## API Highlights

```
POST /auth/register
POST /auth/login

GET  /projects
POST /projects
DELETE /projects/:id

GET  /tasks
POST /tasks
PATCH /tasks/:id
DELETE /tasks/:id

POST /tasks/:id/comments
DELETE /comments/:id

POST /rag/chat          ← AI assistant
```

Full Swagger documentation at `/api` after starting the server.

---

## Roadmap

- [ ] Separate RabbitMQ consumer process (independent scaling)
- [ ] Health checks with `@nestjs/terminus`
- [ ] Rate limiting on auth routes
- [ ] Correlation ID tracing across async flows
- [ ] Dead letter queue strategy for failed embeddings
- [ ] Intelligent task recommendations based on user patterns
- [ ] Full collaborator permission guards on all routes

---

## License

MIT

---

## Contact

Patrick Schifter · [schiftercorp@outlook.com](mailto:schiftercorp@outlook.com) · [GitHub](https://github.com/PatrickSchifter)