# Cursor Bot Dashboard — Design Spec

**Fecha:** 2026-04-24
**Autora:** Delfina Pipan
**Estado:** En review

---

## Objetivo

Dashboard web para medir la utilización e implementación del Cursor Bot en los squads de Humand, sprint a sprint. Permite a PMs y líderes tomar decisiones basadas en datos sobre adopción del bot.

El dashboard se hostea en GitHub Pages y se actualiza automáticamente cada 6 horas desde Jira.

---

## Por qué este spec reemplaza al del 2026-04-23

El spec anterior planteaba que el browser llamara directo a Jira con Basic auth. Eso falla en GitHub Pages por CORS — Jira Cloud no permite requests cross-origin con Basic auth desde un dominio arbitrario. Además, forzaba a hardcodear el API token en el HTML (problema de seguridad).

Este spec mantiene las métricas y vistas del anterior pero corrige la arquitectura: los datos se fetchean desde un workflow de GitHub Actions y se commitean como `data.json`. El browser solo lee ese JSON estático. Se suman también dos métricas nuevas (tendencia global + top/bottom del sprint) y un look & feel más pulido estilo Linear/Vercel.

---

## Alcance

**Squads analizados (17):**

`SQZB, SQSQ, SQSH, SQRN, SQRC, SQPM, SQPD, SQOW, SQOT, SQKA, SQJG, SQGZ, SQEG, SQDP, SQXS, SQCY, SQWH`

**Período:** desde el sprint que arrancó el 24 de febrero de 2025 (primer sprint donde el bot empezó a tomar tareas) hasta el sprint activo actual.

**Criterio de tickets contados como "tasks del bot":**
- Tipo: `Subtask`, `Sub-task` o `Dev Task`
- Estado: `Done`
- Asignado a: usuario "Cursor Bot" en Jira (accountId `712020:98b3a270-fe83-4788-9d35-e5b5611a7a64`)

**Total del sprint (denominador para % adopción):** tickets `Done` del sprint en ese squad con los mismos tipos, sin filtro de asignado. Así la comparación es justa — solo contra trabajo que el bot podría haber hecho.

**Fórmula de adopción:** `tasks_bot / total_tasks × 100`

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  GitHub Actions (scheduled: cada 6h + workflow_dispatch)     │
│    └─ Node 20: fetch-data.js                                 │
│         ├─ usa secret JIRA_TOKEN                             │
│         ├─ llama Jira REST API (Agile v1 + Search v3)        │
│         └─ escribe data.json en el root del repo             │
│                    │                                         │
│                    ▼                                         │
│  git commit + push (si cambió)                               │
│                    │                                         │
│                    ▼                                         │
│  GitHub Pages sirve / (main branch, root)                    │
│                    │                                         │
│                    ▼                                         │
│  Browser: fetch('./data.json') → render                      │
│    · sin CORS (mismo origen)                                 │
│    · sin secrets en el HTML                                  │
│    · sin build step                                          │
└──────────────────────────────────────────────────────────────┘
```

**Decisión clave:** toda la comunicación con Jira ocurre en GitHub Actions. El browser nunca toca Jira.

---

## Stack

- **index.html** — HTML + CSS + JS vanilla embebidos en un solo archivo
- **Chart.js 4.4** via CDN para los gráficos
- **Inter** via Google Fonts para la tipografía
- **fetch-data.js** — script Node 20 que corre en Actions. Sin dependencias externas (usa `fetch` nativo)
- **GitHub Actions** — un workflow `.github/workflows/fetch-data.yml`
- **GitHub Pages** — hosting, apunta a `main` / root

---

## Modelo de datos (`data.json`)

```json
{
  "lastUpdated": "2026-04-24T18:30:00.000Z",
  "squads": {
    "SQZB": {
      "sprints": [
        {
          "id": 12345,
          "name": "SQZB Sprint 1",
          "startDate": "2025-02-24T09:00:00.000Z",
          "endDate": "2025-03-10T09:00:00.000Z",
          "botCount": 14,
          "totalCount": 22
        }
      ],
      "error": null
    },
    "SQSQ": { "sprints": [], "error": "Sin board Scrum" }
  }
}
```

Cada squad tiene un array `sprints` ordenado cronológicamente. Si un squad no tiene board o no tiene sprints desde la fecha de corte, `sprints` queda vacío y `error` trae el mensaje.

---

## Layout

**Sidebar (192px, sticky) + Main panel:**

```
┌──────────────┬─────────────────────────────────────────────┐
│ Cursor Bot   │ [Header: título de vista + subtítulo]       │
│              │                                             │
│ GENERAL      │ [4 KPI cards]                               │
│ ▸ Global     │                                             │
│              │ [Chart 1: tendencia o evolución]            │
│ SQUADS       │                                             │
│ SQZB    32%  │ [Chart 2: ranking o detalle]                │
│ SQSQ    28%  │                                             │
│ SQSH    45%  │ [Top 3 / Bottom 3 — solo vista global]      │
│ SQRN    --   │                                             │
│ ...          │                                             │
│              │                                             │
│ ─────────    │                                             │
│ Actualizado  │                                             │
│ 24/04 18:30  │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

- El sidebar muestra el % de adopción global de cada squad al lado del nombre
- Squads sin datos aparecen en gris con `--` en lugar del %
- El item activo tiene fondo azul muy tenue
- El timestamp de "Actualizado" sale de `data.json.lastUpdated`

---

## Vistas

### Vista Global (default)

**Header:**
- Título: "Adopción del Cursor Bot"
- Subtítulo: "Desde {fecha primer sprint} hasta {fecha último sprint} · {N} sprints"

**KPIs (4 cards horizontales):**

| KPI | Fórmula |
|---|---|
| Tasks del bot | Σ `botCount` de todos los squads, todos los sprints |
| Sprints analizados | Cantidad de sprints únicos (por `startDate`) cubiertos |
| Squads activos | Squads con al menos 1 task del bot en algún sprint |
| Adopción promedio | promedio simple de (% adopción total de cada squad con datos) |

**Chart 1 — Tendencia de adopción global** (line chart):
- X: sprints cronológicos (nombre corto, ej. "S1", "S2", ...)
- Y: % adopción promedio del sprint (promedio ponderado entre squads con actividad ese sprint)
- Línea azul (`#2563eb`), 2px, con puntos en cada sprint
- Grid horizontal muy tenue, sin grid vertical

**Chart 2 — Ranking de squads** (horizontal bar):
- Una barra por squad con al menos 1 task del bot
- Ordenadas de mayor a menor % adopción global
- Color de la barra según el %: verde (`#10b981`) ≥ 75%, azul (`#2563eb`) 50-74%, ámbar (`#f59e0b`) < 50%
- Label a la derecha de cada barra con el % y entre paréntesis `(bot/total)`

**Sección Top / Bottom** (dos cards lado a lado):
- **Top 3 del sprint activo:** los 3 squads con mayor % de adopción en el último sprint. Muestra squad + % + sparkline mini de sus últimos 4 sprints
- **Bottom 3 del sprint activo:** ídem pero los 3 con menor %. Solo incluye squads con actividad en el sprint (no cuenta "sin datos")

### Vista de Squad

Se activa al clickear un squad en el sidebar.

**Header:**
- Título: nombre del squad (ej. "SQZB")
- Subtítulo: "{N} sprints analizados"
- Si `error` no es null: banner en ámbar con el mensaje, no se renderiza el resto

**KPIs (4 cards):**

| KPI | Fórmula |
|---|---|
| Tasks del bot | Σ `botCount` del squad |
| Total tasks | Σ `totalCount` del squad |
| % adopción | Σ botCount / Σ totalCount × 100 |
| Variación | Δ entre % adopción del último sprint y el anteúltimo (flecha arriba/abajo + color) |

**Chart combinado — Evolución del squad:**
- X: sprints cronológicos
- Barras azules: `botCount` por sprint (eje Y izquierdo)
- Línea verde overlay: % adopción por sprint (eje Y derecho, 0-100%)
- Tooltip al hover muestra: bot / total / %

---

## Estilo visual (Linear/Vercel)

**Solo light mode.** No hay toggle dark/light — reduce scope, puede agregarse después.

**Paleta:**

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#fafafa` | fondo de la página |
| `--surface` | `#ffffff` | cards, sidebar |
| `--border` | `#e5e5e5` | bordes sutiles |
| `--text-primary` | `#0a0a0a` | texto principal |
| `--text-secondary` | `#737373` | labels, meta |
| `--text-muted` | `#a3a3a3` | hints |
| `--accent` | `#2563eb` | acciones, highlights, selected |
| `--success` | `#10b981` | adopción alta, deltas positivos |
| `--warning` | `#f59e0b` | adopción baja |
| `--danger` | `#ef4444` | deltas negativos, errores |

**Tipografía:**
- Familia: Inter (400, 500, 600)
- H1 (header de vista): 24px / 600
- H2 (títulos de sección): 14px / 600 / uppercase / letter-spacing 0.05em / muted
- KPI número: 32px / 500
- KPI label: 12px / 500 / muted
- Body: 14px / 400 / line-height 1.5

**Componentes:**
- Card: `bg: --surface; border: 1px solid --border; border-radius: 8px; padding: 20px`
- Sin shadows (Linear no usa sombras — solo bordes)
- Sidebar item: `padding: 8px 12px; border-radius: 6px; font-size: 13px`
- Active state: `bg: rgba(37, 99, 235, 0.08); color: --accent`

**Animaciones:**
- Charts: animación de entrada 400ms, easing ease-out
- Hover en KPI cards y sidebar items: transition 150ms en border y background
- Nada de gradientes, glow, bouncing, confetti, etc. Minimalismo.

---

## Flujo de datos detallado

### Paso 1 — Descubrir boards (una vez por squad, por run)

```
GET /rest/agile/1.0/board?projectKeyOrId={SQUAD}&type=scrum&maxResults=1
```

Toma el primer board. Si no hay, marca `error: "Sin board Scrum"`.

### Paso 2 — Sprints del squad

```
GET /rest/agile/1.0/board/{boardId}/sprint?state=closed,active&maxResults=100
```

Filtra sprints con `startDate >= 2025-02-24`. Ordena por `startDate` ascendente.

### Paso 3 — Issues por sprint (2 queries por sprint)

**Tasks del bot:**
```jql
project = "{SQUAD}"
AND issuetype in (Subtask, "Sub-task", "Dev Task")
AND status = Done
AND assignee = "712020:98b3a270-fe83-4788-9d35-e5b5611a7a64"
AND sprint = {sprintId}
```

**Total del sprint:**
```jql
project = "{SQUAD}"
AND issuetype in (Subtask, "Sub-task", "Dev Task")
AND status = Done
AND sprint = {sprintId}
```

Ambas con `maxResults=0&fields=id` — solo necesitamos el `total`.

### Paso 4 — Paralelización

Las queries dentro de un squad se hacen con `Promise.all`. Los squads se procesan secuencialmente para no saturar la API de Jira ni triggear rate limits.

### Paso 5 — Output

El script escribe `data.json` con el formato descripto arriba. El workflow commitea el archivo solo si cambió (con `git diff --staged --quiet || git commit`).

---

## Seguridad

- **Sin tokens en el HTML.** El HTML es 100% estático y no tiene credenciales.
- **El API token de Jira vive como secret `JIRA_TOKEN` en el repo.** Solo lo ve GitHub Actions en runtime. Nunca se imprime en logs.
- **Repo público.** Los datos son códigos internos de squad (SQZB, SQSQ, etc.) sin PII ni nombres de personas. Público permite usar GitHub Pages gratis. Si más adelante se prefiere privado, se puede migrar sin rehacer el dashboard (requiere GitHub Pro o una organización con Pages habilitado).

---

## Manejo de errores

- Si un squad no tiene board Scrum: `error: "Sin board Scrum"`. Se renderiza en el sidebar con `--` y en el panel muestra banner.
- Si un squad tiene board pero no sprints desde Feb 2025: `error: "Sin sprints recientes"`. Idem.
- Si Jira devuelve error 4xx/5xx en una query: el script reintenta 1 vez; si vuelve a fallar, marca el squad con `error: "Jira {status}"` y sigue con los demás.
- Si falla todo el fetch (ej. token inválido): el workflow falla. `data.json` queda como estaba; el dashboard sigue mostrando la versión vieja con un banner de "Última actualización hace {N} horas".
- Si `data.json` no existe aún (primer deploy): el dashboard muestra un estado "Sin datos todavía — el workflow aún no corrió. Triggerealo manualmente desde Actions".

---

## Performance

**En Jira:** ~17 squads × ~10 sprints × 2 queries = 340 requests por run. Con rate limits típicos de Jira Cloud (500/min por usuario), corre en < 2 min.

**En el browser:** `data.json` pesa ~15-30 KB. Chart.js pesa ~70 KB gzip via CDN. Render < 100ms.

**GitHub Actions:** ~2 min por run. Free tier cubre 2000 min/mes. Con corrida cada 6h = 120 min/mes. Holgado.

---

## Archivos del proyecto

```
/
├── index.html                             # HTML + CSS + JS, lee data.json
├── data.json                              # Generado por Actions. Se commitea al repo.
├── fetch-data.js                          # Node script que corre en Actions
├── README.md                              # Setup + troubleshooting
├── .github/
│   └── workflows/
│       └── fetch-data.yml                 # Schedule + workflow_dispatch
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-04-24-cursor-bot-dashboard-design.md  # este doc
        └── plans/
            └── 2026-04-24-cursor-bot-dashboard.md          # implementation plan
```

---

## Checklist de setup (para Delfina, al deployar)

1. Crear repo **público** `cursor-bot-dashboard` en GitHub
2. Generar un API token nuevo en Jira: https://id.atlassian.com/manage-profile/security/api-tokens
3. Computar el token base64: `echo -n "delfina.pipan@humand.co:EL_API_TOKEN" | base64`
4. En el repo: Settings → Secrets and variables → Actions → New repository secret:
   - Name: `JIRA_TOKEN`
   - Value: el string base64 del paso 3
5. Push inicial desde local (usando un PAT nuevo — el viejo está revocado)
6. Settings → Pages → Source: Deploy from branch → Branch: `main` / `/ (root)` → Save
7. Actions → "Actualizar datos de Jira" → Run workflow (trigger manual la primera vez)
8. Esperar 2 min. Cuando `data.json` aparezca en el repo, el dashboard funciona

---

## Definition of Done

- [ ] Repo nuevo creado y pusheado con la estructura de archivos
- [ ] Secret `JIRA_TOKEN` configurado
- [ ] Workflow corre manualmente sin errores y commitea `data.json`
- [ ] GitHub Pages sirve el dashboard en una URL pública
- [ ] Vista global muestra 4 KPIs, chart de tendencia, ranking, top/bottom
- [ ] Vista por squad muestra 4 KPIs y chart combinado
- [ ] Sidebar lista 17 squads con sus % de adopción global
- [ ] Squads sin datos se muestran en gris con `--`
- [ ] Loading state mientras Chart.js se inicializa
- [ ] Error state si `data.json` no existe o está corrupto
- [ ] Timestamp de "Actualizado: {fecha}" visible en el sidebar
- [ ] README explica el setup paso a paso

---

## Fuera de scope (no hacer ahora)

- Dark mode toggle
- Heatmap squad × sprint
- Desglose por tipo de ticket (Subtask vs Dev Task)
- Export a PDF/CSV
- Autenticación con Jira SSO
- Alertas por email si la adopción baja
- Métricas de tiempo (cycle time, lead time) — requiere queries más pesadas
