# Dominio d'esempio (blog + shop)

Progettato come **infrastruttura di test** (roadmap F0): ogni forma AST che
la libreria dichiara di supportare deve comparire in almeno uno schema.

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
| M2M                               | `Post ↔ Tag` (tabella ponte `post_tags`, DDL in F1, widget in F4) |
| risorsa read-only (D5)            | `Order` (flag `readOnly` arriva in F1)    |

In F0 solo `Tag` e `Product` sono registrati nell'admin: sono gli unici il
cui AST regge l'introspettore del PoC. Gli altri schemi sono il bersaglio
di F1 (mine #1/#2 di `plan.md`) — vedi `test/f1-debt.test.ts`.
