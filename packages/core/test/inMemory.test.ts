import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { defineResource } from "../src/resource.js"
import type { ValidationError } from "../src/types.js"
import { User } from "./fixtures.js"
import { InMemoryRepoLive } from "../src/inMemory.js"
import { AdminRepo } from "../src/repo.js"

const users = defineResource({ name: "users", schema: User, primaryKey: "id" })

const run = <A, E>(effect: Effect.Effect<A, E, AdminRepo>) =>
  Effect.runPromise(Effect.provide(effect, InMemoryRepoLive))

const runExit = <A, E>(effect: Effect.Effect<A, E, AdminRepo>) =>
  Effect.runPromiseExit(Effect.provide(effect, InMemoryRepoLive))

const newUser = { email: "a@b.it", active: true, role: "user" }

describe("in-memory AdminRepo", () => {
  it("create assigns the id, fills auto date fields and returns the full row", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        const row = (yield* repo.create(users, newUser)) as Record<string, unknown>
        expect(row.id).toBe(1)
        expect(row.email).toBe("a@b.it")
        expect(row.createdAt).toBeInstanceOf(Date)
        const again = (yield* repo.create(users, newUser)) as Record<string, unknown>
        expect(again.id).toBe(2)
      })
    ))

  it("list returns all created rows with the total", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        yield* repo.create(users, newUser)
        yield* repo.create(users, { ...newUser, email: "c@d.it" })
        const result = yield* repo.list(users, {})
        expect(result.rows).toHaveLength(2)
        expect(result.total).toBe(2)
      })
    ))

  it("get returns the row or NotFound", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        yield* repo.create(users, newUser)
        const row = (yield* repo.get(users, 1)) as Record<string, unknown>
        expect(row.email).toBe("a@b.it")
        const missing = yield* Effect.exit(repo.get(users, 99))
        expect(Exit.isFailure(missing)).toBe(true)
        if (Exit.isFailure(missing)) {
          expect(missing.cause.toString()).toContain("NotFound")
        }
      })
    ))

  it("update merges partial payloads", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        yield* repo.create(users, newUser)
        const row = (yield* repo.update(users, 1, { role: "admin" })) as Record<string, unknown>
        expect(row.role).toBe("admin")
        expect(row.email).toBe("a@b.it")
      })
    ))

  it("del removes the row; deleting twice is NotFound", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        yield* repo.create(users, newUser)
        yield* repo.del(users, 1)
        const again = yield* Effect.exit(repo.del(users, 1))
        expect(Exit.isFailure(again)).toBe(true)
      })
    ))

  it("create with an invalid payload fails with a readable ValidationError", async () => {
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        return yield* repo.create(users, { email: 123 })
      }).pipe(
        Effect.catchTag("ValidationError", (e: ValidationError) =>
          Effect.fail(e.message)
        )
      )
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const message = String(exit.cause)
      expect(message).toContain("email")
    }
  })

  it("create rejects payloads carrying the pk (excess property)", async () => {
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        return yield* repo.create(users, { ...newUser, id: 7 })
      })
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("update on a missing row is NotFound, not a silent create", async () => {
    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* AdminRepo
        return yield* repo.update(users, 42, { role: "admin" })
      })
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("NotFound")
    }
  })

  it("a read-only resource refuses create/update/delete (D5)", async () => {
    const ro = defineResource({ name: "ro_users", schema: User, primaryKey: "id", readOnly: true })
    for (const write of [
      (repo: typeof AdminRepo.Service) => repo.create(ro, newUser),
      (repo: typeof AdminRepo.Service) => repo.update(ro, 1, { role: "admin" }),
      (repo: typeof AdminRepo.Service) => repo.del(ro, 1)
    ]) {
      const exit = await runExit(Effect.flatMap(AdminRepo, write))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(String(exit.cause)).toContain("read-only")
      }
    }
  })
})

// ---------------------------------------------------------------------------
// F2 list semantics: the in-memory pipeline is the executable specification
// the SQL adapter must match (filter → search → sort → paginate, total
// counted before pagination).
// ---------------------------------------------------------------------------

describe("in-memory list options (F2)", () => {
  const seedMany = Effect.gen(function* () {
    const repo = yield* AdminRepo
    for (let i = 1; i <= 30; i++) {
      yield* repo.create(users, {
        email: `user${String(i).padStart(2, "0")}@example.com`,
        active: i % 2 === 0,
        role: i % 3 === 0 ? "admin" : "user"
      })
    }
    return repo
  })

  it("paginates and reports the un-paginated total", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* seedMany
        const page1 = yield* repo.list(users, { page: 1, pageSize: 10 })
        expect(page1.rows).toHaveLength(10)
        expect(page1.total).toBe(30)
        const page4 = yield* repo.list(users, { page: 4, pageSize: 10 })
        expect(page4.rows).toHaveLength(0)
        expect(page4.total).toBe(30)
      })
    ))

  it("sorts by a whitelisted column in both directions, ignores unknown columns", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* seedMany
        const asc = yield* repo.list(users, { orderBy: "email", orderDir: "asc", pageSize: 1 })
        const desc = yield* repo.list(users, { orderBy: "email", orderDir: "desc", pageSize: 1 })
        expect((asc.rows[0] as { email: string }).email).toBe("user01@example.com")
        expect((desc.rows[0] as { email: string }).email).toBe("user30@example.com")
        const bogus = yield* repo.list(users, { orderBy: "no_such_column" })
        expect(bogus.total).toBe(30)
      })
    ))

  it("filters: eq on select and checkbox, combined", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* seedMany
        const admins = yield* repo.list(users, {
          filters: [{ _tag: "eq", field: "role", value: "admin" }]
        })
        expect(admins.total).toBe(10)
        const activeAdmins = yield* repo.list(users, {
          filters: [
            { _tag: "eq", field: "role", value: "admin" },
            { _tag: "eq", field: "active", value: true }
          ]
        })
        expect(activeAdmins.total).toBe(5)
      })
    ))

  it("filters: range on a number column", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* seedMany
        const result = yield* repo.list(users, {
          filters: [{ _tag: "range", field: "id", min: 5, max: 8 }]
        })
        expect(result.total).toBe(4)
      })
    ))

  it("search runs case-insensitively across text fields", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* seedMany
        const result = yield* repo.list(users, { search: "USER07" })
        expect(result.total).toBe(1)
        expect((result.rows[0] as { email: string }).email).toBe("user07@example.com")
      })
    ))

  it("filters on unknown or unsupported fields are dropped, never an error", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* seedMany
        const result = yield* repo.list(users, {
          filters: [{ _tag: "eq", field: "nope", value: "x" }]
        })
        expect(result.total).toBe(30)
      })
    ))

  it("pageSize is clamped to the maximum", () =>
    run(
      Effect.gen(function* () {
        const repo = yield* seedMany
        const result = yield* repo.list(users, { pageSize: 100000 })
        expect(result.rows).toHaveLength(30)
      })
    ))
})
