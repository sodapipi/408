# 408 学习助手 · uni-app 移动端

一套 Vue 3 + uni-app 代码，同时编译 H5 和微信小程序。后端沿用仓库根目录的 FastAPI，接口全部复用，没有改动 `static/` 下的网页版（网页版仍可正常使用，作为对照）。

## 1. 环境与安装

- Node.js 18+（本机验证版本 v22.16.0 / npm 10.9.2）
- 后端解释器：`C:\ProgramData\anaconda3\envs\py311\python.exe`

```powershell
# 1) 先启动后端（在仓库根目录）
C:\ProgramData\anaconda3\envs\py311\python.exe run_server.py

# 2) 安装前端依赖（在 mobile 目录）
cd E:\record\mobile
npm install
```

## 2. 启动 H5（本地开发）

```powershell
npm run dev:h5
```

打开 <http://127.0.0.1:5173/>。

H5 开发环境不写死后端地址，而是通过 `vite.config.js` 里的代理把 `/api`、`/uploads` 转发到 `http://127.0.0.1:8000`，因此不需要改后端 CORS。

## 3. 编译微信小程序

```powershell
# 一次性构建（产物在 dist/build/mp-weixin）
npm run build:mp-weixin

# 或者开发模式（产物在 dist/dev/mp-weixin，改动自动同步）
npm run dev:mp-weixin
```

用微信开发者工具导入：

1. 打开微信开发者工具 → 导入项目；
2. 目录选择 `E:\record\mobile\dist\build\mp-weixin`（开发模式则选 `dist\dev\mp-weixin`）；
3. AppID 使用测试号 `touristappid`（已写进 `src/manifest.json`，无需真实 AppID 也能预览）；
4. 在「详情 → 本地设置」勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**（因为开发阶段直连 `http://127.0.0.1:8000`）；
5. 点击编译即可。前置条件：后端 `run_server.py` 正在运行。

> 小程序端请求走 `uni.request` / `uni.uploadFile`；H5 端请求层用 `fetch` + `FormData`，由条件编译自动切换，业务代码不用判断平台。

## 4. 换域名上线要改哪里

只需要改 **`src/config.js`** 里的 `BASE_URL`：

```js
// 微信小程序 / App：必须是 HTTPS 且已在小程序后台配置 request、uploadFile 合法域名
let BASE_URL = 'https://api.example.com'
// #ifdef H5
BASE_URL = ''   // H5 部署后同样填 https 域名；本地开发留空走 vite 代理
// #endif
```

- H5：本地开发保持 `''`（走代理）；上线时把 `#ifdef H5` 里的值改成后端域名，然后 `npm run build:h5`，产物在 `dist/build/h5`。
- 小程序：改成备案过的 HTTPS 域名，并在小程序后台「开发管理 → 开发设置 → 服务器域名」添加 `request` 与 `uploadFile` 域名。开发阶段先按上文勾选「不校验合法域名」。
- 图片地址会由 `fileUrl()` 自动拼接同一域名，不需要另配。

## 5. 功能范围（与网页版对齐，无新增）

| 分区 | 能力 |
| --- | --- |
| 概览 | 今日新增 / 待掌握 / 累计错题 / 已掌握；最该补的三章；各科掌握度热力图 |
| 录题 | 拍照/选图 → `/api/ocr` 识别 → 文字可改 → 保存后自动清空继续（本轮计数） |
| 错题本 | 科目/章节/错因/状态/关键词筛选；详情；修正分类；软删除；回收站恢复 |
| 重做 | 按科目/章抽题，查看答案，标记仍错/掌握，复习次数同步 |
| 政治 | 知识点卡（挖空揭晓、自评、手改次数）、时政、分析题框架、政治选择题错题；统一搜索跨四类 |

政治的四张表（知识点卡 / 时政 / 框架 / 错题）删除依旧是**软删除**：删除写 `deleted_at` 时间戳，列表与搜索默认过滤，界面里切到「回收站」可恢复。政治不参与掌握度、不参与「最该补的三章」，也不进重做队列。

## 6. 目录说明

```
mobile/
├─ index.html               H5 入口
├─ vite.config.js           H5 代理、ec-canvas 的 commonjs 配置
└─ src/
   ├─ config.js             后端地址（唯一需要换域名的地方）
   ├─ pages.json            页面与 tabBar 配置（首页注册了 ec-canvas）
   ├─ manifest.json         小程序 AppID / H5 路由等
   ├─ api/
   │  ├─ request.js         请求层：H5 fetch / 小程序 uni.request，条件编译
   │  └─ index.js           全部后端接口封装
   ├─ pages/
   │  ├─ home/              概览 + 热力图
   │  ├─ entry/             录题（OCR）
   │  ├─ list/              错题列表与回收站
   │  ├─ detail/            详情与修正分类
   │  ├─ review/            重做
   │  └─ politics/          政治四分区 + 统一搜索
   └─ wxcomponents/
      └─ ec-canvas/         小程序端 ECharts（ec-canvas + echarts.js）
```

## 7. 已知限制

- 小程序端编辑走 `PATCH`。极少数很老的基础库不支持该 method，遇到时请把微信开发者工具的「调试基础库」升到 2.20+。
- 热力图 H5 用 npm `echarts`，小程序用 `ec-canvas`（`src/wxcomponents/ec-canvas`），两端图表容器高度固定为 250px，避免拉满屏幕。
- 章节数据不在移动端维护，来自后端 `/api/bootstrap`；改章节请改根目录 `chapters.yaml` 后执行 `python -m app.seed`。
- 移动端只调接口，不直连数据库；数据库迁移仍由后端启动时完成。
