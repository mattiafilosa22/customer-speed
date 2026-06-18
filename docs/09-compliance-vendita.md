# 09 — Compliance per la vendita / rivendita

> ⚠️ **Disclaimer**: questo documento elenca requisiti tecnici e organizzativi di conformità per aiutarti a strutturare il prodotto e ridurre il rischio. **Non è consulenza legale.** Prima di pubblicare una landing page e vendere il software a terzi, fai validare contratti, privacy policy, cookie policy e DPA da un **avvocato/DPO**. Le sanzioni citate sono indicative e variano per normativa e Stato membro.

Mentre `06-auth-sicurezza-gdpr.md` copre la compliance **tecnica dentro l'app**, questo documento copre la compliance **del fatto di vendere il prodotto** a clienti come Fabio (e futuri).

---

## 9.1 Chi è chi sotto il GDPR (fondamentale)

La catena di responsabilità determina chi rischia le multe. Va definita con chiarezza nei contratti.

- **Cliente (es. Fabio)** = **Titolare del trattamento** (data controller) dei dati dei *suoi* lead/clienti. Decide finalità e mezzi.
- **Tu (rivenditore/fornitore del SaaS)** = **Responsabile del trattamento** (data processor): tratti i dati dei lead *per conto* del cliente. → **Obbligo di un DPA** (accordo ex **art. 28 GDPR**) firmato con **ogni** cliente.
- **Fornitori infrastrutturali** = **Sub-responsabili** (sub-processor): Vercel, Neon/Supabase, Google (Calendar/reCAPTCHA), Calendly, Resend, eventuale Sentry. → vanno **elencati, autorizzati dal cliente nel DPA**, e devono avere a loro volta garanzie adeguate.

Per i **tuoi** dati di marketing/clienti raccolti dalla landing page (lead commerciali, contatti, account di prova), invece, **sei tu il Titolare** e ti servono le tue informative.

### Azioni
- Predisporre un **template di DPA** (nomina a responsabile) da firmare con ogni cliente.
- Mantenere una **lista pubblica dei sub-responsabili** (sub-processors) con notifica al cliente in caso di modifica.
- Verificare che ogni sub-responsabile abbia **server/dati in UE** o garanzie per trasferimenti extra-UE (SCC). Scegliere region **UE** ovunque possibile (vedi `07`).

---

## 9.2 Documenti legali necessari

### Per la landing page / sito di vendita (sei tu il Titolare)
- **Privacy Policy** del sito (chi sei, dati raccolti dai form/contatti/trial, finalità, base giuridica, diritti, contatti, DPO se nominato).
- **Cookie Policy** + **cookie banner** conforme (vedi §9.3).
- **Note legali / P.IVA** ben visibili (vedi §9.5).
- Se raccogli email per newsletter/marketing: **consenso esplicito** separato e double opt-in consigliato.

### Per il prodotto SaaS (rapporto con il cliente)
- **Termini di Servizio / Contratto SaaS** (condizioni d'uso, licenza, limitazioni, responsabilità, prezzi, durata, recesso, foro competente).
- **DPA (art. 28)** allegato al contratto.
- **Acceptable Use Policy (AUP)** (cosa il cliente non può fare).
- **SLA** (uptime, supporto) — opzionale ma consigliato se vendi a professionisti.
- **Privacy Policy del prodotto** verso gli utenti che accedono (Fabio e collaboratori): come tratti i loro dati di account.
- **Informativa verso i lead** (i clienti finali del cliente): predisporre un **template** che il cliente possa adottare verso i propri lead, dato che è lui il Titolare. Utile fornirlo "in-app" e personalizzabile per tenant.

> In-app: le pagine **Privacy Policy** e **Cookie Policy** devono essere **versionate e personalizzabili per tenant** (vedi `03` campo `Organization.theme`/config e `Consent.version`).

---

## 9.3 Cookie ed ePrivacy (Garante Privacy, requisiti 2025)

Per i siti rivolti all'Italia, il cookie banner deve rispettare le Linee guida del Garante (provv. 10 giugno 2021 e provvedimenti 2025). Requisiti pratici:

- **Cookie tecnici**: nessun consenso (necessari al funzionamento). **Cookie di profilazione/marketing/analytics di terze parti**: solo previo **consenso**.
- Banner con i pulsanti: **"Accetta tutti"**, **"Rifiuta tutto"** (equivalenti per peso/visibilità) e **"Gestisci preferenze"**.
- **X in alto a destra** per chiudere senza consentire: la chiusura = proseguire **senza tracciamento**.
- **Niente cookie wall** (non si può obbligare ad accettare per accedere) salvo eccezioni con alternativa.
- **Non riproporre** il banner se l'utente ha già scelto, salvo: condizioni cambiate, impossibilità di conservare la scelta, o trascorsi **6 mesi (180 giorni)**.
- **Scelte registrate** (proof of consent): registrare versione, timestamp, scelta (modello `Consent` in `03`).
- Cookie Policy con elenco cookie, finalità, durata, terze parti.

> Sanzioni cookie/GDPR: fino a **20 M€ o 4% del fatturato globale annuo**. (Indicativo.)

**Implementazione**: il CRM usa pochi cookie tecnici (sessione auth). reCAPTCHA e eventuali analytics/Calendar di Google richiedono consenso e vanno dichiarati. Caricare gli script di terze parti **solo dopo il consenso**.

---

## 9.4 Accessibilità — European Accessibility Act (EAA) ⚠️ in vigore

**Novità rilevante per la vendita**: l'**European Accessibility Act** è applicabile **dal 28 giugno 2025**. Riguarda prodotti e servizi digitali (incluso e-commerce e molti servizi software) offerti a **consumatori nell'UE**, **indipendentemente da dove ha sede l'azienda**.

Punti chiave:
- Standard di riferimento: **EN 301 549**, che incorpora **WCAG 2.1 livello AA** — coerente con quanto già richiesto in `05` e `CLAUDE.md`.
- Si applica anche a **SaaS/web app**: contenuti dinamici (dashboard, notifiche) devono essere annunciati agli screen reader; componenti custom con ARIA corretti; flussi complessi (multi-step, **drag & drop** della pipeline) accessibili da tastiera.
- **Esenzione microimprese**: imprese con **< 10 dipendenti E fatturato < 2 M€/anno** possono essere esentate per i *servizi* (verificare l'applicazione in Italia, D.Lgs. di recepimento 82/2022). **Attenzione**: l'esenzione dipende dalla dimensione di chi *fornisce il servizio* e dal contesto; non darla per scontata e, soprattutto, **i tuoi clienti potrebbero non essere esenti** → vendere un prodotto accessibile è un **vantaggio commerciale** e riduce il loro rischio.
- Gli **overlay automatici** di accessibilità **non** garantiscono conformità: serve implementazione reale (come previsto in `05`).
- Sanzioni: variano per Stato membro; il prodotto non conforme può essere **escluso dal mercato UE**.

**Conclusione**: trattare WCAG 2.1 AA come **requisito legale**, non solo qualitativo. È già nella Definition of Done.

---

## 9.5 Aspetti commerciali (vendere in Italia)

Per vendere lecitamente il software (specie come attività continuativa):
- **Partita IVA** e inquadramento fiscale adeguati; vendere SaaS in modo abituale è attività d'impresa.
- **Fatturazione elettronica** (obbligo generalizzato in Italia tramite SdI).
- **IVA sui servizi digitali**: regole diverse per B2B vs B2C e per clienti UE/extra-UE (es. regime **OSS** per B2C UE). Da verificare con il commercialista.
- **Informativa precontrattuale e condizioni di vendita** chiare sul sito (prezzo, cosa include, durata, rinnovo, disdetta).
- **Diritto di recesso**: se vendi a **consumatori** (B2C) si applica il Codice del Consumo (recesso 14 giorni, con regole specifiche per i contenuti/servizi digitali e relative rinunce). In **B2B** (es. Fabio con P.IVA) le regole sono più flessibili. Definire bene il target.
- **Trasparenza prezzi** e eventuale prova gratuita con condizioni esplicite.

> Questi punti sono fiscali/legali: confrontati con un **commercialista** e un **avvocato**.

---

## 9.6 Sicurezza come obbligo di legge

L'**art. 32 GDPR** impone misure di sicurezza adeguate. Quanto previsto in `06` (cifratura in transito/riposo, hashing password, RBAC, isolamento tenant, audit log, backup, rate limiting, security headers, gestione segreti) è il baseline. Aggiungere:
- **Procedura di data breach** documentata (notifica al Garante entro **72h**, e ai clienti come Titolari).
- **Registro dei trattamenti (ROPA)** per la tua attività di responsabile.
- **Data retention policy** documentata e applicata.
- Valutare una **DPIA** se il trattamento è ad alto rischio.

---

## 9.7 Se aggiungi funzioni di AI (futuro)

Se in futuro integri funzionalità AI (es. suggerimenti, scoring lead), considera l'**EU AI Act** (trasparenza verso gli utenti che interagiscono con AI, divieti su certe pratiche, eventuali obblighi per sistemi a rischio). Per ora il CRM non ha AI: nessun obbligo specifico, ma tienilo presente nella roadmap commerciale.

---

## 9.8 Checklist "prima di vendere"

**Legale/contrattuale**
- [ ] ToS/Contratto SaaS, AUP, (SLA) redatti e validati da legale
- [ ] Template **DPA (art. 28)** pronto da firmare con ogni cliente
- [ ] Lista **sub-responsabili** pubblicata e aggiornata
- [ ] Privacy Policy + Cookie Policy del **sito di vendita**
- [ ] Privacy Policy del **prodotto** + template informativa per i **lead** dei clienti

**Privacy/tecnico**
- [ ] Cookie banner conforme Garante (Accetta/Rifiuta/Gestisci + X, no re-prompt < 180gg, proof of consent)
- [ ] Tutti i dati e sub-fornitori in **region UE** (o SCC documentate)
- [ ] Export & cancellazione dati (DSR) funzionanti
- [ ] Procedura data breach + ROPA + retention policy
- [ ] Cifratura, RBAC, isolamento tenant, audit log verificati (`06`)

**Accessibilità (EAA)**
- [ ] Audit **WCAG 2.1 AA** superato (tastiera, contrasto, screen reader, drag&drop accessibile)
- [ ] Nessun affidamento a overlay automatici

**Commerciale (Italia)**
- [ ] P.IVA, fatturazione elettronica, regime IVA verificati col commercialista
- [ ] Condizioni di vendita, prezzi, recesso (se B2C) pubblicati

---

## Fonti
- [European Accessibility Act — Level Access](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/)
- [SaaS EAA Compliance / EN 301 549 — Accessibility.Works](https://www.accessibility.works/blog/saas-eaa-compliance-european-accessibility-act-en-301-549-requirements/)
- [Garante Privacy — Provvedimento 27 febbraio 2025](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/10118222)
- [Garante Privacy — Linee guida cookie 10 giugno 2021](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876)
