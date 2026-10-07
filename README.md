# 儿童自然拼读课程编排工具

面向自然拼读教师的纯前端课程设计工具。老师可以组织音素、单词、句子和练习，检查教学顺序与质量，并在本机离线继续编辑。

## 功能

- 按音素、单词、句子、练习四类活动编排课程。
- 设置活动难度、预计时长、教学提示、无障碍说明和练习反馈。
- 使用复选框建立前置活动依赖，并检测循环依赖和失效引用。
- 手机、平板、桌面三种预览宽度，按课程顺序查看学习路径。
- 自动检查音素提前使用、相似音混淆、例句过长、练习缺少反馈、无障碍说明缺失。
- 活动上移、下移、复制、删除，以及整门课程复制。
- **归属与发布治理**：每门课有且只有一位负责人（`ownerId`），只有他能发布；其他人可以改草稿并保存“草稿存档”，但发布请求会被直接拒绝（越权拒绝）。负责人可交接课程。
- **定稿冻结**：发布成功后活动顺序、依赖关系、音素说明与课程信息整体冻结到 `published` 快照（不可变）。之后任何人编辑的都是草稿，质量检查、学习路径和版本比较默认都以“已发布那版”为准。
- **并发控制**：课程带单调递增的修订号 `revision`（乐观锁）。发布必须携带所基于的修订号；两位老师同时提交时先到者把修订号 +1，后到者因修订号失配被拒绝（冲突），只有一位成功。跨标签页以 localStorage 中的修订号为权威，并通过 storage 事件自动同步对方的新定稿。
- **失败回滚**：发布是纯函数 + 一次性落库；质量门禁不通过、越权或冲突时不产生定稿。冲突拒绝保留本地草稿且不覆盖存储中别人的定稿；落库后失败会补偿写回发布前课程，保证“恢复成发布前的样子”。
- **旧数据升级**：v1 老课程在打开时自动迁移到 v2，补录负责人（默认陈老师）与发布状态——最近一个含活动的旧快照补录为“已发布 v1”定稿，更早的快照转为草稿存档，原始 v1 数据保留；迁移幂等，也宽容脏字段。
- 保存完整课程快照（发布定稿 + 草稿存档），并以已发布定稿为基准比较当前草稿或任一历史版本的活动增删、顺序、依赖、音素和字段变化。
- 所有数据自动保存到 localStorage，断网后仍可编辑。
- `Ctrl/Cmd+Z` 撤销、`Ctrl/Cmd+Y` 重做、`Alt+N` 新建活动、`Alt+↑/↓` 调整顺序、`Ctrl/Cmd+S` 保存草稿。

## 领域模型（v2）

代码位于 `src/lib/course/`：

- `types.ts`：`Course` 含 `ownerId`、`status: 'draft' | 'published'`、`revision`、`published: PublishedSnapshot | null`；历史条目 `CourseRevision` 区分 `release`（发布定稿）和 `archive`（草稿存档）。
- `publish.ts`：`publishCourse(course, { teacherId, expectedRevision, validate })` 纯函数，负责归属校验、乐观锁、质量门禁、冻结快照；失败抛 `PublishError`（`not-owner` / `conflict` / `has-errors` / `unchanged`）。
- `store.ts`：Svelte store，身份切换、草稿编辑与撤销栈、发布互斥与回滚、跨标签页定稿同步。
- `analysis.ts` / `versions.ts`：质量检查与定稿基准比较，可对任意活动集运行。
- `migrate.ts` / `seed.ts` / `teachers.ts`：v1→v2 迁移、种子课程、教师目录。

## 测试

```bash
npm test
```

使用 esbuild（Vite 自带）即时编译 `scripts/*.test.ts` 后由 node:test 运行，无额外依赖。覆盖：越权拒绝、并发只有一位成功、质量门禁、失败回滚、定稿冻结、以定稿为准的比较、v1 旧数据迁移，以及 store 层的跨会话并发与跨标签页同步。

## 技术栈

- SvelteKit + TypeScript
- Svelte 5
- Carbon Components Svelte
- Vite
- 浏览器 localStorage
- Nginx 静态部署

## 本地开发

```bash
npm install
npm run dev
```

开发服务器监听 `5173`，宿主端口仅由部署映射，源码未写入 `10026`。

## 生产构建

```bash
npm install
npm run build
```

静态产物位于 `build`。也可以执行 `npm run check` 做 Svelte/TypeScript 检查。

## Docker

```bash
docker build -t sologsb-1026 .
docker run --rm -p 10026:80 sologsb-1026
```

容器内 Nginx 监听 `80`，访问 `http://localhost:10026`。课程数据仅保存在当前浏览器。
