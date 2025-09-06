# Office Football Pool

A service that ingests picksheet-style text and compares it against live market odds, surfacing figures and KPIs about discrepancies.

## Setup Instructions

### 1. Database Setup

Apply the database migrations to your Supabase project:

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to your project (eoslblqescncxcypkmvj)
3. Go to SQL Editor
4. Run the migrations in order:
   - First run: `supabase/migrations/001_initial_schema.sql`
   - Then run: `supabase/migrations/002_rls_policies.sql`

### 2. Environment Variables

The `.env` file is already configured with your Supabase credentials.

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000 to see the application.

## Project Structure

- `src/lib/` - Utility functions and Supabase client
- `src/types/` - TypeScript type definitions
- `src/services/` - Business logic and API integrations
- `src/components/` - React components
- `src/app/` - Next.js app router pages
- `supabase/migrations/` - Database schema and RLS policies

## Task Management

This project uses Task Master AI for task tracking. Use these commands:

```bash
# View next task
task-master next

# View all tasks
task-master list

# Mark task complete
task-master set-status --id=<id> --status=done
```

## API Keys Required

- ✅ Supabase (configured)
- ✅ The Odds API (configured)
- ✅ OpenAI API (configured for LLM matching)