# Board

`Board` 是一个基于 Flask + React 的数据看板项目，当前主要包含以下业务页面：

- 首页数据中心
- Juhe 聚合数据页
- TikTokBot 独立统计页
- User 管理页
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
├─ user_report.py          用户报告相关接口
├─ config.py               环境变量和数据库配置加载
├─ frontend/               React 前端
│  ├─ src/App.tsx
│  ├─ src/components/AppShell.tsx
│  ├─ src/pages/DashboardPage.tsx
│  ├─ src/pages/JuhePage.tsx
│  ├─ src/pages/TikTokPage.tsx
│  └─ src/pages/UserReportPage.tsx
└─ README.md
```

## 功能概览

### 首页

- 左侧边栏默认收起，悬停展开
- 顶部日期切换与今日快捷按钮
- NiceBot 统计卡片、消息分布、作品分布、趋势图
- 消息明细表筛选、排序、复制、链接跳转
- 区块折叠与拖拽排序

### Juhe 页

- 聚合 KPI 卡片
- 全平台来源分布
- 热门城市数据质量
- 上海市详细数据监控
- 顶部日期选择器支持左右切换和日历选取

### TikTokBot 页

- 从首页拆分出的独立统计页
- 保留 TikTok 维度的数据展示

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
- `/api/tiktok/scraped`
- `/api/tiktok/active`
- `/api/tiktok/new`
- `/api/juhe/stats`
- `/api/juhe/shanghai`
- `/api/user/report`
- `/api/user/messages`
- `/api/user/heatmap`

## 最近这轮前端调整

- 左侧导航改为默认隐藏、悬停展开
- 顶部多余按钮移除，主题切换只保留在左侧边栏
- 首页恢复旧版布局、折叠与拖拽排序能力
- 深色模式图表文字和对比度修正
- TikTokBot 统计从首页拆分为独立页面
- Juhe 页恢复旧版顶部样式和上海详细数据监控
- User Report 页改回与首页同风格的区块布局
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
uv run python -m py_compile app.py user_report.py juhe.py
```
