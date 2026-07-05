# effect-admin — Definizione del progetto e decisioni di design

> Riscrittura post-grilling del 2026-07-05. Sostituisce i documenti in
> `archive/`, che descrivevano una migrazione da Django mai esistita.
> Questo documento è il "cosa e perché"; `roadmap.md` è il "quando e in
> che ordine".

## Cos'è

**effect-admin: l'equivalente del Django admin per l'ecosistema Effect,
come libreria.** Un utente con un'app `@effect/platform` e modelli di
dominio in `effect/Schema` monta un router admin sotto `/admin` e ottiene
un pannello di amministrazione completo — lista con filtri/ricerca, form,
relazioni, permessi, audit log — **derivato interamente dai suoi schemi**.
Nessuna duplicazione: lo schema dell'app è l'unica fonte di verità.

Django admin è il riferimento di design, non un sistema da migrare:
il progetto è greenfield, senza app esistente, senza DB ereditato,
senza utenti attuali e senza scadenze.

## Stato

- **PoC completato il 2026-07-05** (vedi `archive/plan (1).md` e
  `archive/implementation-plan.md`): introspezione AST → `FieldMeta`,
  derivazione varianti `full/create/update`, repo in-memory, HttpApi CRUD,
  UI generata dai metadati. Tutti i criteri di successo soddisfatti nel
  time-box. **Decisione: GO.**
- **Grilling del 2026-07-05**: ridefinito il progetto come libreria
  greenfield; le decisioni sono registrate qui sotto.

## Obiettivo e criterio di uscita

**Library-first.** La libreria è il prodotto; l'app di esempio nel monorepo
è il suo primo consumatore e la sua palestra. La domanda guida per ogni
scelta di design è "servirebbe a un utente esterno della libreria?".

**Criterio di uscita del progetto** (ereditato dalla vecchia F6, ora
criterio ultimo): *una persona esterna mette in piedi un admin funzionante
seguendo solo il quickstart, senza aprire il codice sorgente.*

---

## Decision record

Decisioni prese nella sessione del 2026-07-05, con motivazione. Cambiarle
si può, ma consapevolmente: ognuna ha conseguenze a valle già assorbite
dalla roadmap.

### D1 — Library-first, greenfield
Non esiste alcuna migrazione né uso interno che guidi le priorità: il
prodotto è la libreria. Conseguenze: disciplina da pacchetto pubblico
(confini tra package, API surface, docs) fin dall'inizio; l'app di esempio
è progettata apposta per esercitare la libreria.

### D2 — Modello di attacco: router montabile, Django-style
L'API primaria è un Layer/router che l'utente **monta nel proprio server**
`@effect/platform` (come `admin.site.urls` in Django). Un wrapper
standalone `AdminServer.make(...)` arriverà dopo, sopra il router.
Conseguenze day-one: gestione di base path arbitrari, convivenza con i
middleware dell'utente, iniezione dei Layer dell'utente (`SqlClient`, auth),
serving degli asset relativo al mount point.

### D3 — Gli schemi appartengono all'app ospite
La libreria consuma gli schemi Effect dell'utente; non ne definisce di
propri. I metadati admin (`auto`, `ref`, `displayField`, …) si annotano
**in-place negli schemi dell'app** tramite un entrypoint di annotations
minimale e a zero dipendenze (symbol `AdminField` + tipi). L'accoppiamento
app→admin è un solo symbol. Override puntuali in `defineResource` restano
possibili per il raro caso admin-only.
*Alternativa scartata:* overlay completo in `defineResource` — con decine
di risorse ricrea una descrizione-ombra dello schema che può driftare,
cioè esattamente la duplicazione che il progetto vuole eliminare.

### D4 — Convenzione naming: `Schema.fromKey`
Campi camelCase mappati a colonne snake_case **dentro lo schema** via
`Schema.fromKey`. L'introspettore estrae la chiave encoded dall'AST e il
query builder la usa come nome colonna: il mapping vive in un solo posto.

### D5 — Percorso di scrittura: sempre SQL generico
`AdminRepoSql` costruisce `SELECT/INSERT/UPDATE/DELETE` dai metadati.
Nessun passaggio per service/repository dell'app.
**Vincolo accettato:** gli invarianti che l'admin deve rispettare devono
vivere **nel database** (constraint, FK, check, trigger). Le risorse i cui
invarianti vivono solo nei service dell'app devono poter essere registrate
**read-only** — la config di risorsa deve poterlo esprimere.

### D6 — Postgres per primo, via `@effect/sql-pg`
Primo (e per ora unico) adapter SQL. Altri motori sono backlog.

### D7 — Auth pluggabile, permessi Django-style completi
L'autenticazione è un'interfaccia (Tag) implementata dall'app ospite
(verifica credenziali/sessioni). L'autorizzazione è la **matrice completa
alla Django**: permessi `view/add/change/delete` per risorsa, per
utente/gruppo, **salvati su tabelle di proprietà della libreria** e — a
regime — gestibili dall'admin stesso.
*Nota di dipendenza:* la UI di gestione permessi è editing M2M, che arriva
in F4. F3 spedisce l'enforcement con permessi popolati via seed/SQL;
quando F4 porta i widget M2M, le tabelle permessi si registrano come
risorse admin e diventano auto-gestibili gratis. Nessuna UI provvisoria.
Non si resuscitano `auth_permission`/`auth_group` di Django: tabelle nuove,
senza il machinery dei content-types.

### D8 — UI: niente React, mai
UI **server-rendered** generata dai `FieldMeta` (l'architettura del Django
admin stesso): pagine HTML, form con POST classico, errori di validazione
**per-campo** al re-render. JS solo come "isole" dove serve davvero —
lookup asincroni FK/M2M contro endpoint JSON dedicati. Niente build step
frontend. L'estensibilità widget è un registry server-side
(`kind` → template/render function).
*Conseguenza:* la vecchia fase "UI React" non esiste; la UI cresce dentro
ogni fase funzionale. L'HttpApi JSON CRUD resta come superficie secondaria
(e serve comunque ai lookup), ma non è il contratto della UI.

### D9 — Monorepo workspace
Pacchetti della libreria + app di esempio nello stesso workspace pnpm.
Split indicativo: `core` (introspezione, derive, defineResource, tipi;
zero dipendenze HTTP/SQL), `sql` (adapter Postgres), `web` (router HTTP +
rendering server-side — HTTP e UI sono fusi per design), `annotations`
(l'entrypoint minimale di D3, eventualmente dentro `core` come subpath
export), `example` (l'app di esempio).

### D10 — Target di ergonomia: ~30+ risorse
La registrazione deve scalare a decine di risorse con configurazione
quasi nulla: nel caso comune `defineResource` riceve schema, nome tabella,
pk e nient'altro. I default fanno il resto; tutto il resto è override.

---

## Mine tecniche note (dal PoC + grilling)

Punti in cui il codice del PoC **non regge** le decisioni di cui sopra —
sono i primi task di F1, non sorprese future:

1. **`fromKey` produce una `TypeLiteralTransformation` top-level**: uno
   `Schema.Struct` con campi `fromKey` non è più un `TypeLiteral` puro,
   e l'introspettore del PoC va in defect. Serve l'unwrap della
   transformation e la lettura della chiave encoded per ogni property.
2. **`Schema.NullOr` è una union con `Null`**: il PoC la classifica
   `unsupported`, ma le colonne nullable sono ovunque. Da gestire in F1,
   insieme all'unwrap dei refinement.
3. **`unsupported` deve degradare con grazia**: campo read-only in
   lista/dettaglio, escluso dai form — **mai** rendere una risorsa non
   registrabile per un campo non riconosciuto. Con 30+ risorse i kind
   non gestiti sono una certezza statistica.
4. **`deriveSchemas` deve preservare l'encoding `fromKey`** quando
   ricostruisce le varianti `create`/`update`.
5. **I nomi tabella non sono derivabili**: campo esplicito `table:` in
   `defineResource` (default: `name`). Pk integer autoincrement come
   convenzione di default; altri tipi di pk quando servono.


Il lavoro su schemi Effect, introspezione AST e HttpApi resta formativo e
riusabile in ogni scenario di uscita.
