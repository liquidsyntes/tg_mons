# UI / Design Guidelines

## Border Radius (Rounded Corners)
- Across the entire project, the default border radius for cards, widgets, and charts is strictly **3px**.
- Tailwind classes like `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, etc., have been globally overridden in `tailwind.config.js` to equal 3px. You should continue using these standard Tailwind classes (e.g. `rounded-2xl` for widgets) – they will automatically apply the correct 3px radius.
- For Recharts components (like `<Bar>`), manually set the radius to 3px (e.g., `radius={[3, 3, 0, 0]}`).
- **Exceptions**: Fully rounded elements like avatars or status dots should continue to use `rounded-full` (which remains 9999px). Do not change these to 3px.
