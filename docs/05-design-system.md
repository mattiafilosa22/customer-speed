# 05 — Design system, tema e personalizzazione

> Allineato al wireframe di riferimento `back-office-wireframe.html` (fornito dal committente). Da quel file derivano **tipografia, token, palette e i controlli di personalizzazione white-label**. Il wireframe mostra un altro prodotto (back-office AI), ma ne adottiamo **lo stile**; il **layout funzionale** del CRM segue gli screenshot (sidebar scura, KPI, kanban, ecc.). I due si conciliano: tutto passa da token, quindi la sidebar può essere chiara o scura via configurazione.

## 5.1 Principio: tutto passa da token

Nessun valore di stile hard-coded. Tutti i valori vivono come **CSS custom properties** su `:root`, **sovrascrivibili per tenant** iniettando le variabili da `Organization.theme` (JSON) lato server. Tailwind va configurato perché le utility puntino a queste variabili.

Il wireframe dimostra il pattern white-label: cambiando `--accent` e `--radius` a runtime, **l'intera UI si aggiorna**. Riproduciamo lo stesso meccanismo nel pannello "Aspetto & brand" (vedi §5.4).

## 5.2 Tipografia (dal wireframe)

Tre famiglie, caricate da Google Fonts:

```css
--f-display: 'Bebas Neue', Impact, Haettenschweiler, sans-serif;  /* titoli, KPI, brand */
--f-body:    'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; /* testo, controlli */
--f-mono:    'IBM Plex Mono', ui-monospace, Menlo, monospace;     /* label, breadcrumb, header tabella, tag */
```

Regole d'uso:
- **Titoli** (`h1,h2,h3`), numeri KPI e brand → `--f-display`, `font-weight:400`, `letter-spacing:.02–.04em`. `h1` ~27px, `h3` ~16px uppercase.
- **Body** → `--f-body`, base **13.5px**, `line-height:1.55`, `-webkit-font-smoothing:antialiased`.
- **Piccoli controlli** (bottoni, voci nav, header chat) → tenere `--f-body` per leggibilità (no display), come fa il wireframe.
- **Label di form, breadcrumb, header tabella, tag** → `--f-mono`, ~11px, `text-transform:uppercase`, `letter-spacing:.05–.06em`, colore muted.

> La tipografia è **selezionabile** dal pannello brand: `Bebas Neue + Montserrat (default)`, `Inter`, `Manrope`, `System UI`. Verificare che ogni opzione resti accessibile (vedi §5.6).

## 5.3 Token (default dal wireframe)

### Colori — base
```css
:root{
  --accent:#5b5bd6;        /* indigo raffinato — azioni primarie */
  --accent-ink:#4a48c4;    /* hover/pressed */
  --accent-soft: color-mix(in srgb, var(--accent) 9%, #fff);  /* sfondi soft, pill */

  --bg:#f7f7f9;            /* sfondo app */
  --panel:#ffffff;         /* card / superfici */
  --ink:#1c1c22;           /* testo principale */
  --muted:#6e6e79;         /* testo secondario — AA su panel (5.04:1) e bg (4.71:1) */
  --line:#ececef;          /* bordi */
  --line2:#f3f3f5;         /* bordi tenui / separatori tabella */

  /* accenti semantici di dominio (riusabili per gli stage) */
  --ok:#16a34a;            /* successo */
  --warn:#d97706;          /* attenzione */
  --doc:#0d9488;  --doc-soft: color-mix(in srgb,#0d9488 10%,#fff);   /* teal */
  --exec:#db2777; --exec-soft: color-mix(in srgb,#db2777 10%,#fff);  /* magenta/rosa */
}
```

### Forma, ombre, layout
```css
--radius:12px;             /* raggio base — controllato da slider (0–22px) */
/* input usano calc(var(--radius) - 4px); bottoni/nav 8px; pill 20px */
--sidebar:248px;
--sh-sm:0 1px 2px rgba(18,18,30,.05);
--sh:0 1px 2px rgba(18,18,30,.04),0 4px 14px rgba(18,18,30,.06);
```

### Colori stage pipeline
Gli stage del CRM riusano la logica "pill soft" del wireframe (sfondo a bassa saturazione + testo nella stessa tinta). Per WCAG AA (testo piccolo ≥4.5:1) il testo del pill è la tinta **scurita verso il nero** di `--pill-ink-darken` (light 45%, dark 0%) sul fondo soft al 12% — derivata dallo stesso token `--stage-*`/semantico, quindi resta theme-driven e ricolorabile per tenant. Token dedicati, allineati ai colori degli screenshot:
```css
--stage-to-handle:#8c8c97;        /* grigio (muted) */
--stage-taken:#5b5bd6;            /* indigo accent */
--stage-call-scheduled:#0ea5e9;   /* azzurro */
--stage-waiting-docs:#d97706;     /* arancio (warn) */
--stage-presentation:#7a4e9e;     /* viola */
--stage-waiting-decision:#db2777; /* rosa (exec) */
--stage-waiting-payment:#0d9488;  /* teal (doc) */
--stage-won:#16a34a;              /* verde (ok) */
--stage-lost:#e5533b;             /* rosso */
```

## 5.4 Pannello di personalizzazione white-label ("Aspetto & brand")

Riprodurre i controlli del wireframe (sezione "Aspetto & brand"), con **anteprima live**. Tutti i valori salvati in `Organization.theme`.

**Brand**
- Nome piattaforma (`appName`) — aggiorna logo testuale in sidebar/login.
- Logo (upload PNG/SVG) + **sigla/mark fallback** (max 3 caratteri) + favicon.

**Tema & colori**
- **Colore primario**: color picker + **swatch preset** (vedi §5.5).
- **Modalità**: `Chiara` / `Scura` / `Auto` (predisporre dark mode con token speculari).
- **Tipografia**: selettore famiglia (default Bebas Neue + Montserrat).

**Componenti**
- **Stondatura**: slider `--radius` 0–22px (default 12), aggiorna tutta la UI.
- **Stile bottoni**: `Pieno` / `Squadrato` (classe `btnsq` → `border-radius:0` sui bottoni).
- **Densità interfaccia**: `Comoda` / `Compatta` (scala spacing).
- **Ombre morbide**: on/off.
- **"powered by"**: on/off.
- Azioni: **Salva tema**, **Ripristina default**.

Validazione: ad ogni cambio colore, controllare il **contrasto** (vedi §5.6) e avvertire se non raggiunge AA.

## 5.5 Palette suggerite (swatch preset)

I preset del wireframe, pronti da offrire al cliente/rivenditore:

| Preset | Primary | Mood |
|--------|---------|------|
| **Indigo** (default) | `#5b5bd6` | Moderno, fintech |
| **Corallo** | `#E5533B` | Caldo, energico |
| **Teal** | `#1C7C74` | Professionale, sobrio |
| **Blu** | `#3454D1` | Affidabile, corporate |
| **Viola** | `#7A4E9E` | Premium |
| **Oro** | `#C98A12` | Caldo, lusso |
| **Quasi nero** | `#16150F` | Minimal, elegante |

Ogni preset deve superare il contrasto AA per testo e componenti; definirli nel codice come oggetti tema completi (non solo il primary).

## 5.6 Accessibilità (WCAG 2.1 AA)

Requisiti vincolanti:
- **Contrasto**: testo ≥ 4.5:1 (≥ 3:1 testo grande/componenti). Validare ogni tema scelto. `--muted` è `#6e6e79` → AA su panel (5.04:1) e bg (4.71:1), utilizzabile anche per testo piccolo (label di form, testo secondario). I pill stage/tone scuriscono il testo (`--pill-ink-darken`) per restare ≥4.5:1 sul fondo soft. La validazione del tema (`validateThemeContrast`) tratta `muted-on-panel`/`muted-on-bg` come errori bloccanti.
- **Tastiera**: ogni interazione (incluso lo spostamento stage in pipeline) operabile da tastiera; ordine focus logico; **focus visibile** sempre (il wireframe usa `all:unset` su bottoni/nav → ripristinare esplicitamente outline/focus ring).
- **Drag & drop**: alternativa accessibile (menu "Sposta in…") + ARIA live region.
- **Form**: ogni campo con `<label>` associata (non solo stile mono uppercase), errori via `aria-describedby`, stato non solo a colore.
- **Toggle/switch**: usare `role="switch"` + `aria-checked`; non affidarsi solo al colore (off grigio / on accent).
- **Semantica**: heading gerarchici, landmark (`nav`, `main`, `aside`), `aria-current` sulla voce attiva.
- **Movimento**: rispettare `prefers-reduced-motion` (il wireframe ha animazioni `fade`/`transform`).
- **Touch target** ≥ 44×44px su mobile; **testo ridimensionabile** fino al 200%.
- Componenti headless accessibili (Radix/shadcn) per dialog, dropdown, tabs, tooltip, switch.

## 5.7 Responsive (mobile/tablet/desktop)

Mobile-first. Il wireframe usa griglie (`grid-4`, `grid-3`, ecc.) che collassano a `max-width:920px`. Breakpoint Tailwind: `sm 640 / md 768 / lg 1024 / xl 1280`.

- **Desktop (≥1024)**: sidebar fissa (248px) + contenuto (max ~1180px); pipeline a colonne con scroll orizzontale.
- **Tablet (768–1023)**: griglie KPI 2 colonne; sidebar collassabile.
- **Mobile (<768)**: sidebar → drawer (hamburger); KPI in stack/2 colonne; pipeline a colonne scrollabili orizzontalmente con snap, o vista "tab per stage"; tabelle (lead, appuntamenti) → card list; mini-calendario in drawer/pannello.

## 5.8 Componenti del design system (da realizzare)

Mappati sui pattern del wireframe: Bottoni (`btn`, `btn.ghost`, `btn.sm`, stile pieno/squadrato), Input/Select/Textarea (con label mono), Pill di stato (`ok/warn/doc/exec` + un token per stage), Tag (mono, bordato), Card (`--sh-sm`), KPI card (numero in display font, variante `fill` con sfondo accent), Tabella responsive (header mono uppercase), Segmented control (`seg`), Toggle/switch accessibile, Provider/preset card (`opt.sel`), Swatch colore, Upload zone (logo/favicon/file), Dialog/Modal, Dropdown, Tooltip, Avatar (iniziali, radius 8px), Colonna kanban + card lead, Mini-calendario, Breadcrumb (mono), Toast, Empty state, Skeleton, Sidebar/Drawer. Tutti theme-driven e accessibili.
