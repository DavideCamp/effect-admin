import { defineResource } from "@effect-admin/core"
import { Comment } from "./domain/comment.js"
import { Order } from "./domain/order.js"
import { Post } from "./domain/post.js"
import { Product } from "./domain/product.js"
import { Tag } from "./domain/tag.js"
import { User } from "./domain/user.js"

/**
 * F1: the WHOLE domain registers (the introspector hardening unlocked
 * fromKey and NullOr). FK columns render as raw numbers for now — the
 * lookup widgets are roadmap F4. `list.columns` names are the encoded
 * keys, i.e. the column names (see FieldMeta in core).
 */

export const users = defineResource({
  name: "users",
  schema: User,
  primaryKey: "id",
  list: { columns: ["id", "email", "full_name", "active", "role", "created_at"] }
})

export const posts = defineResource({
  name: "posts",
  schema: Post,
  primaryKey: "id",
  list: { columns: ["id", "title", "author_id", "status", "published_at"] }
})

export const comments = defineResource({
  name: "comments",
  schema: Comment,
  primaryKey: "id",
  list: { columns: ["id", "post_id", "author_id", "parent_id", "body", "created_at"] }
})

export const tags = defineResource({
  name: "tags",
  schema: Tag,
  primaryKey: "id"
})

export const products = defineResource({
  name: "products",
  schema: Product,
  primaryKey: "id",
  list: { columns: ["id", "name", "sku", "price", "status", "stock"] }
})

/** Read-only (D5): order invariants belong to the host app's services. */
export const orders = defineResource({
  name: "orders",
  schema: Order,
  primaryKey: "id",
  readOnly: true,
  list: { columns: ["id", "user_id", "status", "total_cents", "placed_at"] }
})

export const resources = [users, posts, comments, tags, products, orders]
