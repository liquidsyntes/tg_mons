# UI / Design Guidelines

## Border Radius (Rounded Corners)
- Across the entire project, the default border radius for cards, widgets, and charts is strictly **3px**.
- Tailwind classes like `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, etc., have been globally overridden in `tailwind.config.js` to equal 3px. You should continue using these standard Tailwind classes (e.g. `rounded-2xl` for widgets) – they will automatically apply the correct 3px radius.
- For Recharts components (like `<Bar>`), manually set the radius to 3px (e.g., `radius={[3, 3, 0, 0]}`).
- **Exceptions**: Fully rounded elements like avatars or status dots should continue to use `rounded-full` (which remains 9999px). Do not change these to 3px.

## Prisma / Database
- **IMPORTANT**: On Windows, when running `npx prisma generate` after changing `schema.prisma`, you MUST first stop any running `node` processes that could be locking the Prisma engine (such as the Next.js dev server or background workers). If you do not stop them, `prisma generate` will fail with an EPERM file-locking error and typings will silently degrade to `any`.
- You can kill these processes safely by finding `node` processes associated with this workspace (`Get-Process node | ...`) and running `Stop-Process`.


## Workspace Location (Расположение проекта)
- **CRITICAL**: Основной проект находится в C:\TgMon. Даже если система создала для вас изолированный worktree, вы ОБЯЗАНЫ выполнять все изменения файлов и консольные команды напрямую в C:\TgMon. Этот проект работает локально из этой папки (через Docker и т.д.), и изменения во временных worktree не будут видны пользователю.

## Docker & Local Development
- **Dev Environment**: The \docker-compose.yml\ and \Dockerfile.web\ are configured for a **production** build. For local development with Hot Reload, do NOT run the \web\ container in Docker. Instead, run the database and worker via Docker (\docker-compose up -d postgres worker\), and run the Next.js web application locally on the host machine using \
pm run dev\.

