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
    Tile
  } from 'carbon-components-svelte';
  import { courseStore } from '$lib/course/store';
  import { analyzeActivities } from '$lib/course/analysis';
  import { compareWithPublished, revisionOptions } from '$lib/course/versions';
  import { TEACHERS, teacherName } from '$lib/course/teachers';
  import type { Activity, ActivityType, Diagnostic, PreviewWidth, ViewMode } from '$lib/course/types';

  let selectedActivityId = '';
  let activeView: ViewMode = 'compose';
  let previewWidth: PreviewWidth = 'desktop';
  let compareTargetId = 'draft';
  let qaSource: 'published' | 'draft' = 'published';
  let pathSource: 'published' | 'draft' = 'published';
  let publishNote = '';
  let transferOwnerId = '';
  let online = true;
  let showOfflineNotice = false;

  $: course = $courseStore.course;
  $: currentTeacherId = $courseStore.currentTeacherId;
  $: storeNotice = $courseStore.notice;
  $: busy = $courseStore.busy;
  $: isOwner = currentTeacherId === course.ownerId;
  $: isPublished = course.status === 'published' && !!course.published;
  $: published = course.published;

  $: draftActivities = course.activities;
  $: viewActivities = activeView === 'issues'
    ? (qaSource === 'published' && published ? published.activities : draftActivities)
    : activeView === 'path'
      ? (pathSource === 'published' && published ? published.activities : draftActivities)
      : draftActivities;

  $: selectedActivity = draftActivities.find((activity) => activity.id === selectedActivityId) ?? draftActivities[0] ?? null;
  $: if (draftActivities.length > 0 && !draftActivities.some((activity) => activity.id === selectedActivityId)) {
    selectedActivityId = draftActivities[0].id;
  }
  $: draftDiagnostics = analyzeActivities(draftActivities);
  $: diagnostics = activeView === 'issues'
    ? analyzeActivities(viewActivities)
    : draftDiagnostics;
  $: errorCount = diagnostics.filter((issue) => issue.level === 'error').length;
  $: warningCount = diagnostics.filter((issue) => issue.level === 'warning').length;
  $: draftErrorCount = draftDiagnostics.filter((issue) => issue.level === 'error').length;
  $: totalMinutes = viewActivities.reduce((sum, activity) => sum + activity.duration, 0);
  $: versionDiff = compareWithPublished(course, compareTargetId);
  $: compareOptions = revisionOptions(course);

  onMount(() => {
    const detachStore = courseStore.init();
    selectedActivityId = course.activities[0]?.id ?? '';
    compareTargetId = 'draft';
    transferOwnerId = course.ownerId;
    const updateNetwork = () => {
      online = navigator.onLine;
      showOfflineNotice = !online;
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      detachStore();
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  });

  // store 在首次载入 / 跨标签页同步后可能换课程，保证选中项有效（见上方响应式声明）。

  function updateCourse(field: 'title' | 'level' | 'ageRange' | 'objective', value: string): void {
    courseStore.commit((draft) => { draft[field] = value; });
  }

  function updateActivity(field: keyof Activity, value: unknown): void {
    if (!selectedActivity) return;
    const id = selectedActivity.id;
    courseStore.commit((draft) => {
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
    courseStore.commit((draft) => {
      draft.activities.push({
        id, type, title: `新的${type}活动`, content: '', phonemes: [], dependencies: [],
        difficulty: 1, prompt: '请输入教师提示语。', accessibility: '请描述视觉、听觉或键盘无障碍支持。',
        duration: type === '练习' ? 10 : 8, feedback: ''
      });
    });
    selectedActivityId = id;
    activeView = 'compose';
  }

  function deleteActivity(): void {
    if (!selectedActivity || course.activities.length <= 1) return;
    const id = selectedActivity.id;
    courseStore.commit((draft) => {
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
    courseStore.commit((draft) => {
      const index = draft.activities.findIndex((activity) => activity.id === selectedActivity?.id);
      draft.activities.splice(index + 1, 0, source);
    });
    selectedActivityId = source.id;
  }

  function moveActivity(direction: -1 | 1): void {
    if (!selectedActivity) return;
    const id = selectedActivity.id;
    courseStore.commit((draft) => {
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

  function submitPublish(): void {
    courseStore.publish(publishNote);
    publishNote = '';
  }

  function focusIssue(issue: Diagnostic): void {
    selectedActivityId = issue.activityId;
    activeView = 'compose';
    qaSource = 'draft';
    pathSource = 'draft';
  }

  function formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function dependencyTitle(id: string): string {
    return draftActivities.find((item) => item.id === id)?.title ?? '';
  }

  function handleKeyboard(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;
    const tag = (event.target as HTMLElement)?.tagName;
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? courseStore.redo() : courseStore.undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      courseStore.redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      courseStore.saveNow();
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
    </div>
    <div class="header-actions">
      <Select
        labelText=""
        size="sm"
        selected={currentTeacherId}
        on:change={(event) => courseStore.setTeacher(readText(event))}
      >
        {#each TEACHERS as teacher}
          <SelectItem value={teacher.id} text={`${teacher.name}${teacher.id === course.ownerId ? ' · 负责人' : ''}`} />
        {/each}
      </Select>
      <Button size="small" kind="ghost" disabled={!$courseStore.canUndo} on:click={() => courseStore.undo()}>撤销</Button>
      <Button size="small" kind="ghost" disabled={!$courseStore.canRedo} on:click={() => courseStore.redo()}>重做</Button>
      <Button size="small" kind="tertiary" on:click={() => courseStore.saveNow()}>保存草稿</Button>
    </div>
  </header>

  {#if showOfflineNotice}
    <div class="offline-notice">
      <InlineNotification lowContrast kind="info" title="已切换到离线模式" subtitle="草稿在本机继续保存；发布时会与其他窗口的定稿做版本核对。" />
    </div>
  {/if}

  {#if storeNotice}
    <div class="offline-notice">
      <InlineNotification
        lowContrast
        kind={storeNotice.kind === 'success' ? 'success' : storeNotice.kind === 'info' ? 'info' : storeNotice.kind === 'warning' ? 'warning' : 'error'}
        title={storeNotice.title}
        subtitle={storeNotice.subtitle ?? ''}
        on:close={() => courseStore.dismissNotice()}
      />
    </div>
  {/if}

  <section class="course-hero">
    <div class="hero-copy">
      <span class="kicker">COURSE BUILDER / {course.level}</span>
      <h2>{course.title}</h2>
      <p>{course.objective}</p>
      <div class="hero-badges">
        {#if isPublished}
          <Tag type="green">已定稿 v{published?.releaseNo} · 第 {published?.revision} 版</Tag>
          <Tag type="cool-gray">签发：{teacherName(published?.publishedBy)}</Tag>
          <Tag type="cool-gray">{formatDateTime(published?.publishedAt ?? '')}</Tag>
        {:else}
          <Tag type="magenta">草稿 · 尚未发布</Tag>
        {/if}
        <Tag type={isOwner ? 'blue' : 'cool-gray'}>
          负责人：{teacherName(course.ownerId)}{isOwner ? '（你）' : ''}
        </Tag>
        <Tag type="cool-gray">当前身份：{teacherName(currentTeacherId)}</Tag>
      </div>
      {#if isPublished}
        <p class="freeze-note">定稿已冻结活动顺序、依赖与音素说明；下方编排修改的是草稿，质量检查与版本比较仍以已发布那版为准。</p>
      {/if}
    </div>
    <div class="hero-side">
      <div class="hero-stats">
        <div><strong>{viewActivities.length}</strong><span>{qaSource === 'published' && isPublished ? '定稿活动' : '草稿活动'}</span></div>
        <div><strong>{totalMinutes}</strong><span>分钟</span></div>
        <div><strong class={draftErrorCount ? 'critical' : ''}>{draftErrorCount}</strong><span>草稿必修</span></div>
        <div><strong class="caution">{warningCount}</strong><span>{qaSource === 'published' && isPublished ? '定稿建议' : '建议调整'}</span></div>
      </div>
      <Tile class="publish-card">
        <div class="publish-head">
          <span class="kicker">RELEASE CONTROL</span>
          {#if isPublished}
            <Tag type="green">已发布 v{published?.releaseNo}</Tag>
          {:else}
            <Tag type="magenta">待发布</Tag>
          {/if}
        </div>
        {#if isOwner}
          <TextArea
            labelText={isPublished ? '本次重新发布说明' : '发布说明'}
            rows={2}
            bind:value={publishNote}
            placeholder={isPublished ? '说明本次定稿相对上一版的变化（可选）' : '例如：完成全部质量检查，确认音素教学顺序。'}
          />
          <Button kind="primary" size="small" disabled={busy} on:click={submitPublish}>
            {busy ? '发布中…' : isPublished ? `发布新定稿（第 ${course.revision + 1} 版）` : '发布课程定稿'}
          </Button>
          <p class="publish-hint">
            提交基于第 {course.revision} 版；若有另一位老师抢先发布，本次提交会因版本过期被拒绝，不会覆盖对方定稿。
            <Button size="small" kind="ghost" on:click={() => courseStore.pullLatest()}>拉取最新定稿</Button>
          </p>
          <div class="transfer-row">
            <Select
              labelText="负责人交接"
              size="sm"
              bind:selected={transferOwnerId}
              on:change={(event) => (transferOwnerId = readText(event))}
            >
              {#each TEACHERS as teacher}
                <SelectItem value={teacher.id} text={`${teacher.name}${teacher.id === course.ownerId ? '（现任）' : ''}`} />
              {/each}
            </Select>
            <Button size="small" kind="ghost" disabled={transferOwnerId === course.ownerId} on:click={() => courseStore.transferOwner(transferOwnerId)}>交接</Button>
          </div>
        {:else}
          <p class="publish-denied">只有课程负责人 <b>{teacherName(course.ownerId)}</b> 可以发布。你（{teacherName(currentTeacherId)}）对草稿的修改会保留，但不能签发定稿；即使提交发布也会被直接拒绝。</p>
          <Button kind="primary" size="small" disabled on:click={submitPublish}>禁止发布</Button>
        {/if}
      </Tile>
    </div>
  </section>

  <nav class="workspace-tabs" aria-label="工作区">
    <button class:active={activeView === 'compose'} on:click={() => activeView = 'compose'}><span>01</span><b>课程编排</b><small>活动、依赖与教学说明（草稿）</small></button>
    <button class:active={activeView === 'path'} on:click={() => activeView = 'path'}><span>02</span><b>学习路径</b><small>多屏幕顺序预览</small></button>
    <button class:active={activeView === 'issues'} on:click={() => activeView = 'issues'}><span>03</span><b>质量检查</b><small>以已发布定稿为准</small></button>
    <button class:active={activeView === 'versions'} on:click={() => activeView = 'versions'}><span>04</span><b>版本与复用</b><small>定稿、存档与比较</small></button>
  </nav>

  {#if activeView === 'compose'}
    <main class="compose-layout">
      <aside class="activity-sidebar">
        <div class="sidebar-heading">
          <div><span class="kicker">LESSON MAP</span><h3>学习活动（草稿）</h3></div>
          <Button size="small" kind="ghost" on:click={() => addActivity('练习')}>添加</Button>
        </div>
        <div class="type-legend">
          {#each ['音素', '单词', '句子', '练习'] as type}
            <span><i class:practice={type === '练习'} class:phoneme={type === '音素'}></i>{type}</span>
          {/each}
        </div>
        <div class="activity-list">
          {#each draftActivities as activity, index (activity.id)}
            <button class:selected={activity.id === selectedActivityId} class="activity-row" on:click={() => selectedActivityId = activity.id}>
              <span class="sequence">{String(index + 1).padStart(2, '0')}</span>
              <span class="activity-type {activity.type}">{activity.type}</span>
              <span class="activity-copy"><b>{activity.title}</b><small>{activity.duration} 分钟 · 难度 {activity.difficulty}/5</small></span>
              {#if activity.dependencies.length}<i title="有前置依赖">↳</i>{/if}
            </button>
          {/each}
        </div>
        <div class="sidebar-help">快捷键：Alt + N 新建 · Alt + ↑/↓ 调整顺序{#if isPublished} · 改动只进草稿{/if}</div>
      </aside>

      <section class="editor-column">
        {#if selectedActivity}
          <div class="editor-toolbar">
            <div>
              <span class="kicker">ACTIVITY EDITOR</span>
              <h3>{selectedActivity.type}活动</h3>
            </div>
            <div>
              <Button size="small" kind="ghost" disabled={draftActivities[0]?.id === selectedActivity.id} on:click={() => moveActivity(-1)}>上移</Button>
              <Button size="small" kind="ghost" disabled={draftActivities.at(-1)?.id === selectedActivity.id} on:click={() => moveActivity(1)}>下移</Button>
              <Button size="small" kind="ghost" on:click={duplicateActivity}>复制</Button>
              <Button size="small" kind="danger-ghost" on:click={deleteActivity}>删除</Button>
            </div>
          </div>
          {#if isPublished}
            <InlineNotification lowContrast kind="info" title="正在编辑草稿" subtitle="定稿已冻结，这里的顺序、依赖与音素修改不会影响已发布版本；负责人重新发布后才会成为新定稿。" />
          {/if}

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
              {#each draftActivities.filter((activity) => activity.id !== selectedActivity?.id) as activity (activity.id)}
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
          <span class="kicker">COURSE META</span><h3>课程信息（草稿）</h3>
          <TextInput labelText="课程名称" value={course.title} on:input={(event) => updateCourse('title', readText(event))} />
          <TextInput labelText="课程等级" value={course.level} on:input={(event) => updateCourse('level', readText(event))} />
          <TextInput labelText="适用年龄" value={course.ageRange} on:input={(event) => updateCourse('ageRange', readText(event))} />
          <TextArea labelText="学习目标" rows={3} value={course.objective} on:input={(event) => updateCourse('objective', readText(event))} />
        </Tile>
        <Tile class="compact-card issue-peek">
          <div class="section-title"><div><span class="kicker">DRAFT CHECK</span><h3>草稿实时提示</h3></div><Tag type={draftErrorCount ? 'red' : 'green'}>{draftErrorCount ? `${draftErrorCount} 项` : '通过'}</Tag></div>
          {#each draftDiagnostics.slice(0, 4) as issue}
            <button on:click={() => focusIssue(issue)} class="peek-row">
              <i class:error={issue.level === 'error'} class:warning={issue.level === 'warning'}></i>
              <span><b>{issue.title}</b><small>{issue.category}</small></span>
            </button>
          {/each}
          {#if draftDiagnostics.length === 0}<p class="empty-state">草稿结构完整，没有发现提示，可以交给负责人发布。</p>{/if}
          <Button size="small" kind="ghost" on:click={() => { qaSource = 'draft'; activeView = 'issues'; }}>查看草稿检查</Button>
        </Tile>
      </aside>
    </main>
  {/if}

  {#if activeView === 'path'}
    <main class="path-view">
      <div class="path-toolbar">
        <div><span class="kicker">RESPONSIVE SEQUENCE</span><h2>学习顺序预览</h2><p>已发布课程默认展示定稿顺序；切换草稿可预览尚未发布的改动。</p></div>
        <div class="path-controls">
          {#if isPublished}
            <div class="width-switcher">
              <button class:active={pathSource === 'published'} on:click={() => pathSource = 'published'}>已发布定稿 v{published?.releaseNo}</button>
              <button class:active={pathSource === 'draft'} on:click={() => pathSource = 'draft'}>当前草稿</button>
            </div>
          {/if}
          <div class="width-switcher">
            <button class:active={previewWidth === 'phone'} on:click={() => previewWidth = 'phone'}>手机</button>
            <button class:active={previewWidth === 'tablet'} on:click={() => previewWidth = 'tablet'}>平板</button>
            <button class:active={previewWidth === 'desktop'} on:click={() => previewWidth = 'desktop'}>桌面</button>
          </div>
        </div>
      </div>
      <div class="preview-stage">
        <div class="device-preview {previewWidth}">
          <div class="device-bar">
            <span></span>
            <b>{previewWidth === 'phone' ? '390 px' : previewWidth === 'tablet' ? '768 px' : '1200 px'} · {pathSource === 'published' && isPublished ? `定稿 v${published?.releaseNo}` : '草稿'}</b>
          </div>
          <div class="lesson-preview">
            <header>
              {#if pathSource === 'published' && published}
                <span>已发布定稿 v{published.releaseNo}</span>
                <h3>{published.title}</h3>
                <p>{published.objective}</p>
              {:else}
                <span>草稿预览</span>
                <h3>{course.title}</h3>
                <p>{course.objective}</p>
              {/if}
            </header>
            {#each viewActivities as activity, index (activity.id)}
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
                  {#if activity.dependencies.length}<small>前置：{activity.dependencies.map(dependencyTitle).filter(Boolean).join('、')}</small>{/if}
                </div>
              </article>
            {/each}
            <footer>课程结束 · 预计 {totalMinutes} 分钟 · {pathSource === 'published' && isPublished ? '以定稿为准' : '草稿，未发布'}</footer>
          </div>
        </div>
      </div>
    </main>
  {/if}

  {#if activeView === 'issues'}
    <main class="issues-view">
      <div class="view-heading">
        <div><span class="kicker">CURRICULUM QA</span><h2>课程质量检查</h2><p>质量检查以已发布定稿为准；草稿检查仅用于发布前自查，别人继续改草稿不会改变定稿结论。</p></div>
        <div class="issue-summary"><span><b>{errorCount}</b> 必须处理</span><span><b>{warningCount}</b> 建议调整</span><span><b>{diagnostics.length}</b> 全部提示</span></div>
      </div>
      {#if isPublished}
        <div class="width-switcher qa-switcher">
          <button class:active={qaSource === 'published'} on:click={() => qaSource = 'published'}>检查已发布定稿 v{published?.releaseNo}</button>
          <button class:active={qaSource === 'draft'} on:click={() => qaSource = 'draft'}>检查当前草稿（{draftErrorCount} 项必修）</button>
        </div>
      {/if}
      <div class="issue-board">
        {#each diagnostics as issue, index (issue.id + index)}
          <article class:critical={issue.level === 'error'} class:caution={issue.level === 'warning'} class:info={issue.level === 'info'}>
            <span class="issue-index">{String(index + 1).padStart(2, '0')}</span>
            <div><div class="issue-meta"><Tag type={issue.level === 'error' ? 'red' : issue.level === 'warning' ? 'magenta' : 'blue'}>{issue.category}</Tag><small>{issue.level === 'error' ? '必须处理' : issue.level === 'warning' ? '建议调整' : '教学提示'}</small></div><h3>{issue.title}</h3><p>{issue.detail}</p></div>
            {#if qaSource !== 'draft'}
              <Button size="small" kind="ghost" on:click={() => focusIssue(issue)}>到草稿定位</Button>
            {/if}
          </article>
        {:else}
          <Tile class="all-clear">
            <h3>{qaSource === 'published' && isPublished ? `定稿 v${published?.releaseNo} 检查通过` : '草稿检查通过'}</h3>
            <p>{qaSource === 'published' && isPublished ? '顺序、依赖、音素、反馈与无障碍说明均已定稿。' : '教学顺序、反馈与无障碍说明均已完成，可以发布。'}</p>
          </Tile>
        {/each}
        {#if diagnostics.length}
          <div class="rule-grid">
            <Tile><span>前置知识</span><strong>先教后用</strong><p>非音素活动使用未单独教学的音素时阻断发布。</p></Tile>
            <Tile><span>相似音</span><strong>对比教学</strong><p>发现 /b/-/p/、/f/-/v/ 等音对时建议增加辨音。</p></Tile>
            <Tile><span>例句</span><strong>≤ 12 词</strong><p>超过建议长度时提示拆分意群。</p></Tile>
            <Tile><span>练习</span><strong>必须有反馈</strong><p>每个练习活动都要提供可行动反馈。</p></Tile>
          </div>
        {/if}
      </div>
    </main>
  {/if}

  {#if activeView === 'versions'}
    <main class="versions-view">
      <div class="view-heading">
        <div><span class="kicker">REUSE & HISTORY</span><h2>定稿、存档与课程复用</h2><p>发布记录（定稿）由负责人签发且不可变；草稿存档任何人都可保存，仅用于对照。版本比较以已发布那版为基准。</p></div>
        <div class="version-actions">
          <Button kind="tertiary" on:click={() => courseStore.duplicateCourse()}>复制课程</Button>
          <Button kind="tertiary" on:click={() => courseStore.saveArchive()}>保存草稿存档</Button>
          {#if isOwner}
            <Button kind="primary" disabled={busy} on:click={submitPublish}>{isPublished ? '发布新定稿' : '发布课程定稿'}</Button>
          {:else}
            <Button kind="primary" disabled>仅负责人可发布</Button>
          {/if}
        </div>
      </div>
      <div class="version-layout-svelte">
        <Tile class="version-timeline">
          <div class="section-title"><div><span class="kicker">TIMELINE</span><h3>发布记录与草稿存档</h3></div><Tag type="cool-gray">{course.versions.length} 条</Tag></div>
          {#each [...course.versions].reverse() as version (version.id)}
            <article class:latest={version.kind === 'release'}>
              <span class="timeline-dot {version.kind}"></span>
              <div>
                <div class="timeline-tags">
                  <b>{version.label}</b>
                  {#if version.kind === 'release'}
                    <Tag type="green">定稿 · 第 {version.revision} 版</Tag>
                    <Tag type="cool-gray">{teacherName(version.publishedBy)}</Tag>
                  {:else}
                    <Tag type="cool-gray">草稿存档 · 非定稿</Tag>
                  {/if}
                </div>
                <h4>{version.note}</h4>
                <p>{formatTime(version.savedAt)} · {version.activities.length} 个活动</p>
              </div>
            </article>
          {:else}
            <p class="empty-state">还没有任何历史。负责人发布后这里会出现不可变的定稿记录。</p>
          {/each}
        </Tile>
        <Tile class="diff-card">
          <div class="section-title"><div><span class="kicker">COMPARE</span><h3>与已发布定稿比较</h3></div></div>
          {#if isPublished && published}
            <div class="published-base">
              <Tag type="green">比较基准 · 定稿 v{published.releaseNo}</Tag>
              <small>{teacherName(published.publishedBy)} 签发于 {formatDateTime(published.publishedAt)} · {published.activities.length} 个活动 · 顺序、依赖与音素已冻结</small>
            </div>
            <div class="compare-pickers">
              <Select labelText="比较目标" bind:selected={compareTargetId} on:change={(event) => (compareTargetId = readText(event))}>
                {#each compareOptions as option}
                  <SelectItem
                    value={option.id}
                    text={option.kind === 'release' ? `定稿 v${option.releaseNo} · ${formatTime(option.savedAt)}` : `${option.label} · ${formatTime(option.savedAt)}`}
                  />
                {/each}
              </Select>
            </div>
            <div class="diff-list">
              {#each versionDiff as diff (diff.id + diff.kind)}
                <article class={diff.kind}><span>{diff.kind === 'added' ? '相对新增' : diff.kind === 'removed' ? '定稿独有' : '已修改'}</span><div><b>{diff.title}</b><p>{diff.detail}</p></div></article>
              {:else}
                <p class="empty-state">比较目标与已发布定稿完全一致。</p>
              {/each}
            </div>
          {:else}
            <p class="empty-state">课程尚未发布，还没有可作为基准的定稿。请由负责人 <b>{teacherName(course.ownerId)}</b> 发布第一版后再进行版本比较。</p>
          {/if}
        </Tile>
      </div>
    </main>
  {/if}

  <footer class="app-footer">
    <span>草稿保存在当前浏览器 localStorage · 定稿一经发布即冻结，只有负责人能发布</span>
    <span>Ctrl/Cmd + Z 撤销 · Ctrl/Cmd + Y 重做 · Alt + N 新建活动 · Ctrl/Cmd + S 保存草稿</span>
  </footer>
</div>
