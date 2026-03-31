# Board

这个项目已经完成从 Flask 模板页到 React 前端的重构。

现在的整体结构是：

- Flask 负责提供 API
- React 负责所有页面
- Flask 直接托管 React 的构建产物
- Python 数据库配置已从业务代码中解耦，统一走环境变量 / `.env`

## 当前状态

以下页面都已经迁移到 React：

- `/`
- `/users`
- `/juhe`
- `/user/<identity>`

旧的 Jinja 模板页已经全部退役并移除。

## 项目结构

### 后端

- [app.py](D:/python/board/app.py)
  - Flask 主入口
  - 提供 `nicebot` / `tiktok_bot` API
  - 托管 `frontend/dist`
- [juhe.py](D:/python/board/juhe.py)
  - `juhe` 相关 API
- [user_report.py](D:/python/board/user_report.py)
  - 用户报告相关 API
- [config.py](D:/python/board/config.py)
  - 统一加载 `.env` 和环境变量
  - 统一生成数据库连接配置

### 前端

- [frontend](D:/python/board/frontend)
  - React + Vite + TypeScript
  - 统一路由、主题、布局和页面实现

核心页面：

- [frontend/src/pages/DashboardPage.tsx](D:/python/board/frontend/src/pages/DashboardPage.tsx)
- [frontend/src/pages/UserManagePage.tsx](D:/python/board/frontend/src/pages/UserManagePage.tsx)
- [frontend/src/pages/JuhePage.tsx](D:/python/board/frontend/src/pages/JuhePage.tsx)
- [frontend/src/pages/UserReportPage.tsx](D:/python/board/frontend/src/pages/UserReportPage.tsx)

核心壳子和配置：

- [frontend/src/components/AppShell.tsx](D:/python/board/frontend/src/components/AppShell.tsx)
- [frontend/src/App.tsx](D:/python/board/frontend/src/App.tsx)
- [frontend/src/index.css](D:/python/board/frontend/src/index.css)
- [frontend/vite.config.ts](D:/python/board/frontend/vite.config.ts)

## 现有 API

前端当前依赖这些接口：

- `/api/niceme`
- `/api/niceme/works_dist`
- `/api/list/niceme_messages`
- `/api/niceme/users`
- `/api/niceme/users/<user_id>`
- `/api/tiktok/scraped`
- `/api/tiktok/active`
- `/api/tiktok/new`
- `/api/juhe/stats`
- `/api/juhe/shanghai`
- `/api/user/report`
- `/api/user/messages`
- `/api/user/heatmap`

## 数据库配置

数据库配置已经不再直接写死在 `app.py`、`juhe.py`、`user_report.py` 里。

项目会优先从根目录下的 `.env` 文件读取配置；如果没有 `.env`，则读取系统环境变量。

可以先复制一份模板：

```powershell
Copy-Item .env.example .env
```

然后按你的环境填写：

```text
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_password_here

NICEBOT_DB_NAME=nicebot
TIKTOK_DB_NAME=tiktok_bot
JUHE_DB_NAME=juhe
```

如果三个库不在同一台机器，或者用户名密码不同，也可以分别覆盖：

```text
NICEBOT_DB_HOST=127.0.0.1
NICEBOT_DB_USER=root
NICEBOT_DB_PASSWORD=your_password_here

TIKTOK_DB_HOST=127.0.0.1
TIKTOK_DB_USER=root
TIKTOK_DB_PASSWORD=your_password_here

JUHE_DB_HOST=127.0.0.1
JUHE_DB_USER=root
JUHE_DB_PASSWORD=your_password_here
```

## 如何运行

### 方式 1：直接运行正式入口

在项目根目录执行：

```powershell
cd D:\python\board
.\.venv\Scripts\python app.py
```

打开：

```text
http://127.0.0.1:12345
```

这是 Flask 托管的正式站点入口。

### 方式 2：前端开发模式

适合做 React 页面开发。需要两个终端。

终端 1，启动 Flask API：

```powershell
cd D:\python\board
.\.venv\Scripts\python app.py
```

终端 2，启动 React 开发服务器：

```powershell
cd D:\python\board\frontend
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173
```

开发模式下，Vite 已代理：

- `/api/*` -> `http://127.0.0.1:12345`

## 前端构建

```powershell
cd D:\python\board\frontend
npm run build
```

构建产物输出到：

```text
frontend/dist
```

构建完成后，Flask 会自动使用新的构建产物作为站点入口。

## 页面访问路径

启动 Flask 后可直接访问：

- [主页](http://127.0.0.1:12345/)
- [User 管理](http://127.0.0.1:12345/users)
- [Juhe](http://127.0.0.1:12345/juhe)
- [用户报告](http://127.0.0.1:12345/user/test)

其中用户报告页的 `identity` 参数支持原有逻辑，比如用户名、用户 ID，或者特殊值 `favorite`。

## 已完成的重构内容

1. 统一入口，移除主页、Juhe、User 管理三套旧模板入口。
2. React 接管所有主页面。
3. 主页接入真实 `niceme / works_dist / tiktok` 数据。
4. User 管理页接入真实用户列表和保存接口。
5. Juhe 页接入真实聚合数据接口。
6. 用户报告页接入真实统计、热力图和消息分页接口。
7. Flask 已改为托管 React 构建产物。

## 当前遗留问题

这些问题还值得继续处理：

1. `PUT /api/niceme/users/<user_id>` 仍然缺字段白名单，存在安全风险。
2. 前端引入了 ECharts，当前打包体积偏大，可以做代码分割。
3. 仍有部分后端代码是“脚本式”写法，后续可以继续整理 service 层。
4. 旧代码里还有一些已经不再使用的逻辑和依赖，可以再做一轮清理。

## 建议下一步

如果继续优化，我建议按这个顺序：

1. 先修后端配置和安全问题
2. 再做前端拆包和性能优化
3. 最后再整理后端结构
