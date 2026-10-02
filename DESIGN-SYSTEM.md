# Catchly Design System (v1.0)
> Core architectural foundations, tokens, components, and design rules for the Catchly Chrome Extension and Web App.

---

## 1. Core Principles
1. **Privacy by Architecture**: The interface communicates safety, transparency, and trust. No telemetry, no external database trackers.
2. **Tabular Numerics**: All currency amounts, renewal countdowns, timestamps, and statistics must use `font-variant-numeric: tabular-nums` in `JetBrains Mono` to prevent layout shift.
3. **Urgency with Restraint**: Hues are functional:
   - 🟢 **Safe** (`--ds-success`: `#12B76A`): &gt; 7 days until renewal.
   - 🟡 **Renewal Soon** (`--ds-warning`: `#F79009`): &le; 7 days until renewal.
   - 🔴 **Urgent / Free Trial Expiry** (`--ds-danger`: `#F04438`): &le; 2 days or converting trial.
4. **4px Spacing Grid**: All margins, paddings, gaps, and heights adhere to `4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px`.

---

## 2. Token Definitions

### Color Tokens
| Token | Light Value | Dark Value (Default) | Utility Value | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--canvas` / `--ds-bg` | `#FFFFFF` | `#090E17` | `#FAF7F2` | Root app background |
| `--surface` | `#F8F9FA` | `#0F1726` | `#FFFFFF` | Primary card background |
| `--surface-2` | `#F1F3F5` | `#162136` | `#F2EDE3` | Recessed/raised layer |
| `--surface-3` | `#E9ECEF` | `#1E2D48` | `#E8E2D5` | Popovers & dropdowns |
| `--ink` / `--ds-text` | `#0A1628` | `#F8FAFC` | `#15110C` | Primary high-contrast text |
| `--muted` | `#6B7689` | `#8896AB` | `#6E6557` | Secondary labels & metadata |
| `--border` | `#E3E8EF` | `#1E2B42` | `#E5DFD3` | Standard hairlines |
| `--border-strong` | `#CDD5DF` | `#2B3D5D` | `#C9C0AE` | Input borders & focus states |
| `--primary` | `#1B5BFF` | `#3875FF` | `#15110C` | Primary action buttons |
| `--accent` | `#F5D547` | `#F5D547` | `#F5D547` | Catchly Gold brand accent |
| `--success` | `#12B76A` | `#32D583` | `#12B76A` | Safe state (&gt;7d) |
| `--warning` | `#F79009` | `#FDB022` | `#F79009` | Renewal soon (&le;7d) |
| `--danger` | `#F04438` | `#F97066` | `#F04438` | Urgent / Trial expiring (&le;2d) |

### Typography Tokens
- **Primary UI**: `'Inter', system-ui, -apple-system, sans-serif`
  - Weights: `400` (Body), `500` (Labels/Meta), `600` (Headings/Buttons), `700` (Hero titles).
- **Tabular Mono**: `'JetBrains Mono', ui-monospace, Menlo, monospace`
  - Required for all prices, countdown pills, dates, and currency totals.

### Radii Tokens
- `--radius-input`: `6px` (form inputs, status pills, small tags)
- `--radius-card`: `10px` (subscription list items, alert boxes)
- `--radius-modal`: `16px` (drawers, dialogs, popovers)
- `--radius-pill`: `999px` (urgency countdowns, category filters)

### Motion & Timing
- `--dur-instant`: `80ms` (buttons, active press scale: `0.97`)
- `--dur-fast`: `140ms` (hover states, tooltips)
- `--dur-panel`: `220ms` (drawers, calendar slide-out)
- `--dur-toast`: `400ms` (in-page checkout capture toast)

---

## 3. Component Specs

### 1. Action Buttons
- Height: `38px` (standard) or `28px` (compact/table actions)
- Padding: `0 16px`
- Border radius: `6px`
- Active press: `transform: scale(0.97)`
- Single Primary CTA per view (Blue or Inverted Black).

### 2. Subscription Item Card
- Height: Auto (approx `62px`)
- Layout: 3-column flex (`[Merchant Logo/Monogram 34px] [Name + Cycle] [Price (Tabular) + Urgency Pill]`)
- Border: `1px solid var(--border)`
- Background: `var(--surface)`

### 3. In-Page Checkout Toast
- Position: Fixed bottom-right (`24px` from edges)
- Mount: Rendered inside an open `ShadowRoot` on `<catchly-toast-host>` to isolate host page stylesheets.
- Border-left: `4px solid var(--primary)`

---

## 4. Strict Design Rules

### ✅ DO
1. **Always use tabular figures** (`font-variant-numeric: tabular-nums`) on all monetary values and countdown numbers.
2. **Strictly restrict red/crimson** to urgent warnings (&le; 2 days) and expiring trials.
3. **Ensure dark mode depth** is achieved through the surface ladder (`#090E17` &rarr; `#0F1726` &rarr; `#162136` &rarr; `#1E2D48`) and hairlines, not heavy blur shadows.
4. **Follow the 4px spacing grid** without introducing random margin/padding values.

### ❌ DON'T
1. **Never use bright brand colors on full card backgrounds** — background surfaces must stay calm and neutral.
2. **Never round corners inconsistently** — stick to `6px` (inputs/tags), `10px` (cards), and `16px` (drawers).
3. **Never transmit private subscription data** to any external server or telemetry collector.
