# effect-admin — Roadmap verso PROD-ready

> Prerequisito: PoC (slice verticale, vedi `plan.md`) completato con esito
> positivo. Ogni fase produce qualcosa di usabile: la roadmap è pensata per
> essere interrompibile senza buttare lavoro.

## Definizione di "PROD-ready"

Per questo progetto, prod-ready significa:

1. **Usabile in produzione interna** sul caso reale: admin per l'app migrata
   da Django, puntato al DB esistente, usato dallo staff ogni giorno.
2. **Pubblicabile come pacchetto**: installabile via npm, documentato,
   versionato, con API stabile per il caso d'uso base.

Le fasi 1-4 portano al punto (1). Le fasi 5-7 al punto (2). Il punto (1) è
il vero traguardo per la migrazione; il punto (2) è opzionale e va deciso
solo dopo aver vissuto il punto (1).

---

## Fase 1 — Persistenza SQL reale (DB Django esistente)

**Obiettivo:** l'admin gira sul Postgres/MySQL di Django, non più in-memory.

- Adapter `AdminRepoSql`: implementazione del `Context.Tag` `AdminRepo`
  con `@effect/sql` + `@effect/sql-pg` (o `sql-mysql2`)
- Query builder minimale dai metadati risorsa: `SELECT` con colonne dai
  `FieldMeta`, `INSERT ... RETURNING` (id generato dal DB, contratto
  invariato rispetto all'in-memory), `UPDATE` parziale, `DELETE`
- Mapping convenzioni Django: tabelle `app_model`, `id` autoincrement,
  snake_case colonne ↔ camelCase campi (annotation o convenzione di naming)
- **Nessun introspettore automatico DB→Schema in questa fase**: gli schemi
  si scrivono a mano guardando le tabelle. (Un eventuale generatore è in
  fase 7 — non prima, perché serve capire sul campo quali pattern generare.)
- Transazioni per create/update; pool di connessioni via Layer
- Test di integrazione contro un Postgres in Docker (testcontainers o
  docker-compose)

**Exit criteria:** CRUD completo dal browser su una tabella Django reale
(es. `auth_user`), con i dati veri.

**Rischi:** tipi Postgres non banali (timestamptz, numeric, json) → mapparli
esplicitamente o marcarli `unsupported`; encoding/decoding date e null.

---

## Fase 2 — List "vera": paginazione, ordinamento, filtri, ricerca

**Obiettivo:** la lista regge tabelle con centinaia di migliaia di righe.

- `ListOpts` esteso: `page`, `pageSize` (limit/offset), `orderBy` + direzione,
  `filters` per colonna (eq per select/bool, contains per testo, range per
  date/numeri), `search` sui campi `searchable`
- Risposta list con `total` per la paginazione UI
- Validazione delle opzioni via schema (mai SQL costruito da input libero:
  whitelist di colonne dai `FieldMeta`, parametri sempre bindati)
- UI: controlli di paginazione, header cliccabili per il sort, barra filtri
  generata dai `FieldMeta`

**Exit criteria:** lista fluida su una tabella grande, filtri e ricerca
funzionanti, nessuna query non parametrizzata (verifica con review + test).

**Rischi:** SQL injection se si scappa dalla whitelist → questo è il punto
di massima attenzione security della roadmap, insieme all'auth di fase 3.

---

## Fase 3 — Auth e permessi

**Obiettivo:** l'admin è esposto in rete in sicurezza. **Blocca il deploy:
niente produzione prima di questa fase.**

- Autenticazione: sessione con cookie `HttpOnly`+`Secure` (o integrazione
  con l'auth esistente dell'app); login/logout; hashing password se si
  riusano gli utenti Django (`pbkdf2_sha256` — verificare compatibilità o
  forzare reset password)
- Middleware Effect di autorizzazione: equivalente `is_staff` come baseline,
  poi permessi per risorsa e per azione (`view/add/change/delete`, come
  Django) definiti in `defineResource`
- Audit log minimale: chi ha fatto cosa e quando (equivalente `LogEntry`
  di Django admin) — tabella dedicata, scrittura nel repo layer
- Protezioni web di base: CSRF per i form (o API token same-site),
  rate limiting sul login, security header

**Exit criteria:** utente non autenticato → redirect al login; utente senza
permesso → 403; ogni scrittura tracciata nell'audit log.

---

## Fase 4 — Relazioni

**Obiettivo:** il vero salto di qualità rispetto a un CRUD piatto; è ciò che
rende l'admin "Django-like".

- ForeignKey: annotation `AdminField.ref` → nella UI select con ricerca
  asincrona (endpoint di lookup dedicato, con permessi); nella lista,
  colonna che mostra la label della riga riferita (annotation `displayField`)
- Validazione referenziale: FK inesistente → `ValidationError` leggibile
- ManyToMany: widget multi-select con ricerca; scrittura sulla tabella ponte
- Inline (righe figlie dentro il form del padre): **solo lettura** in questa
  fase — l'editing inline è la feature più complessa di Django admin, rinviata
  finché non serve davvero
- `onDelete`: comportamento esplicito (blocco con messaggio vs cascade,
  seguendo i constraint del DB)

**Exit criteria:** modello con FK e M2M gestibile interamente da UI;
lookup ricercabile fluido su tabelle grandi.

**Rischi:** è la fase con più incognite di design dopo l'introspezione AST.
Prevedere una spike di 1-2 giorni prima di stimarla.

---

### Checkpoint: PROD-ready interno ✅

Con le fasi 1-4 l'obiettivo (1) è raggiunto: admin usabile in produzione
interna per la migrazione da Django. Le fasi successive servono solo se si
vuole il pacchetto pubblico. **Fermarsi qui è un esito legittimo.**

---

## Fase 5 — UI React generica

**Obiettivo:** sostituire l'HTML vanilla con un frontend mantenibile.

- App React (Vite) che consuma `/_schema` e gli endpoint CRUD
- Registry di widget: `kind` → componente (text, number, checkbox, select,
  date picker, FK lookup, M2M) — estensibile dall'utente del pacchetto
- Errori di validazione **per-campo** (il PoC mostrava solo il messaggio
  grezzo; qui si mappa `ParseError` → campo)
- Dark mode gratis e responsive di base; niente design system custom:
  una libreria componenti esistente (es. Radix/shadcn) per non trasformare
  il progetto in un progetto di UI

**Exit criteria:** parità di funzioni con la UI vanilla + errori per-campo +
widget relazioni; la UI vanilla viene ritirata.

---

## Fase 6 — Packaging e DX

**Obiettivo:** da "repo mio" a "npm install effect-admin".

- Split in pacchetti: `@effect-admin/core` (introspezione, defineResource,
  tipi — zero dipendenze da DB/HTTP), `@effect-admin/sql`, `@effect-admin/http`,
  `@effect-admin/ui`
- API pubblica congelata per il caso base; semver da qui in poi
- `AdminServer.make({ resources, auth, db })`: l'esperienza "installo e ho
  tutto" promessa all'inizio
- Documentazione: quickstart (10 minuti dal `npm install` all'admin che
  gira), guida annotations, guida estensione widget, esempio di migrazione
  da Django con mapping delle tabelle
- CI: test, typecheck, build matrix; esempio eseguibile nel repo
- Copertura AST estesa: refinement (min/max/pattern → vincoli form),
  branded types, optional con default, `Schema.Union` non-literal →
  `unsupported` documentato

**Exit criteria:** una persona esterna al progetto mette in piedi un admin
funzionante seguendo solo il quickstart, senza aprire il codice sorgente.

---

## Fase 7 — Nice to have (backlog, nessun ordine)

- Generatore schemi dal DB (l'introspettore "prisma db pull-style" — ora
  ha senso: i pattern da generare sono noti dalle fasi 1-4)
- Azioni bulk e azioni custom per risorsa (equivalente `actions` Django)
- Export CSV/JSON della lista filtrata
- Editing inline delle righe figlie (rinviato dalla fase 4)
- Upload file/immagini (storage adapter)
- Campi JSON con editor dedicato; rich text
- History/undo per riga (sopra l'audit log della fase 3)
- i18n delle label

---

## Vista d'insieme e dipendenze

```
PoC ──► F1 SQL ──► F2 List ──► F3 Auth ──► F4 Relazioni ──► [PROD interno ✅]
                                                    │
                                                    ▼
                                     F5 UI React ──► F6 Packaging ──► [npm ✅]
                                                              │
                                                              ▼
                                                        F7 Backlog
```

- F1→F4 sono sequenziali (ognuna si appoggia alla precedente).
- F3 (auth) **blocca qualunque deploy**: se serve andare online prima di
  aver finito F2, F3 si anticipa.
- F5 può partire in parallelo a F4 se si è in più persone.
- Ordini di grandezza (una persona, part-time): F1-F2 insieme ~2-3 settimane,
  F3 ~1-2 settimane, F4 ~2-3 settimane, F5 ~2-3 settimane, F6 ~2+ settimane.
  Sono stime a bassa confidenza — da ricalibrare dopo ogni fase con i tempi
  reali della precedente; l'esperienza del PoC (time-box rispettato o no)
  è il primo dato di calibrazione.

## Criteri di stop (validi in ogni fase)

Riconsiderare AdminJS / React Admin sull'OpenAPI esistente se:
- una fase sfora la stima di oltre il doppio,
- l'introspezione AST richiede workaround fragili sui casi reali del DB,
- il bisogno reale si rivela essere "un CRUD interno qualunque" e non
  giustifica più il costo del custom.

Il lavoro su schemi Effect e HttpApi resta riusabile in ogni scenario di
uscita: è la parte del progetto senza rimpianti.
