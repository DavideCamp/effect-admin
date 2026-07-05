# effect-admin — Roadmap (library-first)

> Riscritta il 2026-07-05 dopo il grilling. Prerequisito: PoC completato
> con esito positivo (fatto, 2026-07-05). Le decisioni di design a monte
> sono in `plan.md` (D1–D10); qui solo sequenza, contenuto e criteri di
> uscita delle fasi. La vecchia roadmap orientata alla migrazione è in
> `archive/roadmap.md`.
>
> Ogni fase produce qualcosa di usabile nell'app di esempio: la roadmap
> resta interrompibile senza buttare lavoro. Non c'è scadenza: il ritmo
> è quello di una persona, part-time.

## Vista d'insieme

```
PoC ✅ ──► F0 monorepo + dominio esempio
                │
                ▼
           F1 SQL reale + introspezione hardening
                │
                ▼
           F2 List vera (paginazione, sort, filtri, ricerca)
                │
                ▼
           F3 Auth pluggabile + matrice permessi + audit
                │
                ▼
           F4 Relazioni (FK, M2M, lookup) ──► permessi auto-gestibili
                │
                ▼
           F5 Packaging, docs, npm ──► [criterio di uscita: quickstart ✅]
                │
                ▼
           F6 Backlog
```

- F0→F4 sequenziali; la UI server-rendered (D8) **cresce dentro ogni
  fase**, non è una fase.
- Le stime della vecchia roadmap non valgono più (cambiati scope e
  premesse). Si ristimano a inizio fase, usando i tempi reali della fase
  precedente; il PoC (time-box rispettato) è il primo dato.

---

## Fase 0 — Monorepo e dominio d'esempio

**Obiettivo:** la casa della libreria e la sua palestra.

- Nuovo repo, **senza `:` nel nome della directory** (il `:` rompe
  `node_modules/.bin` — lezione del PoC)
- Workspace pnpm con lo split di D9: `core`, `sql`, `web`, `example`
  (+ entrypoint `annotations`); migrare il codice del PoC in `core`/`web`
- **Progettare il dominio d'esempio come infrastruttura di test**: deve
  esercitare ogni forma AST che la libreria dichiara di supportare —
  colonne nullable (`NullOr`), enum/union di literal, date, numeric/money,
  JSON, FK, M2M, FK self-referencing, campi con refinement e branded
  types, una risorsa read-only (D5). Un dominio tipo blog+shop copre
  tutto: users, posts, tags (M2M), comments (FK + self-FK), products,
  orders (money, enum stato, read-only)
- App di esempio: server `@effect/platform` che **monta** il router admin
  (D2) — il mount path è dogfooding, non un dettaglio
- CI minima: typecheck + test su ogni package

**Exit criteria:** monorepo che builda e testa; schemi del dominio
d'esempio scritti (con `fromKey` e annotations in-place, D3/D4); l'app di
esempio monta l'admin del PoC (ancora in-memory) e funziona nel browser.

---

## Fase 1 — Persistenza SQL reale + introspezione hardening

**Obiettivo:** l'admin gira su Postgres, sugli schemi realistici
dell'esempio. È la fase che paga il debito tra PoC e decisioni di design
(le "mine tecniche" di `plan.md`).

Introspezione (prima, perché blocca tutto):
- unwrap della `TypeLiteralTransformation` prodotta da `fromKey`; lettura
  della chiave encoded per ogni property → nome colonna (mina #1/#4)
- `Schema.NullOr` → kind del ramo non-null + flag `nullable` (mina #2)
- unwrap dei refinement (il vincolo si ignora per ora; diventa vincolo di
  form in F5)
- `unsupported` con degradazione elegante: read-only in lista/dettaglio,
  escluso dai form, **mai** un errore di registrazione (mina #3)

Adapter SQL:
- `AdminRepoSql`: implementazione del Tag `AdminRepo` con `@effect/sql` +
  `@effect/sql-pg` (D5/D6); query costruite dai `FieldMeta`, **whitelist
  di colonne dai metadati, parametri sempre bindati**
- `SELECT` con colonne esplicite, `INSERT ... RETURNING` (contratto
  invariato rispetto all'in-memory), `UPDATE` parziale, `DELETE`
- Mapping tipi Postgres: timestamptz, numeric, jsonb, boolean — espliciti;
  ciò che non si mappa → `unsupported`, documentato
- Transazioni per create/update; pool via Layer (config iniettata
  dall'app ospite, D2)
- `defineResource`: campo `table:` esplicito (default: `name`), flag
  `readOnly` (D5)
- DDL del dominio d'esempio: migration/SQL versionato nel package
  `example` (il DB è nostro: gli invarianti si mettono nei constraint,
  D5)
- Test di integrazione contro Postgres in Docker (testcontainers o
  docker-compose)

**Exit criteria:** CRUD completo dal browser su tutte le risorse
dell'esempio (quelle con relazioni: campi FK come numeri grezzi, per ora);
la risorsa read-only rifiuta le scritture; introspezione verde su tutti
gli schemi dell'esempio senza workaround.

**Rischi:** è la fase che decide se "gli schemi veri reggono". Se
l'introspezione richiede workaround fragili → criterio di stop.

---

## Fase 2 — List vera: paginazione, ordinamento, filtri, ricerca

**Obiettivo:** la lista regge tabelle con centinaia di migliaia di righe
(seed di volume nel dominio d'esempio per provarlo davvero).

- `ListOpts` esteso: `page`, `pageSize` (limit/offset), `orderBy` +
  direzione, `filters` per colonna (eq per select/bool, contains per
  testo, range per date/numeri), `search` sui campi `searchable`
- Risposta list con `total` per la paginazione
- Validazione delle opzioni via schema; **mai SQL da input libero**:
  whitelist di colonne dai `FieldMeta`, parametri bindati
- UI server-rendered (D8): controlli di paginazione, header cliccabili
  per il sort, barra filtri generata dai `FieldMeta` — form GET,
  stato nella query string (bookmarkabile, come Django admin)

**Exit criteria:** lista fluida su una tabella grande dell'esempio;
filtri e ricerca funzionanti; nessuna query non parametrizzata
(review + test). Punto di massima attenzione security insieme a F3.

---

## Fase 3 — Auth pluggabile, matrice permessi, audit

**Obiettivo:** l'admin è esponibile in sicurezza. **Blocca qualunque
deploy pubblico dell'app di esempio.**

- Autenticazione (D7): interfaccia (Tag) implementata dall'app ospite —
  verifica credenziali e/o sessione; la libreria fornisce il flusso
  login/logout con cookie di sessione `HttpOnly`+`Secure` e
  un'implementazione di riferimento nell'esempio
- Autorizzazione: **matrice completa alla Django** — permessi
  `view/add/change/delete` per risorsa, per utente/gruppo, su **tabelle
  di proprietà della libreria** (schema + migration fornite); niente
  content-types alla Django, tabelle nuove e semplici
- In F3 i permessi si popolano via **seed/SQL** — la UI di gestione
  arriva gratis in F4 registrando le tabelle permessi come risorse
  (D7); nessuna UI provvisoria
- Middleware di enforcement su ogni route (pagine e endpoint JSON);
  utente non autenticato → redirect al login; senza permesso → 403
- Audit log minimale: chi/cosa/quando per ogni scrittura (equivalente
  `LogEntry`), tabella dedicata, scrittura nel repo layer
- Protezioni web di base: CSRF sui form POST (siamo server-rendered:
  token nel form), rate limiting sul login, security header

**Exit criteria:** non autenticato → login; senza permesso → 403 su
pagina e su endpoint; ogni scrittura in audit log; CSRF verificato
da test.

---

## Fase 4 — Relazioni

**Obiettivo:** il salto da CRUD piatto ad admin "Django-like". La fase
con più incognite di design: **spike di 1-2 giorni prima di stimarla.**

- ForeignKey: annotation `AdminField.ref` (+ `displayField`) in-place
  negli schemi (D3) → nel form un'isola JS di lookup con ricerca
  asincrona contro un endpoint JSON dedicato (con permessi, D8); in
  lista, colonna con la label della riga riferita
- Validazione referenziale: FK inesistente → `ValidationError` leggibile
  (il constraint DB è la rete di sicurezza, D5)
- ManyToMany: widget multi-select con ricerca; scrittura sulla tabella
  ponte, transazionale
- **Dogfooding permessi (D7):** registrare le tabelle utenti/gruppi/
  permessi come risorse admin → la matrice diventa auto-gestibile
  dall'admin stesso; è il test di accettazione dei widget M2M
- Inline (righe figlie nel form del padre): **solo lettura**; l'editing
  inline resta nel backlog
- `onDelete`: comportamento esplicito guidato dai constraint del DB
  (blocco con messaggio leggibile vs cascade)

**Exit criteria:** il dominio d'esempio (FK, self-FK, M2M) interamente
gestibile da UI; lookup fluido su tabella grande; permessi gestiti
dall'admin senza toccare SQL.

---

### Checkpoint: la libreria funziona ✅

A questo punto la libreria fa ciò che promette, sul suo primo
consumatore. Le fasi successive la rendono **adottabile da altri**.
Fermarsi qui (libreria privata/personale) è un esito legittimo.

---

## Fase 5 — Packaging, docs, npm

**Obiettivo:** da "monorepo mio" a `npm install`. (Era la vecchia F6;
lo split in package esiste già dalla F0, qui si congela e si pubblica.)

- API pubblica congelata per il caso base; semver da qui in poi
- `AdminServer.make({ resources, auth, db })`: il wrapper standalone
  sopra il router montabile (D2)
- Copertura AST estesa e documentata: refinement → vincoli di form
  (min/max/pattern), branded types, optional con default; matrice
  esplicita "supportato / read-only / non supportato"
- Documentazione: quickstart (10 minuti da `npm install` all'admin
  montato), guida annotations, guida widget/template registry, guida
  auth adapter
- CI completa: test, typecheck, build matrix; l'app di esempio è
  l'esempio eseguibile del repo
- Nome del pacchetto, licenza OSS, repo pubblico: si decidono qui

**Exit criteria = criterio di uscita del progetto:** una persona esterna
mette in piedi un admin funzionante seguendo solo il quickstart, senza
aprire il sorgente.

---

## Fase 6 — Backlog (nessun ordine)

- Azioni bulk e azioni custom per risorsa (equivalente `actions` Django)
- Export CSV/JSON della lista filtrata
- Editing inline delle righe figlie (rinviato dalla F4)
- Upload file/immagini (storage adapter)
- Campi JSON con editor dedicato; rich text
- History/undo per riga (sopra l'audit log di F3)
- i18n delle label
- Adapter MySQL/SQLite (`@effect/sql-mysql2`, `@effect/sql-sqlite-*`)
- Standalone `AdminServer` avanzato (se il wrapper di F5 non basta)

> Il vecchio "generatore schemi dal DB" è **morto**: gli schemi
> appartengono all'app ospite (D3), non c'è niente da generare.

## Criteri di stop

Vedi `plan.md` § Criteri di stop — valgono a ogni fase.
