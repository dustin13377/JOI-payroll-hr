# JOI Payroll & HR

Internal payroll and HR management app for Just Outsource It.

## Stack

Vite + React + TypeScript + Supabase + Tailwind CSS + shadcn/ui

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
git clone https://github.com/sandoval-art/JOI-payroll-hr.git
cd JOI-payroll-hr
npm install
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the Supabase dashboard
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

## Further reading

See [HANDOFF.md](./HANDOFF.md) for architecture details, database migrations, and deployment notes.
- **Recruiting** — see [`docs/recruiting-mvp-handoff.md`](docs/recruiting-mvp-handoff.md)
