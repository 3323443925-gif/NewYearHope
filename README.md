# 星屿祈光 · Starlight Isle

> 给未说出口的话，和新年愿望的一座光屿  
> *A quiet island for unspoken words & new year wishes.*

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](./LICENSE)

**星屿祈光（Starlight Isle / NewYearHope）** 是一座基于“真、善、美”理念打造的冬夜 3D 浮岛留言网站。始于迎接新年伊始的温暖仪式，并永久开放，让全世界的旅人在孤独或怀抱希望的时刻，都能随时放飞一盏星灯、彼此问好与安慰。

---

## 核心特性 / Features

- **轻量化 3D 雪夜浮岛**：原生 Three.js 程序化低模圣诞树群、飘雪星空、微光辉映与双端触控拖拽；支持弱机/无 WebGL 自动降级至 Canvas 2D 夜空。
- **本地 24 小时燃烧引线与每日 0 点烟花**：岛边星光礼花筒的引线随**访客设备本地时间** `00:00 ~ 23:59` 实时燃烧推进，每日本地 0 点燃尽升空绽放烟花；并随临近 1 月 1 日逐步演进节日氛围。
- **留言化作孔明灯与星愿**：免登录即可发布（文字 + 心情标签 + 内置治愈 SVG 贴纸 + 前端压缩并剥离 EXIF 的照片），支持自定义“是否允许陌生人回复”；同屏优雅限流（桌面 ≤ 50 / 移动 ≤ 30 盏）保证流畅。
- **温和互动与本机记忆**：公开温暖回信 + 点亮祝福（祝你如愿 / 抱抱你 / 新年好）；本机自动记住“我的灯”、提醒新回复，并支持一键自主撤回熄灭。
- **真善美守护**：内置中英敏感词与广告过滤、自伤倾向公益心理热线暖心提示、可插拔云端文本/图片安全审核接口、举报满 3 次自动隐藏与极简 `/admin` 管理后台。
- **中英双语 & 国内直连友好**：自动识别语言并支持一键切换；生产环境所有 Supabase 请求与图片加载均经自有域名服务端代理与缓存，零浏览器直连 `*.supabase.co`。

---

## 快速启动 / Quick Start

要求：`Node.js >= 22.13`（推荐 Node 24 LTS，内置 `node:sqlite`，本地零配置即可运行）。

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可体验完整功能（默认启用本地 SQLite 数据库与本地图片存储）。

- 测试烟花效果：访问 `http://localhost:3000/?demoFireworks=1` 或点击浮岛雪地上的礼花筒预览。
- 模拟不同日期/时刻（如 `23:59:50`）：访问 `http://localhost:3000/?previewTime=2026-12-31T23:59:50`。
- 管理后台：访问 `http://localhost:3000/admin`（默认开发密钥见 `.env.example` 中的 `ADMIN_TOKEN`）。

---

## 生产部署（Vercel + Supabase）

1. 在 Supabase（推荐选择 **Singapore** 或 **Tokyo** 节点）执行 [`supabase/schema.sql`](./supabase/schema.sql) 建表，并创建名为 `lantern-images` 的 Storage Bucket。
2. 将仓库导入 Vercel，项目已内置 [`vercel.json`](./vercel.json) 将 Serverless Function 节点固定在香港（`hkg1`）。
3. 在 Vercel 环境变量中配置 `.env.example` 中的生产变量（`DATA_PROVIDER=supabase`、`STORAGE_PROVIDER=supabase`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_TOKEN`、`HASH_SALT` 及可选的 `OPENAI_API_KEY`）。
4. 绑定你的独立域名（如 `idnenz.cn`），即可全球与国内免 VPN 正常直连访问。

---

## 参与贡献 / Contributing

欢迎通过 Issue 与 Pull Request 一起守护和丰富这座冬夜小岛！特别欢迎：
- 新增多语言翻译（`src/locales/`）
- 更多治愈系矢量贴纸（`src/data/stickers.ts`）
- 更多云端内容安全审核适配器（`src/server/moderation/`）
- 节日演进视觉彩蛋与性能优化
