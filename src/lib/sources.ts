/**
 * Ways to get a lesson, shown as "Chọn nguồn bài" on Home.
 * To add a source: add an entry here and handle its id in Home's `pickSource` switch.
 */

export type LessonSourceId = 'catalog' | 'upload' | 'auto' | 'link'

export interface LessonSourceOption {
  id: LessonSourceId
  label: string
  description: string
  /** false = shown dimmed with "Sắp có". */
  available: boolean
}

export const LESSON_SOURCES: LessonSourceOption[] = [
  {
    id: 'catalog',
    label: 'Bài có sẵn',
    description: 'Bài nghe từ Voice of America (public domain).',
    available: true,
  },
  {
    id: 'upload',
    label: 'Tải file của bạn',
    description: 'Audio hoặc video ngắn, kèm transcript bạn dán vào.',
    available: true,
  },
  {
    id: 'auto',
    label: 'Nhận dạng tự động',
    description: 'Tự chép lời từ file bằng Whisper, không cần dán chữ.',
    available: false,
  },
  {
    id: 'link',
    label: 'Dán đường dẫn',
    description: 'Tạo bài từ link audio hoặc video.',
    available: false,
  },
]
