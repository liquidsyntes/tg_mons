# UI / Design Guidelines

## Border Radius (Rounded Corners)
- Across the entire project, the default border radius for cards, widgets, and charts is strictly **3px**.
- Tailwind classes like `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, etc., have been globally overridden in `tailwind.config.js` to equal 3px. You should continue using these standard Tailwind classes (e.g. `rounded-2xl` for widgets) – they will automatically apply the correct 3px radius.
- For Recharts components (like `<Bar>`), manually set the radius to 3px (e.g., `radius={[3, 3, 0, 0]}`).
- **Exceptions**: Fully rounded elements like avatars or status dots should continue to use `rounded-full` (which remains 9999px). Do not change these to 3px.

## Prisma / Database
- **IMPORTANT**: On Windows, a Next.js dev server or worker from this checkout can lock Prisma Query Engine and cause `prisma generate` to fail with `EPERM`. Identify the locking process before stopping only that process; do not stop unrelated Node.js applications.
- You can kill these processes safely by finding `node` processes associated with this workspace (`Get-Process node | ...`) and running `Stop-Process`.

## Workspace Location (Расположение проекта)
- **CRITICAL**: Основной проект находится в C:\TgMon. Даже если система создала для вас изолированный worktree, вы ОБЯЗАНЫ выполнять все изменения файлов и консольные команды напрямую в C:\TgMon. Этот проект работает локально из этой папки (через Docker и т.д.), и изменения во временных worktree не будут видны пользователю.

## Docker & Local Development
- **Dev Environment**: The `docker-compose.yml` and `Dockerfile.web` are configured for a **production** build. For local development with Hot Reload, you MUST run the `web` container inside Docker. Use the provided override file by running `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`. This will mount the source code as a volume and run `npm run dev` so changes are instantly reflected in the container. Do NOT run `npm run dev` locally on the host machine.

## Documentation Generation
- Use the following specialized skills when they are available and relevant to documentation, diagrams, or architectural records:
  - `mermaid-expert` (for diagrams and charts)
  - `docs-architect` (for holistic codebase documentation)
  - `api-documenter` (for API specs and OpenAPI)
  - `architecture-decision-records` (for ADRs)
  - `c4-architecture-c4-architecture` (for C4 models)
  - `reference-builder` (for exhaustive references)
  - `code-documentation-code-explain` (for complex code explanations and tutorials)
- If a listed skill is unavailable, verify documentation against the current code, links, encoding and diff directly. An unavailable optional skill does not block a documentation task.
