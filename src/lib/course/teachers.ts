/** 教研组教师目录。纯前端工具用轻量账号模拟“谁在操作”，发布归属以此为准。 */
export interface Teacher {
  id: string;
  name: string;
  title: string;
}

export const TEACHERS: Teacher[] = [
  { id: 'teacher-chen', name: '陈老师', title: '拼读教研组 · 负责人' },
  { id: 'teacher-lin', name: '林老师', title: '拼读教研组 · 教师' },
  { id: 'teacher-wang', name: '王老师', title: '拼读教研组 · 教师' }
];

/** 迁移老数据时没有负责人信息，默认补建为第一位教师。 */
export const DEFAULT_OWNER_ID = TEACHERS[0].id;

export function teacherName(id: string | undefined | null): string {
  if (!id) return '未指派';
  return TEACHERS.find((teacher) => teacher.id === id)?.name ?? id;
}

export function isTeacherKnown(id: string): boolean {
  return TEACHERS.some((teacher) => teacher.id === id);
}
