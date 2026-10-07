import type { Activity } from './types';
import { DEFAULT_OWNER_ID } from './teachers';

export const SCHEMA_VERSION = 2;
export const LEGACY_STORAGE_KEY = 'sologsb-1026-phonics-course-v1';
export const STORAGE_KEY = 'sologsb-1026-phonics-course-v2';
export const SESSION_TEACHER_KEY = 'sologsb-1026-current-teacher';

/** 从 v1 的 CourseVersion 转为 v2 的“草稿存档”历史条目（非定稿）。 */
function toArchiveEntry(legacyVersion: unknown): import('./types').CourseRevision | null {
  if (!legacyVersion || typeof legacyVersion !== 'object') return null;
  const v = legacyVersion as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.savedAt !== 'string') return null;
  const activities = Array.isArray(v.activities) ? sanitizeActivities(v.activities) : [];
  return {
    id: v.id,
    // 老版本不是负责人发布的定稿，一律标 archive，不冒充发布记录。
    kind: 'archive',
    label: typeof v.label === 'string' ? v.label : '历史存档',
    note: typeof v.note === 'string' ? v.note : '',
    savedAt: v.savedAt,
    revision: 0,
    // releaseNo / publishedBy 缺失即表示不是发布条目
    activities
  };
}

function toPublishedSnapshot(value: Record<string, unknown>, ownerId: string): import('./types').PublishedSnapshot | null {
  const versionId = typeof value.id === 'string' ? value.id : `v-legacy-${Date.now()}`;
  const savedAt = typeof value.savedAt === 'string' ? value.savedAt : new Date().toISOString();
  const activities = Array.isArray(value.activities) ? sanitizeActivities(value.activities) : [];
  if (activities.length === 0) return null; // 老的空快照不能算“已定稿”
  return {
    versionId,
    // 老课程此前没有发布序列，这一批次统一记为第 1 次发布。
    releaseNo: 1,
    revision: 1,
    publishedAt: savedAt,
    // “给老课程补负责人”：历史快照归属补记到该负责人名下。
    publishedBy: ownerId,
    title: typeof value.title === 'string' ? value.title : '',
    // v1 快照只存活动，课程级字段在迁移时用当前草稿回填。
    level: '',
    ageRange: '',
    objective: '',
    activities
  };
}

/**
 * 旧数据升级：把 v1（无主课程）补全为带 ownerId / status / revision / published 的 v2。
 * 适用于任何来源不明的旧对象，重复执行也是幂等的（已是 v2 只做字段补全）。
  */
export function migrateCourse(raw: unknown): import('./types').Course {
  if (!raw || typeof raw !== 'object') {
    throw new Error('课程数据不可读');
  }
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.activities)) {
    throw new Error('课程数据缺少活动列表');
  }

  const ownerId = typeof value.ownerId === 'string' && value.ownerId
    ? value.ownerId
    : DEFAULT_OWNER_ID;

  // 已是新版：补全可能缺失的字段后原样保留，不动归属、不动发布状态。
  if (value.schemaVersion === SCHEMA_VERSION) {
    return normalizeV2(value, ownerId);
  }

  // ---- v1 -> v2 ----
  const rawVersions = Array.isArray(value.versions) ? value.versions : [];
  const archives = rawVersions.map(toArchiveEntry).filter((entry): entry is import('./types').CourseRevision => entry !== null);

  // 老课程补“发布状态”：以时间线上最后一个含活动的快照作为既有定稿，
  // 避免升级后教研组被迫把正在用的课程全部重新发布一遍；没有有效快照则保持草稿。
  const hasActivities = (v: unknown): v is Record<string, unknown> => {
    if (!v || typeof v !== 'object') return false;
    const activities = (v as Record<string, unknown>).activities;
    return Array.isArray(activities) && activities.length > 0;
  };
  const lastMeaningful = [...rawVersions].reverse().find(hasActivities);

  const published = lastMeaningful ? toPublishedSnapshot(lastMeaningful, ownerId) : null;

  const course: import('./types').Course = {
    schemaVersion: SCHEMA_VERSION,
    id: typeof value.id === 'string' ? value.id : `course-${Date.now()}`,
    title: typeof value.title === 'string' ? value.title : '未命名课程',
    level: typeof value.level === 'string' ? value.level : '',
    ageRange: typeof value.ageRange === 'string' ? value.ageRange : '',
    objective: typeof value.objective === 'string' ? value.objective : '',
    ownerId,
    // 老课程“定不定稿”的事实从既有快照推断；快照里课程信息回填到 published。
    status: published ? 'published' : 'draft',
    // 已经发布过的老课程修订号从 1 开始，下一次发布走到 2；没发布过为 0。
    revision: published ? 1 : 0,
    activities: sanitizeActivities(value.activities),
    // release 条目由 published 生成并放在时间线最后（它本来就是最晚的快照）。
    versions: published
      ? [...archives.filter((entry) => entry.id !== published.versionId), publishedToRevision(published, value)]
      : archives,
    published,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
  };

  // 老快照未存课程级信息，用当前草稿的内容补全定稿头部，保证比较/检查能显示标题。
  if (published) {
    published.title = course.title;
    published.level = course.level;
    published.ageRange = course.ageRange;
    published.objective = course.objective;
  }
  return course;
}

/** 把推断出的定稿补成一条 release 历史，替换时间线上对应的老 archive。 */
function publishedToRevision(
  published: import('./types').PublishedSnapshot,
  legacyValue: Record<string, unknown>
): import('./types').CourseRevision {
  const legacyList = Array.isArray(legacyValue.versions) ? legacyValue.versions : [];
  const legacy = legacyList.find((v) =>
    v && typeof v === 'object' && (v as Record<string, unknown>).id === published.versionId
  ) as Record<string, unknown> | undefined;
  return {
    id: published.versionId,
    kind: 'release',
    label: '发布 v1（升级前定稿）',
    note: typeof legacy?.note === 'string' ? legacy.note : '由旧版课程数据升级补录的定稿。',
    savedAt: published.publishedAt,
    revision: 1,
    releaseNo: 1,
    publishedBy: published.publishedBy,
    activities: structuredClone(published.activities)
  };
}

function normalizeV2(value: Record<string, unknown>, ownerId: string): import('./types').Course {
  const status = value.status === 'published' ? 'published' : 'draft';
  const revision = Number.isInteger(value.revision) ? Number(value.revision) : 0;
  const versions = Array.isArray(value.versions)
    ? value.versions.map(toArchiveEntry).filter((entry): entry is import('./types').CourseRevision => entry !== null)
    : [];
  const course: import('./types').Course = {
    schemaVersion: SCHEMA_VERSION,
    id: typeof value.id === 'string' ? value.id : `course-${Date.now()}`,
    title: typeof value.title === 'string' ? value.title : '未命名课程',
    level: typeof value.level === 'string' ? value.level : '',
    ageRange: typeof value.ageRange === 'string' ? value.ageRange : '',
    objective: typeof value.objective === 'string' ? value.objective : '',
    ownerId,
    status,
    revision: status === 'published' && revision === 0 ? 1 : revision,
    activities: sanitizeActivities(value.activities),
    versions,
    published: null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
  };
  if (value.published && typeof value.published === 'object') {
    const p = value.published as Record<string, unknown>;
    if (Array.isArray(p.activities) && p.activities.length > 0) {
      course.published = {
        versionId: typeof p.versionId === 'string' ? p.versionId : `v-${Date.now()}`,
        releaseNo: typeof p.releaseNo === 'number' ? p.releaseNo : 1,
        revision: typeof p.revision === 'number' ? p.revision : course.revision,
        publishedAt: typeof p.publishedAt === 'string' ? p.publishedAt : course.updatedAt,
        publishedBy: typeof p.publishedBy === 'string' ? p.publishedBy : ownerId,
        title: typeof p.title === 'string' ? p.title : course.title,
        level: typeof p.level === 'string' ? p.level : course.level,
        ageRange: typeof p.ageRange === 'string' ? p.ageRange : course.ageRange,
        objective: typeof p.objective === 'string' ? p.objective : course.objective,
        activities: sanitizeActivities(p.activities)
      };
      // 发布状态与定稿保持一致：有快照就是已发布。
      course.status = 'published';
      // 恢复时间线上的 release 条目。
      const releaseEntry: import('./types').CourseRevision = {
        id: course.published.versionId,
        kind: 'release',
        label: `发布 v${course.published.releaseNo}`,
        note: '已发布定稿。',
        savedAt: course.published.publishedAt,
        revision: course.published.revision,
        releaseNo: course.published.releaseNo,
        publishedBy: course.published.publishedBy,
        activities: structuredClone(course.published.activities)
      };
      if (!course.versions.some((entry) => entry.id === releaseEntry.id && entry.kind === 'release')) {
        course.versions.push(releaseEntry);
      }
    }
  }
  return course;
}

function sanitizeActivities(raw: unknown): Activity[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const a = (item ?? {}) as Record<string, unknown>;
    const type = ['音素', '单词', '句子', '练习'].includes(a.type as string) ? a.type as Activity['type'] : '练习';
    return {
      id: typeof a.id === 'string' ? a.id : `a-migrated-${index}`,
      type,
      title: typeof a.title === 'string' ? a.title : `活动 ${index + 1}`,
      content: typeof a.content === 'string' ? a.content : '',
      phonemes: Array.isArray(a.phonemes) ? a.phonemes.filter((p): p is string => typeof p === 'string') : [],
      dependencies: Array.isArray(a.dependencies) ? a.dependencies.filter((d): d is string => typeof d === 'string') : [],
      difficulty: typeof a.difficulty === 'number' ? a.difficulty : 1,
      prompt: typeof a.prompt === 'string' ? a.prompt : '',
      accessibility: typeof a.accessibility === 'string' ? a.accessibility : '',
      duration: typeof a.duration === 'number' ? a.duration : 8,
      feedback: typeof a.feedback === 'string' ? a.feedback : ''
    };
  });
}
