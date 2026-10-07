import test from 'node:test';
import assert from 'node:assert/strict';
import { CourseStore } from '../src/lib/course/store.js';
import type { StoreState } from '../src/lib/course/store.js';
import { STORAGE_KEY } from '../src/lib/course/migrate.js';

function makeStorage(seed?: Record<string, string>): Storage {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); }
  } as unknown as Storage;
}

function snapshot(store: CourseStore): StoreState {
  let value!: StoreState;
  const unsubscribe = store.subscribe((state: StoreState) => { value = state; });
  unsubscribe();
  return value;
}

/** 跳过依赖真实 window 的 init()，只注入存储并执行载入。 */
function attachStorage(store: CourseStore, storage: Storage): void {
  const internals = store as unknown as { storage: Storage | null; loadFromStorage: () => void };
  internals.storage = storage;
  internals.loadFromStorage.call(store);
}

test('store 层并发发布：两个会话基于同一修订号提交，只有先落库者成功', () => {
  const storage = makeStorage();
  const storeA = new CourseStore();
  const storeB = new CourseStore();
  attachStorage(storeA, storage);
  attachStorage(storeB, storage);

  // B 先提交（revision -> 1），随后 A 基于手里的第 0 版提交。
  const stateB0 = snapshot(storeB);
  assert.equal(stateB0.course.revision, 0);
  storeB.publish('B 先提交');
  const afterB = snapshot(storeB);
  assert.equal(afterB.course.revision, 1);
  assert.equal(afterB.notice?.kind, 'success');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)!).revision, 1, '先提交者已落库');

  const stateA0 = snapshot(storeA);
  assert.equal(stateA0.course.revision, 0);
  storeA.publish('A 同时提交');
  const afterA = snapshot(storeA);
  assert.equal(afterA.course.revision, 0, 'A 被拒绝并回滚到发布前，仍停在自己的第 0 版草稿');
  assert.equal(afterA.notice?.kind, 'error');
  assert.match(afterA.notice!.title, /冲突/);
  // 存储仍是 B 的定稿，A 的发布没有覆盖它。
  const stored = JSON.parse(storage.getItem(STORAGE_KEY)!);
  assert.equal(stored.revision, 1);
  assert.equal(stored.published.publishedBy, stateB0.currentTeacherId);

  // A 拉取最新定稿后采用第 1 版，基于新版改草稿后可发布。
  storeA.pullLatest();
  assert.equal(snapshot(storeA).course.revision, 1);
  storeA.commit((draft) => { draft.activities[0].title = `${draft.activities[0].title}（A 补充）`; });
  storeA.publish('A 基于最新版再提交');
  assert.equal(snapshot(storeA).course.revision, 2, '刷新到新版后发布成功，revision 推进到 2');
});

test('store 层越权发布：非负责人提交被拒，存储里不留任何发布痕迹', () => {
  const storage = makeStorage();
  const store = new CourseStore();
  attachStorage(store, storage);
  store.setTeacher('teacher-lin');

  const before = snapshot(store).course;
  assert.equal(before.published, null);
  store.publish('越权');
  const after = snapshot(store);
  assert.equal(after.course.published, null);
  assert.equal(after.course.status, 'draft');
  assert.equal(after.course.revision, 0);
  assert.equal(after.notice?.kind, 'error');
  assert.match(after.notice!.title, /越权/);
  const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
  assert.equal(stored?.published ?? null, null);
  assert.equal(stored?.revision ?? 0, 0);
});

test('store 层收到跨标签页 storage 事件后采用更新的定稿并清空撤销栈', () => {
  const storage = makeStorage();
  const listeners: Array<(event: StorageEvent) => void> = [];
  const fakeWin = {
    localStorage: storage,
    addEventListener: (_name: string, fn: EventListener) => listeners.push(fn as (event: StorageEvent) => void),
    removeEventListener: () => {}
  } as unknown as Window & typeof globalThis;

  const store = new CourseStore();
  store.init({ window: fakeWin, storage });

  // 别处把课程发布到第 1 版。
  const other = new CourseStore();
  attachStorage(other, storage);
  other.publish('别处发布');
  const publishedRaw = storage.getItem(STORAGE_KEY)!;

  // 先在本地产生一步可撤销的草稿编辑。
  store.commit((draft) => { draft.title = '本地改了标题'; });
  assert.equal(snapshot(store).canUndo, true);

  for (const fn of listeners) {
    fn({ key: STORAGE_KEY, newValue: publishedRaw } as unknown as StorageEvent);
  }

  const after = snapshot(store);
  assert.equal(after.course.revision, 1, '跨标签页定稿被采用');
  assert.equal(after.canUndo, false, '撤销栈已在定稿边界清空');
  assert.match(after.notice?.title ?? '', /定稿已更新/);
});
