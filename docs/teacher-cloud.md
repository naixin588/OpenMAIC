# 教师工作台云端配置与边界

当前版本面向单个老师在本地或可信私网使用。云端部署需要同时准备数据库、私有文件存储和可持续执行任务的服务。接入 R2 只改变现有 Materials 的文件保存位置，不新增上传入口，也不替代 PostgreSQL、模型或后台任务。

## 最小配置

在应用服务端配置以下环境变量，然后重新部署。Vercel 项目在 Settings → Environment Variables 中设置生产环境；`NEXT_PUBLIC_PRO_WORKBENCH_ENABLED` 是构建时开关，必须重新构建。

```dotenv
OPENMAIC_AGENT_RUNTIME_ENABLED=true
NEXT_PUBLIC_PRO_WORKBENCH_ENABLED=true
DATABASE_URL=由数据库控制台提供的直连PostgreSQL地址
ACCESS_CODE=老师自己保管的访问码
MATERIAL_STORAGE_PROVIDER=s3
MATERIAL_S3_BUCKET=专用私有桶名称
MATERIAL_S3_ENDPOINT=https://你的账户ID.r2.cloudflarestorage.com
MATERIAL_S3_REGION=auto
MATERIAL_S3_ACCESS_KEY_ID=仅该桶对象读写权限的访问密钥ID
MATERIAL_S3_SECRET_ACCESS_KEY=对应密钥
```

以上值均为占位说明。不要将实际数据库地址、访问码或对象存储密钥提交 Git、发到聊天或写进 `NEXT_PUBLIC_*`。R2 桶保持私有，关闭 `r2.dev` 公开访问；老师通过现有鉴权接口上传、读取、删除文件，不需要公开桶域名或浏览器 CORS。

Neon 使用直连地址，保留控制台提供的 TLS 配置，也可显式设置 `sslmode=verify-full`。当前运行时还使用按连接生效的 PostgreSQL `LISTEN`，因此不使用事务池连接。应用首次读取会自动建立必要表，连接角色需要建表权限。学生档案的保存不要求配置 `PERSISTENCE_DEV_TOKEN` 或公开持久化 token。

模型仍按 `.env.example` 配置提供商密钥和 `MODEL_ROUTES` 中的 `maic-agent-driver`；启用文件与数据库不会自动获得免费的 OCR 或模型推理。

## 免费额度与运行成本

截至 2026-09-08，Cloudflare R2 Standard 每月免费额度包含 10 GB-month 存储、100 万次 Class A 操作、1000 万次 Class B 操作，直接从 R2 的出站流量免费。超出免费额度按量计费；不要选择没有对应免费层的 Infrequent Access。以 [R2 官方定价](https://developers.cloudflare.com/r2/pricing/) 及账户控制台为准，其他中间服务的流量费用另计。

本次 Neon Free 控制台显示每项目 0.5 GB 数据库存储、每月 100 CU-hours 计算和 5 GB 公网传输。可用最小 0.25 CU 和空闲 5 分钟休眠降低用量，具体限制以 [Neon 官方定价](https://neon.com/pricing) 和账户控制台为准。当前后台任务会周期性扫描数据库并使用 `LISTEN`，可能让数据库保持活跃、无法休眠，持续消耗计算额度。整体服务不保证永久免费，应检查双方用量。

## Vercel 限制

- `Function Storage` 保存各地区、各保留部署的函数程序包，与 R2 中的教材或答卷容量独立。Vercel 按存储量和保留时间累计 GB-month 用量；缩减新包或清理旧部署不会立即抹去已发生的用量。先在 Usage → Functions Storage → Projects 定位项目，再在部署 Resources 中比较函数大小；不要因提醒而直接删除整个项目。参见 [Deployment Storage](https://vercel.com/docs/deployment-storage) 与 [优化指南](https://vercel.com/docs/deployment-storage/optimize)。
- Vercel 使用 `pnpm build:vercel` 构建：配置读取保持固定文件路径，并从函数清单中排除仓库演示媒体、测试及本地数据。Next 16.1.2 的独立 instrumentation 清单需要在构建结束后应用同样的精确排除；保留运行时技能、PPTX worker、字体和 SDK。此处理只修改部署清单，不删除原始文件或学生资料。历史部署仍保留原包体，需要结合回滚需求单独管理；自动保留策略有最近部署和别名等例外，不能只缩短天数就保证立即释放空间。
- 上传仍经原有 `/api/materials`，本次没有实现预签名直传。Vercel Functions 请求和响应体上限为 **4.5 MB**，即使项目允许更大文件、R2 容量充足，也不能绕过这个限制。经应用返回原始文件时同样受限。测试时选用明显小于上限的虚构材料；大 PDF、PPTX 或视频需要后续直传适配或常驻服务器。参见 [Vercel Functions limits](https://vercel.com/docs/functions/limitations)。
- Agent 备课和资料提取仍在应用进程中启动后台计时器。Vercel serverless 不保证常驻运行，可能暂停或终止任务；R2 不解决任务持续执行。完整教学流程目前建议常驻 Node 服务或 Docker，搭配数据库和持久存储。
- 原有部分课件/生成媒体路径仍使用 `data/` 本地目录，接入 Materials 的 R2 后端不等于全项目文件路径已适配无状态部署。

### 继续缩减函数程序包

构建排除规则还精确覆盖开发用评测、端到端测试、工作区包测试、独立文档站/渲染服务、锁文件，以及未导出的两个重复浏览器 bundle。包的 ESM/CJS 入口、运行时模板、源码、SDK、worker、技能和 `public/vendor` 保留。聊天与幻灯片中的代码高亮在浏览器中按需加载，包含应用与公共 renderer 包的代码元素；服务端渲染不加载这些入口的 Shiki 语言数据。具体节省量须比较同环境生产构建的最终 NFT 和部署 Resources，不能把本地未压缩文件大小当成 Vercel 的累计 GB-month。

### 分担任务的下一步（尚未启用）

| 服务 | 可承担的工作 | 当前状态 |
| --- | --- | --- |
| Vercel | 网页、鉴权、任务入队、结果查询 | 仍同时运行现有后台任务和同步分析接口 |
| Neon | 学生记录、已有任务队列、事件与执行租约 | 已接入；持续轮询可能阻止休眠 |
| R2 | 私有教材、作业与答卷文件；后续保存生成媒体 | Materials 已接入；生成图片、视频、配音尚未共享 |
| 独立 Node worker | 领取已有备课与材料提取任务 | 尚未提供独立入口或切换生产执行角色 |

本机 worker 可主动连接同一 Neon 和 R2，无需开放公网端口，但使用时必须开机。全天候云端 worker 则需要可持续运行 Node 的主机，不能保证在免费配额内。R2 只能存文件，不能执行 PPT 生成或模型解析程序。

迁移前先将生成媒体接入现有资产存储与 owner 鉴权，再提供独立执行角色、停机恢复及跨进程测试，最后通过构建清单证明 worker 专属依赖已离开 Vercel。不要通过关闭 `OPENMAIC_AGENT_RUNTIME_ENABLED` 停止 web 端 runner：这个开关还会关闭教师、材料和 agent 接口。教师作业分析、考试提取和原有同步生成接口需分别迁移；仅分离现有两个 runner 不会搬走全部计算。

## 验证、迁移与备份

使用新的浏览器身份，输入访问码后刷新教师工作台。`GET /api/teacher/students` 返回 `200` 和空名册即可验证数据库初始化与读取，不必录入真实学生。`/api/health` 和 `/api/agent/runtime` 只报告应用或开关状态，不能证明数据库连通。上传一个虚构小文件，刷新后读取并删除，再检查桶对象和材料列表是否一致。

未设置 `MATERIAL_STORAGE_PROVIDER` 或设为 `local` 时继续使用本地 `data/`。配置为 `s3` 但缺少配置时会明确失败，不会偷偷写回本地。切换后不会自动搬迁已有文件：迁移需先备份数据库与 `data/`，停写后按原始 key 将 Materials 对象复制到目标桶并校验内容，确认完成才切换。不要只换配置后删除旧目录。

远程写入先完整读取并限制输入大小，再提交单次原子 PUT；流失败或超限不会覆盖已有文件。如果服务已提交但应答丢失，应用会读回并比对内容，无法确认时保留待清理记录，避免当作文件不存在；不会用回滚或删除破坏一次已有对象的并发写入。按前缀清理逐页执行，任何未成功的删除都会保留可重试状态。

老师身份恢复码、PostgreSQL 备份和 R2 对象备份须分别保管。身份恢复码不包含学生资料；数据库备份不自动备份 R2。免费额度和云端存储都不等于已有独立备份，本版本没有自动跨云备份或文件迁移工具。
