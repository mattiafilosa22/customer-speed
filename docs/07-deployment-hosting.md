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
