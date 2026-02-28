# ENVOY Platform - Backend Foundation

This is the backend foundation for the ENVOY platform.

## Setup Instructions

1. **Database Setup (Local Development)**
   - Ensure Docker is installed.
   - Run `docker-compose up -d` to start the PostgreSQL database.
   - The database will be initialized with the schema in `src/db/schema.sql`.

2. **Environment Variables**
   - Copy `.env.example` to `.env`.
   - Configure your database connection details if different from the defaults.

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Seed Data**
   ```bash
   npm run seed
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /api/intelligence` - Paginated intelligence feed.
- `GET /api/inbox` - Priority inbox items.
- `POST /api/inbox/:id/approve` - Approve an inbox item.
- `GET /api/matches` - Trade matchmaking recommendations.
- `POST /api/matches/:id/approve` - Approve a match.
- `GET /api/delegation/:id` - Full delegation details.
- `GET /api/tasks` - Agent task queue.
- `POST /api/tasks` - Commission a new task.
- `GET /api/agents/status` - Live status of all agents.

## Security & Constraints

- **Audit Log**: Append-only table. Updates and deletions are blocked at the database level.
- **Human-in-the-Loop**: All consequential actions require explicit approval via `/approve` endpoints.
- **Data Sovereignty**: Designed for deployment in sovereign cloud or on-premise environments.
