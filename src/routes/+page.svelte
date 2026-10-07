<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Button,
    Checkbox,
    InlineNotification,
    Select,
    SelectItem,
    Tag,
    TextArea,
    TextInput,
    Tile,
    ToastNotification
  } from 'carbon-components-svelte';

  type ActivityType = '音素' | '单词' | '句子' | '练习';
  type ViewMode = 'compose' | 'path' | 'issues' | 'versions';
  type PreviewWidth = 'phone' | 'tablet' | 'desktop';
  type IssueLevel = 'error' | 'warning' | 'info';
  type CourseStatus = 'draft' | 'published';
  type NoticeKind = 'error' | 'success' | 'info' | 'warning';

  interface Teacher {
    id: string;
    name: string;
    role: string;
  }

  interface Activity {
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

  interface CourseVersion {
    id: string;
    label: string;
    savedAt: string;
    note: string;
    activities: Activity[];
  }

  interface CourseRelease {
    id: string;
    label: string;
    savedAt: string;
    note: string;
    publishedBy: string;
    activities: Activity[];
  }

  interface Course {
    id: string;
    title: string;
    level: string;
    ageRange: string;
    objective: string;
    ownerId: string;
    status: CourseStatus;
    activities: Activity[];
    versions: CourseVersion[];
    releases: CourseRelease[];
    publishedReleaseId: string | null;
    revision: number;
    updatedAt: string;
  }

  interface Diagnostic {
    id: string;
    activityId: string;
    level: IssueLevel;
    category: string;
    title: string;
    detail: string;
  }

  interface VersionDiff {
    id: string;
    title: string;
    kind: 'added' | 'removed' | 'changed';
    detail: string;
  }

  const STORAGE_KEY = 'sologsb-1026-phonics-course-v1';
  const USER_KEY = 'sologsb-1026-current-user';
  const LOCK_KEY = 'sologsb-1026-publish-lock';
  const LOCK_TTL_MS = 5000;

  const teachers: Teacher[] = [
    { id: 't-wang', name: '王雪梅', role: '教研组长' },
    { id: 't-li', name: '李一鸣', role: '自然拼读教师' },
    { id: 't-chen', name: '陈可', role: '自然拼读教师' },
    { id: 't-zhao', name: '赵之衡', role: '课程顾问' }
  ];

  const confusablePairs = [
    ['/b/', '/p/'], ['/d/', '/t/'], ['/f/', '/v/'], ['/m/', '/n/'], ['/ɪ/', '/iː/'], ['/æ/', '/e/']
  ];

  const initialCourse = (): Course => ({
    id: 'course-phonics-1',
    title: 'Starter Phonics · 声音侦探',
    level: '启蒙一级',
    ageRange: '5–6 岁',
    objective: '建立音素意识，能听辨、拼读并书写短元音单词。',
    ownerId: 't-wang',
    status: 'published',
    publishedReleaseId: 'rel-1',
    revision: 2,
    updatedAt: '2026-09-24T16:20:00+08:00',
    activities: [
      {
        id: 'a-1', type: '音素', title: '听音游戏：认识 /m/', content: '/m/',
        phonemes: ['/m/'], dependencies: [], difficulty: 1,
        prompt: '闭上嘴唇，轻轻发出 /m/，感受鼻子的震动。',
        accessibility: '提供口型示范图和可重复播放的低频音频。', duration: 6, feedback: ''
      },
      {
        id: 'a-2', type: '音素', title: '首音识别：/s/ 与 /m/', content: '/s/ /m/',
        phonemes: ['/s/', '/m/'], dependencies: ['a-1'], difficulty: 1,
        prompt: '听到单词时拍手，听到 /m/ 时把手放在鼻子上。',
        accessibility: '视觉提示使用不同形状，不只依赖颜色。', duration: 8, feedback: ''
      },
      {
        id: 'a-3', type: '单词', title: '拼读短词：sat', content: 's – a – t → sat',
        phonemes: ['/s/', '/æ/', '/t/'], dependencies: ['a-2'], difficulty: 2,
        prompt: '用手指依次点每个字母，再连起来读。',
        accessibility: '字母块支持键盘逐字聚焦和屏幕阅读器朗读。', duration: 10, feedback: '三条电缆拼在一起形成完整电路。'
      },
      {
        id: 'a-4', type: '练习', title: '听音选图：m / s 开头', content: 'moon, sun, mat, sock',
        phonemes: ['/m/', '/s/'], dependencies: ['a-2'], difficulty: 2,
        prompt: '先听单词，再从两张图片中选出正确首音。',
        accessibility: '所有图片均配替代文本，可只用键盘选择。', duration: 8, feedback: ''
      },
      {
        id: 'a-5', type: '音素', title: '短元音 /æ/ 的口型', content: '/æ/',
        phonemes: ['/æ/'], dependencies: ['a-1'], difficulty: 2,
        prompt: '嘴巴张大，舌尖放低，声音短而有力。',
        accessibility: '提供正面口型、侧面舌位和慢速音频。', duration: 6, feedback: ''
      },
      {
        id: 'a-6', type: '句子', title: '拼读句子：Mat sat.', content: 'Mat sat on the mat.',
        phonemes: ['/m/', '/æ/', '/s/', '/t/'], dependencies: ['a-3'], difficulty: 3,
        prompt: '先读每个单词，再按意群连读句子。',
        accessibility: '句子可按词高亮，并提供更大字号选项。', duration: 10, feedback: '读对了，再试试让声音更连贯。'
      },
      {
        id: 'a-7', type: '练习', title: '把单词和图片配对', content: 'mat · map · sun · sock',
        phonemes: ['/m/', '/æ/', '/s/'], dependencies: ['a-3', 'a-4'], difficulty: 3,
        prompt: '读出单词，然后把单词卡拖到对应图片。',
        accessibility: '支持键盘选择起点和终点，不使用拖拽也能完成。', duration: 12, feedback: '答对后播放该单词的分解音。'
      },
      {
        id: 'a-8', type: '句子', title: '迁移朗读：A man sat.', content: 'A man sat and had a nap.',
        phonemes: ['/m/', '/æ/', '/n/'], dependencies: ['a-6'], difficulty: 4,
        prompt: '观察 a 和 man 之间的联系，再完整朗读。',
        accessibility: '提供分句导航、朗读速度控制和高对比模式。', duration: 12, feedback: ''
      }
    ],
    versions: [
      {
        id: 'v-1', label: '初稿', savedAt: '2026-09-21T10:00:00+08:00', note: '完成音素和基础拼读活动。',
        activities: []
      },
      {
        id: 'v-2', label: '增加句子迁移', savedAt: '2026-09-24T15:30:00+08:00', note: '补充 A man sat and had a nap.',
        activities: [
          {
            id: 'a-1', type: '音素', title: '听音游戏：认识 /m/', content: '/m/', phonemes: ['/m/'], dependencies: [], difficulty: 1,
            prompt: '闭上嘴唇，轻轻发出 /m/。', accessibility: '口型示范和重复音频。', duration: 6, feedback: ''
          },
          {
            id: 'a-2', type: '音素', title: '首音识别：/s/ 与 /m/', content: '/s/ /m/', phonemes: ['/s/', '/m/'], dependencies: ['a-1'], difficulty: 1,
            prompt: '听到单词时拍手。', accessibility: '不同形状的视觉提示。', duration: 8, feedback: ''
          },
          {
            id: 'a-3', type: '单词', title: '拼读短词：sat', content: 's – a – t → sat', phonemes: ['/s/', '/æ/', '/t/'], dependencies: ['a-2'], difficulty: 2,
            prompt: '用手指依次点每个字母。', accessibility: '键盘逐字聚焦。', duration: 10, feedback: '形成完整电路。'
          },
          {
            id: 'a-6', type: '句子', title: '拼读句子：Mat sat.', content: 'Mat sat on the mat.', phonemes: ['/m/', '/æ/', '/s/', '/t/'], dependencies: ['a-3'], difficulty: 3,
            prompt: '先读每个单词，再按意群连读。', accessibility: '按词高亮。', duration: 10, feedback: '再试试更连贯。'
          }
        ]
      }
    ],
    releases: [
      {
        id: 'rel-1',
        label: '第 1 次发布',
        savedAt: '2026-09-24T16:20:00+08:00',
        publishedBy: 't-wang',
        note: '定稿 4 个活动 · 34 分钟。',
        activities: [
          {
            id: 'a-1', type: '音素', title: '听音游戏：认识 /m/', content: '/m/', phonemes: ['/m/'], dependencies: [], difficulty: 1,
            prompt: '闭上嘴唇，轻轻发出 /m/。', accessibility: '口型示范和重复音频。', duration: 6, feedback: ''
          },
          {
            id: 'a-2', type: '音素', title: '首音识别：/s/ 与 /m/', content: '/s/ /m/', phonemes: ['/s/', '/m/'], dependencies: ['a-1'], difficulty: 1,
            prompt: '听到单词时拍手。', accessibility: '不同形状的视觉提示。', duration: 8, feedback: ''
          },
          {
            id: 'a-3', type: '单词', title: '拼读短词：sat', content: 's – a – t → sat', phonemes: ['/s/', '/æ/', '/t/'], dependencies: ['a-2'], difficulty: 2,
            prompt: '用手指依次点每个字母。', accessibility: '键盘逐字聚焦。', duration: 10, feedback: '形成完整电路。'
          },
          {
            id: 'a-6', type: '句子', title: '拼读句子：Mat sat.', content: 'Mat sat on the mat.', phonemes: ['/m/', '/æ/', '/s/', '/t/'], dependencies: ['a-3'], difficulty: 3,
            prompt: '先读每个单词，再按意群连读。', accessibility: '按词高亮。', duration: 10, feedback: '再试试更连贯。'
          }
        ]
      }
    ]
  });

  let course: Course = initialCourse();
  let currentUserId = teachers[0].id;
  let selectedActivityId = course.activities[0]?.id ?? '';
  let activeView: ViewMode = 'compose';
  let previewWidth: PreviewWidth = 'desktop';
  let compareBaseId = course.releases[0]?.id ?? '';
  let compareTargetId = course.releases.at(-1)?.id ?? '';
  let hydrated = false;
  let online = true;
  let savedLabel = '等待载入';
  let showOfflineNotice = false;
  let history: Course[] = [];
  let future: Course[] = [];
  let selectedActivity: Activity | null = null;
  let notice: { kind: NoticeKind; title: string; subtitle: string } | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  $: selectedActivity = course.activities.find((activity) => activity.id === selectedActivityId) ?? course.activities[0] ?? null;
  $: currentTeacher = teachers.find((teacher) => teacher.id === currentUserId) ?? teachers[0];
  $: isOwner = currentUserId === course.ownerId;
  $: currentRelease = course.releases.find((release) => release.id === course.publishedReleaseId) ?? course.releases.at(-1) ?? null;
  $: releaseDiagnostics = currentRelease ? analyzeActivities(currentRelease.activities) : [];
  $: draftDiagnostics = analyzeActivities(course.activities);
  $: versionDiff = compareSnapshots(course.releases, compareBaseId, compareTargetId);
  $: errorCount = releaseDiagnostics.filter((issue) => issue.level === 'error').length;
  $: warningCount = releaseDiagnostics.filter((issue) => issue.level === 'warning').length;
  $: draftErrorCount = draftDiagnostics.filter((issue) => issue.level === 'error').length;
  $: totalMinutes = course.activities.reduce((sum, activity) => sum + activity.duration, 0);
  $: statusLabel = course.status === 'published' ? '已发布' : '草稿';

  onMount(() => {
    let migrated = false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        course = migrateCourse(JSON.parse(stored) as Course);
        migrated = true;
        selectedActivityId = course.activities[0]?.id ?? '';
        compareBaseId = course.releases[0]?.id ?? '';
        compareTargetId = course.releases.at(-1)?.id ?? '';
        savedLabel = `已恢复 · ${formatTime(course.updatedAt)}`;
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser && teachers.some((teacher) => teacher.id === storedUser)) currentUserId = storedUser;
    hydrated = true;
    // 旧数据升级后立即写回，让负责人与发布状态的补全持久生效
    if (migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(course));
    const updateNetwork = () => {
      online = navigator.onLine;
      showOfflineNotice = !online;
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    window.addEventListener('storage', handleStorageSync);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      window.removeEventListener('storage', handleStorageSync);
      clearTimeout(noticeTimer);
    };
  });

  function migrateCourse(value: Course): Course {
    if (!value.id || !Array.isArray(value.activities)) return initialCourse();
    // 旧数据升级：为老课程补齐负责人、发布状态与发布记录
    value.versions ??= [];
    value.releases ??= [];
    value.ownerId ??= teachers[0].id;
    value.publishedReleaseId ??= value.releases.at(-1)?.id ?? null;
    value.status ??= value.publishedReleaseId ? 'published' : 'draft';
    if (value.publishedReleaseId && value.releases.some((release) => release.id === value.publishedReleaseId)) {
      value.status = 'published';
    }
    value.revision ??= 1;
    value.releases.forEach((release) => {
      release.publishedBy ??= value.ownerId;
    });
    return value;
  }

  function commit(recipe: (draft: Course) => void): void {
    history = [...history.slice(-49), structuredClone(course)];
    const next = structuredClone(course);
    recipe(next);
    next.updatedAt = new Date().toISOString();
    course = next;
    future = [];
    persist();
  }

  function persist(): void {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(course));
    savedLabel = `已保存 · ${formatTime(new Date().toISOString())}`;
  }

  function undo(): void {
    const previous = history.at(-1);
    if (!previous) return;
    future = [structuredClone(course), ...future].slice(0, 50);
    history = history.slice(0, -1);
    course = previous;
    selectedActivityId = course.activities[0]?.id ?? '';
    persist();
  }

  function redo(): void {
    const next = future[0];
    if (!next) return;
    history = [...history, structuredClone(course)].slice(-50);
    future = future.slice(1);
    course = next;
    selectedActivityId = course.activities[0]?.id ?? '';
    persist();
  }

  function saveNow(): void {
    persist();
  }

  function notify(kind: NoticeKind, title: string, subtitle: string): void {
    notice = { kind, title, subtitle };
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = null; }, 6500);
  }

  function teacherName(id: string): string {
    return teachers.find((teacher) => teacher.id === id)?.name ?? '未指定';
  }

  function switchTeacher(id: string): void {
    if (!teachers.some((teacher) => teacher.id === id) || id === currentUserId) return;
    currentUserId = id;
    if (hydrated) localStorage.setItem(USER_KEY, id);
    const teacher = teachers.find((item) => item.id === id);
    notify(
      'info',
      '已切换当前教师',
      id === course.ownerId
        ? `现在以负责人 ${teacher?.name} 的身份操作，可以发布本课程。`
        : `现在以 ${teacher?.name} 的身份操作；本课程负责人是 ${teacherName(course.ownerId)}，你无法发布。`
    );
  }

  function transferOwnership(id: string): void {
    if (!isOwner || id === course.ownerId) return;
    commit((draft) => { draft.ownerId = id; });
    notify('success', '负责人已更新', `本课程负责人已调整为 ${teacherName(id)}，之后只有他能发布本课程。`);
  }

  function readStoredCourse(): Course | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? migrateCourse(JSON.parse(raw) as Course) : null;
    } catch {
      return null;
    }
  }

  function acquirePublishLock(token: string): boolean {
    const now = Date.now();
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (raw) {
        const lock = JSON.parse(raw) as { token?: string; at?: number };
        if (lock.token !== token && typeof lock.at === 'number' && now - lock.at < LOCK_TTL_MS) return false;
      }
      localStorage.setItem(LOCK_KEY, JSON.stringify({ token, at: now }));
      const confirm = JSON.parse(localStorage.getItem(LOCK_KEY) ?? '{}') as { token?: string };
      return confirm.token === token;
    } catch {
      return false;
    }
  }

  function releasePublishLock(token: string): void {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (raw && (JSON.parse(raw) as { token?: string }).token === token) localStorage.removeItem(LOCK_KEY);
    } catch {
      // 锁到期会自动失效，无需处理
    }
  }

  function publishCourse(): void {
    if (!isOwner) {
      notify('error', '发布被拒绝', `只有课程负责人 ${teacherName(course.ownerId)} 能发布本课程，你当前以 ${currentTeacher.name} 的身份操作。`);
      return;
    }
    const before = structuredClone(course);
    const token = `publish-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (!acquirePublishLock(token)) {
      rollbackPublish(before, readStoredCourse(), '另一位老师正在发布本课程，请稍后重试。');
      return;
    }
    try {
      const stored = readStoredCourse();
      if (stored && stored.revision !== course.revision) {
        rollbackPublish(before, stored, '另一位老师已抢先发布，本次发布未生效。');
        return;
      }
      const next = structuredClone(course);
      const releaseNumber = next.releases.length + 1;
      const minutes = next.activities.reduce((sum, item) => sum + item.duration, 0);
      const release: CourseRelease = {
        id: `rel-${Date.now()}`,
        label: `第 ${releaseNumber} 次发布`,
        savedAt: new Date().toISOString(),
        publishedBy: currentUserId,
        note: `定稿 ${next.activities.length} 个活动 · ${minutes} 分钟。`,
        activities: structuredClone(next.activities)
      };
      next.releases = [...next.releases, release];
      next.status = 'published';
      next.publishedReleaseId = release.id;
      next.revision += 1;
      next.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      const confirm = readStoredCourse();
      if (!confirm || confirm.revision !== next.revision || confirm.publishedReleaseId !== release.id) {
        rollbackPublish(before, confirm, '发布结果未能写入本地存储。');
        return;
      }
      course = next;
      // 发布是对外动作，不作为可撤销的草稿编辑
      history = [];
      future = [];
      compareBaseId = next.releases.at(-2)?.id ?? release.id;
      compareTargetId = release.id;
      savedLabel = `已发布 · ${formatTime(release.savedAt)}`;
      notify('success', '发布成功', `${release.label} 已成为定稿，质量检查与版本比较将以该版为准。`);
    } catch {
      rollbackPublish(before, readStoredCourse(), '发布过程中出现异常。');
    } finally {
      releasePublishLock(token);
    }
  }

  function rollbackPublish(before: Course, stored: Course | null, reason: string): void {
    // 发布失败：恢复成发布前的样子，同时采纳存储中他人已发布的定稿信息
    const restored = structuredClone(before);
    if (stored) {
      restored.releases = stored.releases;
      restored.status = stored.status;
      restored.publishedReleaseId = stored.publishedReleaseId;
      restored.revision = stored.revision;
    }
    course = restored;
    savedLabel = '发布失败 · 已恢复';
    notify('error', '发布未完成', `${reason} 已恢复为发布前的状态。`);
  }

  function handleStorageSync(event: StorageEvent): void {
    if (event.key !== STORAGE_KEY || !event.newValue || !hydrated) return;
    const stored = readStoredCourse();
    if (!stored || stored.revision === course.revision) return;
    // 其他窗口发布了新定稿：同步发布相关信息，本地草稿内容保持不变
    const draft = structuredClone(course);
    draft.releases = stored.releases;
    draft.status = stored.status;
    draft.publishedReleaseId = stored.publishedReleaseId;
    draft.revision = stored.revision;
    draft.ownerId = stored.ownerId;
    course = draft;
    notify('info', '已同步发布状态', '另一位老师在其他窗口发布了新定稿，本地草稿保持不变。');
  }

  function updateCourse(field: 'title' | 'level' | 'ageRange' | 'objective', value: string): void {
    commit((draft) => { draft[field] = value; });
  }

  function updateActivity(field: keyof Activity, value: unknown): void {
    if (!selectedActivity) return;
    const id = selectedActivity.id;
    commit((draft) => {
      const target = draft.activities.find((activity) => activity.id === id);
      if (target) (target as unknown as Record<string, unknown>)[field] = value;
    });
  }

  function readText(event: Event): string {
    const custom = event as CustomEvent<{ value?: string; text?: string } | string>;
    if (typeof custom.detail === 'string') return custom.detail;
    if (typeof custom.detail === 'number') return String(custom.detail);
    if (custom.detail?.value) return custom.detail.value;
    if (custom.detail?.text) return custom.detail.text;
    const target = (event.currentTarget ?? event.target) as HTMLInputElement | HTMLTextAreaElement | null;
    return target?.value ?? '';
  }

  function readNumber(event: Event): number {
    return Number(readText(event));
  }

  function readChecked(event: Event): boolean {
    const custom = event as CustomEvent<{ checked?: boolean } | boolean>;
    if (typeof custom.detail === 'boolean') return custom.detail;
    if (typeof custom.detail?.checked === 'boolean') return custom.detail.checked;
    const target = (event.currentTarget ?? event.target) as HTMLInputElement | null;
    return Boolean(target?.checked);
  }

  function addActivity(type: ActivityType = '练习'): void {
    const id = `a-${Date.now()}`;
    commit((draft) => {
      draft.activities.push({
        id, type, title: `新的${type}活动`, content: '', phonemes: [], dependencies: [],
        difficulty: 1, prompt: '请输入教师提示语。', accessibility: '请描述视觉、听觉或键盘无障碍支持。',
        duration: type === '练习' ? 10 : 8, feedback: type === '练习' ? '' : ''
      });
    });
    selectedActivityId = id;
    activeView = 'compose';
  }

  function deleteActivity(): void {
    if (!selectedActivity || course.activities.length <= 1) return;
    const id = selectedActivity.id;
    commit((draft) => {
      draft.activities = draft.activities.filter((activity) => activity.id !== id);
      draft.activities.forEach((activity) => {
        activity.dependencies = activity.dependencies.filter((dependency) => dependency !== id);
      });
    });
    selectedActivityId = course.activities[0]?.id ?? '';
  }

  function duplicateActivity(): void {
    if (!selectedActivity) return;
    const source = structuredClone(selectedActivity);
    source.id = `a-${Date.now()}`;
    source.title = `${source.title}（副本）`;
    source.dependencies = [...source.dependencies];
    commit((draft) => {
      const index = draft.activities.findIndex((activity) => activity.id === selectedActivity?.id);
      draft.activities.splice(index + 1, 0, source);
    });
    selectedActivityId = source.id;
  }

  function moveActivity(direction: -1 | 1): void {
    if (!selectedActivity) return;
    const id = selectedActivity.id;
    commit((draft) => {
      const index = draft.activities.findIndex((activity) => activity.id === id);
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= draft.activities.length) return;
      const [item] = draft.activities.splice(index, 1);
      draft.activities.splice(nextIndex, 0, item);
    });
  }

  function toggleDependency(dependencyId: string, checked: boolean): void {
    if (!selectedActivity || dependencyId === selectedActivity.id) return;
    const next = checked
      ? [...new Set([...selectedActivity.dependencies, dependencyId])]
      : selectedActivity.dependencies.filter((id) => id !== dependencyId);
    updateActivity('dependencies', next);
  }

  function updatePhonemes(value: string): void {
    updateActivity('phonemes', value.split(/[\s,，、]+/).map((item) => item.trim()).filter(Boolean));
  }

  function copyCourse(): void {
    commit((draft) => {
      const copy = structuredClone(draft);
      copy.id = `course-${Date.now()}`;
      copy.title = `${copy.title} · 副本`;
      copy.versions = [];
      copy.activities.forEach((activity) => {
        activity.title = activity.title.replace('（副本）', '') + '（复制）';
      });
      draft.id = copy.id;
      draft.title = copy.title;
      draft.versions = [];
      draft.activities = copy.activities;
      // 副本是全新的草稿：不带走定稿，操作者成为新课程的负责人
      draft.releases = [];
      draft.status = 'draft';
      draft.publishedReleaseId = null;
      draft.ownerId = currentUserId;
      draft.revision = 1;
    });
    compareBaseId = '';
    compareTargetId = '';
    savedLabel = '课程已复制为新草稿';
    notify('info', '课程已复制', '副本是未发布的新草稿，你是新课程的负责人。');
  }

  function focusIssue(issue: Diagnostic): void {
    selectedActivityId = issue.activityId;
    activeView = 'compose';
  }

  function analyzeActivities(activities: Activity[]): Diagnostic[] {
    const issues: Diagnostic[] = [];
    const learned = new Set<string>();
    const seenPhonemes: Array<{ activity: Activity; phoneme: string }> = [];

    activities.forEach((activity, index) => {
      activity.phonemes.forEach((phoneme) => {
        if (!learned.has(phoneme) && activity.type !== '音素') {
          issues.push({
            id: `early-${activity.id}-${phoneme}`, activityId: activity.id, level: 'error', category: '前置知识',
            title: `${activity.title} 提前使用 ${phoneme}`,
            detail: `第 ${index + 1} 个活动中使用了尚未单独教学的音素。请增加前置音素活动或调整顺序。`
          });
        }
        if (activity.type === '音素') learned.add(phoneme);
        seenPhonemes.push({ activity, phoneme });
      });

      if (activity.type === '句子') {
        const words = activity.content.trim().split(/\s+/).filter(Boolean);
        if (words.length > 12) issues.push({
          id: `long-${activity.id}`, activityId: activity.id, level: 'warning', category: '例句长度',
          title: `${activity.title} 包含 ${words.length} 个单词`,
          detail: '启蒙阶段建议控制在 12 个单词以内，或拆成两个意群。'
        });
      }

      if (activity.type === '练习' && !activity.feedback.trim()) issues.push({
        id: `feedback-${activity.id}`, activityId: activity.id, level: 'error', category: '练习反馈',
        title: `${activity.title} 缺少反馈`,
        detail: '答对或答错后需要给出可理解、可行动的学习反馈。'
      });

      if (!activity.accessibility.trim()) issues.push({
        id: `a11y-${activity.id}`, activityId: activity.id, level: 'error', category: '无障碍说明',
        title: `${activity.title} 缺少无障碍说明`,
        detail: '请说明视觉、听觉、运动或认知支持方式。'
      });

      activity.dependencies.forEach((dependency) => {
        if (!activities.some((item) => item.id === dependency)) issues.push({
          id: `missing-dep-${activity.id}-${dependency}`, activityId: activity.id, level: 'error', category: '依赖缺失',
          title: `${activity.title} 的依赖已不存在`, detail: '请移除失效依赖或重新选择前置活动。'
        });
      });
    });

    confusablePairs.forEach(([left, right]) => {
      const leftActivity = seenPhonemes.find((item) => item.phoneme === left)?.activity;
      const rightActivity = seenPhonemes.find((item) => item.phoneme === right)?.activity;
      if (leftActivity && rightActivity) issues.push({
        id: `confusable-${left}-${right}`, activityId: rightActivity.id, level: 'info', category: '相似音',
        title: `${left} 与 ${right} 可能混淆`,
        detail: `建议在“${leftActivity.title}”和“${rightActivity.title}”之间加入口型对比或辨音练习。`
      });
    });

    const cycle = findDependencyCycle(activities);
    if (cycle) issues.push({
      id: 'cycle', activityId: cycle[0], level: 'error', category: '依赖关系',
      title: '活动依赖形成循环', detail: cycle.join(' → ')
    });
    return issues;
  }

  function findDependencyCycle(activities: Activity[]): string[] | null {
    const byId = new Map(activities.map((activity) => [activity.id, activity]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    let cycle: string[] = [];
    const visit = (id: string, path: string[]): boolean => {
      if (visiting.has(id)) {
        cycle = [...path.slice(path.indexOf(id)), id];
        return true;
      }
      if (visited.has(id)) return false;
      visiting.add(id);
      const activity = byId.get(id);
      for (const dependency of activity?.dependencies ?? []) {
        if (visit(dependency, [...path, dependency])) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    for (const activity of activities) {
      if (visit(activity.id, [activity.id])) break;
    }
    return cycle.length ? cycle : null;
  }

  function compareSnapshots(snapshots: Array<{ id: string; activities: Activity[] }>, baseId: string, targetId: string): VersionDiff[] {
    const base = snapshots.find((snapshot) => snapshot.id === baseId);
    const target = snapshots.find((snapshot) => snapshot.id === targetId);
    if (!base || !target) return [];
    const rows: VersionDiff[] = [];
    const baseMap = new Map(base.activities.map((activity) => [activity.id, activity]));
    const targetMap = new Map(target.activities.map((activity) => [activity.id, activity]));
    for (const activity of base.activities) {
      if (!targetMap.has(activity.id)) rows.push({ id: activity.id, title: activity.title, kind: 'removed', detail: '目标版本已删除该活动' });
    }
    for (const activity of target.activities) {
      const before = baseMap.get(activity.id);
      if (!before) {
        rows.push({ id: activity.id, title: activity.title, kind: 'added', detail: `${activity.type} · ${activity.duration} 分钟` });
        continue;
      }
      const fields: string[] = [];
      if (before.title !== activity.title) fields.push('标题');
      if (before.content !== activity.content) fields.push('内容');
      if (before.difficulty !== activity.difficulty) fields.push('难度');
      if (before.duration !== activity.duration) fields.push('时长');
      if (JSON.stringify(before.dependencies) !== JSON.stringify(activity.dependencies)) fields.push('依赖');
      if (before.prompt !== activity.prompt || before.accessibility !== activity.accessibility) fields.push('提示或无障碍');
      if (before.feedback !== activity.feedback) fields.push('练习反馈');
      if (fields.length) rows.push({ id: activity.id, title: activity.title, kind: 'changed', detail: `变化字段：${fields.join('、')}` });
    }
    return rows;
  }

  function formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function activityIcon(type: ActivityType): string {
    return type === '音素' ? 'ear' : type === '单词' ? 'text-font' : type === '句子' ? 'text-align-left' : 'game-console';
  }

  function handleKeyboard(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;
    const tag = (event.target as HTMLElement)?.tagName;
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveNow();
      return;
    }
    if (event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      addActivity('练习');
      return;
    }
    if (!editing && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveActivity(event.key === 'ArrowUp' ? -1 : 1);
    }
  }
</script>

<svelte:window on:keydown={handleKeyboard} />

<div class="app-frame">
  <header class="app-header">
    <div class="brand">
      <div class="brand-symbol" aria-hidden="true"><span>a</span><i>+</i><span>m</span></div>
      <div>
        <h1>Phonics Studio</h1>
        <p>儿童自然拼读课程编排台</p>
      </div>
    </div>
    <div class="header-center">
      <span class:connected={online} class="network-dot"></span>
      <span>{online ? '本地离线编辑可用' : '当前离线，修改仍会保存'}</span>
      <strong>{savedLabel}</strong>
    </div>
    <div class="header-actions">
      <div class="teacher-switcher">
        <Select inline labelText="当前教师" selected={currentUserId} on:change={(event) => switchTeacher(readText(event))}>
          {#each teachers as teacher}<SelectItem value={teacher.id} text={`${teacher.name} · ${teacher.role}`} />{/each}
        </Select>
      </div>
      <Button size="small" kind="ghost" disabled={history.length === 0} on:click={undo}>撤销</Button>
      <Button size="small" kind="ghost" disabled={future.length === 0} on:click={redo}>重做</Button>
      <Button size="small" kind="tertiary" on:click={saveNow}>保存</Button>
      <Button size="small" kind="primary" on:click={publishCourse}>发布课程</Button>
    </div>
  </header>

  {#if showOfflineNotice}
    <div class="offline-notice">
      <InlineNotification lowContrast kind="info" title="已切换到离线模式" subtitle="所有修改会先保存在本机浏览器，恢复网络后仍可继续编辑。" />
    </div>
  {/if}

  {#if notice}
    <div class="notice-stack">
      <ToastNotification kind={notice.kind} title={notice.title} subtitle={notice.subtitle} timeout={6500} on:close={() => (notice = null)} />
    </div>
  {/if}

  <section class="course-hero">
    <div class="hero-copy">
      <span class="kicker">COURSE BUILDER / {course.level}</span>
      <h2>{course.title}</h2>
      <p>{course.objective}</p>
      <div class="hero-meta">
        <Tag type={course.status === 'published' ? 'green' : 'warm-gray'}>{statusLabel}</Tag>
        <span>负责人：{teacherName(course.ownerId)}</span>
        <span>{currentRelease ? `当前定稿：${currentRelease.label} · ${formatTime(currentRelease.savedAt)}` : '尚未发布定稿'}</span>
      </div>
    </div>
    <div class="hero-stats">
      <div><strong>{course.activities.length}</strong><span>活动</span></div>
      <div><strong>{totalMinutes}</strong><span>分钟</span></div>
      <div><strong class="critical">{errorCount}</strong><span>必修问题</span></div>
      <div><strong class="caution">{warningCount}</strong><span>建议调整</span></div>
    </div>
  </section>

  <nav class="workspace-tabs" aria-label="工作区">
    <button class:active={activeView === 'compose'} on:click={() => activeView = 'compose'}><span>01</span><b>课程编排</b><small>活动、依赖与教学说明</small></button>
    <button class:active={activeView === 'path'} on:click={() => activeView = 'path'}><span>02</span><b>学习路径</b><small>多屏幕顺序预览</small></button>
    <button class:active={activeView === 'issues'} on:click={() => activeView = 'issues'}><span>03</span><b>质量检查</b><small>针对已发布定稿</small></button>
    <button class:active={activeView === 'versions'} on:click={() => activeView = 'versions'}><span>04</span><b>发布与版本</b><small>负责人、定稿与比较</small></button>
  </nav>

  {#if activeView === 'compose'}
    <main class="compose-layout">
      <aside class="activity-sidebar">
        <div class="sidebar-heading">
          <div><span class="kicker">LESSON MAP</span><h3>学习活动</h3></div>
          <Button size="small" kind="ghost" on:click={() => addActivity('练习')}>添加</Button>
        </div>
        <div class="type-legend">
          {#each ['音素', '单词', '句子', '练习'] as type}
            <span><i class:practice={type === '练习'} class:phoneme={type === '音素'}></i>{type}</span>
          {/each}
        </div>
        <div class="activity-list">
          {#each course.activities as activity, index (activity.id)}
            <button class:selected={activity.id === selectedActivityId} class="activity-row" on:click={() => selectedActivityId = activity.id}>
              <span class="sequence">{String(index + 1).padStart(2, '0')}</span>
              <span class="activity-type {activity.type}">{activity.type}</span>
              <span class="activity-copy"><b>{activity.title}</b><small>{activity.duration} 分钟 · 难度 {activity.difficulty}/5</small></span>
              {#if activity.dependencies.length}<i title="有前置依赖">↳</i>{/if}
            </button>
          {/each}
        </div>
        <div class="sidebar-help">快捷键：Alt + N 新建 · Alt + ↑/↓ 调整顺序</div>
      </aside>

      <section class="editor-column">
        {#if selectedActivity}
          <div class="editor-toolbar">
            <div>
              <span class="kicker">ACTIVITY EDITOR</span>
              <h3>{selectedActivity.type}活动</h3>
            </div>
            <div>
              <Button size="small" kind="ghost" disabled={course.activities[0]?.id === selectedActivity.id} on:click={() => moveActivity(-1)}>上移</Button>
              <Button size="small" kind="ghost" disabled={course.activities.at(-1)?.id === selectedActivity.id} on:click={() => moveActivity(1)}>下移</Button>
              <Button size="small" kind="ghost" on:click={duplicateActivity}>复制</Button>
              <Button size="small" kind="danger-ghost" on:click={deleteActivity}>删除</Button>
            </div>
          </div>

          <Tile class="editor-card">
            <div class="form-grid">
              <TextInput labelText="活动标题" value={selectedActivity.title} on:input={(event) => updateActivity('title', readText(event))} />
              <Select labelText="活动类型" selected={selectedActivity.type} on:change={(event) => updateActivity('type', readText(event))}>
                <SelectItem value="音素" text="音素" />
                <SelectItem value="单词" text="单词" />
                <SelectItem value="句子" text="句子" />
                <SelectItem value="练习" text="练习活动" />
              </Select>
              <TextInput labelText="预计时长（分钟）" type="number" min="1" max="60" value={String(selectedActivity.duration)} on:input={(event) => updateActivity('duration', readNumber(event))} />
              <div class="difficulty-field">
                <label for="difficulty">难度：{selectedActivity.difficulty}/5</label>
                <input id="difficulty" type="range" min="1" max="5" value={selectedActivity.difficulty} on:input={(event) => updateActivity('difficulty', readNumber(event))} />
              </div>
            </div>
            <TextArea labelText={selectedActivity.type === '音素' ? '音素内容' : selectedActivity.type === '句子' ? '目标句子' : '教学内容'} rows={3} value={selectedActivity.content} on:input={(event) => updateActivity('content', readText(event))} />
            <TextInput labelText="涉及音素（用逗号或空格分隔）" value={selectedActivity.phonemes.join(', ')} on:input={(event) => updatePhonemes(readText(event))} />
            <TextArea labelText="教师提示语" rows={2} value={selectedActivity.prompt} on:input={(event) => updateActivity('prompt', readText(event))} />
            <TextArea labelText="无障碍说明" rows={2} value={selectedActivity.accessibility} on:input={(event) => updateActivity('accessibility', readText(event))} />
            <TextArea labelText={selectedActivity.type === '练习' ? '练习反馈（必填）' : '学习反馈'} rows={2} value={selectedActivity.feedback} on:input={(event) => updateActivity('feedback', readText(event))} />
          </Tile>

          <Tile class="dependency-card">
            <div class="section-title">
              <div><span class="kicker">PREREQUISITES</span><h3>前置活动与依赖关系</h3><p>只有完成选中的活动后，系统才会按当前顺序推荐本活动。</p></div>
              <Tag type="cool-gray">{selectedActivity.dependencies.length} 个依赖</Tag>
            </div>
            <div class="dependency-grid">
              {#each course.activities.filter((activity) => activity.id !== selectedActivity?.id) as activity (activity.id)}
                <Checkbox
                  labelText={`${activity.title} · ${activity.type}`}
                  checked={selectedActivity.dependencies.includes(activity.id)}
                  on:change={(event) => toggleDependency(activity.id, readChecked(event))}
                />
              {/each}
            </div>
          </Tile>
        {/if}
      </section>

      <aside class="inspector">
        <Tile class="compact-card">
          <span class="kicker">COURSE META</span><h3>课程信息</h3>
          <TextInput labelText="课程名称" value={course.title} on:input={(event) => updateCourse('title', readText(event))} />
          <TextInput labelText="课程等级" value={course.level} on:input={(event) => updateCourse('level', readText(event))} />
          <TextInput labelText="适用年龄" value={course.ageRange} on:input={(event) => updateCourse('ageRange', readText(event))} />
          <TextArea labelText="学习目标" rows={3} value={course.objective} on:input={(event) => updateCourse('objective', readText(event))} />
          <Select labelText="课程负责人" selected={course.ownerId} disabled={!isOwner} on:change={(event) => transferOwnership(readText(event))}>
            {#each teachers as teacher}<SelectItem value={teacher.id} text={`${teacher.name} · ${teacher.role}`} />{/each}
          </Select>
          {#if !isOwner}<p class="field-hint">只有当前负责人 {teacherName(course.ownerId)} 能调整归属或发布本课程。</p>{/if}
        </Tile>
        <Tile class="compact-card issue-peek">
          <div class="section-title"><div><span class="kicker">LIVE CHECK</span><h3>草稿实时提示</h3></div><Tag type={draftErrorCount ? 'red' : 'green'}>{draftErrorCount ? `${draftErrorCount} 项` : '通过'}</Tag></div>
          {#each draftDiagnostics.slice(0, 4) as issue}
            <button on:click={() => focusIssue(issue)} class="peek-row">
              <i class:error={issue.level === 'error'} class:warning={issue.level === 'warning'}></i>
              <span><b>{issue.title}</b><small>{issue.category}</small></span>
            </button>
          {/each}
          {#if draftDiagnostics.length === 0}<p class="empty-state">草稿结构完整，没有发现提示。</p>{/if}
          <p class="peek-note">质量检查与版本比较以已发布定稿为准。</p>
          <Button size="small" kind="ghost" on:click={() => activeView = 'issues'}>查看全部检查</Button>
        </Tile>
      </aside>
    </main>
  {/if}

  {#if activeView === 'path'}
    <main class="path-view">
      <div class="path-toolbar">
        <div><span class="kicker">RESPONSIVE SEQUENCE</span><h2>学习顺序预览</h2><p>按活动依赖和课程顺序生成，可切换设备宽度检查信息密度。</p></div>
        <div class="width-switcher">
          <button class:active={previewWidth === 'phone'} on:click={() => previewWidth = 'phone'}>手机</button>
          <button class:active={previewWidth === 'tablet'} on:click={() => previewWidth = 'tablet'}>平板</button>
          <button class:active={previewWidth === 'desktop'} on:click={() => previewWidth = 'desktop'}>桌面</button>
        </div>
      </div>
      <div class="preview-stage">
        <div class="device-preview {previewWidth}">
          <div class="device-bar"><span></span><b>{previewWidth === 'phone' ? '390 px' : previewWidth === 'tablet' ? '768 px' : '1200 px'}</b></div>
          <div class="lesson-preview">
            <header><span>今日学习</span><h3>{course.title}</h3><p>{course.objective}</p></header>
            {#each course.activities as activity, index (activity.id)}
              <article>
                <div class="lesson-number">{index + 1}</div>
                <div class="lesson-type {activity.type}">{activity.type}</div>
                <div class="lesson-content">
                  <h4>{activity.title}</h4>
                  <p>{activity.content}</p>
                  {#if activity.prompt}<blockquote>{activity.prompt}</blockquote>{/if}
                  <div class="lesson-tags">
                    {#each activity.phonemes as phoneme}<span>{phoneme}</span>{/each}
                    <em>{activity.duration} 分钟</em>
                  </div>
                  {#if activity.dependencies.length}<small>前置：{activity.dependencies.map((id) => course.activities.find((item) => item.id === id)?.title).filter(Boolean).join('、')}</small>{/if}
                </div>
              </article>
            {/each}
            <footer>课程结束 · 预计 {totalMinutes} 分钟</footer>
          </div>
        </div>
      </div>
    </main>
  {/if}

  {#if activeView === 'issues'}
    <main class="issues-view">
      <div class="view-heading">
        <div><span class="kicker">CURRICULUM QA</span><h2>课程质量检查</h2><p>检查前置知识、相似音、例句长度、练习反馈、无障碍说明和依赖完整性。</p></div>
        <div class="issue-summary"><span><b>{errorCount}</b> 必须处理</span><span><b>{warningCount}</b> 建议调整</span><span><b>{releaseDiagnostics.length}</b> 全部提示</span></div>
      </div>
      {#if currentRelease}
        <div class="release-banner">
          <Tag type="green">已发布定稿</Tag>
          <span>检查对象：{currentRelease.label} · {formatTime(currentRelease.savedAt)} · 由 {teacherName(currentRelease.publishedBy)} 发布</span>
          <small>草稿的后续修改不影响这里的检查结果</small>
        </div>
        <div class="issue-board">
          {#each releaseDiagnostics as issue, index}
            <article class:critical={issue.level === 'error'} class:caution={issue.level === 'warning'} class:info={issue.level === 'info'}>
              <span class="issue-index">{String(index + 1).padStart(2, '0')}</span>
              <div><div class="issue-meta"><Tag type={issue.level === 'error' ? 'red' : issue.level === 'warning' ? 'magenta' : 'blue'}>{issue.category}</Tag><small>{issue.level === 'error' ? '必须处理' : issue.level === 'warning' ? '建议调整' : '教学提示'}</small></div><h3>{issue.title}</h3><p>{issue.detail}</p></div>
              <Button size="small" kind="ghost" on:click={() => focusIssue(issue)}>定位活动</Button>
            </article>
          {:else}
            <Tile class="all-clear"><h3>课程检查通过</h3><p>已发布定稿的教学顺序、反馈与无障碍说明均已完成。</p></Tile>
          {/each}
          {#if releaseDiagnostics.length}
            <div class="rule-grid">
              <Tile><span>前置知识</span><strong>先教后用</strong><p>非音素活动使用未单独教学的音素时阻断。</p></Tile>
              <Tile><span>相似音</span><strong>对比教学</strong><p>发现 /b/-/p/、/f/-/v/ 等音对时建议增加辨音。</p></Tile>
              <Tile><span>例句</span><strong>≤ 12 词</strong><p>超过建议长度时提示拆分意群。</p></Tile>
              <Tile><span>练习</span><strong>必须有反馈</strong><p>每个练习活动都要提供可行动反馈。</p></Tile>
            </div>
          {/if}
        </div>
      {:else}
        <Tile class="all-clear"><h3>课程尚未发布</h3><p>由课程负责人 {teacherName(course.ownerId)} 发布定稿后，这里将检查已发布版本的活动顺序、依赖与音素说明。</p></Tile>
      {/if}
    </main>
  {/if}

  {#if activeView === 'versions'}
    <main class="versions-view">
      <div class="view-heading">
        <div><span class="kicker">RELEASE & OWNERSHIP</span><h2>发布与版本</h2><p>只有课程负责人能发布；定稿后活动顺序、依赖与音素说明即固定，草稿修改不影响已发布内容。</p></div>
        <div class="version-actions"><Button kind="tertiary" on:click={copyCourse}>复制课程</Button><Button kind="primary" on:click={publishCourse}>发布当前草稿</Button></div>
      </div>
      <Tile class="publish-panel">
        <div class="publish-facts">
          <div><span>课程负责人</span><strong>{teacherName(course.ownerId)}</strong></div>
          <div><span>当前教师</span><strong>{currentTeacher.name}{isOwner ? '（负责人）' : ''}</strong></div>
          <div><span>发布状态</span><strong>{statusLabel}</strong></div>
          <div><span>当前定稿</span><strong>{currentRelease ? `${currentRelease.label} · ${formatTime(currentRelease.savedAt)}` : '尚未发布'}</strong></div>
        </div>
        <p class="publish-note">发布会把当前草稿固化为定稿：质量检查与版本比较均以定稿为准。发布不可撤销，如需调整请修改草稿后再次发布；两人同时提交时只有一人成功，失败方会自动恢复。</p>
        {#if !isOwner}
          <InlineNotification lowContrast hideCloseButton kind="warning" title="无权发布" subtitle={`你当前以 ${currentTeacher.name} 的身份操作，只有负责人 ${teacherName(course.ownerId)} 能发布本课程，越权提交会被直接拒绝。`} />
        {/if}
      </Tile>
      <div class="version-layout-svelte">
        <Tile class="version-timeline">
          <div class="section-title"><div><span class="kicker">RELEASES</span><h3>发布记录</h3></div><Tag type="cool-gray">{course.releases.length} 次发布</Tag></div>
          {#each course.releases as release (release.id)}
            <article class:latest={release.id === course.publishedReleaseId}>
              <span class="timeline-dot"></span>
              <div>
                <b>{release.label}</b>
                {#if release.id === course.publishedReleaseId}<Tag type="green" size="sm">当前定稿</Tag>{/if}
                <h4>{release.note}</h4>
                <p>{formatTime(release.savedAt)} · {teacherName(release.publishedBy)} 发布 · {release.activities.length} 个活动</p>
              </div>
            </article>
          {:else}
            <p class="empty-state">还没有发布记录。由负责人 {teacherName(course.ownerId)} 发布首个定稿。</p>
          {/each}
          {#if course.versions.length}
            <div class="legacy-snapshots">
              <span class="kicker">LEGACY SNAPSHOTS</span>
              <h4>旧版草稿快照</h4>
              {#each course.versions as version (version.id)}
                <p>{version.label} · {formatTime(version.savedAt)} · {version.activities.length} 个活动（仅存档，不参与比较）</p>
              {/each}
            </div>
          {/if}
        </Tile>
        <Tile class="diff-card">
          <div class="section-title"><div><span class="kicker">COMPARE</span><h3>比较已发布版本</h3></div></div>
          {#if course.releases.length}
            <div class="compare-pickers">
              <Select labelText="基准版本" selected={compareBaseId} on:change={(event) => compareBaseId = readText(event)}>
                {#each course.releases as release}<SelectItem value={release.id} text={`${release.label} · ${formatTime(release.savedAt)}`} />{/each}
              </Select>
              <Select labelText="目标版本" selected={compareTargetId} on:change={(event) => compareTargetId = readText(event)}>
                {#each course.releases as release}<SelectItem value={release.id} text={`${release.label} · ${formatTime(release.savedAt)}`} />{/each}
              </Select>
            </div>
            <div class="diff-list">
              {#each versionDiff as diff}
                <article class={diff.kind}><span>{diff.kind === 'added' ? '新增' : diff.kind === 'removed' ? '删除' : '修改'}</span><div><b>{diff.title}</b><p>{diff.detail}</p></div></article>
              {:else}
                <p class="empty-state">两个已发布版本之间没有活动差异；发布至少两个版本后可比较变化。</p>
              {/each}
            </div>
          {:else}
            <p class="empty-state">课程尚未发布。发布两个以上定稿后，可在此比较活动增删与字段变化。</p>
          {/if}
        </Tile>
      </div>
    </main>
  {/if}

  <footer class="app-footer">
    <span>所有数据保存在当前浏览器 localStorage · 负责人与发布状态随课程一并保存</span>
    <span>Ctrl/Cmd + Z 撤销 · Ctrl/Cmd + Y 重做 · Alt + N 新建活动 · Ctrl/Cmd + S 保存</span>
  </footer>
</div>
