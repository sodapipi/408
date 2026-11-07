# 408 学习助手 v1

个人自用的错题本 + 章节掌握度诊断，单用户、无登录，数据全部保存在本机。

## 启动

在项目根目录下任选一种方式（以下命令均在项目根目录执行）：

```powershell
# 方式一：双击 start.bat，或在 PowerShell 里执行（脚本内已写死 py311 解释器，无需先激活 conda）
.\start.bat

# 方式二：直接命令行启动
C:\ProgramData\anaconda3\envs\py311\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

浏览器打开：**http://127.0.0.1:8000**

手机与电脑连同一个 Wi-Fi 后访问：启动时终端会打印自动检测到的局域网地址（形如 `http://192.168.x.x:8000`）；检测不到时用 `ipconfig` 查看本机 IPv4 地址。

`start.bat` 为纯 ASCII + CRLF 批处理，不依赖激活状态；解释器路径不存在、目录不对或端口被占用时会打印明确提示并停在 `pause`，方便看报错。

**端口被占用时换端口**：

```powershell
netstat -ano | findstr :8000        # 最后一列是占用进程的 PID

# 临时指定端口启动（bat 会自动使用 ASSISTANT_PORT）
set ASSISTANT_PORT=8001
.\start.bat

# 或用命令行直接换端口
C:\ProgramData\anaconda3\envs\py311\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

> 关于 conda：交互式终端里 `conda activate py311` 是正常的（提示符会显示 `(py311)`）；之前观察到的“落回 base”只出现在 `conda run -n py311` 这类非交互调用中。`start.bat` 统一使用解释器绝对路径，因此激活或不激活都能启动。

首次启动会自动建库并导入 `chapters.yaml`。若换机器，先补依赖：

```powershell
C:\ProgramData\anaconda3\envs\py311\python.exe -m pip install -r requirements.txt
```

停止服务：在运行窗口按 `Ctrl+C`，随后按任意键关闭窗口。


## 目录结构

```
项目根目录
├─ app\
│  ├─ main.py          FastAPI 路由与业务逻辑
│  ├─ db.py            SQLite 表结构与连接
│  ├─ catalog.py       章节 YAML 校验、导入与同步
│  ├─ ocr.py           RapidOCR 离线识别封装
│  ├─ seed.py          章节重导命令
│  └─ __init__.py
├─ static\
│  ├─ index.html       单页前端
│  ├─ styles.css       样式与响应式布局
│  ├─ app.js           页面逻辑
│  └─ vendor\echarts.min.js
├─ data\
│  ├─ assistant.db     SQLite 数据库
│  └─ server.log       后台启动时的日志
├─ uploads\            题目照片
├─ chapters.yaml       章节树与分值权重（可编辑）
├─ run_server.py       后台启动脚本（日志写入 data\server.log）
├─ start.bat           前台启动
├─ requirements.txt
└─ README.md
```

## 数据库与备份

- 数据库：`data\assistant.db`（相对项目根目录）
- 照片：`uploads\`（相对项目根目录）
- 服务运行时数据库为 WAL 模式，`data\` 下可能同时出现 `assistant.db-wal`、`assistant.db-shm`。

**备份**（服务运行中也可执行，会生成一致性快照）：

```powershell
# 在项目根目录执行
C:\ProgramData\anaconda3\envs\py311\python.exe -c "import sqlite3; src=sqlite3.connect(r'data/assistant.db'); dst=sqlite3.connect(r'data/backup.db'); src.backup(dst); dst.close(); src.close(); print('backup ok')"
```

然后把 `data\backup.db` 和 `uploads\` 一起复制到别处即可。恢复时先停止服务，把备份文件放回 `data\assistant.db`，再放回对应的 `uploads` 照片。

## 修改章节

章节树在 `chapters.yaml` 中维护：科目 → 章（含权重）→ 节。父级关系由嵌套层级表达。408 四科的分值权重按 45 / 45 / 35 / 25 分配到章，数学二按高数、线代讲次划分，英语二按题型划分。政治作为独立科目追加在文件末尾，章是五大块（马原 24 / 毛中特 30 / 史纲 14 / 思修 16 / 形策 16），节按考研大纲的章划分，以后换老师或换教材直接改这个文件重导即可。

改完文件后执行：

```powershell
# 在项目根目录执行
C:\ProgramData\anaconda3\envs\py311\python.exe -m app.seed
```

重导会更新已有章节、新增章节；文件里删掉的章节，若没有错题引用会直接删除，有引用则停用（历史错题仍保留）。导入前会校验每科章权重合计是否等于 `total_weight`。

## v1 功能与口径

- **录题**：科目 → 章 → 节三级联动；照片或文字至少一项；错因标签必选；保存后自动记住当前科目与章节。
- **错题本**：按科目、章节、错因、日期筛选，支持关键词搜索；可查看原图、编辑章节与错因。
- **掌握度**：错误率 = 该章仍未掌握错题数 / 该章累计错题数；重做标记「掌握」后状态更新。
- **最该补的三章**：按 `章分值权重 × 错误率（掌握度缺口）` 排序。
- **重做模式**：只抽「未掌握」错题，随机排序；标记「掌握 / 仍错」并记录复习时间。

## v2 新增：拍照录题（本地 OCR）

- 一张照片对应一道错题。上传后自动用本地 RapidOCR（onnxruntime，CPU）识别印刷体，识别结果填入可编辑文本框，识别错了可以直接改。
- 原图完整保存作为题目本体；OCR 原始文字另存到 `ocr_raw` 字段，关键词搜索使用你改过的 `content`。
- 保存后自动清空照片与文字，保留当前科目与章节，可直接拍下一张；录题页会显示「本轮已录 N 道」。
- 识别失败或没有识别到文字时，文字留空也能只保存图片；手写答案、批注、数学公式与插图不做文字化。
- 首次识别需要加载模型，之后单张通常 0.5–3 秒（取决于照片分辨率）。
- 依赖：`rapidocr_onnxruntime`（内含 onnx 模型，约 15MB，无需联网或密钥）。换机器时执行：

```powershell
C:\ProgramData\anaconda3\envs\py311\python.exe -m pip install -r requirements.txt
```

- 数据兼容：启动时自动为已有数据库增加 `ocr_raw` 列，只加列不重建表，历史错题不受影响。

## v3 新增：政治模块

政治的错题本是**陷阱清单**，不是诊断工具，所以它单独占一个导航入口「政治」，统计口径与另外六科彻底分开。

- **不进任何诊断**：政治数据不参与掌握度、不参与「最该补的三章」排序、不算「今日新增」、不进重做队列；错题本页的科目筛选里也不出现政治。
- **知识点卡**：正面写考点名，背面写关键词 / 一句话解释（支持换行和要点）。默认遮住背面，点一下揭晓，揭晓即计一次「看过」；揭晓后可自评「记住了 / 没记住」。可按大块、章筛选抽卡，卡片显示看过次数、上次看的时间、最近自评。
- **时政 + 分析题框架**：时政按日期倒序堆叠，记事件、标签、关联考点、备注，可按标签和考点筛；分析题框架按题型（原理类 / 意义类 / 措施类等）存模板与关键词。两类都支持关键词搜索。
- **政治选择题错题**：复用录题页的照片上传、OCR、章节三级联动，只是科目选「政治」时多出必填的「错选项分析」和可选的年份，错因换成政治专用的六个标签。不做重做队列，也不做「掌握 / 仍错」标记——政治的第二遍会被答案带偏，重做没有意义。
- **统一搜索**：政治页顶部一个搜索框，同时查知识点卡、时政条目、分析题框架、政治错题，结果标注来源类型，点一下就跳到对应分区并定位到该条。
- **章节数据**：在 `chapters.yaml` 末尾的「政治」科目里，改完执行 `python -m app.seed` 重导。
- **数据兼容**：`questions` 表只新增 `qtype`、`option_analysis`、`exam_year` 三列（`qtype='politics_choice'` 标识政治选择题），新增 `knowledge_cards`、`current_affairs`、`answer_frameworks` 三张表，启动时自动迁移，不重建表，已有错题一条不丢。

## 说明

- 这是本机个人工具，无账号与权限体系，请不要把 8000 端口直接暴露到公网。
- 复习事件流水已保存在 `review_events` 表，为后续间隔复习队列预留。
