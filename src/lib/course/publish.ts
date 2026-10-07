import type { Activity, Course, CourseRevision, PublishedSnapshot } from './types';

/** 发布被拒绝的原因，UI 据此显示具体提示。 */
export type PublishRejection =
  | 'not-owner'
  | 'already-finalized'
  | 'conflict'
  | 'has-errors'
  | 'unchanged';

export class PublishError extends Error {
  constructor(readonly reason: PublishRejection, message: string) {
    super(message);
    this.name = 'PublishError';
  }
}

export interface PublishRequest {
  /** 提交发布的教师 id，必须等于课程负责人。 */
  teacherId: string;
  /** 教师打开页面 / 上次同步时看到的课程修订号，用作乐观锁。 */
  expectedRevision: number;
  note?: string;
  /** 用当前草稿做质量门禁；注入以便单测，UI 传入 analyzeCourse。 */
  validate?: (activities: Activity[]) => { level: string }[];
  now?: () => string;
  genId?: () => string;
}

export interface PublishOutcome {
  course: Course;
  snapshot: PublishedSnapshot;
  revision: CourseRevision;
}

/**
 * 发布课程定稿。纯函数：绝不原地修改输入，任何一步失败都抛 PublishError，
 * 调用方持有的原课程就是“发布前的样子”，直接丢弃结果即可完成回滚。
 *
 * 规则：
 * 1. 只有负责人能发布，其他人直接拒绝（越权发布）；
 * 2. 每位教师提交时必须带自己看到的修订号，两位教师同时提交只有先到者成功，
 *    后到者 expectedRevision 对不上 -> conflict 拒绝；
 * 3. 质量门禁不通过不得发布；
 * 4. 成功后顺序、依赖、音素说明整体冻结进 published，草稿之后怎么改都不动它；
 * 5. 已发布课程的草稿若与定稿逐字段一致，则没有可发布的新内容。
 */
export function publishCourse(current: Course, request: PublishRequest): PublishOutcome {
  if (!request.teacherId) {
    throw new PublishError('not-owner', '无法识别发布教师，发布已拒绝。');
  }
  // 1. 归属校验：越权发布直接拒绝，不继续做任何变更。
  if (current.ownerId !== request.teacherId) {
    throw new PublishError('not-owner', `只有负责人 ${current.ownerId} 可以发布，${request.teacherId} 无权发布。`);
  }
  // 2. 乐观锁：修订号不一致说明期间已有一次发布落定（并发的另一位/另一个标签页先成功了）。
  if (current.revision !== request.expectedRevision) {
    throw new PublishError(
      'conflict',
      `课程已被更新到第 ${current.revision} 版（你基于第 ${request.expectedRevision} 版提交），本次发布为过期提交，已拒绝。请刷新定稿后重试。`
    );
  }
  // 3. 质量门禁。
  const issues = request.validate ? request.validate(current.activities) : [];
  if (issues.some((issue) => issue.level === 'error')) {
    throw new PublishError('has-errors', '课程仍存在必须处理的质量问题，发布已拒绝。');
  }
  // 4. 已发布且草稿与定稿一致（活动 + 课程级字段都没有变化）：幂等拒绝，不产生新版本。
  if (current.published && sameAsPublished(current.published, current)) {
    throw new PublishError('unchanged', '草稿与当前已发布定稿完全一致，没有需要发布的变化。');
  }

  const now = (request.now ?? (() => new Date().toISOString()))();
  const genId = request.genId ?? (() => `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  // 先在副本上构建全部结果，构建过程中抛错不会影响入参 current。
  const next: Course = structuredClone(current);
  const releaseNo = (current.published?.releaseNo ?? 0) + 1;
  const newRevision = current.revision + 1;
  const versionId = genId();

  const snapshot: PublishedSnapshot = {
    versionId,
    releaseNo,
    revision: newRevision,
    publishedAt: now,
    publishedBy: request.teacherId,
    title: next.title,
    level: next.level,
    ageRange: next.ageRange,
    objective: next.objective,
    activities: structuredClone(next.activities)
  };

  const totalMinutes = snapshot.activities.reduce((sum, item) => sum + item.duration, 0);
  const revisionEntry: CourseRevision = {
    id: versionId,
    kind: 'release',
    label: `发布 v${releaseNo}`,
    note: request.note?.trim() || `定稿 ${snapshot.activities.length} 个活动，共 ${totalMinutes} 分钟。`,
    savedAt: now,
    revision: newRevision,
    releaseNo,
    publishedBy: request.teacherId,
    activities: structuredClone(snapshot.activities)
  };

  // 全部对象构造成功后才提交到副本（这之后不会再抛错）。
  next.published = snapshot;
  next.status = 'published';
  next.revision = newRevision;
  next.versions.push(revisionEntry);
  next.updatedAt = now;

  return { course: next, snapshot, revision: revisionEntry };
}

/** 比较两组活动的顺序、依赖与全部字段（含音素说明）是否完全一致。 */
export function sameActivities(a: Activity[], b: Activity[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 草稿相对已定稿内容（课程级字段 + 活动序列）是否完全没有变化。 */
export function sameAsPublished(snapshot: PublishedSnapshot, current: Course): boolean {
  const sameMeta = snapshot.title === current.title
    && snapshot.level === current.level
    && snapshot.ageRange === current.ageRange
    && snapshot.objective === current.objective;
  return sameMeta && sameActivities(snapshot.activities, current.activities);
}

/**
 * “发布失败后恢复成发布前的样子”的显式回滚入口。
 * publishCourse 是纯函数，失败时不会落库；store 层用它对“已写入再失败”的
 * 场景做补偿，保证 localStorage 回到发布前的课程。
 */
export function restoreBeforePublish(before: Course): Course {
  return structuredClone(before);
}
