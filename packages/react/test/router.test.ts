import { describe, expect, it } from "vitest"
import {
  editPath,
  matchAdminRoute,
  normalizeBasePath,
  recordPath,
  resourcePath
} from "../src/router.js"

describe("admin router", () => {
  it("normalizes base paths and builds encoded links", () => {
    expect(normalizeBasePath("admin/")).toBe("/admin")
    expect(resourcePath("/admin/", "blog posts")).toBe("/admin/blog%20posts")
    expect(recordPath("/admin", "users", "a/b")).toBe("/admin/users/a%2Fb")
    expect(editPath("/admin", "users", 1)).toBe("/admin/users/1/edit")
  })

  it("matches only the configured base path", () => {
    expect(matchAdminRoute("/admin2/users", "/admin")).toEqual({ screen: "not-found" })
    expect(matchAdminRoute("/admin/users/a%2Fb", "/admin")).toEqual({
      screen: "detail",
      resource: "users",
      id: "a/b"
    })
  })

  it("rejects malformed encoded paths", () => {
    expect(matchAdminRoute("/admin/users/%E0%A4%A", "/admin")).toEqual({ screen: "not-found" })
  })
})
