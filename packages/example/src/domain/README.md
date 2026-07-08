# Example domain models

These schemas exercise the AST forms supported by the React field metadata
layer. The frontend uses decoded names (`fullName`); `fromKey("full_name")`
remains an API encoding concern.

| Forma AST                         | Dove                                      |
| --------------------------------- | ----------------------------------------- |
| `fromKey` (camelCase→snake_case)  | `User.fullName`, `Post.authorId`, …       |
| `NullOr` (colonna nullable)       | `Post.publishedAt`, `Comment.parentId`    |
| enum (union di literal)           | `User.role`, `Post.status`, `Order.status`|
| date                              | `*.createdAt`, `Order.placedAt`           |
| numeric/money                     | `Product.price`, `Order.totalCents`       |
| branded type                      | `Order.totalCents` (brand `"Cents"`)      |
| refinement (min/pattern/int)      | `Tag.name`, `Product.sku`, `Product.stock`|
| JSON                              | `Order.metadata`                          |
| FK                                | `Post.authorId`, `Comment.postId`, …      |
| self-FK                           | `Comment.parentId`                        |
| M2M                               | `Post.tagIds` → `Tag`                     |

The runnable V1 example registers users, posts, and tags. The remaining models
are compact fixtures for expanding widgets without coupling the library to
database persistence.
