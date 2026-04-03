# Board

`Board` 是一个基于 Flask + React 的数据看板项目，当前主要包含以下业务页面：

- 首页今日概览
- Juhe 聚合数据页
- TikTokBot 独立统计页
- 关注用户管理页
- 消息删除管理页
- User Report 用户报告页

后端负责提供 API 和托管前端构建产物，前端负责页面路由、交互、图表和表格展示。

## 技术栈

- 后端：Flask、PyMySQL、Pandas
- 前端：React、TypeScript、Vite、ECharts
- 数据源：MySQL

## 目录结构

```text
board/
├─ app.py                  Flask 主入口，注册 API 并托管 frontend/dist
├─ juhe.py                 Juhe 相关接口
├─ message_manage.py       消息管理页后端接口与服务逻辑
├─ user_report.py          用户报告相关接口
├─ config.py               环境变量和数据库配置加载
├─ frontend/               React 前端
│  ├─ src/App.tsx
│  ├─ src/components/AppShell.tsx
│  ├─ src/components/PageIntro.tsx
│  ├─ src/config/page-info.ts
│  ├─ src/lib/message-delete.ts
│  ├─ src/lib/session-cache.ts
│  ├─ src/pages/DashboardPage.tsx
│  ├─ src/pages/JuhePage.tsx
│  ├─ src/pages/MessageDeletePage.tsx
│  ├─ src/pages/TikTokPage.tsx
│  ├─ src/pages/UserManagePage.tsx
│  └─ src/pages/UserReportPage.tsx
├─ README.md
└─ GIT_CHANGES_OVERVIEW.md
```

## 功能概览

### 首页

- 顶部 `page-info` 使用英文眉题 + 中文标题 + 页面说明
- 顶部日期切换与今日快捷按钮
- 三大区块：核心指标、数据图表、消息明细
- 图表点击可筛选，消息/作品图点击空白区域可清除筛选
- 消息明细表筛选、排序、链接跳转
- 区块折叠与拖拽排序

### Juhe 页

- 顶部 `page-info` 与首页统一
- 聚合 KPI 卡片
- 全平台来源分布
- 热门城市数据质量
- 上海市详细数据监控
- 顶部日期选择器支持左右切换和日历选取

### TikTokBot 页

- 从首页拆分出的独立统计页
- 保留 TikTok 维度的数据展示
- 顶部 `page-info` 与首页统一

### 关注用户管理页

- 顶部 `page-info` 与首页统一
- 三大区块：核心指标、图表报告、关注用户详细
- 核心指标支持快捷筛选：`全部关注 / 有效关注 / 特别关注 / 待巡检`
- 当存在筛选条件时，`全部关注` 卡片会切换显示为 `筛选后用户数`，再次点击可恢复全部关注
- 图表支持点击筛选
- 平台图已调整为“各平台关注类型分布图”，可按平台和关注类型联动筛选
- 表格支持双击单元格编辑并保存

### 消息管理页

- 页面访问路径：`/message-manage`
- 包含 4 个功能页签：
  - 条件查询
  - SQL 查询
  - 消息 ID 区间
  - 消息检查
- 条件查询和消息检查都基于 `messages` 表字段构造可视化条件
- SQL 查询页固定使用 `SELECT MESSAGE_ID FROM messages WHERE ...`
- 消息 ID 区间页固定处理 `chat_id=708424141`
- 所有删除操作都遵循“先预览，再确认执行”
- 日志已拆分为按功能独立记录，页面底部会随当前页签显示对应日志
- 支持在页面内直接清理当前功能日志

### User Report 页

- 活跃度日历
- 关联账号维度统计
- 历史消息记录与筛选
- 页面风格与首页保持一致

## 环境配置

项目优先从根目录 `.env` 读取数据库配置，没有 `.env` 时再读取系统环境变量。

先复制模板：

```powershell
Copy-Item .env.example .env
```

常见配置如下：

```text
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_password_here

NICEBOT_DB_NAME=nicebot
TIKTOK_DB_NAME=tiktok_bot
JUHE_DB_NAME=juhe
```

如果不同业务库使用不同连接信息，也可以分别配置：

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

MESSAGE_DELETE_LOG_TAIL_LINES=120
MESSAGE_DELETE_DOWNLOAD_ROOT=D:\python\download
```

消息管理页日志默认写入：

```text
logs/message_manage_condition_query.log
logs/message_manage_sql_query.log
logs/message_manage_id_range.log
logs/message_manage_message_check.log
```

## 安装依赖

### 后端

建议使用项目内虚拟环境：

```powershell
cd D:\python\board
uv sync
```

如果你已经有 `.venv`，也可以直接复用现有环境。

### 前端

```powershell
cd D:\python\board\frontend
npm install
```

## 启动方式

### 方式 1：直接运行 Flask 入口

```powershell
cd D:\python\board
uv run python app.py
```

默认访问地址：

```text
http://127.0.0.1:12345
```

这是最推荐的启动方式，因为会使用 `app.py` 中定义的端口和入口逻辑。

### 方式 2：使用 Flask CLI

```powershell
cd D:\python\board
uv run python -m flask run --port 12345
```

注意：

- 如果只执行 `flask run` 或 `python -m flask run`，Flask 默认会启动在 `5000` 端口
- 这不会自动使用 `app.py` 里 `app.run(... port=12345 ...)` 的配置

### 方式 3：前端开发模式

终端 1：

```powershell
cd D:\python\board
uv run python app.py
```

终端 2：

```powershell
cd D:\python\board\frontend
npm run dev
```

前端开发地址：

```text
http://127.0.0.1:5173
```

Vite 已代理 `/api/*` 到后端服务。

## 前端构建

```powershell
cd D:\python\board\frontend
npm run build
```

构建产物输出到：

```text
frontend/dist
```

构建完成后，Flask 会直接托管最新的前端静态资源。

## 主要访问路径

启动后可直接访问：

- `/`
- `/juhe`
- `/tiktok`
- `/users`
- `/message-manage`
- `/user/<identity>`

例如：

```text
http://127.0.0.1:12345/user/周妍希
```

## 主要接口

当前前端主要依赖这些接口：

- `/api/niceme`
- `/api/niceme/works_dist`
- `/api/list/niceme_messages`
- `/api/niceme/users`
- `/api/niceme/users/<user_id>`
- `/api/niceme/message-delete/sql/preview`
- `/api/niceme/message-delete/sql/execute`
- `/api/niceme/message-delete/sql/execute-single`
- `/api/niceme/message-delete/id-range/preview`
- `/api/niceme/message-delete/id-range/execute`
- `/api/niceme/message-delete/delivery-check`
- `/api/niceme/message-delete/query-fields`
- `/api/niceme/message-delete/logs`
- `/api/niceme/message-delete/logs/clear`
- `/api/tiktok/scraped`
- `/api/tiktok/active`
- `/api/tiktok/new`
- `/api/juhe/stats`
- `/api/juhe/shanghai`
- `/api/user/report`
- `/api/user/messages`
- `/api/user/heatmap`

## 页面文案配置

4 个主页面顶部 `page-info` 的英文眉题、中文标题和说明文案已集中放在：

```text
frontend/src/config/page-info.ts
```

修改这一个文件即可统一调整：

- 首页
- TikTok 页
- 关注用户管理页
- 消息删除管理页
- Juhe 页

## 缓存行为

前端已加入“本次网页会话缓存”：

- 刷新网页后重新请求数据
- 切换日期或月份时重新请求对应数据
- 仅在页面之间切换时，直接复用已获取数据，不重复请求

相关实现位于：

```text
frontend/src/lib/session-cache.ts
```

## 最近这轮前端调整

- 左侧导航支持悬停展开、固定展开，且展开时不会遮挡右侧内容
- 顶部 `page-info` 抽为统一组件，4 个主页面统一样式
- 顶部文案抽到配置文件，支持集中自定义
- 首页标题改为“今日概览”，布局拆分为核心指标、数据图表、消息明细
- 首页图表支持点击筛选，空白点击清除筛选
- TikTokBot 统计从首页拆分为独立页面
- Juhe 页顶部样式与主页统一，保留聚合监控内容
- 关注用户管理页重组为核心指标、图表报告、关注用户详细
- 消息管理页内置删除与检查服务，支持条件查询、SQL 查询、消息 ID 区间删除、消息检查、按功能独立日志与日志清理
- User Report 页改回与首页同风格的区块布局
- 页面切换默认复用已获取数据，减少重复请求
- User 页面直达路由补齐，支持中文用户名路径

## 验证

前端改动后建议执行：

```powershell
cd D:\python\board\frontend
npm run build
```

后端改动后建议执行：

```powershell
cd D:\python\board
uv run python -m py_compile app.py message_manage.py user_report.py juhe.py
```
