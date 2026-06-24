# Style 04 Control-Room UI Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Apply the approved Style 04 “Playful Learning Studio” visual treatment to the real Kafka Playground Next.js UI while preserving the same control-room layout approved in `docs/design/kafka-playground-control-room-style-04.html`.

**Architecture:** Keep the existing React component hierarchy and grid layout. Add a small reusable style system in `globals.css` and lightweight UI primitives, then update the current page components to use those tokens and primitives. Do not change backend APIs, Kafka runtime behavior, scenario state, SSE behavior, or route structure.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, TypeScript, Vitest, Playwright, existing `@kplay/*` workspaces.

**Approved Reference Mock:** `docs/design/kafka-playground-control-room-style-04.html`

**Implementation Target:** `apps/web/`

---

## Current State

The current app already has the correct high-level scenario layout in `apps/web/components/playground-workspace.tsx`:

- topbar
- utility rail
- scenario sidebar
- central topology canvas
- right message inspector
- bottom scenario console
- bottom-right event timeline

The approved mock keeps that structure but changes visual style to:

- warm cream / mint / sky palette
- chunky teal borders
- playful rounded cards
- soft dotted canvas
- bright partition/message chips
- coaching-friendly status and explanation cards

Current app styling is mostly inline Tailwind classes. The implementation should avoid copy-pasting massive class strings by introducing reusable semantic CSS classes and small primitives.

---

## Non-Goals

Do **not** change:

- API route behavior under `apps/web/app/api/v1/`
- runtime or Kafka adapters
- scenario-engine contracts
- SSE event handling
- message/event reducer behavior
- route paths
- layout topology of the approved mock

Do **not** add:

- new external UI libraries
- new package dependencies
- query-flagged alternate UI modes
- dark/light theme switching as a blocker

The Style 04 UI should become the default visual direction for the scenario page.

---

## Acceptance Criteria

The implementation is complete when:

1. `/scenarios/partitioning` visually matches the approved Style 04 control-room mock in layout and tone.
2. The layout still works before a run starts and after a run exists.
3. The app passes:

```bash
npm run typecheck
npm run lint
npm test
```

4. Demo server renders the page:

```bash
npm run dev:demo
```

5. Chromium screenshots can be captured for:

```text
http://127.0.0.1:3000/scenarios/partitioning
http://127.0.0.1:3000/
```

6. `git status --short` only shows intentional app/design changes.

---

## Task 1: Add Style 04 design tokens and semantic CSS classes

**Objective:** Establish reusable Style 04 tokens/classes in global CSS so component updates are maintainable.

**Files:**

- Modify: `apps/web/app/globals.css`

**Step 1: Replace/extend root tokens**

Add Style 04 tokens while keeping legacy variable names available:

```css
:root {
  color-scheme: light;
  --background: #fff7ed;
  --foreground: #123047;
  --muted: #466778;
  --panel: #fffdf5;
  --panel-strong: #ffffff;
  --border: #0f766e;
  --accent: #0ea5e9;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #e11d48;

  --kplay-bg: #fff7ed;
  --kplay-bg-soft: #ecfeff;
  --kplay-panel: #fffdf5;
  --kplay-panel-mint: #ccfbf1;
  --kplay-panel-sky: #eff6ff;
  --kplay-panel-violet: #f5f3ff;
  --kplay-panel-warn: #fef3c7;
  --kplay-border: #0f766e;
  --kplay-text: #123047;
  --kplay-muted: #466778;
  --kplay-soft: #60798d;
  --kplay-sky: #0ea5e9;
  --kplay-mint: #10b981;
  --kplay-violet: #8b5cf6;
  --kplay-pink: #fb7185;
  --kplay-amber: #f59e0b;
  --kplay-shadow: 7px 7px 0 rgba(15, 118, 110, 0.14);
  --kplay-shadow-strong: 12px 12px 0 rgba(15, 118, 110, 0.22);
}
```

**Step 2: Update base page background**

Set `html, body` and `body` to the approved warm/mint background:

```css
html,
body {
  min-height: 100%;
  background:
    radial-gradient(circle at 18% 8%, rgba(251, 113, 133, 0.16), transparent 28rem),
    radial-gradient(circle at 82% 18%, rgba(45, 212, 191, 0.20), transparent 30rem),
    linear-gradient(135deg, #fff7ed, #ecfeff 62%, #eff6ff);
  color: var(--kplay-text);
}

body {
  margin: 0;
  font-family: "Nunito Sans", "Aptos", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}
```

**Step 3: Add semantic utility classes**

Add reusable classes copied conceptually from the approved mock:

```css
.kplay-shell {
  background: var(--kplay-panel);
  color: var(--kplay-text);
}

.kplay-chunky-border {
  border: 3px solid var(--kplay-border);
  box-shadow: var(--kplay-shadow);
}

.kplay-card {
  border: 3px solid var(--kplay-border);
  border-radius: 16px;
  background: var(--kplay-panel);
  box-shadow: var(--kplay-shadow);
  color: var(--kplay-text);
}

.kplay-card-mint {
  border: 3px solid var(--kplay-border);
  border-radius: 16px;
  background: var(--kplay-panel-mint);
  box-shadow: var(--kplay-shadow);
  color: #115e59;
}

.kplay-card-sky {
  border: 3px solid var(--kplay-sky);
  border-radius: 16px;
  background: #ecfeff;
  box-shadow: var(--kplay-shadow);
  color: var(--kplay-text);
}

.kplay-card-warn {
  border: 3px solid var(--kplay-amber);
  border-radius: 16px;
  background: var(--kplay-panel-warn);
  color: #78350f;
}

.kplay-section-title {
  color: var(--kplay-border);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.kplay-grid-bg {
  background:
    radial-gradient(circle, rgba(14, 165, 233, 0.35) 2px, transparent 3px),
    linear-gradient(180deg, #f8fafc, #ecfeff);
  background-size: 28px 28px, 100% 100%;
}
```

**Step 4: Verify CSS compiles**

Run:

```bash
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style: add playful Kafka UI design tokens"
```

---

## Task 2: Upgrade shared Button styling for Style 04

**Objective:** Make existing buttons match the playful chunky visual style without changing call sites.

**Files:**

- Modify: `apps/web/components/ui/button.tsx`

**Step 1: Update base button classes**

Replace the current class set with Style 04-friendly variants:

```tsx
export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 px-3 py-2 text-sm font-extrabold transition focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "border-teal-700 bg-teal-700 text-white shadow-[4px_4px_0_rgba(15,118,110,0.18)] hover:bg-teal-800",
        variant === "secondary" && "border-teal-700 bg-[#fffdf5] text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.14)] hover:bg-teal-50",
        variant === "danger" && "border-rose-700 bg-rose-100 text-rose-800 shadow-[4px_4px_0_rgba(190,18,60,0.14)] hover:bg-rose-200",
        variant === "ghost" && "border-teal-700 bg-transparent text-teal-800 hover:bg-teal-50",
        className
      )}
      {...props}
    />
  );
}
```

**Step 2: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/web/components/ui/button.tsx
git commit -m "style: restyle shared buttons for playful UI"
```

---

## Task 3: Restyle the workspace shell/topbar/rail/sidebar

**Objective:** Apply the approved Style 04 shell while preserving the existing grid layout in `PlaygroundWorkspace`.

**Files:**

- Modify: `apps/web/components/playground-workspace.tsx`
- Modify: `apps/web/components/education/education-panel.tsx`

**Step 1: Remove theme-dependent dark wrapper**

The current root uses `theme === "dark" ? ... : ...`. For this approved design, make the scenario shell visually stable:

```tsx
<main className="min-h-screen overflow-auto bg-[var(--kplay-bg)] text-[var(--kplay-text)] lg:h-screen lg:overflow-hidden">
```

Keep `toggleTheme` logic untouched for now, but do not let it change the approved page styling in this wave.

**Step 2: Restyle topbar**

Use cream background, teal border, and chunky brand mark:

```tsx
<header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b-[3px] border-teal-700 bg-[#fff7ed] px-3 py-3 sm:px-5 lg:h-16 lg:flex-nowrap lg:py-0">
```

Brand mark:

```tsx
<div className="grid size-10 shrink-0 place-items-center rounded-2xl border-[3px] border-teal-700 bg-amber-200 text-teal-700 shadow-[5px_5px_0_rgba(15,118,110,0.18)]">
  <Network size={24} strokeWidth={2.4} aria-hidden />
</div>
```

Title text:

```tsx
<h1 className="max-w-44 truncate text-base font-extrabold tracking-tight text-[#123047] sm:max-w-none sm:text-lg">
```

**Step 3: Restyle status areas**

Update `StatusPill` in `playground-workspace.tsx` to use Style 04 colors:

```tsx
function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" | "sky" | "slate" }) {
  const color = {
    green: "border-emerald-500 bg-emerald-100 text-emerald-800",
    amber: "border-amber-500 bg-amber-100 text-amber-800",
    sky: "border-teal-700 bg-teal-100 text-teal-800",
    slate: "border-teal-700 bg-[#fffdf5] text-teal-800"
  }[tone];
  return <span className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${color}`}>{label}</span>;
}
```

**Step 4: Keep the grid layout exactly the same**

Do not change this grid structure unless needed for responsive fixes:

```tsx
lg:grid-cols-[60px_260px_minmax(680px,1fr)_360px]
lg:grid-rows-[minmax(0,1fr)_340px]
```

Only update colors/borders/backgrounds.

**Step 5: Restyle rail**

In `UtilityRail`, make active buttons mint + chunky border:

```tsx
<nav className="flex items-center gap-2 border-b-[3px] border-teal-700 bg-[#ecfeff] px-2 py-2 text-teal-700 lg:row-span-2 lg:flex-col lg:border-b-0 lg:border-r-[3px] lg:px-1.5 lg:py-4">
```

Active button:

```tsx
item.active ? "bg-teal-100 text-teal-800 shadow-[inset_0_0_0_2px_#0f766e,4px_4px_0_rgba(15,118,110,0.16)]" : "hover:bg-teal-50 hover:text-teal-900"
```

**Step 6: Restyle scenario sidebar cards**

In `ScenarioSidebar`, update primary card to mint and future cards to cream:

- Primary card: `border-[3px] border-teal-700 bg-teal-100 shadow-[7px_7px_0_rgba(15,118,110,0.14)]`
- Future cards: `border-[3px] border-teal-700 bg-[#fffdf5] text-slate-600`
- Section titles: use `kplay-section-title` or `text-teal-700`.

**Step 7: Restyle `EducationPanel`**

Replace dark slate classes with:

```tsx
<section className="mt-4 rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-4 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
  <h2 className="kplay-section-title">What you are seeing</h2>
  <p className="mt-3 text-sm leading-6 text-[#31566a]">{text}</p>
</section>
```

**Step 8: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 9: Commit**

```bash
git add apps/web/components/playground-workspace.tsx apps/web/components/education/education-panel.tsx
git commit -m "style: apply playful shell and scenario sidebar"
```

---

## Task 4: Restyle topology canvas and Kafka visualization cards

**Objective:** Make the central topology match the approved Style 04 canvas while keeping the current component structure and interactions.

**Files:**

- Modify: `apps/web/components/topology/kafka-topology.tsx`

**Step 1: Update canvas root**

Replace the dark root with the semantic grid class:

```tsx
<div className="kplay-grid-bg relative min-h-[560px] overflow-hidden lg:h-full lg:min-h-0">
```

**Step 2: Restyle toolbar controls**

Use teal chunky buttons:

```tsx
<button className="inline-flex h-8 items-center gap-2 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-3 text-xs font-extrabold text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.16)]">
```

Apply the same treatment to zoom and fit controls.

**Step 3: Restyle producer/topic/consumer cards**

Producer card root:

```tsx
<section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-5 text-center shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
```

Producer icon:

```tsx
<div className="mx-auto grid size-14 place-items-center rounded-2xl border-[3px] border-teal-700 bg-amber-200 text-teal-700 shadow-[5px_5px_0_rgba(15,118,110,0.18)]">
```

Topic card:

```tsx
<section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
```

Consumer group card: same as topic card.

**Step 4: Restyle partition lanes**

In `PartitionLane`, use sky/violet lanes:

```tsx
<div className={partition === 0
  ? "rounded-2xl border-[3px] border-sky-500 bg-sky-50 p-2"
  : "rounded-2xl border-[3px] border-violet-500 bg-violet-50 p-2"}
>
```

Message chips:

```tsx
selectedMessageId === message.messageId
  ? "border-rose-700 bg-rose-400 text-white shadow-[0_0_0_5px_rgba(251,113,133,0.16)]"
  : partition === 0
    ? "border-teal-700 bg-teal-100 text-teal-800"
    : "border-violet-500 bg-violet-100 text-violet-800"
```

Include `border-2 rounded-xl` in the base chip class.

**Step 5: Restyle consumers**

Active consumer:

```tsx
border-emerald-500 bg-emerald-100 text-[#123047]
```

Idle/rebalance consumer:

```tsx
border-amber-500 bg-amber-100 text-[#123047]
```

**Step 6: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/web/components/topology/kafka-topology.tsx
git commit -m "style: restyle Kafka topology canvas"
```

---

## Task 5: Restyle message inspector to match lifecycle cards

**Objective:** Apply Style 04 to the right inspector while keeping the current message/event data rendering.

**Files:**

- Modify: `apps/web/components/inspector/inspector-panel.tsx`

**Step 1: Restyle inspector shell/header**

Root stays flex column. Header becomes cream + teal:

```tsx
<header className="flex items-center justify-between border-b-[3px] border-teal-700 bg-[#fff7ed] px-5 py-4">
  <h2 className="kplay-section-title">Message Inspector</h2>
```

**Step 2: Restyle selected message section**

Use sky card:

```tsx
<section className="border-b-[3px] border-teal-700 p-5">
  ...
  <div className="rounded-2xl border-[3px] border-sky-500 bg-sky-50 px-3 py-2 text-sm font-extrabold text-[#123047] shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
```

**Step 3: Restyle overview and commit details**

Use text colors:

- labels: `text-[#466778]`
- values: `text-[#123047]`
- success: `text-emerald-700 font-extrabold`

**Step 4: Restyle `StateStep`**

Use larger colored dots/icons if possible while keeping current lucide icons:

- done: `text-emerald-600`
- active: `text-amber-500`
- inactive: `text-slate-500`
- label text: `text-[#123047]`
- detail: `text-[#466778]`

**Step 5: Payload/raw details**

If keeping JSON payload text in future, use:

```tsx
className="rounded-xl bg-slate-50 p-3 font-mono text-xs text-[#123047]"
```

Do not add payload rendering in this task unless it already exists in the component.

**Step 6: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/web/components/inspector/inspector-panel.tsx
git commit -m "style: restyle message lifecycle inspector"
```

---

## Task 6: Restyle scenario console controls

**Objective:** Apply Style 04 to the bottom controls while preserving all existing button callbacks and form controls.

**Files:**

- Modify: `apps/web/components/controls/controls-panel.tsx`

**Step 1: Update root control deck**

Replace dark container class with:

```tsx
<div className="mx-3 mt-3 grid grid-cols-1 gap-3 rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)] sm:grid-cols-2 lg:grid-cols-[260px_90px_120px_110px_minmax(130px,1fr)]">
```

**Step 2: Update section dividers**

Replace slate borders with teal:

- `border-slate-700` → `border-teal-700`
- `text-slate-500` labels → `text-teal-700`
- `text-slate-400` helper text → `text-[#466778]`

**Step 3: Restyle inputs/selects**

Use cream backgrounds and teal borders:

```tsx
className="mb-2 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1.5 text-sm font-semibold text-[#123047]"
```

Range inputs:

```tsx
className="w-full accent-sky-500"
```

**Step 4: Use button variants intentionally**

- Start / Produce one / Add consumer: `variant="primary"`
- Pause / Stop / Stop consumer: `secondary` or `danger` for destructive stop if appropriate

Do not change callback wiring.

**Step 5: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/web/components/controls/controls-panel.tsx
git commit -m "style: restyle scenario console controls"
```

---

## Task 7: Restyle event timeline as playful event stream

**Objective:** Make the event timeline readable in the narrow right-bottom column using the approved light cards and badges.

**Files:**

- Modify: `apps/web/components/timeline/event-timeline.tsx`

**Step 1: Restyle filter bar**

Root filter bar:

```tsx
<div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border-[3px] border-teal-700 bg-[#fff7ed] px-3 py-1.5">
```

Active filter button:

```tsx
"inline-flex items-center gap-2 rounded-full border-2 border-sky-500 bg-sky-100 px-2 py-1 text-xs font-extrabold text-sky-800"
```

Inactive filter button:

```tsx
"inline-flex items-center gap-2 rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 text-xs font-extrabold text-teal-800 hover:bg-teal-50"
```

**Step 2: Restyle timeline container**

```tsx
<div className="min-h-0 flex-1 overflow-auto rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]">
```

**Step 3: Keep table grid or convert to card stream**

Preferred for narrow column: keep current row data but style each row like a compact card:

```tsx
className="grid min-w-[760px] grid-cols-[120px_160px_190px_minmax(260px,1fr)] border-b-[3px] border-teal-700 px-4 py-2 text-left text-xs text-[#123047] hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-200"
```

If horizontal scrolling is visually poor after screenshot review, convert rows to a stacked event-card layout in a follow-up task.

**Step 4: Update tone dots**

Keep current `filterTone`, but use brighter accessible colors if needed:

```tsx
Messages: "bg-sky-500"
Rebalances: "bg-amber-500"
Commits: "bg-emerald-500"
Lifecycle: "bg-cyan-500"
Cleanup: "bg-violet-500"
Errors: "bg-rose-500"
```

**Step 5: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/web/components/timeline/event-timeline.tsx
git commit -m "style: restyle event timeline"
```

---

## Task 8: Restyle empty/start-run state

**Objective:** Make the no-run state match the Style 04 visual system.

**Files:**

- Modify: `apps/web/components/playground-workspace.tsx`

**Step 1: Update empty-state panel**

In the `!run` branch, keep `kplay-grid-bg` but restyle the content:

```tsx
<div className="kplay-grid-bg flex h-full items-center justify-center p-10">
  <div className="max-w-xl rounded-3xl border-[3px] border-teal-700 bg-[#fffdf5] p-8 text-center shadow-[12px_12px_0_rgba(15,118,110,0.22)]">
```

Heading:

```tsx
<h2 className="text-2xl font-extrabold text-[#123047]">Start a scenario run</h2>
```

Paragraph:

```tsx
<p className="mt-3 text-sm leading-6 text-[#466778]">
```

**Step 2: Restyle `ConnectionNotice`**

Use amber card:

```tsx
<div className="mt-5 rounded-2xl border-[3px] border-amber-500 bg-amber-100 p-3 text-left text-sm text-amber-900 shadow-[7px_7px_0_rgba(245,158,11,0.18)]">
```

**Step 3: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/web/components/playground-workspace.tsx
git commit -m "style: restyle scenario empty state"
```

---

## Task 9: Apply related landing page styling

**Objective:** Make `/` feel compatible with the new scenario page without overhauling its content.

**Files:**

- Modify: `apps/web/app/page.tsx`

**Step 1: Update root background**

Use the same warm/mint background:

```tsx
<main className="min-h-screen bg-[var(--kplay-bg)] px-6 py-8 text-[var(--kplay-text)]">
```

**Step 2: Restyle header CTA**

Use shared playful button-like Link classes:

```tsx
className="inline-flex items-center gap-2 rounded-xl border-2 border-teal-700 bg-teal-700 px-4 py-2 text-sm font-extrabold text-white shadow-[4px_4px_0_rgba(15,118,110,0.18)] transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-sky-200"
```

**Step 3: Restyle cards**

Primary card:

```tsx
className="group rounded-2xl border-[3px] border-teal-700 bg-teal-100 p-6 shadow-[7px_7px_0_rgba(15,118,110,0.14)] transition hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-sky-200"
```

Runtime/future cards:

```tsx
className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-6 shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
```

**Step 4: Run checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "style: align landing page with playful UI"
```

---

## Task 10: Browser verification and screenshot capture

**Objective:** Verify the implemented UI in the actual app, not just TypeScript/lint.

**Files:**

- No source file changes expected.
- Create screenshots only if useful for review, under `docs/design/implementation-previews/`.

**Step 1: Run full checks**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all pass.

**Step 2: Start demo server**

```bash
npm run dev:demo
```

Use a tracked background process if running through Hermes.

**Step 3: Verify HTTP responses**

```bash
curl -sS -o /tmp/kplay-home.html -w 'home=%{http_code}\n' http://127.0.0.1:3000/
curl -sS -o /tmp/kplay-scenario.html -w 'scenario=%{http_code}\n' http://127.0.0.1:3000/scenarios/partitioning
```

Expected:

```text
home=200
scenario=200
```

**Step 4: Capture screenshots**

```bash
mkdir -p docs/design/implementation-previews
chromium --headless --no-sandbox --disable-gpu --window-size=1680,1100 \
  --screenshot=docs/design/implementation-previews/scenario-style-04.png \
  http://127.0.0.1:3000/scenarios/partitioning
chromium --headless --no-sandbox --disable-gpu --window-size=1440,1000 \
  --screenshot=docs/design/implementation-previews/home-style-04.png \
  http://127.0.0.1:3000/
```

Expected: both PNG files exist and are non-empty.

**Step 5: Visual review checklist**

Compare `scenario-style-04.png` against:

```text
docs/design/previews/kafka-playground-control-room-style-04-full.png
```

Check:

- same layout skeleton
- no dark-theme leftovers
- readable right inspector
- readable controls and timeline
- no low-contrast text on mint/cream backgrounds
- no clipped topbar content at 1680px width
- mobile/tablet not broken below desktop widths

**Step 6: Stop demo server**

Stop the background process cleanly.

**Step 7: Commit screenshots if desired**

If screenshots are useful for review:

```bash
git add docs/design/implementation-previews/
git commit -m "docs: add style 04 implementation previews"
```

Otherwise leave screenshots uncommitted or delete them.

---

## Task 11: Final cleanup and documentation update

**Objective:** Ensure the repo is clean and document the approved direction.

**Files:**

- Modify: `README.md` only if adding a screenshot note is desired.
- Modify/Create: `docs/design/style-04-implementation-notes.md` only if there are implementation deviations from the mock.

**Step 1: Check repo status**

```bash
git status --short
```

Expected: only intentional files are modified.

Note: if `mockups/kafka-ui-mockup.html` shows as deleted and that deletion was not intentional, restore it:

```bash
git checkout -- mockups/kafka-ui-mockup.html
```

**Step 2: Run final quality gates**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: PASS.

**Step 3: Final commit**

If any cleanup/docs files remain:

```bash
git add README.md docs/design/style-04-implementation-notes.md
 git commit -m "docs: document style 04 UI direction"
```

Skip this commit if there are no docs changes.

---

## Rollback Plan

If the visual conversion causes regressions:

1. Revert the most recent styling commit:

```bash
git revert <commit_sha>
```

2. Re-run:

```bash
npm run typecheck
npm run lint
npm test
```

3. If only one component is problematic, revert that component’s task commit instead of the whole wave.

---

## Implementation Notes

- Prefer semantic classes from `globals.css` for repeated styles.
- Keep layout grid dimensions stable until screenshot review proves a change is needed.
- Avoid introducing `?newui=1` or alternate UI flags.
- Keep all existing state and API logic intact.
- Treat screenshots as required verification, not optional polish.
- If browser tooling fails, use local Chromium headless as done for the approved mock.

---

## Suggested Execution Strategy

Implement in three reviewable chunks:

1. **Foundation:** Tasks 1–2
2. **Scenario page:** Tasks 3–8
3. **Landing + verification:** Tasks 9–11

After each chunk, run:

```bash
npm run typecheck
npm run lint
```

After the scenario page chunk, also capture a screenshot before moving to landing page work.
