import type { SampleLesson } from './types.ts'

export const SAMPLE_LESSON: SampleLesson = {
  id: 'sample',
  title: 'Bài mẫu: Một ngày bình thường',
  kind: 'tts',
  langId: 'en',
  createdAt: 0,
  sentences: [
    'I wake up at six every morning.',
    'My sister makes a cup of tea.',
    'We eat breakfast together at the kitchen table.',
    'After that, I walk to the bus stop.',
    'The bus is usually full, but I find a seat.',
    'In the evening, we cook dinner and talk about our day.',
  ].map((text, i) => ({ id: `sample-${i}`, text })),
}
