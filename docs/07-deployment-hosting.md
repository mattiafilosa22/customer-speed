# 07 — Deployment e hosting

## 7.1 Perché NON GitHub Pages

GitHub Pages serve **solo file statici**: niente server, niente database, niente auth lato server, niente variabili d'ambiente segrete. Un CRM con login, dati personali e DB **non può** girare lì in modo sicuro. Va escluso.

## 7.2 Scelta consigliata: Vercel + PostgreSQL gestito

Per Fabio (e i primi tenant): **Vercel** (hosting Next.js) + **Neon** o **Supabase** (PostgreSQL gestito), entrambi con region **UE**.

Vantaggi: HTTPS automatico, deploy continuo da GitHub, preview per ogni PR, scaling gestito, ottima integrazione Next.js, costi iniziali bassi/nulli. La protezione "accesso riservato" è data dall'**autenticazione applicativa** (login obbligatorio), non da artifici esterni.

### Setup
1. Repo su GitHub. Vercel collegato al repo → deploy automatici.
2. Database su **Neon** (serverless Postgres, branch per preview) o **Supabase** (Postgres + storage se serve per i loghi). Region EU.
3. Variabili d'ambiente impostate in Vercel (vedi `06` §6.6), separate per Preview e Production.
4. `prisma migrate deploy` in fase di build/release; seed iniziale per creare superAdmin + tenant Fabio.
5. Dominio: sottodominio tuo (`crm.tuodominio.it`) o dominio dedicato per Fabio. HTTPS gestito da Vercel.

## 7.3 Confronto opzioni (costo/protezione)

| Opzione | Costo indicativo | Pro | Contro |
|--------|------------------|-----|--------|
| **Vercel + Neon/Supabase** (consigliato) | Free tier → ~20€/mese al crescere | Zero-ops, preview, HTTPS, perfetto per Next.js | Costi salgono con il traffico; funzioni serverless con limiti |
| **Railway / Render** | ~5–15€/mese | App + Postgres insieme, semplice, sempre-on | Meno ottimizzato per Next.js edge |
| **VPS (Hetzner/Contabo) + Docker** | ~4–6€/mese | Costo fisso basso, controllo totale, sempre-on | Devi gestire tu OS, HTTPS, backup, aggiornamenti |
| **Fly.io** | ~5€/mese | Vicino all'edge, Postgres gestito | Curva iniziale |

**Multi-tenant**: con il modello SaaS unico, aggiungere un cliente = creare un tenant nel DB (nessun nuovo deploy). I costi restano accentrati: ottimo per la rivendita. Se in futuro un cliente esige isolamento fisico, si può fare un deploy dedicato per quel cliente riusando lo stesso codice.

### Protezione dell'accesso
La riservatezza è garantita da: login obbligatorio + RBAC + isolamento tenant + HTTPS/HSTS + security headers + rate limiting (vedi `06`). Per ambienti di staging non ancora pubblici si può aggiungere la **Vercel Password Protection** (Deployment Protection) come barriera extra.

### RLS su Supabase (API PostgREST pubblica)
Supabase espone ogni tabella dello schema `public` via PostgREST con la chiave `anon` pubblica. L'app non usa quell'API (si connette con Prisma come owner delle tabelle, che bypassa la RLS), quindi **ogni tabella deve avere RLS abilitata** senza policy permissive per `anon`/`authenticated`:
- ogni migrazione che fa `CREATE TABLE` deve includere `ALTER TABLE "<Tabella>" ENABLE ROW LEVEL SECURITY;` — lo verifica `src/lib/migrations-rls.test.ts`;
- modello di riferimento: `20260630120000_enable_rls_public_tables` (tabelle iniziali) e `20261028120000_enable_rls_chat_activity_day` (RLS + revoca grant + policy `RESTRICTIVE` deny-all per `anon`/`authenticated`);
- non usare `FORCE ROW LEVEL SECURITY` finché l'app non imposta il tenant via GUC (vedi nota in `src/lib/prisma-tenant.ts`): bloccherebbe anche l'owner;
- dopo ogni rilascio controllare il Security Advisor di Supabase (`rls_disabled_in_public` deve essere vuoto).

### Rilascio DB automatizzato
`vercel-build` esegue `pnpm db:release` (`scripts/release-db.ts`) prima di `next build`. La CI (job e2e) esegue lo stesso comando.
1. **Preflight**, prima di toccare lo schema: l'utente di `DATABASE_URL` (lo stesso dell'app, anche via pooler) dev'essere owner di ogni tabella o avere `BYPASSRLS`, e deve leggere ogni tabella con `row_security = off`. Se fallisce, la build si ferma **senza applicare migrazioni** e resta online il deploy precedente.
2. `prisma migrate deploy` (usa `DIRECT_URL` se presente).
3. **Post-check**: l'app legge ancora tutto senza filtri RLS e **ogni** tabella di `public` ha la RLS attiva (equivalente al lint `rls_disabled_in_public` dell'Advisor).

**Preview:** con `VERCEL_ENV=preview|development` migrazioni e controlli vengono saltati, così una preview non modifica mai il DB a cui punta. Impostare `ALLOW_PREVIEW_MIGRATIONS=true` nell'ambiente Preview di Vercel solo se le preview hanno un database dedicato.

**Backup pre-rilascio (fail-closed):** il workflow `.github/workflows/db-backup.yml` parte su ogni PR verso `main` o `develop` che tocca `prisma/migrations/` (e a mano da *Actions → Pre-release DB backup*):
1. `scripts/backup-db.sh`: in **un solo snapshot** `pg_dump --format=custom --schema=public` + manifest (`scripts/db-backup/manifest.sql`: righe e hash del contenuto per tabella, flag RLS, owner, policy, GRANT, migrazioni, nomi dei ruoli) → pacchetto cifrato `gpg` AES-256 + `.sha256` accanto al file;
2. `scripts/verify-db-backup.sh`: checksum → decifratura → Postgres usa-e-getta senza rete (`postgres:<major della sorgente>`) → stub `NOLOGIN` dei ruoli (Supabase: `anon`, `authenticated`, `service_role`, …; non si usa `pg_dumpall --roles-only`) → `pg_restore --exit-on-error --single-transaction` → confronto col manifest → test sintetico (`scripts/db-backup/synthetic-test.sql`: RLS su ogni tabella, `anon`/`authenticated` non leggono righe, migrazioni complete);
3. upload come artifact (14 giorni) **solo se verificato**.

Ogni fase ha un exit code proprio (10 checksum, 11 decifratura, 12 pacchetto, 13 restore, 14 manifest, 15 test sintetico, 16 versione immagine) e qualsiasi errore ferma il job. Servono i soli secret `PROD_DATABASE_URL` (session pooler Supabase, porta 5432, utente `postgres`: i runner GitHub non hanno IPv6) e `BACKUP_PASSPHRASE`; i valori derivati dall'URL (password, host) vengono mascherati e gli errori di connessione redatti. Va reso **check obbligatorio** su `main` e `develop` (branch protection), così non si fa merge senza un backup verificato.

La pipeline stessa è provata su dati finti, senza secret, da `.github/workflows/db-backup-selftest.yml` (`pnpm db:backup:test`): percorso positivo, backup durante scritture concorrenti e casi negativi (checksum alterato, file corrotto, chiave sbagliata, cifrato contraffatto, restore fallito, manifest diverso, test sintetico fallito, credenziali errate, scansione dei segreti nei log).

Ripristino (usare la stessa major del manifest):
```bash
BACKUP_PASSPHRASE=... pnpm db:backup:verify backups/<nome>.backup.tar.gpg   # prova prima che sia integro
gpg --decrypt backups/<nome>.backup.tar.gpg | tar -xf - db.dump manifest.txt
pg_restore --list db.dump | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > restore.list
pg_restore --exit-on-error --single-transaction --use-list=restore.list -d "$TARGET_DATABASE_URL" db.dump
```
Lo schema `public` del database di destinazione va lasciato com'è (non ricrearlo): `pg_dump` non salva i permessi di default di `public` (es. `USAGE` a `PUBLIC`) e uno schema ricreato li perderebbe.

## 7.4 CI/CD

- **GitHub Actions**: lint + typecheck + `vitest` + (su PR) `playwright` sui flussi critici; build di verifica.
- **Vercel**: deploy automatico su merge in `main` (production) e preview per ogni PR.
- **Migrazioni**: `prisma migrate deploy` come step di release; mai `migrate dev` in produzione.
- **Branch DB** (Neon) per le preview, così i test e2e non toccano il DB di produzione.

## 7.5 Osservabilità e backup

- **Logging/errori**: Sentry (free tier) per errori runtime.
- **Uptime**: monitor esterno (es. UptimeRobot).
- **Backup**: automatici dal provider DB; verificare la procedura di restore.
- **Analytics** (opzionale, GDPR-friendly): Vercel Analytics o Plausible, dietro consenso cookie.
