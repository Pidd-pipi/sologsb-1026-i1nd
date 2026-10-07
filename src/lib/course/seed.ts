import type { Course } from './types';
import { DEFAULT_OWNER_ID } from './teachers';

/** 全新环境使用的种子课程：一份归属明确、可直接发布的草稿。 */
export function createSeedCourse(): Course {
  return {
    schemaVersion: 2,
    id: 'course-phonics-1',
    title: 'Starter Phonics · 声音侦探',
    level: '启蒙一级',
    ageRange: '5–6 岁',
    objective: '建立音素意识，能听辨、拼读并书写短元音单词。',
    ownerId: DEFAULT_OWNER_ID,
    status: 'draft',
    revision: 0,
    updatedAt: '2026-10-01T09:00:00+08:00',
    published: null,
    activities: [
      {
        id: 'a-1', type: '音素', title: '听音游戏：认识 /m/', content: '/m/',
        phonemes: ['/m/'], dependencies: [], difficulty: 1,
        prompt: '闭上嘴唇，轻轻发出 /m/，感受鼻子的震动。',
        accessibility: '提供口型示范图和可重复播放的低频音频。', duration: 6, feedback: ''
      },
      {
        id: 'a-2', type: '音素', title: '短元音 /æ/ 的口型', content: '/æ/',
        phonemes: ['/æ/'], dependencies: ['a-1'], difficulty: 2,
        prompt: '嘴巴张大，舌尖放低，声音短而有力。',
        accessibility: '提供正面口型、侧面舌位和慢速音频。', duration: 6, feedback: ''
      },
      {
        id: 'a-5', type: '音素', title: '认读辅音 /s/ 与 /t/', content: '/s/ /t/',
        phonemes: ['/s/', '/t/'], dependencies: ['a-1'], difficulty: 2,
        prompt: '对着纸条轻轻发 /s/，再弹舌发出短促的 /t/。',
        accessibility: '提供气流纸条实验示范和可重复播放的辨音音频。', duration: 7, feedback: ''
      },
      {
        id: 'a-3', type: '单词', title: '首音识别：/s/ 与 /m/', content: '/s/ /m/',
        phonemes: ['/s/', '/m/'], dependencies: ['a-1', 'a-5'], difficulty: 1,
        prompt: '听到单词时拍手，听到 /m/ 时把手放在鼻子上。',
        accessibility: '视觉提示使用不同形状，不只依赖颜色。', duration: 8, feedback: ''
      },
      {
        id: 'a-4', type: '单词', title: '拼读短词：sat', content: 's – a – t → sat',
        phonemes: ['/s/', '/æ/', '/t/'], dependencies: ['a-2', 'a-5', 'a-3'], difficulty: 2,
        prompt: '用手指依次点每个字母，再连起来读。',
        accessibility: '字母块支持键盘逐字聚焦和屏幕阅读器朗读。', duration: 10, feedback: '拼对后让学生再连读一遍，确认每个音素都发清楚。'
      },
      {
        id: 'a-6', type: '练习', title: '听音选图：m / s 开头', content: 'moon, sun, mat, sock',
        phonemes: ['/m/', '/s/'], dependencies: ['a-3'], difficulty: 2,
        prompt: '先听单词，再从两张图片中选出正确首音。',
        accessibility: '所有图片均配替代文本，可只用键盘选择。', duration: 8, feedback: '选对后请跟读单词；选错时再听一次首音并对比口型。'
      },
      {
        id: 'a-7', type: '练习', title: '把单词和图片配对', content: 'mat · map · sun · sock',
        phonemes: ['/m/', '/æ/', '/s/'], dependencies: ['a-4', 'a-6'], difficulty: 3,
        prompt: '读出单词，然后把单词卡拖到对应图片。',
        accessibility: '支持键盘选择起点和终点，不使用拖拽也能完成。', duration: 12, feedback: '答对后播放该单词的分解音；答错时先拼读再重选。'
      },
      {
        id: 'a-8', type: '句子', title: '拼读句子：Mat sat.', content: 'Mat sat on the mat.',
        phonemes: ['/m/', '/æ/', '/s/', '/t/'], dependencies: ['a-4'], difficulty: 3,
        prompt: '先读每个单词，再按意群连读句子。',
        accessibility: '句子可按词高亮，并提供更大字号选项。', duration: 10, feedback: '读对了，再试试让声音更连贯。'
      },
      {
        id: 'a-9', type: '音素', title: '认识鼻辅音 /n/', content: '/n/',
        phonemes: ['/n/'], dependencies: ['a-1'], difficulty: 3,
        prompt: '舌尖抵上齿龈，用鼻音发出 /n/，和 /m/ 比较震动位置。',
        accessibility: '提供鼻腔震动触感提示卡和慢速对比音频。', duration: 6, feedback: ''
      },
      {
        id: 'a-10', type: '句子', title: '迁移朗读：A man sat.', content: 'A man sat and had a nap.',
        phonemes: ['/m/', '/æ/', '/n/', '/s/'], dependencies: ['a-8', 'a-9'], difficulty: 4,
        prompt: '观察 a 和 man 之间的联系，再完整朗读。',
        accessibility: '提供分句导航、朗读速度控制和高对比模式。', duration: 12,
        feedback: '按意群朗读，注意 man 中 /æ/ 的口型；全句 8 个词，控制在一个节拍内。'
      }
    ],
    versions: []
  };
}
