# Task Manager API

A production-ready task and project management platform built with NestJS, focused on collaboration, scalability, and modern backend architecture.
The project was fully designed, implemented, deployed, and maintained from scratch as a portfolio-grade SaaS application.

The application is publicly available at:

* [tasks.solutlabs.com.br](https://tasks.solutlabs.com.br?utm_source=chatgpt.com)

Source code:

* [GitHub Repository](https://github.com/PatrickSchifter/task-manager?utm_source=chatgpt.com)

---

# Features

* **User Authentication**

  * JWT-based authentication
  * Role-based access control (USER / ADMIN)
  * Password recovery flow

* **Project Management**

  * Create and manage projects
  * Invite collaborators
  * Permission roles (VIEWER / EDITOR / OWNER)

* **Task Management**

  * Create and assign tasks
  * Status tracking (TODO / IN_PROGRESS / DONE)
  * Priority system (LOW / MEDIUM / HIGH)

* **Collaboration**

  * Task comments
  * Multi-user workspace support

* **File Uploads**

  * Avatar upload support via [Cloudinary](https://cloudinary.com/?utm_source=chatgpt.com)

* **Asynchronous Email Processing**

  * Queue-based email processing with [RabbitMQ](https://www.rabbitmq.com/?utm_source=chatgpt.com)
  * Forgot-password notifications
  * Decoupled mail architecture

* **API Documentation**

  * Auto-generated Swagger/OpenAPI documentation

* **Database**

  * PostgreSQL + Prisma

* **Validation**

  * DTO validation using class-validator and class-transformer

* **Testing**

  * Jest unit tests configured

* **CI/CD & Deployment**

  * Automated deployment pipeline to Oracle Cloud Infrastructure
  * Production environment with PM2 process management
  * Automated build and deployment workflow integrated with GitHub

---

# Tech Stack

## Backend

* NestJS
* TypeScript
* Prisma
* PostgreSQL

## Infrastructure

* [Oracle Cloud Infrastructure](https://www.oracle.com/cloud/?utm_source=chatgpt.com)
* [PM2](https://pm2.keymetrics.io/?utm_source=chatgpt.com)
* [RabbitMQ](https://www.rabbitmq.com/?utm_source=chatgpt.com)

## External Services

* [Cloudinary](https://cloudinary.com/?utm_source=chatgpt.com)
* SMTP Mail Service

## Tooling

* [Swagger/OpenAPI](https://swagger.io/?utm_source=chatgpt.com)
* [Jest](https://jestjs.io/?utm_source=chatgpt.com)
* [Biome](https://biomejs.dev/?utm_source=chatgpt.com)
* [PNPM](https://pnpm.io/?utm_source=chatgpt.com)

---

# Project Structure

```bash
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
│   └── mail/
├── generated/
└── ...
```

---

# Architecture Highlights

## Queue-Based Email Processing

The application uses asynchronous processing with [RabbitMQ](https://www.rabbitmq.com/?utm_source=chatgpt.com) to prevent expensive operations from blocking API responses.

Example:

* Forgot password requests immediately return a response
* Email delivery is handled asynchronously by consumers

This architecture improves:

* scalability
* responsiveness
* fault isolation

---

## Production Deployment

The application is deployed in production on Oracle Cloud Infrastructure using an automated deployment pipeline.

### Deployment Flow

1. Push changes to repository
2. CI/CD pipeline executes build process
3. Application is deployed automatically to Oracle Cloud server
4. PM2 reloads the production process

### Production Stack

* Linux VPS on Oracle Cloud
* PM2 process manager
* Reverse proxy configuration
* Environment-based configuration
* Production PostgreSQL database

---

# Prerequisites

* Node.js (v18+ recommended)
* PostgreSQL
* RabbitMQ
* Cloudinary account
* PNPM

---

# Installation

## Clone the repository

```bash
git clone https://github.com/PatrickSchifter/task-manager.git
cd task-manager
```

## Install dependencies

```bash
pnpm install
```

## Configure environment variables

```bash
cp .env.example .env
```

Edit the `.env` file with your credentials.

---

# Environment Variables

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

---

# Available Scripts

```bash
pnpm start
pnpm start:dev
pnpm start:debug
pnpm start:prod

pnpm build

pnpm lint
pnpm format

pnpm test
pnpm test:watch
pnpm test:cov
pnpm test:e2e

pnpm prisma:generate
pnpm migrate:dev
pnpm migrate:deploy
```

---

# API Documentation

After starting the server:

* Swagger UI:

  * `http://localhost:${APP_PORT}/api`

* OpenAPI JSON:

  * `http://localhost:${APP_PORT}/api-json`

---

# Authentication

The API uses JWT Bearer authentication.

## Authentication Flow

### Register

```http
POST /auth/register
```

### Login

```http
POST /auth/login
```

Returns:

```json
{
  "access_token": "jwt_token"
}
```

### Authenticated Requests

```http
Authorization: Bearer <access_token>
```

---

# Modules Overview

## Auth

* Registration
* Login
* JWT management
* Password recovery

## Users

* Profile management
* Avatar uploads

## Projects

* CRUD operations
* Collaboration management

## Tasks

* Task lifecycle management
* Assignment system
* Status tracking

## Collaborators

* Permission-based collaboration

## Mail

* Async email processing
* Queue consumers
* Handlebars templates

---

# Development Guidelines

## Code Style

The project uses [Biome](https://biomejs.dev/?utm_source=chatgpt.com) for linting and formatting.

```bash
pnpm lint
pnpm format
```

---

## Testing

* Unit tests colocated with modules
* E2E tests in `/test`
* Jest testing environment configured

```bash
pnpm test
```

---

## Database

The application uses Prisma as ORM.

### Generate Prisma Client

```bash
pnpm prisma:generate
```

### Run Migrations

```bash
pnpm migrate:dev
```

---

# Roadmap / Future Improvements

* [ ] AI-powered semantic search with RAG
* [ ] Workspace contextual assistant
* [ ] Intelligent task recommendations
* [ ] Separate RabbitMQ consumer process
* [ ] Health checks with `@nestjs/terminus`
* [ ] Rate limiting on forgot-password route
* [ ] Correlation ID tracing
* [ ] Retry and DLQ strategy for RabbitMQ
* [ ] Seed scripts and fixtures
* [ ] Full collaborator permission guards

---

# Contributing

1. Fork the repository
2. Create a branch

```bash
git checkout -b feature/amazing-feature
```

3. Commit changes

```bash
git commit -m "Add amazing feature"
```

4. Push branch

```bash
git push origin feature/amazing-feature
```

5. Open a Pull Request

---

# License

MIT License

---

# Contact

Patrick Schifter

* Email:

  * `schiftercorp@outlook.com`

* GitHub:

  * [PatrickSchifter GitHub](https://github.com/PatrickSchifter?utm_source=chatgpt.com)

* Project Repository:

  * [Task Manager Repository](https://github.com/PatrickSchifter/task-manager?utm_source=chatgpt.com)
