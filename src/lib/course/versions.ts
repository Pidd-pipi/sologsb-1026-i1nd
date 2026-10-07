import type { Activity, Course, CourseRevision, PublishedSnapshot, VersionDiff } from './types';

/** 比较任意两组活动快照（如：已发布定稿 vs 某次存档/当前草稿）。 */
export function compareActivities(base: Activity[], target: Activity[]): VersionDiff[] {
  const rows: VersionDiff[] = [];
  const baseMap = new Map(base.map((activity) => [activity.id, activity]));
  const targetMap = new Map(target.map((activity) => [activity.id, activity]));
  for (const activity of base) {
    if (!targetMap.has(activity.id)) rows.push({ id: activity.id, title: activity.title, kind: 'removed', detail: '目标版本已删除该活动' });
  }
  for (const activity of target) {
    const before = baseMap.get(activity.id);
    if (!before) {
      rows.push({ id: activity.id, title: activity.title, kind: 'added', detail: `${activity.type} · ${activity.duration} 分钟` });
      continue;
    }
    const fields: string[] = [];
    if (before.title !== activity.title) fields.push('标题');
    if (before.content !== activity.content) fields.push('内容');
    // 顺序变化（同 id 在数组中的位置不同）也要在比较中体现。
    if (base.findIndex((item) => item.id === before.id) !== target.findIndex((item) => item.id === activity.id)) fields.push('顺序');
    if (before.difficulty !== activity.difficulty) fields.push('难度');
    if (before.duration !== activity.duration) fields.push('时长');
    if (JSON.stringify(before.dependencies) !== JSON.stringify(activity.dependencies)) fields.push('依赖');
    if (JSON.stringify(before.phonemes) !== JSON.stringify(activity.phonemes)) fields.push('音素');
    if (before.prompt !== activity.prompt || before.accessibility !== activity.accessibility) fields.push('提示或无障碍');
    if (before.feedback !== activity.feedback) fields.push('练习反馈');
    if (fields.length) rows.push({ id: activity.id, title: activity.title, kind: 'changed', detail: `变化字段：${fields.join('、')}` });
  }
  return rows;
}

/**
 * 版本比较以“已发布那版”为固定基准：
 * - 课程已发布：基准是 published（定稿），目标可以是任意存档或当前草稿；
 * - 尚未发布：没有定稿可比，返回空结果，由 UI 提示先发布。
 */
export function compareWithPublished(course: Course, targetId: string): VersionDiff[] {
  if (!course.published) return [];
  const target = resolveRevisionActivities(course, targetId);
  if (!target) return [];
  return compareActivities(course.published.activities, target);
}

/** 取某次比较目标的活动；'draft' 表示当前草稿，其余匹配历史条目。 */
export function resolveRevisionActivities(course: Course, targetId: string): Activity[] | null {
  if (targetId === 'draft') return course.activities;
  const entry = course.versions.find((version) => version.id === targetId);
  return entry ? entry.activities : null;
}

export interface RevisionOption {
  id: string;
  label: string;
  savedAt: string;
  kind: CourseRevision['kind'];
  releaseNo?: number;
  publishedBy?: string;
}

/** 比较下拉项：当前草稿 + 各次历史（发布定稿在最前）。 */
export function revisionOptions(course: Course): RevisionOption[] {
  const draft: RevisionOption = { id: 'draft', label: '当前草稿（未发布改动）', savedAt: course.updatedAt, kind: 'archive' };
  const entries = [...course.versions].reverse().map((version) => ({
    id: version.id,
    label: version.label,
    savedAt: version.savedAt,
    kind: version.kind,
    releaseNo: version.releaseNo,
    publishedBy: version.publishedBy
  }));
  return [draft, ...entries];
}

export function latestRelease(course: Course): CourseRevision | null {
  return [...course.versions].reverse().find((version) => version.kind === 'release') ?? null;
}

export function publishedSnapshot(course: Course): PublishedSnapshot | null {
  return course.published;
}
