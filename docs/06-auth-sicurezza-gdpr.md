# 06 — Autenticazione, sicurezza e GDPR

## 6.1 Autenticazione

Libreria: **Auth.js (NextAuth v5)**.

- **Credentials provider**: email + password. Password con **Argon2id** (preferito) o bcrypt (cost ≥ 12). Mai password in chiaro o reversibili.
- **OAuth Google** (opzionale, per login e per l'integrazione calendario).
- **Sessioni**: JWT o database session; cookie `httpOnly`, `Secure`, `SameSite=Lax`. Scadenza ragionevole + refresh.
- **Verifica email** alla registrazione (token a tempo).
- **Reset password** via email con token monouso a scadenza.
- **Cambio password** ("Cambio Password" in sidebar): richiede password attuale; invalida le altre sessioni.
- **Rate limiting** su login, register, forgot-password (per IP + per account) per contrastare brute force/enumeration.
- **Messaggi non rivelatori**: in login/forgot non distinguere "email inesistente" da "password errata".
- Considerare **2FA (TOTP)** come opzione futura (predisporre il modello utente).

## 6.2 reCAPTCHA

- **Google reCAPTCHA v3** (score-based, invisibile) su **registrazione**, **login** e **forgot-password**; fallback a **v2 checkbox** se lo score è basso.
- Verifica del token **lato server** contro l'API Google con `RECAPTCHA_SECRET_KEY`; soglia di score configurabile (es. 0.5).
- Variabili: `RECAPTCHA_SITE_KEY` (client), `RECAPTCHA_SECRET_KEY` (server).
- Documentare nel cookie/privacy policy l'uso di reCAPTCHA (Google raccoglie dati).

## 6.3 Autorizzazione (RBAC) e isolamento tenant

- Ruoli: `superAdmin`, `proUser`, `baseUser` (matrice in `02-specifiche-funzionali.md`).
- **Enforcement server-side** su ogni Server Action / Route Handler tramite un helper `requirePermission(capability)` che usa il tenant context e il ruolo. Nascondere elementi UI è solo cosmetico, non sufficiente.
- **Capability model**: i permessi sono capability (es. `lead.delete`, `invoice.create`, `pipeline.configure`) mappate ai ruoli; la mappatura è modificabile per modulare `baseUser`.
- **Isolamento tenant**: ogni accesso a dati filtra per `organizationId`. Usare Prisma extension che inietta il filtro + (consigliato) **RLS** PostgreSQL come seconda barriera. Lo `superAdmin` usa un contesto esplicito e tracciato per operazioni cross-tenant.

## 6.4 Sicurezza applicativa (hardening)

- **HTTPS ovunque**, HSTS.
- **Security headers** (via middleware/`next.config`): `Content-Security-Policy` (consentire solo origin necessari: Google reCAPTCHA/Calendar, Calendly), `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **CSRF**: Server Actions Next.js + cookie `SameSite`; per le Route Handlers che mutano stato, verificare origin/token.
- **Validazione e sanificazione** di tutti gli input (Zod); output encoding per evitare XSS.
- **Webhook** (Google/Calendly): verifica firma e idempotenza.
- **Segreti**: solo in env / secret manager Vercel; mai nel repo. Rotazione documentata.
- **Token di terze parti** (`CalendarConnection.accessToken/refreshToken`): **cifrati a riposo** (AES-GCM con chiave da env), non in chiaro nel DB.
- **Audit log** (`AuditLog`) per login, modifiche lead, azioni admin, accessi cross-tenant.
- **Dependency scanning** (Dependabot) e `npm audit` in CI.
- **Backup DB** automatici (gestiti dal provider) + test di restore.

## 6.5 GDPR e compliance

Il prodotto tratta dati personali di lead/clienti: deve essere **conforme al GDPR** by design.

### Basi e documenti legali
- **Privacy policy** e **Cookie policy** pubbliche (pagine dedicate, versionate). Devono essere personalizzabili per tenant (il titolare del trattamento verso i lead è il consulente/cliente; il rivenditore è tipicamente **responsabile del trattamento** — predisporre un **DPA** tra rivenditore e cliente).
- **Cookie banner** conforme (opt-in granulare): cookie tecnici sempre attivi; analytics/marketing solo previo consenso. Registrare i consensi (`Consent`) con versione, timestamp, IP.

### Diritti degli interessati
- **Accesso/portabilità**: export dei dati personali (`GET /api/me/export`, e su richiesta per i lead).
- **Cancellazione ("diritto all'oblio")**: procedura di **erasure** reale (non solo soft-delete) su richiesta, con log dell'operazione.
- **Rettifica**: modifica dati.
- **Revoca consenso**: facile come darlo.

### Principi operativi
- **Minimizzazione**: raccogliere solo i dati necessari.
- **Data retention**: policy di conservazione configurabile (es. cancellazione/anonimizzazione lead inattivi dopo N mesi).
- **Cifratura**: TLS in transito; cifratura a riposo per i campi sensibili/token; DB gestito con encryption at rest.
- **Registro dei trattamenti** e, se necessario, **DPIA**.
- **Data residency**: scegliere region **UE** per DB e hosting (Vercel region EU + Neon/Supabase EU) per ridurre i trasferimenti extra-UE. Documentare i sub-responsabili (Google, Calendly, Vercel, Resend) e le relative garanzie.
- **Notifica data breach**: procedura interna (72h).

> Nota: questo documento fornisce requisiti tecnici di compliance, non costituisce consulenza legale. Far validare privacy policy, cookie policy e DPA da un legale prima della vendita a terzi.

> Per la compliance **legata alla vendita/rivendita** (ruoli titolare/responsabile, DPA, documenti contrattuali, cookie banner secondo il Garante, accessibilità EAA come obbligo di legge, aspetti fiscali) vedi **`09-compliance-vendita.md`**.

## 6.6 Variabili d'ambiente (riepilogo)

```
DATABASE_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
ENCRYPTION_KEY=                 # cifratura token di terze parti
RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CALENDLY_CLIENT_ID=
CALENDLY_CLIENT_SECRET=
CALENDLY_WEBHOOK_SIGNING_KEY=
RESEND_API_KEY=
APP_REGION=eu
```
Mantenere `.env.example` aggiornato e documentato.
