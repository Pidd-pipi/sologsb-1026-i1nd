export type ActivityType = '音素' | '单词' | '句子' | '练习';
export type ViewMode = 'compose' | 'path' | 'issues' | 'versions';
export type PreviewWidth = 'phone' | 'tablet' | 'desktop';
export type IssueLevel = 'error' | 'warning' | 'info';

/** 草稿 / 已发布。已发布课程仍可改草稿，但定稿内容不受影响。 */
export type CourseStatus = 'draft' | 'published';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  content: string;
  phonemes: string[];
  dependencies: string[];
  difficulty: number;
  prompt: string;
  accessibility: string;
  duration: number;
  feedback: string;
}

/**
 * 历史条目分两类：
 * - release：负责人发布产生的定稿版本，带发布序号（v1、v2…），永久不可变；
 * - archive：任何人都可保存的草稿快照，仅作对照，不是定稿。
 */
export interface CourseRevision {
  id: string;
  kind: 'release' | 'archive';
  label: string;
  note: string;
  savedAt: string;
  /** 产生该条目时课程所处的修订号；release 的修订号即定稿修订号。 */
  revision: number;
  /** release：第几次发布（从 1 开始）；archive 为空。 */
  releaseNo?: number;
  /** release：发布负责人的教师 id。 */
  publishedBy?: string;
  activities: Activity[];
}

/** 已发布定稿：顺序、依赖、音素说明在此冻结，质量检查与版本比较都以它为准。 */
export interface PublishedSnapshot {
  versionId: string;
  releaseNo: number;
  revision: number;
  publishedAt: string;
  publishedBy: string;
  title: string;
  level: string;
  ageRange: string;
  objective: string;
  activities: Activity[];
}

export interface Course {
  schemaVersion: 2;
  id: string;
  title: string;
  level: string;
  ageRange: string;
  objective: string;
  /** 课程负责人 id，只有该教师可以发布。 */
  ownerId: string;
  status: CourseStatus;
  /**
   * 乐观锁修订号，每次发布 +1。
   * 发布请求必须带上它所基于的修订号，与当前值不一致即判定为过期并发提交，直接拒绝。
   */
  revision: number;
  activities: Activity[];
  versions: CourseRevision[];
  published: PublishedSnapshot | null;
  updatedAt: string;
}

export interface Diagnostic {
  id: string;
  activityId: string;
  level: IssueLevel;
  category: string;
  title: string;
  detail: string;
}

export interface VersionDiff {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed';
  detail: string;
}
