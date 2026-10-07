import test from 'node:test';
import assert from 'node:assert/strict';
import { publishCourse, PublishError, restoreBeforePublish } from '../src/lib/course/publish.js';
import { migrateCourse } from '../src/lib/course/migrate.js';
import { analyzeActivities } from '../src/lib/course/analysis.js';
import { compareWithPublished, revisionOptions } from '../src/lib/course/versions.js';
import { createSeedCourse } from '../src/lib/course/seed.js';
import { DEFAULT_OWNER_ID } from '../src/lib/course/teachers.js';
import type { Course } from '../src/lib/course/types.js';

const OWNER = DEFAULT_OWNER_ID;
const OTHER = 'teacher-lin';
const THIRD = 'teacher-wang';

function validatingCourse(overrides: Partial<Course> = {}): Course {
  const course = structuredClone(createSeedCourse());
  // 种子课程本身无 error 级问题。
  assert.equal(analyzeActivities(course.activities).filter((i) => i.level === 'error').length, 0);
  return { ...course, ...overrides };
}

test('只有负责人能发布：越权发布直接拒绝，课程保持原样', () => {
  const before = validatingCourse();
  assert.throws(
    () => publishCourse(before, { teacherId: OTHER, expectedRevision: 0, validate: analyzeActivities }),
    (error: unknown) => error instanceof PublishError && error.reason === 'not-owner'
  );
  // 失败是纯函数语义：入参未被改动。
  assert.equal(before.status, 'draft');
  assert.equal(before.revision, 0);
  assert.equal(before.published, null);
});

test('负责人发布成功：顺序、依赖、音素冻结进定稿，草稿与定稿分离', () => {
  const course = validatingCourse();
  const result = publishCourse(course, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities });
  assert.equal(result.course.status, 'published');
  assert.equal(result.course.revision, 1);
  assert.equal(result.snapshot.releaseNo, 1);
  assert.equal(result.snapshot.publishedBy, OWNER);
  assert.deepEqual(result.snapshot.activities.map((a) => a.id), course.activities.map((a) => a.id));
  assert.equal(result.course.versions.at(-1)?.kind, 'release');
  assert.equal(result.course.versions.at(-1)?.publishedBy, OWNER);

  // 改草稿（调顺序、改依赖、删音素说明）不动定稿。
  result.course.activities.reverse();
  result.course.activities[0].dependencies.push('a-1');
  result.course.activities[0].phonemes = [];
  assert.deepEqual(
    result.snapshot.activities.map((a) => a.id),
    course.activities.map((a) => a.id),
    '定稿顺序未被草稿调整影响'
  );
  assert.deepEqual(result.snapshot.activities[0].phonemes, course.activities[0].phonemes);
});

test('两位老师同时提交：只有一位成功，后到者修订号失配被拒绝', () => {
  // 场景 A：负责人本人两个标签页基于第 0 版同时点发布。
  const c0 = validatingCourse();
  const r1 = publishCourse(c0, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities });
  assert.equal(r1.course.revision, 1);
  assert.throws(
    () => publishCourse(r1.course, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities }),
    (error: unknown) => error instanceof PublishError && error.reason === 'conflict'
  );

  // 场景 B：另一用户的过期提交（存储已被先到者推到第 1 版）也被拒绝。
  assert.throws(
    () => publishCourse(r1.course, { teacherId: OTHER, expectedRevision: 0, validate: analyzeActivities }),
    (error: unknown) => error instanceof PublishError && ['conflict', 'not-owner'].includes(error.reason)
  );

  // 负责人基于最新第 1 版改草稿后可发布 v2，revision 递增到 2。
  const c1 = structuredClone(r1.course);
  c1.activities.push({
    id: 'a-new', type: '练习', title: '新练习', content: 'go', phonemes: ['/g/'],
    dependencies: ['a-7'], difficulty: 2, prompt: 'p', accessibility: 'a', duration: 6, feedback: 'f'
  });
  // /g/ 未教 => error，门禁会挡；补一个音素活动。
  c1.activities.unshift({
    id: 'a-g', type: '音素', title: '认识 /g/', content: '/g/', phonemes: ['/g/'],
    dependencies: [], difficulty: 1, prompt: 'p', accessibility: 'a', duration: 5, feedback: ''
  });
  const r2 = publishCourse(c1, { teacherId: OWNER, expectedRevision: 1, validate: analyzeActivities });
  assert.equal(r2.course.revision, 2);
  assert.equal(r2.snapshot.releaseNo, 2);
});

test('非负责人即使课程已发布，也无法以过期或最新修订号发布', () => {
  const c0 = validatingCourse();
  const published = publishCourse(c0, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities }).course;
  for (const expectedRevision of [0, 1]) {
    assert.throws(
      () => publishCourse(published, { teacherId: OTHER, expectedRevision, validate: analyzeActivities }),
      (error: unknown) => error instanceof PublishError && error.reason === 'not-owner'
    );
  }
});

test('质量门禁：存在 error 级问题不得发布，错误前不产生任何定稿', () => {
  const course = validatingCourse();
  const practice = course.activities.find((a) => a.id === 'a-6')!;
  practice.feedback = ''; // 练习去掉反馈 -> error
  assert.ok(analyzeActivities(course.activities).some((i) => i.level === 'error'));
  assert.throws(
    () => publishCourse(course, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities }),
    (error: unknown) => error instanceof PublishError && error.reason === 'has-errors'
  );
  assert.equal(course.published, null);
  assert.equal(course.status, 'draft');
  assert.equal(course.revision, 0);
});

test('草稿与定稿一致时重复发布被拒绝（幂等），不会产生空白新版本', () => {
  const c0 = validatingCourse();
  const published = publishCourse(c0, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities }).course;
  assert.throws(
    () => publishCourse(published, { teacherId: OWNER, expectedRevision: 1, validate: analyzeActivities }),
    (error: unknown) => error instanceof PublishError && error.reason === 'unchanged'
  );
  assert.equal(published.versions.filter((v) => v.kind === 'release').length, 1);
});

test('发布失败即回滚：补偿函数恢复出发布前课程，且与原对象隔离', () => {
  const before = validatingCourse();
  const restored = restoreBeforePublish(before);
  restored.activities[0].title = '被污染';
  assert.notEqual(restored.activities[0].title, before.activities[0].title, '回滚副本与原对象隔离');
  assert.equal(before.status, 'draft');
});

test('版本比较以已发布定稿为基准：能看出草稿的新增/删除/顺序/依赖/音素变化', () => {
  const c0 = validatingCourse();
  const published = publishCourse(c0, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities }).course;

  const draft = structuredClone(published);
  draft.activities[0].title = '标题被修改';
  draft.activities[0].phonemes = ['/m/', '/x/'];
  draft.activities[1].dependencies = [];
  draft.activities.pop();
  draft.activities.push({
    id: 'a-x', type: '练习', title: '草稿新练习', content: 'x', phonemes: ['/s/'],
    dependencies: [], difficulty: 1, prompt: 'p', accessibility: 'a', duration: 5, feedback: 'f'
  });

  const diffs = compareWithPublished(draft, 'draft');
  const titles = diffs.map((d) => d.detail);
  assert.ok(diffs.some((d) => d.kind === 'removed'), '定稿独有活动应被列出');
  assert.ok(diffs.some((d) => d.kind === 'added'), '草稿新增活动应被列出');
  const changed = diffs.find((d) => d.id === 'a-1');
  assert.ok(changed && /音素/.test(changed.detail), '音素变化要体现在比较中');
  const depChanged = diffs.find((d) => d.id === 'a-2');
  assert.ok(depChanged && /依赖/.test(depChanged.detail), '依赖变化要体现在比较中');
  assert.ok(titles.length >= 1);

  // 未发布课程比较返回空。
  assert.deepEqual(compareWithPublished(validatingCourse(), 'draft'), []);
  assert.ok(revisionOptions(published).some((o) => o.id === 'draft'));
});

test('质量检查可以独立跑在定稿快照上，草稿后续破坏不影响定稿检查结论', () => {
  const c0 = validatingCourse();
  const published = publishCourse(c0, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities }).course;
  assert.equal(analyzeActivities(published.published!.activities).filter((i) => i.level === 'error').length, 0);

  const broken = structuredClone(published);
  broken.activities.find((a) => a.id === 'a-6')!.feedback = ''; // 草稿破坏质量
  assert.ok(analyzeActivities(broken.activities).some((i) => i.level === 'error'));
  assert.equal(analyzeActivities(broken.published!.activities).filter((i) => i.level === 'error').length, 0);
});

test('旧数据升级 v1 -> v2：补负责人、补发布状态，并把最近快照补录为 v1 定稿', () => {
  const legacy = {
    id: 'old-course',
    title: '老课程',
    level: '启蒙',
    ageRange: '5 岁',
    objective: '目标',
    updatedAt: '2026-08-01T10:00:00+08:00',
    activities: [
      { id: 'x-1', type: '音素', title: '老音素', content: '/a/', phonemes: ['/a/'], dependencies: [], difficulty: 1, prompt: 'p', accessibility: 'a', duration: 5, feedback: '' },
      { id: 'x-2', type: '练习', title: '老练习', content: 'go', phonemes: ['/a/'], dependencies: ['x-1'], difficulty: 1, prompt: 'p', accessibility: 'a', duration: 5, feedback: '反馈内容' }
    ],
    versions: [
      { id: 'ov-1', label: '初稿', savedAt: '2026-07-20T09:00:00+08:00', note: '最早', activities: [] },
      { id: 'ov-2', label: '二稿', savedAt: '2026-07-25T09:00:00+08:00', note: '在用版本', activities: [
        { id: 'x-1', type: '音素', title: '老音素', content: '/a/', phonemes: ['/a/'], dependencies: [], difficulty: 1, prompt: 'p', accessibility: 'a', duration: 5, feedback: '' }
      ] }
    ]
  };
  const migrated = migrateCourse(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.ownerId, DEFAULT_OWNER_ID, '老课程补负责人');
  assert.equal(migrated.status, 'published', '最近有效快照 => 已发布');
  assert.equal(migrated.revision, 1);
  assert.ok(migrated.published);
  assert.equal(migrated.published?.versionId, 'ov-2');
  assert.equal(migrated.published?.releaseNo, 1);
  assert.equal(migrated.published?.publishedBy, DEFAULT_OWNER_ID);
  assert.equal(migrated.published?.title, '老课程', '定稿头部用当前草稿课程信息回填');
  assert.ok(migrated.versions.some((v) => v.id === 'ov-2' && v.kind === 'release'));
  assert.ok(migrated.versions.some((v) => v.id === 'ov-1' && v.kind === 'archive'));

  // 迁移幂等：再迁一次状态不变。
  const again = migrateCourse(structuredClone(migrated));
  assert.equal(again.status, 'published');
  assert.equal(again.revision, 1);
  assert.equal(again.published?.versionId, 'ov-2');
});

test('旧数据升级：没有任何有效快照时保持草稿并补负责人', () => {
  const legacy = {
    id: 'old-empty', title: '空老课程', updatedAt: '2026-08-01T10:00:00+08:00',
    activities: [{ id: 'x-1', type: '音素', title: '/a/', content: '/a/', phonemes: ['/a/'], dependencies: [], difficulty: 1, prompt: 'p', accessibility: 'a', duration: 5, feedback: '' }],
    versions: [{ id: 'ov-empty', label: '空', savedAt: '2026-07-20T09:00:00+08:00', activities: [] }]
  };
  const migrated = migrateCourse(legacy);
  assert.equal(migrated.status, 'draft');
  assert.equal(migrated.revision, 0);
  assert.equal(migrated.published, null);
  assert.equal(migrated.ownerId, DEFAULT_OWNER_ID);
});

test('迁移宽容处理脏字段：非法类型与缺失依赖不会炸', () => {
  const dirty = {
    id: 'dirty', title: '脏', updatedAt: 'x',
    activities: [
      { id: 'd-1', type: '未知类型', phonemes: 'not-array', dependencies: [1, 'd-missing'], duration: 'nope' }
    ],
    versions: null
  };
  // @ts-expect-error 故意喂脏数据
  const migrated = migrateCourse(dirty);
  assert.equal(migrated.activities[0].type, '练习');
  assert.deepEqual(migrated.activities[0].phonemes, []);
  assert.deepEqual(migrated.activities[0].dependencies, ['d-missing']);
  assert.equal(migrated.activities[0].duration, 8);
  assert.equal(migrated.status, 'draft');
});

test('负责人交接后，旧负责人视角的过期提交被冲突拒绝（串行模拟并发）', () => {
  const c0 = validatingCourse();
  const v1 = publishCourse(c0, { teacherId: OWNER, expectedRevision: 0, validate: analyzeActivities }).course;
  const handed: Course = { ...structuredClone(v1), ownerId: THIRD };
  // 新负责人在第 1 版基础上调整草稿后签发第 2 版。
  handed.activities[0].title = `${handed.activities[0].title}（更新）`;
  const v2 = publishCourse(handed, { teacherId: THIRD, expectedRevision: 1, validate: analyzeActivities, now: () => '2026-10-07T10:00:00+08:00', genId: () => 'v-new' }).course;
  assert.equal(v2.revision, 2);
  assert.equal(v2.published?.publishedBy, THIRD);
  // 手里仍是第 1 版视图的提交（无论是谁）都因修订号过期被拒，只有一位能成功。
  assert.throws(
    () => publishCourse(v2, { teacherId: THIRD, expectedRevision: 1, validate: analyzeActivities }),
    (error: unknown) => error instanceof PublishError && error.reason === 'conflict'
  );
  // 原负责人在交接后完全失去发布权。
  assert.throws(
    () => publishCourse(v2, { teacherId: OWNER, expectedRevision: 2, validate: analyzeActivities }),
    (error: unknown) => error instanceof PublishError && error.reason === 'not-owner'
  );
});
