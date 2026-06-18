# 04 — API e contratti

L'app è full-stack Next.js: la maggior parte delle mutazioni può usare **Server Actions**; gli endpoint REST sotto sono il contratto logico (utile anche se in futuro si espone un'API pubblica o un'app mobile). Per webhook e integrazioni si usano **Route Handlers** (`src/app/api/...`).

Principi comuni:
- Tutte le route autenticate risolvono il **tenant context** e applicano **RBAC** (vedi `06`).
- Input/output validati con **Zod**. Errori in formato uniforme `{ error: { code, message, fields? } }`.
- Paginazione: `?page`, `?pageSize` (default 25), risposta `{ data, total, page, pageSize }`.
- Filtro periodo condiviso: `?year=2026&month=6` (month assente = tutto l'anno).

## 4.1 Auth
```
POST /api/auth/register        # registrazione (con reCAPTCHA, consensi)
POST /api/auth/[...nextauth]    # gestito da Auth.js (login, callback OAuth)
POST /api/auth/forgot-password  # invia email reset (reCAPTCHA)
POST /api/auth/reset-password   # token + nuova password
POST /api/auth/change-password  # utente loggato ("Cambio Password")
POST /api/auth/verify-email     # conferma email
```

## 4.2 Dashboard
```
GET /api/dashboard/summary?year=&month=
→ {
    totals: number,
    won: number,
    lost: number,
    convRate: number,        // 0..1
    netRevenue: number,
    pipelineDistribution: [{ stage, count }],   // solo stage visibili
    invoicesSummary: { count, totalNet },
    lostReasons: [{ reason, count }],
    activeLeads: [{ id, name, email, stage, daysInStage }]  // esclusi WON/LOST, ordinati per giorni desc
  }
```

## 4.3 Lead
```
GET    /api/leads?query=&stage=&year=&month=&sort=days_asc|days_desc&minDays=
       → lista paginata (per "I miei lead")
POST   /api/leads                      # crea lead
GET    /api/leads/:id                  # dettaglio
PATCH  /api/leads/:id                  # aggiorna campi (incl. capitalBracket)
DELETE /api/leads/:id                  # solo ruoli con permesso (soft delete)
PATCH  /api/leads/:id/stage            # { stage, lossReason? } -> aggiorna stage + stageChangedAt + StageHistory
```
Validazioni: email formato valido (se presente), phone normalizzato, `capitalBracket` ∈ enum, transizione a `LOST` richiede `lossReason`.

## 4.4 Note
```
GET    /api/leads/:id/notes
POST   /api/leads/:id/notes            # { body }
PATCH  /api/notes/:noteId
DELETE /api/notes/:noteId
```

## 4.5 Appuntamenti
```
GET    /api/appointments?filter=all|todo|done&from=&to=
POST   /api/appointments               # { startAt, reason, leadId? }
PATCH  /api/appointments/:id           # update + cambio stato (done/canceled)
DELETE /api/appointments/:id
```

## 4.6 Fatture
```
GET    /api/leads/:id/invoices
POST   /api/leads/:id/invoices         # { number?, grossAmount, netAmount, issuedAt }  (permesso richiesto)
DELETE /api/invoices/:id
```

## 4.7 Aggiornamento dati (CRM esterno)
```
POST   /api/leads/:id/external-refs    # { altName?, altEmail?, source? }
DELETE /api/external-refs/:id
```

## 4.8 Configurazione pipeline / tenant
```
GET    /api/pipeline/config            # stage, visibilità, ordine, colori
PATCH  /api/pipeline/config            # mostra/nascondi stage, riordina (proUser/superAdmin)
GET    /api/org/settings               # appName, theme, featureFlags
PATCH  /api/org/settings               # personalizzazione (permessi)
GET    /api/org/loss-reasons
POST   /api/org/loss-reasons
```

## 4.9 Integrazioni calendario
```
GET  /api/integrations/google/connect      # avvia OAuth Google
GET  /api/integrations/google/callback
POST /api/integrations/google/disconnect
POST /api/webhooks/google                   # push notifications (sync)

POST /api/integrations/calendly/connect
POST /api/webhooks/calendly                 # invitee.created / invitee.canceled
```
I webhook verificano la firma del provider. Le connessioni sono per-utente; i token sono cifrati.

## 4.10 Admin (superAdmin)
```
GET    /api/admin/organizations
POST   /api/admin/organizations            # crea tenant (appName, slug, theme, featureFlags)
PATCH  /api/admin/organizations/:id        # personalizza, attiva/disattiva feature
GET    /api/admin/organizations/:id/users
POST   /api/admin/organizations/:id/users  # invita utente con ruolo
```

## 4.11 GDPR
```
GET    /api/me/export                  # export dati personali (JSON/ZIP)
DELETE /api/me                         # richiesta cancellazione account/dati
GET    /api/consents                   # stato consensi
POST   /api/consents                   # registra/aggiorna consenso (cookie, ecc.)
```
