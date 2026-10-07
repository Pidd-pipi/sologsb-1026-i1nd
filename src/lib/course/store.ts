import { writable } from 'svelte/store';
import type { Course } from './types';
import { analyzeActivities } from './analysis';
import { migrateCourse, LEGACY_STORAGE_KEY, STORAGE_KEY, SESSION_TEACHER_KEY } from './migrate';
import { publishCourse, PublishError, type PublishRejection, restoreBeforePublish } from './publish';
import { createSeedCourse } from './seed';
import { DEFAULT_OWNER_ID, teacherName } from './teachers';

export interface StoreNotice {
  id: number;
  kind: 'success' | 'info' | 'warning' | 'error';
  title: string;
  subtitle?: string;
}

export interface StoreState {
  course: Course;
  currentTeacherId: string;
  busy: boolean;
  notice: StoreNotice | null;
  canUndo: boolean;
  canRedo: boolean;
}

const REJECTION_TEXT: Record<PublishRejection, string> = {
  'not-owner': '越权发布被拒绝',
  'already-finalized': '课程已定稿',
  'conflict': '并发发布冲突',
  'has-errors': '质量门禁未通过',
  'unchanged': '没有新的改动需要发布'
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * 课程状态服务（Svelte store）。
 * 归属与发布的所有强制规则都在这里，UI 只是调用方：
 * - 当前身份（currentTeacherId）与课程负责人（ownerId）分离，切换身份不改课程；
 * - 发布走 publishCourse（纯函数）+ 乐观锁，store 只在成功后落库，失败补偿回滚；
 * - localStorage 是跨标签页的权威通道，发布前重新读取以挡住并发的另一个提交。
 */
export class CourseStore {
  readonly subscribe;
  private state: StoreState;
  private history: Course[] = [];
  private future: Course[] = [];
  private storage: StorageLike | null = null;
  private noticeSeq = 0;

  private emit: () => void;

  constructor() {
    this.state = this.buildInitialState();
    const { subscribe, set } = writable<StoreState>(this.state);
    this.subscribe = subscribe;
    this.emit = () => set(this.state);
  }

  private buildInitialState(): StoreState {
    return {
      course: createSeedCourse(),
      currentTeacherId: DEFAULT_OWNER_ID,
      busy: false,
      notice: null,
      canUndo: false,
      canRedo: false
    };
  }

  private sync(): void {
    this.state = {
      ...this.state,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0
    };
    this.emit();
  }

  init(env?: { window?: Window & typeof globalThis; storage?: StorageLike }): () => void {
    const win = env?.window ?? window;
    this.storage = env?.storage ?? this.resolveStorage();
    this.state = { ...this.state, currentTeacherId: this.readTeacher() };
    this.loadFromStorage();
    this.sync();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const remote = migrateCourse(JSON.parse(event.newValue));
        const local = this.state.course;
        // 另一个标签页完成了发布（修订号更大）或草稿更新（同修订号、更新时间更晚）。
        const newer = remote.revision > local.revision
          || (remote.revision === local.revision && remote.updatedAt > local.updatedAt);
        if (!newer) return;
        const wasRelease = remote.revision > local.revision;
        this.history = [];
        this.future = [];
        this.state = { ...this.state, course: remote };
        this.notify(
          wasRelease ? 'success' : 'info',
          wasRelease ? `定稿已更新：${teacherName(remote.published?.publishedBy)} 发布了 v${remote.published?.releaseNo}` : '课程已在其他窗口更新',
          wasRelease ? `本页已切换到第 ${remote.revision} 版定稿，请基于新版继续修改。` : '已同步另一个窗口保存的草稿。'
        );
        this.sync();
      } catch {
        // 收到不可解析的数据时保留本地状态，不做处理。
      }
    };
    win.addEventListener('storage', onStorage as EventListener);
    return () => win.removeEventListener('storage', onStorage as EventListener);
  }

  private resolveStorage(): StorageLike | null {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private readTeacher(): string {
    const saved = this.storage?.getItem(SESSION_TEACHER_KEY);
    return saved || DEFAULT_OWNER_ID;
  }

  setTeacher(teacherId: string): void {
    this.storage?.setItem(SESSION_TEACHER_KEY, teacherId);
    this.state = { ...this.state, currentTeacherId: teacherId, notice: null };
    this.emit();
  }

  private loadFromStorage(): void {
    if (!this.storage) return;
    const rawV2 = this.storage.getItem(STORAGE_KEY);
    if (rawV2) {
      try {
        this.state = { ...this.state, course: migrateCourse(JSON.parse(rawV2)) };
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
      return;
    }
    // 旧数据升级：v1 课程补负责人与发布状态后以 v2 落库（v1 原始数据保留不删）。
    const rawV1 = this.storage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      try {
        const migrated = migrateCourse(JSON.parse(rawV1));
        this.state = { ...this.state, course: migrated };
        this.writeStored(migrated);
        this.notify(
          'info',
          `已升级旧课程：负责人补录为 ${teacherName(migrated.ownerId)}`,
          migrated.status === 'published'
            ? `并按最近快照补录了“已发布 v${migrated.published?.releaseNo}”定稿。`
            : '课程尚未有定稿，状态为草稿，负责人可随时发布。'
        );
      } catch {
        this.storage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
  }

  private readStoredCourse(): Course | null {
    const raw = this.storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return migrateCourse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private writeStored(course: Course): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(course));
  }

  /** 草稿修改：只动草稿区，published 永不被编辑路径触碰。 */
  commit(recipe: (draft: Course) => void): void {
    this.history = [...this.history.slice(-49), structuredClone(this.state.course)];
    const next = structuredClone(this.state.course);
    recipe(next);
    next.updatedAt = new Date().toISOString();
    this.state = { ...this.state, course: next, notice: null };
    this.future = [];
    this.writeStored(next);
    this.sync();
  }

  undo(): void {
    const previous = this.history.at(-1);
    if (!previous) return;
    this.future = [structuredClone(this.state.course), ...this.future].slice(0, 50);
    this.history = this.history.slice(0, -1);
    this.state = { ...this.state, course: previous };
    this.writeStored(previous);
    this.sync();
  }

  redo(): void {
    const next = this.future[0];
    if (!next) return;
    this.history = [...this.history, structuredClone(this.state.course)].slice(-50);
    this.future = this.future.slice(1);
    this.state = { ...this.state, course: next };
    this.writeStored(next);
    this.sync();
  }

  saveNow(): void {
    this.writeStored(this.state.course);
    this.notify('success', '草稿已保存', '只保存当前草稿，不影响已发布定稿。');
  }

  /** 草稿存档：任何教师都可保存，仅作对照，不是定稿。 */
  saveArchive(): void {
    const course = this.state.course;
    const totalMinutes = course.activities.reduce((sum, item) => sum + item.duration, 0);
    const archiveCount = course.versions.filter((version) => version.kind === 'archive').length + 1;
    this.commit((draft) => {
      draft.versions.push({
        id: `arc-${Date.now()}`,
        kind: 'archive',
        label: `草稿存档 ${archiveCount}`,
        note: `${teacherName(this.state.currentTeacherId)} 保存草稿，${draft.activities.length} 个活动，共 ${totalMinutes} 分钟（非定稿）。`,
        savedAt: new Date().toISOString(),
        revision: draft.revision,
        activities: structuredClone(draft.activities)
      });
    });
    this.notify('info', '草稿已存档', '存档只用于对照，定稿以负责人发布的版本为准。');
  }

  duplicateCourse(): void {
    const currentTeacher = this.state.currentTeacherId;
    this.commit((draft) => {
      draft.id = `course-${Date.now()}`;
      draft.title = `${draft.title} · 副本`;
      // 复制出来的是全新草稿：无定稿、修订号归零，归属给执行复制的教师。
      draft.status = 'draft';
      draft.revision = 0;
      draft.ownerId = currentTeacher;
      draft.published = null;
      draft.versions = [];
      draft.activities.forEach((activity) => {
        activity.title = activity.title.replace('（副本）', '').replace('（复制）', '') + '（复制）';
      });
    });
    this.history = [];
    this.future = [];
    this.notify('success', '课程已复制为新草稿', `负责人：${teacherName(currentTeacher)}，尚未发布。`);
    this.sync();
  }

  /** 负责人交接：只有现任负责人可以把课程交给另一位教师。 */
  transferOwner(newOwnerId: string): void {
    const course = this.state.course;
    if (course.ownerId !== this.state.currentTeacherId) {
      this.notify('error', '负责人变更被拒绝', '只有现任负责人可以交接课程。');
      return;
    }
    if (newOwnerId === course.ownerId) return;
    this.commit((draft) => { draft.ownerId = newOwnerId; });
    this.notify('success', `负责人已变更为 ${teacherName(newOwnerId)}`, '后续只有新负责人能够发布。');
  }

  /**
   * 发布课程。两位教师同时提交时：
   * - 同一标签页连点由 busy 挡住；
   * - 不同标签页/会话以 localStorage 中的修订号为权威，先提交者把 revision 从 n 推到 n+1，
   *   后提交者携带的 expectedRevision 失配 -> conflict，只有一位成功；
   * - 冲突拒绝不回写存储（对方定稿必须保留）；其余失败把内存恢复成发布前的样子，
   *   仅当本次流程已写过存储时才做补偿写，发布失败后一切回到发布前。
   */
  publish(note?: string): void {
    if (this.state.busy) return;
    const before = structuredClone(this.state.course);
    const teacherId = this.state.currentTeacherId;
    const expectedRevision = before.revision;
    this.state = { ...this.state, busy: true, notice: null };
    this.emit();

    // 标记本次流程是否已向存储写入；只有写过之后失败才做存储补偿，
    // 绝不能在冲突拒绝时把对方已经落库的更新覆盖回旧版。
    let wroteStorage = false;
    try {
      // 跨标签页并发：以存储中的最新课程重新校验乐观锁；存储尚未写入时以内存课程为准。
      const authoritative = this.readStoredCourse() ?? before;
      if (authoritative.revision !== expectedRevision) {
        // 过期提交：拒绝，不动内存草稿，也不动存储（存储里的更新是别人的定稿）。
        throw new PublishError(
          'conflict',
          `课程已被更新到第 ${authoritative.revision} 版（你基于第 ${expectedRevision} 版提交），本次发布为过期提交，已拒绝。你的草稿改动已原样保留，可拉取最新定稿查看后重试。`
        );
      }

      const result = publishCourse(authoritative, {
        teacherId,
        expectedRevision,
        note,
        validate: (activities) => analyzeActivities(activities)
      });

      // 纯函数已成功构造完整新课程，此处一次性落库；不存在部分写入。
      this.writeStored(result.course);
      wroteStorage = true;
      // 发布是定稿边界，撤销/重做栈不得跨越发布，直接清空。
      this.history = [];
      this.future = [];
      this.state = {
        ...this.state,
        course: result.course,
        notice: {
          id: ++this.noticeSeq,
          kind: 'success',
          title: `发布成功：定稿 v${result.snapshot.releaseNo}（第 ${result.snapshot.revision} 版）`,
          subtitle: `活动顺序、依赖与音素说明已冻结，${teacherName(teacherId)} 签发于 ${result.snapshot.publishedAt.slice(0, 16).replace('T', ' ')}。`
        }
      };
    } catch (error) {
      if (error instanceof PublishError && error.reason === 'conflict') {
        // 并发冲突：存储保持对方写入的新版；内存保持发布前草稿。
        this.state = { ...this.state, course: before };
        this.notify('error', REJECTION_TEXT.conflict, error.message);
      } else {
        // 其余失败（越权 / 门禁 / 落库异常）：恢复成发布前的样子；
        // 只有本次流程确实写过存储时才做补偿写，避免覆盖任何既有数据。
        const restored = restoreBeforePublish(before);
        if (wroteStorage) this.writeStored(restored);
        this.state = { ...this.state, course: restored };
        if (error instanceof PublishError) {
          this.notify('error', REJECTION_TEXT[error.reason], error.message);
        } else {
          this.notify('error', '发布失败', '已恢复到发布前的状态，草稿和原定稿均未改动。');
        }
      }
    } finally {
      this.state = { ...this.state, busy: false };
      this.sync();
    }
  }

  /** 冲突后主动拉取存储中最新课程（跨标签页 / 跨会话），本地未发布草稿会被替换。 */
  pullLatest(): void {
    const latest = this.readStoredCourse();
    if (!latest) {
      this.notify('info', '存储中没有课程', '继续使用当前草稿。');
      return;
    }
    const previousRevision = this.state.course.revision;
    const wasRelease = latest.revision > previousRevision;
    this.history = [];
    this.future = [];
    this.state = { ...this.state, course: latest };
    this.notify(
      wasRelease ? 'success' : 'info',
      wasRelease ? `已拉取最新定稿 v${latest.published?.releaseNo}（第 ${latest.revision} 版）` : '已拉取存储中的课程',
      wasRelease ? `签发人：${teacherName(latest.published?.publishedBy)}。` : undefined
    );
    this.sync();
  }

  dismissNotice(): void {
    this.state = { ...this.state, notice: null };
    this.emit();
  }

  private notify(kind: StoreNotice['kind'], title: string, subtitle?: string): void {
    this.state = {
      ...this.state,
      notice: { id: ++this.noticeSeq, kind, title, subtitle }
    };
    this.emit();
  }
}

export const courseStore = new CourseStore();
