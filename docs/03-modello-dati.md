# 03 — Modello dati

Schema di riferimento in **Prisma**. Tutti gli identificatori in inglese. Ogni entità di dominio è legata a `Organization` (tenant) tramite `organizationId`.

## 3.1 Diagramma logico

```
Organization 1───* User
Organization 1───* Lead
Organization 1───* PipelineStageConfig
Organization 1───* LossReason
Organization 1───* LeadSource
User         1───* Lead          (ownerId, opzionale)
Lead         1───* Note
Lead         1───* Appointment
Lead         1───* Invoice
Lead         1───* ExternalCrmRef (aggiornamento dati)
User         1───* CalendarConnection
User/Org     *───* Consent / AuditLog
```

## 3.2 Enum principali

```prisma
enum Role {
  superAdmin
  proUser
  baseUser
}

enum LeadStage {
  TO_HANDLE          // Da gestire
  TAKEN              // Preso in carico
  CALL_SCHEDULED     // Call schedulata
  WAITING_DOCS       // Attesa documenti
  PRESENTATION_CALL  // Call presentazione
  WAITING_DECISION   // Attesa decisione
  WAITING_PAYMENT    // Attesa pagamento
  WON                // Vinta (terminale)
  LOST               // Persa (terminale)
}

enum CapitalBracket {
  B_0_50K       // 0–50k
  B_50_100K     // 50–100k
  B_100_250K    // 100–250k
  B_250_500K    // 250–500k
  B_500K_1M     // 500k–1 mln
  B_OVER_1M     // > 1 mln
}

enum AppointmentStatus {
  PENDING   // In attesa
  DONE      // Fatto
  CANCELED  // Annullato
}

enum CalendarProviderType {
  GOOGLE
  CALENDLY
}
```

> Le label IT delle enum vivono nel layer i18n, non nel DB. Map enum→label in `src/i18n`.

## 3.3 Schema Prisma (bozza)

```prisma
model Organization {
  id            String   @id @default(cuid())
  name          String
  slug          String   @unique
  customDomain  String?  @unique

  // Personalizzazione white-label
  appName       String                       // nome piattaforma mostrato
  theme         Json                         // design tokens (vedi 05)
  featureFlags  Json     @default("{}")       // { calendar: false, invoices: true, ... }

  users         User[]
  leads         Lead[]
  stageConfigs  PipelineStageConfig[]
  lossReasons   LossReason[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model User {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  email           String
  emailVerified   DateTime?
  passwordHash    String?                     // null se solo OAuth
  name            String
  role            Role     @default(baseUser)
  isActive        Boolean  @default(true)

  leads               Lead[]               @relation("LeadOwner")
  calendarConnections CalendarConnection[]
  consents            Consent[]

  lastLoginAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([organizationId, email])          // email unica per tenant
  @@index([organizationId])
}

model Lead {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  ownerId         String?
  owner           User?    @relation("LeadOwner", fields: [ownerId], references: [id])

  firstName       String
  lastName        String
  email           String?
  phone           String?

  stage           LeadStage @default(TO_HANDLE)
  stageChangedAt  DateTime  @default(now())   // per il calcolo "giorni"
  capitalBracket  CapitalBracket?

  // provenienza / sorgente del lead (lista configurabile per tenant)
  sourceId        String?
  source          LeadSource? @relation(fields: [sourceId], references: [id])

  adminNotes      String?   @db.Text          // "Note admin" testo lungo

  // dati per lead persi
  lossReasonId    String?
  lossReason      LossReason? @relation(fields: [lossReasonId], references: [id])

  notes           Note[]
  appointments    Appointment[]
  invoices        Invoice[]
  externalRefs    ExternalCrmRef[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([organizationId, stage])
  @@index([organizationId, stageChangedAt])
}

model StageHistory {                          // opzionale ma consigliato
  id          String   @id @default(cuid())
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  fromStage   LeadStage?
  toStage     LeadStage
  changedById String?
  changedAt   DateTime @default(now())
  @@index([leadId])
}

model Note {
  id        String   @id @default(cuid())
  leadId    String
  lead      Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  authorId  String?
  body      String   @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([leadId])
}

model Appointment {
  id          String   @id @default(cuid())
  organizationId String
  leadId      String?
  lead        Lead?    @relation(fields: [leadId], references: [id], onDelete: SetNull)
  ownerId     String?

  startAt     DateTime                        // data + ora
  reason      String                          // "Motivo"
  status      AppointmentStatus @default(PENDING)

  // sync con provider esterni
  provider        CalendarProviderType?
  externalEventId String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([organizationId, startAt])
  @@index([leadId])
}

model Invoice {
  id          String   @id @default(cuid())
  organizationId String
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)

  number      String?
  grossAmount Decimal  @db.Decimal(12,2)
  netAmount   Decimal  @db.Decimal(12,2)      // alimenta "Fatturato netto"
  issuedAt    DateTime
  createdAt   DateTime @default(now())
  @@index([organizationId, issuedAt])
  @@index([leadId])
}

model ExternalCrmRef {                        // "Aggiornamento dati"
  id        String   @id @default(cuid())
  leadId    String
  lead      Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  altName   String?
  altEmail  String?
  source    String?
  createdAt DateTime @default(now())
}

model LossReason {
  id             String  @id @default(cuid())
  organizationId String
  label          String                       // es. "Non ha più risposto"
  leads          Lead[]
  @@unique([organizationId, label])
}

model LeadSource {                            // "Provenienza" — configurabile per tenant
  id             String  @id @default(cuid())
  organizationId String
  label          String                       // es. "Funnel", "Instagram", "Referenza", "Google"
  isActive       Boolean @default(true)
  sortOrder      Int     @default(0)
  leads          Lead[]
  @@unique([organizationId, label])
}

model PipelineStageConfig {
  id             String    @id @default(cuid())
  organizationId String
  stage          LeadStage
  isVisible      Boolean   @default(true)      // per nascondere stage
  sortOrder      Int
  colorToken     String?                       // override colore stage
  @@unique([organizationId, stage])
}

model CalendarConnection {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider     CalendarProviderType
  // token cifrati a riposo (vedi 06)
  accessToken  String   @db.Text
  refreshToken String?  @db.Text
  expiresAt    DateTime?
  scope        String?
  createdAt    DateTime @default(now())
  @@unique([userId, provider])
}

model Consent {                                // GDPR
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  type       String                            // "cookie_analytics", "privacy_policy_v1", ...
  granted    Boolean
  version    String
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
}

model AuditLog {                               // GDPR / sicurezza
  id             String   @id @default(cuid())
  organizationId String?
  actorId        String?
  action         String                        // "lead.update", "auth.login", ...
  entity         String?
  entityId       String?
  meta           Json?
  ip             String?
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
}
```

## 3.4 Note di modellazione

- **Calcolo "giorni"**: `now - stageChangedAt` (in giorni interi). Aggiornare `stageChangedAt` ad ogni cambio stage e registrare la riga in `StageHistory`.
- **Fatturato netto** (KPI dashboard): somma di `Invoice.netAmount` per lead in stato `WON` con `issuedAt` nel periodo.
- **Conv. rate**: vedi formula in `02-specifiche-funzionali.md` §2.2.
- **Soft delete**: valutare un campo `deletedAt` su `Lead` invece di hard delete, per audit e GDPR (e per il diritto alla cancellazione gestire una vera erasure su richiesta — vedi `06`).
- **Isolamento**: nessuna query senza `organizationId` salvo contesto `superAdmin`. Forzare via Prisma extension/middleware.
- **Provenienza**: `LeadSource` è una lista per tenant (come `LossReason`), gestibile da Settings. Seed di default per ogni nuovo tenant: **Funnel, Instagram, Referenza, Google**. Mantenere il riferimento via FK (`sourceId`) invece di un enum, così ogni cliente personalizza le proprie sorgenti senza migrazioni.
- **Seed**: creare un `superAdmin`, un tenant demo e il tenant **Fabio** (proUser) con i lead di esempio degli screenshot, le sorgenti di default (Funnel/Instagram/Referenza/Google) e `featureFlags.calendar = false`.
