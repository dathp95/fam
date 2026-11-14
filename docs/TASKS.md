# FAM — Yêu cầu công việc cho Claude Code

Dự án: Vite + React + TypeScript (xem `CLAUDE.md` và `README.md`). Đọc toàn bộ file này trước, rồi làm **từng Task theo thứ tự A → B → C**. Mỗi Task là một lần làm việc riêng và một commit riêng.

## Quy tắc chung
- Giữ nguyên hành vi và giao diện hiện có, trừ phần được nêu trong Task.
- Giao diện tiếng Việt, mã nguồn và tên biến tiếng Anh. Có chế độ sáng/tối (dùng token màu trong `src/index.css`), dùng được trên điện thoại.
- Logic thuần để trong `src/lib/` và có test Vitest (import tường minh `describe, it, expect` từ 'vitest').
- **Không bịa nội dung**: không tự tạo file audio, không tự bịa tên tác phẩm, tác giả, URL, mã đối tượng (objectId) hay số câu. Phần nào cần nội dung thật do người dùng cung cấp thì dùng dữ liệu giả cho test và để trống/`[]` trong file dữ liệu thật.
- Cuối mỗi Task: chạy `npm run build`, `npm run lint`, `npm test`; báo kết quả, danh sách file đã đổi và gợi ý commit message (không tự commit/push).
- Không thêm thư viện mới nếu không thật cần; nếu thêm thì nói rõ lý do.

## Quyết định đã chốt
1. Chủ đề ảnh đầu tiên: **mèo** (bộ sưu tập "Cats" của Met Museum Open Access, CC0).
2. Ngưỡng mở một mảnh tranh: điểm trung bình bài học **>= 60** (hằng số `PASS_SCORE = 60`).
3. **Có** bài thưởng cuối chuỗi: luyện chính các câu giới thiệu bức tranh (đọc bằng giọng TTS).
4. Nguồn audio A1: VOA "Let's Learn English – Level 1" (public domain). Ghi nguồn trong app. ELLLO chưa gắn sẵn (chưa rõ điều khoản dùng lại), chỉ dùng qua chế độ tải file của người dùng.

---

## Task A — Sửa tách câu với chữ viết tắt
File: `src/lib/segment.ts` (`splitSentences`), test trong `src/lib/segment.test.ts`.

Lỗi hiện tại: "I live in Washington, D.C. and I like it." bị tách thành "…Washington, D." và "C." và "and I like it.".

Yêu cầu:
- Không tách câu sau các chữ viết tắt chắc chắn không kết thúc câu: Mr., Mrs., Ms., Dr., St., Jr., Sr., vs., etc. (chỉ khi theo sau là chữ thường), e.g., i.e.
- Với viết tắt nhiều chữ cái như U.S., U.K., D.C., a.m., p.m.: dấu chấm bên trong luôn là dấu chấm của từ. Dấu chấm cuối chỉ kết thúc câu khi sau đó là khoảng trắng + chữ in hoa hoặc hết văn bản.
- Chữ viết tắt trong `[...]`, ngoặc kép, hoặc sau dấu `?`/`!` vẫn hoạt động đúng.
- Triển khai gợi ý: thay các dấu chấm "được bảo vệ" bằng ký tự giữ chỗ trước khi tách, rồi khôi phục. Giữ nguyên quy tắc tách hiện có (câu > 16 từ tách tại `, ; :` thành đoạn >= 6 từ).

Test tối thiểu:
- "I live in Washington, D.C. and I like it very much." → 1 câu.
- "I live in Washington, D.C. Anna lives there too." → 2 câu.
- "Mr. Smith and Dr. Lee arrive at 9 a.m. today." → 1 câu.
- "It is 5 p.m. We go home." → 2 câu.
- Các test cũ vẫn qua.

---

## Task B — Bài có sẵn (static), nguồn bài, xuất JSON

### B1. Kiểu dữ liệu (`src/lib/types.ts`)
```ts
export type Level = 'A1' | 'A2'
export interface SourceInfo { name: string; url: string; license: string }

export interface StaticLesson extends LessonBase {
  kind: 'static'
  /** Đường dẫn tương đối tới file audio, ví dụ "lessons/voa/l01.mp3" (tính từ BASE_URL). */
  audioUrl: string
  duration: number
  sentences: TimedSentence[]
  level: Level
  topic: string
  source: SourceInfo
  seriesId?: string
  /** Thứ tự trong chuỗi (bắt đầu từ 1). */
  order?: number
}
// Lesson = SampleLesson | MediaLesson | StaticLesson
```

### B2. Danh mục bài (`public/lessons/index.json`)
```json
{ "version": 1, "lessons": [], "series": [] }
```
- `lessons`: mảng `StaticLesson` (đã có `kind: "static"`).
- `series`: dùng cho Task C (để `[]` trong Task B).
- File dữ liệu thật để trống; người dùng sẽ thêm bài sau bằng nút xuất JSON.
- Tạo `src/lib/catalog.ts`: `loadCatalog(): Promise<Catalog>` đọc `import.meta.env.BASE_URL + 'lessons/index.json'`, kiểm tra kiểu ở runtime (hàm `parseCatalog(raw: unknown)` thuần, có test). Bài sai định dạng bị bỏ qua và ghi vào danh sách cảnh báo; lỗi mạng/JSON hỏng trả về catalog rỗng kèm thông báo tiếng Việt, không làm app lỗi.

### B3. Phát audio từ URL
- `useSegmentPlayer(source: Blob | string | null)`: nếu là `string` thì dùng thẳng làm `src` (nối `BASE_URL` ở nơi gọi), **không** tạo hay thu hồi object URL. Giữ nguyên logic chờ `loadedmetadata`, dọn dẹp, `stop()`.
- `Practice` nhận nguồn phát thay cho `media: Blob | null`. Với `kind: 'tts'` vẫn dùng speechSynthesis.
- `App.loadMedia`: `static` trả về URL; `media` đọc Blob từ IndexedDB như cũ.
- Video hay audio quyết định bằng đuôi file (`.mp4/.webm` = video, còn lại audio) khi nguồn là chuỗi.

### B4. Chọn nguồn bài (`src/lib/sources.ts`)
```ts
export interface LessonSourceOption {
  id: 'catalog' | 'upload' | 'auto' | 'link'
  label: string
  description: string
  available: boolean   // false = hiện mờ, ghi "Sắp có"
}
export const LESSON_SOURCES: LessonSourceOption[] = [...]
```
- `catalog` (Bài có sẵn, nguồn VOA) và `upload` (Tải file của bạn) có `available: true`; `auto` (nhận dạng tự động bằng Whisper) và `link` (dán đường dẫn) có `available: false`.
- Home hiện nhóm "Chọn nguồn bài" gồm các thẻ này. Thêm nguồn mới sau này chỉ cần thêm một phần tử vào mảng và một nhánh xử lý.

### B5. Home
- Nhóm "Bài có sẵn": nhóm theo `seriesId` (hoặc "Khác"), sắp theo `order`; mỗi bài có nhãn `level`, chủ đề, số câu và dòng nguồn ("Nguồn: Voice of America · public domain") lấy từ `source`.
- Nhóm "Bài của bạn": bài `media` như hiện nay (Chỉnh sửa/Xóa).
- Bài mẫu TTS vẫn hiện.
- Khi catalog rỗng hoặc lỗi: dòng thông báo trung tính, không chặn các phần khác.

### B6. Xuất JSON từ màn hình Review (`Review.tsx`)
- Thêm khối thu gọn "Thông tin xuất bản (tùy chọn)": `level` (A1/A2), `topic`, `source.name`, `source.url`, `source.license`, `seriesId`, `order`, `audioUrl`.
- Nút "Xuất bài (JSON)": tạo `StaticLesson` từ trạng thái hiện tại (id lấy từ `audioUrl` hoặc ô nhập, `kind: 'static'`, `sentences` đang chỉnh) và tải về bằng Blob + thẻ `<a download>`. Không đưa file audio vào JSON.
- Hàm dựng JSON là hàm thuần trong `src/lib/export.ts` (`buildStaticLesson(...)`), có test, kiểm tra đủ trường bắt buộc và trả lỗi tiếng Việt nếu thiếu.
- Quy trình nội dung: nạp audio → căn câu → xuất JSON → người dùng đặt audio vào `public/lessons/...` và dán phần tử vào `lessons` của `index.json`.

### B7. Test
- `parseCatalog` (hợp lệ, thiếu trường, sai kiểu, bài trùng id).
- `buildStaticLesson`.
- Logic nhóm/sắp xếp bài trên Home (tách thành hàm thuần).

---

## Task C — Bức tranh mở dần

### C1. Dữ liệu chuỗi (series) trong `public/lessons/index.json`
```ts
export interface PictureCredit {
  title: string; artist: string; date: string
  objectId: string; url: string; license: 'CC0' | 'placeholder'
}
export interface Series {
  id: string
  title: string
  level: Level
  image: { src: string; width: number; height: number; alt: string; credit: PictureCredit }
  grid: { cols: number; rows: number }      // cols * rows === lessonIds.length
  revealOrder: number[]                      // hoán vị cố định của 0..(cols*rows-1)
  lessonIds: string[]                        // các bài của chuỗi, theo thứ tự học
  intro: string[]                            // 3–5 câu tiếng Anh A1 giới thiệu bức tranh
}
```
- Kiểm tra ở runtime trong `parseCatalog`: `grid.cols*grid.rows === lessonIds.length`, `revealOrder` là hoán vị hợp lệ, `intro` không rỗng. Chuỗi sai bị bỏ qua kèm cảnh báo.
- Chuỗi đầu tiên có `id: "cats"`, 10 bài (`grid` 5×2), `lessonIds` theo thứ tự:
  `voa-l01-welcome`, `voa-l05-where-are-you`, `voa-l07-what-are-you-doing`, `voa-l09-is-it-cold`, `voa-l11-neighborhood`, `voa-l12-family`, `voa-l16-where-from`, `voa-l17-free-on-friday`, `voa-l22-next-summer`, `voa-l35-make-dinner`.
- Số câu dự kiến của 10 bài: 6, 8, 10, 13, 15, 18, 21, 23, 26, 29 (mỗi bài hơn bài trước 2–3 câu). Đây là mục tiêu khi người dùng cắt nội dung, không phải ràng buộc của code.
- **Ảnh tạm để phát triển**: tạo `public/series/cats/placeholder.svg` (khoảng 1600×1000, nền gradient đơn giản, chữ "Ảnh tạm – thay bằng ảnh Met Open Access"), credit `license: "placeholder"`, `intro` có 3 câu mẫu ghi rõ là nội dung tạm. Khi người dùng có ảnh thật, chỉ cần thay `image` và `intro` trong JSON.

### C2. Tiến độ (`src/lib/progress.ts`)
- Mở rộng `Progress` với `lessonsDone: Record<string, { best: number; at: number }>`.
- `loadProgress` phải đọc được dữ liệu cũ không có trường này (mặc định `{}`) và kiểm tra kiểu từng phần tử.
- Hằng số `PASS_SCORE = 60`.
- Hàm thuần `recordLessonDone(p, lessonId, avgScore, now?)` trả về `{ progress, firstPass: boolean }`:
  - `avgScore >= PASS_SCORE`: lưu/cập nhật `best` (giữ điểm cao hơn); `firstPass = true` chỉ khi trước đó chưa có mục cho `lessonId`.
  - `avgScore < PASS_SCORE`: không ghi gì, `firstPass = false`.
- Hàm thuần `revealedTiles(series, progress): number[]`: các chỉ số ô đã mở = `revealOrder.slice(0, soBàiĐãQua)`, trong đó số bài đã qua đếm các `lessonIds` có trong `lessonsDone`. Luyện lại bài cũ không mở thêm ô.
- Test: dữ liệu cũ, ngưỡng đúng 60 / 59, bài đã qua rồi luyện lại, `revealedTiles` với 0, 3, 10 bài.

### C3. Giao diện
- `PictureCard` (trên Home, một thẻ cho mỗi chuỗi): ảnh nằm dưới, lưới ô phủ lên (CSS grid, tỉ lệ khung theo `width/height`), ô đã mở trong suốt, ô chưa mở che bằng màu của giao diện; chú thích "Đã mở 3/10 mảnh". Ảnh đặt `role="img"` với `aria-label` từ `alt`; các ô che có `aria-hidden`.
- Khi mở đủ ô: hiện ảnh đầy đủ, danh sách `intro`, và dòng nguồn ảnh (tên tác phẩm, tác giả, năm, link Met, giấy phép).
- Màn hình `Result` khi `firstPass` và bài thuộc một chuỗi: hiện ảnh với ô vừa mở làm nổi (hiệu ứng mờ dần ~600 ms) và dòng "Bạn vừa mở mảnh thứ 4/10". Tắt hiệu ứng khi `prefers-reduced-motion`. Nếu điểm < `PASS_SCORE`: dòng "Cần điểm trung bình từ 60 để mở mảnh tranh" và nút "Luyện lại".
- Bài chưa có trong catalog (người dùng chưa thêm): trong thẻ chuỗi ghi "Chưa có bài", không báo lỗi.

### C4. Bài thưởng
- Khi chuỗi đã mở đủ ô, thẻ chuỗi hiện nút "Bài thưởng: đọc về bức tranh".
- Bài thưởng là bài `tts` được dựng từ `series.intro` (id `bonus:<seriesId>`, `langId: 'en'`). Hoàn thành thì ghi vào `lessonsDone` với khóa `bonus:<seriesId>` (không ảnh hưởng số ô đã mở) và nhận XP như bình thường.
- Hàm dựng bài thưởng là hàm thuần trong `src/lib/series.ts`, có test.

### C5. Test cho Task C
- `parseCatalog` với chuỗi hợp lệ / sai lưới / `revealOrder` không phải hoán vị.
- `recordLessonDone`, `revealedTiles`, dựng bài thưởng.

---

## Việc người dùng tự làm (Claude Code không làm thay)
1. **Chọn ảnh mèo** ở https://www.metmuseum.org: tìm trong bộ sưu tập "Cats", bật lọc Open Access (biểu tượng CC0), chọn tranh ngang, mèo rõ nét, độ rộng >= 1600 px. Ghi lại objectId, tên tác phẩm, tác giả, năm và link trang. Thu nhỏ: `ffmpeg -i goc.jpg -vf scale=1600:-2 -q:v 80 cats.webp`, đặt vào `public/series/cats/`.
2. **Viết `intro`**: 3–5 câu tiếng Anh A1 (mỗi câu <= 10 từ, thì hiện tại đơn), chỉ dùng thông tin trên trang của Met (tên, tác giả, năm, chất liệu). Nhờ Claude trong cuộc trò chuyện soạn giúp rồi kiểm tra lại.
3. **Cắt audio VOA** cho 10 bài: `ffmpeg -ss <bắt đầu> -to <kết thúc> -i bai.mp4 -vn -ac 1 -b:a 48k l01.mp3`, đặt vào `public/lessons/voa/`. Đối chiếu transcript trên trang VOA, nạp vào màn hình "Tải file" → "Xem lại các câu" → "Xuất bài (JSON)" rồi thêm vào `public/lessons/index.json`.
4. Chỉ lấy chữ và audio VOA, không lấy ảnh của họ. Giữ dòng ghi nguồn "Voice of America · public domain".