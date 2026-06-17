# 个人博客

一个前后端分离的个人博客示例项目：

- 前端：Vite + React
- 后端：Go + JSON-RPC
- 数据库：PostgreSQL
- 功能：后台发帖、前台看文章、评论、点赞

## 目录结构

```text
.
├── backend/          # Go JSON-RPC 后端
├── frontend/         # Vite React 前端
├── db/               # PostgreSQL schema 和 seed
├── docker-compose.yml
└── README.md
```

## 启动 PostgreSQL

```bash
docker compose up -d postgres
```

数据库首次启动会自动执行 `db/schema.sql` 和 `db/seed.sql`。

如果使用本机 PostgreSQL，也可以手动执行：

```bash
psql "postgres://blog:blog@localhost:5432/blog?sslmode=disable" -f db/schema.sql
psql "postgres://blog:blog@localhost:5432/blog?sslmode=disable" -f db/seed.sql
```

## 启动后端

```bash
cd backend
go mod download
go run .
```

默认配置：

- `DATABASE_URL=postgres://blog:blog@localhost:5432/blog?sslmode=disable`
- `ADMIN_TOKEN=change-me`
- `HTTP_ADDR=:8080`

生产或公开环境请务必修改 `ADMIN_TOKEN`。

## 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 Vite 输出的地址，通常是 <http://localhost:5173>。

后台发帖面板在页面右侧，管理 Token 默认填写 `change-me`。

## JSON-RPC 方法

后端统一入口是 `POST /rpc`。

- `posts.list`：文章列表，传入正确 `adminToken` 时包含草稿
- `posts.get`：文章详情和评论
- `posts.create`：后台创建文章，需要 `adminToken`
- `comments.add`：新增评论
- `posts.like`：点赞

请求示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "posts.list",
  "params": {}
}
```

## 提交到 Git 仓库

本项目已包含 `.gitignore`。初始化并提交：

```bash
git init
git add .
git commit -m "Initial personal blog app"
```

关联远程仓库后推送：

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

