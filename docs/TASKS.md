# FAM — Yêu cầu công việc cho Claude Code

Dự án: Vite + React + TypeScript (xem `CLAUDE.md` và `README.md`). Đọc toàn bộ file này trước, rồi làm **từng Task theo thứ tự A → B → C → E**. Mỗi Task là một lần làm việc riêng và một commit riêng. **Task E thay thế thiết kế chuỗi tranh (series) của Task C.**

## Quy tắc chung
- Giữ nguyên hành vi và giao diện hiện có, trừ phần được nêu trong Task.
- Giao diện tiếng Việt, mã nguồn và tên biến tiếng Anh. Có chế độ sáng/tối (dùng token màu trong `src/index.css`), dùng được trên điện thoại.
- Logic thuần để trong `src/lib/` và có test Vitest (import tường minh `describe, it, expect` từ 'vitest').
- **Không bịa nội dung**: không tự tạo file audio, không tự bịa tên tác phẩm, tác giả, URL, mã đối tượng (objectId) hay số câu. Phần nào cần nội dung thật do người dùng cung cấp thì dùng dữ liệu giả cho test và để trống/`[]` trong file dữ liệu thật.
- Cuối mỗi Task: chạy `npm run build`, `npm run lint`, `npm test`; báo kết quả, danh sách file đã đổi và gợi ý commit message (không tự commit/push).
- Không thêm thư viện mới nếu không thật cần; nếu thêm thì nói rõ lý do.

## Quyết định đã chốt
1. Ngưỡng để một lần hoàn thành bài được tính là "qua bài": điểm trung bình **>= 60** (hằng số `PASS_SCORE = 60`).
2. Nguồn audio A1: VOA "Let's Learn English – Level 1" (public domain). Ghi nguồn trong app. ELLLO chưa gắn sẵn (chưa rõ điều khoản dùng lại), chỉ dùng qua chế độ tải file của người dùng.
3. **Bộ sưu tập tranh ngẫu nhiên (Task E)**: mỗi tranh là một tác phẩm public domain của Met (Open Access), lưới cố định 3×2 (6 mảnh), thứ tự mở ngẫu nhiên. **Mỗi lần qua bài (kể cả luyện lại) mở thêm `TILES_PER_PASS` mảnh: chế độ thật là 1 (cần 6 bài), chế độ thử nghiệm hiện tại là 6 (một bài mở cả bức tranh).** Mở đủ 6 mảnh thì hiện mô tả tiếng Việt, nguồn ảnh và bài thưởng; lần qua bài tiếp theo bắt đầu một tranh mới. Quyết định này thay thế các quyết định cũ về chuỗi tranh "thiên nhiên" 10 bài (lưới 5×2, mở theo `lessonIds`).

---

## Task A — Sửa tách câu với chữ viết tắt
File: `src/lib/segment.ts` (`splitSentences`), test trong `src/lib/segment.test.ts`.

Lỗi hiện tại: "I live in Washington, D.C. and I like it." bị tách thành "…Washington, D." và "C." và "and I like it.".

Yêu cầu:
- Không tách câu sau các chữ viết tắt chắc chắn không kết thúc câu: Mr., Mrs., Ms., Dr., St., Jr., Sr., vs., etc. (chỉ khi theo sau là chữ thường), e.g., i.e.
- Với viết tắt nhiều chữ cái như U.S., U.K., D.C., a.m., p.m.: dấu chấm bên trong luôn là dấu chấm của từ. Dấu chấm cuối chỉ kết thúc câu khi sau đó là khoảng trắng + chữ in hoa hoặc hết văn bản.
- Số thập phân, giá tiền, giờ (5.5, $3.50, 9.30) không bị tách.
- Chữ viết tắt trong `[...]`, ngoặc kép, hoặc sau dấu `?`/`!` vẫn hoạt động đúng.
- Triển khai gợi ý: thay các dấu chấm "được bảo vệ" bằng ký tự giữ chỗ trước khi tách, rồi khôi phục. Giữ nguyên quy tắc tách hiện có (câu > 16 từ tách tại `, ; :` thành đoạn >= 6 từ).

Test tối thiểu:
- "I live in Washington, D.C. and I like it very much." → 1 câu.
- "I live in Washington, D.C. Anna lives there too." → 2 câu.
- "Mr. Smith and Dr. Lee arrive at 9 a.m. today." → 1 câu.
- "It is 5 p.m. We go home." → 2 câu.
- "The ticket costs 5.5 dollars." → 1 câu.
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
  /** Thứ tự trong cùng trình độ và chủ đề (bắt đầu từ 1). Từ Task K không còn `seriesId`. */
  order?: number
}
// Lesson = SampleLesson | MediaLesson | StaticLesson
```
`order` của bài học chỉ dùng để sắp xếp bài trong cùng trình độ và chủ đề trên Home (`seriesId` đã bỏ ở Task K); chúng không liên quan đến tranh (xem Task E).

### B2. Danh mục bài (`public/lessons/index.json`)
```json
{ "version": 1, "lessons": [], "pictures": [] }
```
- `lessons`: mảng `StaticLesson` (đã có `kind: "static"`).
- `pictures`: bộ sưu tập tranh của Task E. (Khóa `series` của Task C đã bỏ; nếu còn trong file cũ thì bị bỏ qua, không báo lỗi.)
- Người dùng thêm bài bằng nút xuất JSON; thêm tranh bằng công cụ `npm run ingest:pictures` (Task E).
- `src/lib/catalog.ts`: `loadCatalog(): Promise<Catalog>` đọc `import.meta.env.BASE_URL + 'lessons/index.json'`, kiểm tra kiểu ở runtime (hàm `parseCatalog(raw: unknown)` thuần, có test). Bài hoặc tranh sai định dạng bị bỏ qua và ghi vào danh sách cảnh báo; lỗi mạng/JSON hỏng trả về catalog rỗng kèm thông báo tiếng Việt, không làm app lỗi.

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
- (Đã thay bằng Task K: nhóm theo trình độ/chủ đề, không còn dòng nguồn.) Nhóm "Bài có sẵn" nằm trên cùng (dưới "Chọn nguồn bài" nếu đang hiện): một danh sách phẳng, không có tiêu đề nhóm, sắp theo `seriesId` rồi `order`; mỗi bài có nhãn `level`, chủ đề, số câu và dòng nguồn ("Nguồn: Voice of America · public domain") lấy từ `source`. Bài đã qua (có điểm trong `lessonsDone`) có nền xanh nhẹ (`--ok-bg`) và nhãn "Đã qua · điểm".
- Nhóm "Bài của bạn": bài `media` như hiện nay (Chỉnh sửa/Xóa).
- Không còn bài mẫu TTS trên Home (đã bỏ).
- Khi catalog rỗng hoặc lỗi: dòng thông báo trung tính, không chặn các phần khác.

### B6. Xuất JSON từ màn hình Review (`Review.tsx`)
- (Đã thay bằng khối "Phân loại" ở Task K.) Thêm khối thu gọn "Thông tin xuất bản (tùy chọn)": `level` (A1/A2), `topic`, `source.name`, `source.url`, `source.license`, `seriesId`, `order`, `audioUrl`.
- Nút "Xuất bài (JSON)": tạo `StaticLesson` từ trạng thái hiện tại (id lấy từ `audioUrl` hoặc ô nhập, `kind: 'static'`, `sentences` đang chỉnh) và tải về bằng Blob + thẻ `<a download>`. Không đưa file audio vào JSON.
- Hàm dựng JSON là hàm thuần trong `src/lib/export.ts` (`buildStaticLesson(...)`), có test, kiểm tra đủ trường bắt buộc và trả lỗi tiếng Việt nếu thiếu.
- Quy trình nội dung: nạp audio → căn câu → xuất JSON → người dùng đặt audio vào `public/lessons/...` và dán phần tử vào `lessons` của `index.json`.

### B7. Test
- `parseCatalog` (hợp lệ, thiếu trường, sai kiểu, bài trùng id).
- `buildStaticLesson`.
- Logic nhóm/sắp xếp bài trên Home (tách thành hàm thuần).

---

## Task C — Chuỗi tranh mở dần (ĐÃ BỊ THAY THẾ bởi Task E)

Thiết kế cũ: mỗi chuỗi (`series`) gắn với một danh sách `lessonIds`, lưới `cols × rows` bằng số bài, `revealOrder` cố định trong JSON, mở mảnh khi qua đúng các bài của chuỗi. **Không còn dùng.** Đã gỡ khỏi code: kiểu `Series`, `src/lib/series.ts`, khóa `series` trong `index.json`, `lessonIds`, `revealOrder`, `grid` theo từng tranh.

Những gì được giữ lại trong Task E: `PASS_SCORE = 60`, lưới ô che phủ lên ảnh, hiệu ứng mờ dần ~600 ms và `prefers-reduced-motion`, bài thưởng đọc chính tả các câu giới thiệu bằng TTS, và bức tranh Hokusai (nay là `met-39799`). Chi tiết thiết kế cũ nằm trong lịch sử git.

---

## Task E — Bộ sưu tập tranh ngẫu nhiên

### E1. Dữ liệu (`public/pictures/index.json` → `pictures`; từ Task I, trước đó nằm trong `public/lessons/index.json`)
```ts
export interface PictureCredit { text: string; url: string }   // text tiếng Việt, hiển thị nguyên văn
export interface Picture {
  id: string                  // "met-<objectId>"
  title: string
  byline?: string             // "tác giả · năm" (vd. "Pieter Bruegel the Elder · 1565"), hiện mờ dưới tên tranh; tùy chọn
  image: { src: string; width: number; height: number; alt: string; credit: PictureCredit }
  description: string[]       // tiếng Việt, 3–5 câu, hiện cho người dùng khi tranh hoàn chỉnh; KHÔNG nêu kích thước tác phẩm
  commentary: PictureCommentary // bắt buộc; hiện sau description khi tranh hoàn chỉnh
  intro: string[]             // tiếng Anh A1, 3–5 câu, <= 10 từ/câu, thì hiện tại đơn; dùng cho bài thưởng
}
export interface PictureCommentary {
  story: string               // chuyện gì đang diễn ra trong cảnh
  view: string                // họa sĩ thể hiện thế nào / nên chú ý gì
  takeaway: string            // một câu rút ra; lưu KHÔNG kèm nhãn "Rút ra" (giao diện tự thêm nhãn)
}
export interface PictureProgress { id: string; opened: number; order: number[] }
```
- `image.src` là đường dẫn tương đối `pictures/met-<objectId>.webp` (file nằm trong `public/pictures/`), `alt` tiếng Việt.
- **Lưới là hằng số**, không lưu theo từng tranh: `PICTURE_COLS = 3`, `PICTURE_ROWS = 2`, `PICTURE_TILES = 6` (trong `src/lib/pictures.ts`). Không có `lessonIds`, `revealOrder`, `grid`, `level` trong tranh.
- `parseCatalog` kiểm tra cấu trúc (id, title, image đủ trường, `description` và `intro` là danh sách chuỗi không rỗng, id không trùng) và kiểm tra **nghiêm ngặt** `commentary`: phải là đối tượng có `story`, `view`, `takeaway` đều là chuỗi không rỗng (lỗi tiếng Việt nêu đúng trường, vd. "commentary.story phải là chuỗi không rỗng."); `byline` nếu có thì phải không rỗng. Tranh sai bị bỏ qua kèm cảnh báo, không làm hỏng bài học.
- Quy tắc nội dung (hàm thuần `contentIssues` trong `src/lib/pictures.ts`, dùng ở công cụ ingest và test dữ liệu thật, **không** dùng ở parser để một câu dài không làm ẩn cả bức tranh): `description` và `intro` mỗi loại 3–5 câu; mỗi câu `intro` tối đa 10 từ; **không câu `description` nào chứa "Kích thước"** (kích thước tác phẩm không thuộc phần mô tả); `commentary` đủ `story`, `view`, `takeaway`. Nên tránh chữ có dấu trong `intro` (vd. "Cézanne"), vì trình chấm tiếng Anh chỉ giữ ký tự `a-z`, người học gõ "Cezanne" sẽ bị chấm sai.
- Không dùng và không migrate dữ liệu cũ: khóa `series` bị bỏ qua.
- Bức tranh có sẵn: `met-39799` (Hokusai, *Under the Wave off Kanagawa*), giữ nguyên ảnh, credit và `intro`; `description` gồm 4 câu tiếng Việt đã duyệt.

### E2. Tiến độ (`src/lib/progress.ts`)
```ts
interface Progress {
  xp; streak; last; sentences
  lessonsDone: Record<string, { best: number; at: number }>   // chỉ để hiện "Đã qua · 90"
  picture: PictureProgress | null     // tranh đang mở
  picturesDone: string[]              // tranh đã hoàn thành trong vòng hiện tại (cũ → mới)
}
```
- `loadProgress` kiểm tra các trường mới: `picture` phải có `id` không rỗng, `opened` nguyên 0..6, `order` là hoán vị của 0..5, nếu không thì `null`; `picturesDone` giữ chuỗi không rỗng, bỏ trùng. Dữ liệu cũ (không có trường mới, hoặc có `passes`/trường thừa) vẫn đọc được; trường thừa bị bỏ.
- Mọi hàm ngẫu nhiên nhận tham số `random: Random = Math.random` (`() => number` trong [0, 1)) để test xác định được. `shuffle(n, random)` là Fisher–Yates trong `pictures.ts`.
- `pickNextPicture(pictures, picturesDone, random)`: chọn ngẫu nhiên một tranh **chưa** có trong `picturesDone`. Nếu đã hoàn thành hết thì bắt đầu vòng mới: chọn trong các tranh khác tranh hoàn thành gần nhất (`picturesDone` còn lại đúng tranh đó); chỉ có một tranh thì lặp lại chính nó. Id đã xong nhưng không còn trong catalog bị bỏ qua.
- `ensureActivePicture(p, pictures, random)`: nếu chưa có tranh đang mở (hoặc tranh đó không còn trong catalog) thì chọn tranh mới, `opened = 0`, `order = shuffle(6)`. Tranh đang mở, kể cả đã hoàn chỉnh, được giữ nguyên. Gọi khi catalog tải xong để Home luôn có tranh để hiện.
- `recordPicturePass(p, pictures, avgScore, random, tilesPerPass = TILES_PER_PASS)` → `{ progress, outcome }`. `TILES_PER_PASS` là hằng số trong `src/lib/pictures.ts` (hiện **6 = chế độ thử nghiệm**; đặt về **1** để chuyển sang chế độ thật, 6 bài mỗi tranh; không cần sửa gì khác):
  - `avgScore < PASS_SCORE`: không đổi, `outcome = { kind: 'failed' }`.
  - Ngược lại: nếu chưa có tranh, tranh đã hoàn chỉnh hoặc không còn trong catalog thì bắt đầu tranh mới trước (`started = true` khi trước đó đã có tranh); sau đó `opened + 1` (kể cả luyện lại bài cũ). Khi `opened` chạm 6 thì tranh hoàn chỉnh và thêm vào `picturesDone` (không trùng). `outcome = { kind: 'opened', picture, revealed, fresh: order[opened-1], count, complete, started }`.
  - Mỗi lần qua bài mở `tilesPerPass` mảnh kế tiếp (tối thiểu 1, không vượt quá 6); `fresh` là danh sách các ô vừa mở. Màn Kết quả ghi "Bạn vừa mở k mảnh (n/6)" khi mở nhiều ô cùng lúc, "Bạn vừa mở mảnh thứ n/6" khi mở một ô.
  - Không có tranh nào trong catalog: `outcome = null`.
- `advancePicture(p, pictures, random)`: gọi khi bắt đầu luyện một bài (trừ bài thưởng, cả khi bấm "Luyện lại" ở màn Kết quả). Nếu tranh hiện tại đã hoàn chỉnh thì chọn ngay một tranh mới còn che (`opened = 0`), để màn luyện tập luôn hiện tranh còn trắng chứ không hiện lại tranh vừa xong. Tranh hoàn chỉnh chỉ hiện trên Home (mô tả, bài thưởng) cho đến lúc đó. Trạng thái khác thì giữ nguyên.
- Mọi bài hoàn thành đều tính (bài có sẵn, bài của người dùng, bài mẫu) **trừ bài thưởng** (`bonus:<pictureId>`), vì bài thưởng chỉ dành cho tranh đã hoàn chỉnh. Việc ghi điểm cao nhất của bài vào `lessonsDone` do `recordLessonDone` đảm nhiệm, tách khỏi việc mở mảnh.

### E3. Giao diện
- **Home**: mục "Bức tranh của bạn" hiện tranh đang mở (`PictureCard`): ảnh nằm dưới, 6 ô che phủ lên theo `opened`/`order` (ô đã mở trong suốt), chú thích "Đã mở x/6 mảnh". Khi chưa hoàn chỉnh, tiêu đề là "Bức tranh bí ẩn" kèm dòng hướng dẫn mở mảnh. Ảnh đặt `role="img"` với `aria-label` từ `alt`; ô che có `aria-hidden`.
- **Khi hoàn chỉnh** (Home và Album; không hiện khi còn đang mở dở), theo thứ tự: tiêu đề tác phẩm, dòng `byline` ("tác giả · năm", mờ), ảnh đầy đủ, `description` (tiếng Việt), rồi `commentary`: hai đoạn `story` và `view`, và `takeaway` trong khối nổi bật (nhãn nhỏ mờ "Rút ra" phía trên, thanh trái 3px màu `--accent`, chữ thường); sau cùng là dòng "Nguồn ảnh: <credit.text>" cùng link tới bảo tàng (chỉ khi là http/https) và nút "Bài thưởng: chép chính tả về bức tranh". Chữ dùng dòng cao ~1.6, cột chữ tối đa 62 ký tự. Lần qua bài tiếp theo bắt đầu tranh mới. Màn Kết quả khi vừa mở hết tranh không hiện phần chữ này (hướng người dùng về trang chính).
- **Result** khi qua bài: "Bạn vừa mở mảnh thứ k/6" và ảnh với ô vừa mở được làm nổi (viền nhấn và hiệu ứng mờ dần ~600 ms; tắt hiệu ứng khi `prefers-reduced-motion`, viền vẫn giữ). Nếu vừa bắt đầu tranh mới: "Một bức tranh mới bắt đầu!". Khi vừa hoàn chỉnh: nhắc về trang chính để xem giới thiệu và làm bài thưởng. Điểm < `PASS_SCORE`: "Cần điểm trung bình từ 60 để mở mảnh tranh" và nút "Luyện lại".
- **Bài thưởng**: bài `tts` dựng từ `picture.intro` (hàm thuần `buildBonusLesson` trong `pictures.ts`; id `bonus:<pictureId>`, `langId: 'en'`), chép chính tả các câu tiếng Anh. Hoàn thành thì ghi điểm vào `lessonsDone` với khóa `bonus:<pictureId>`, nhận XP như thường, không mở mảnh.
- Toàn bộ chữ trên giao diện là tiếng Việt, trừ `intro`.

### E3b. Album
- `Progress.album: string[]` là danh sách mọi tranh đã hoàn thành (cũ → mới), **không bao giờ bị đặt lại** (khác `picturesDone`, bị đặt lại mỗi vòng). Một tranh được thêm vào khi mở đủ 6 mảnh, không trùng. `loadProgress` với dữ liệu cũ chưa có `album` (hoặc `album` hỏng) thì suy ra từ `picturesDone` cộng tranh hiện tại nếu đã hoàn chỉnh.
- Hàm thuần `albumPictures(progress, pictures)` trả về các tranh trong album còn tồn tại trong catalog, theo thứ tự đã sưu tập.
- **Home**: mục "Album" (hiện khi catalog có tranh) với dòng "Đã sưu tập n/N tranh" và tối đa 3 ảnh thu nhỏ; bấm vào để mở màn Album.
- **Màn Album** (`Album.tsx`): lưới 2 cột các tranh đã sưu tập (ảnh đầy đủ, không che, kèm tên); chưa có tranh thì hiện câu hướng dẫn. Bấm một tranh để xem chi tiết (dùng `PictureCard` với `inAlbum`): tên, ảnh đầy đủ, mô tả tiếng Việt, nguồn ảnh và nút "Bài thưởng". Bài thưởng bắt đầu từ album hiện đúng tranh đó (đã mở đủ 6 mảnh), không đổi tranh đang mở và không mở mảnh.
- **Chuyển giữa các tranh trong màn chi tiết**: nút ‹ › (44px) kèm số thứ tự "2 / 3", phím ← →, và vuốt ngang trên điện thoại. Không quay vòng: nút bị vô hiệu ở tranh đầu/cuối. Hàm thuần `stepIndex` và `swipeDirection` trong `src/lib/album.ts` (vuốt tối thiểu 60px và phải ngang rõ rệt hơn dọc, để cuộn trang không đổi tranh). Màn chi tiết đặt `touch-action: pan-y` để vuốt ngang không kích hoạt cử chỉ "vuốt để quay lại" của trình duyệt.
- Khi bắt đầu một bài, tranh hoàn chỉnh trên Home được thay bằng tranh mới (`advancePicture`), nhưng tranh cũ vẫn nằm trong album.

### E4. Công cụ nạp tranh (`npm run ingest:pictures`)
Mã: `scripts/ingest-pictures.ts` (chạy bằng `node`, không thêm thư viện); phần thuần nằm ở `src/lib/ingest.ts` và có test. Thư mục `inbox/` đã được gitignore.

Bước 1, chuyển ảnh (`npm run ingest:pictures`):
- Đầu vào: `inbox/images/<objectId>.(jpg|jpeg|png)`, trong đó `<objectId>` là số ở cuối link Met.
- Với mỗi file, gọi `https://collectionapi.metmuseum.org/public/collection/v1/objects/<objectId>` (không cần API key). **Nếu `isPublicDomain` không phải đúng `true` thì bỏ qua và báo bằng tiếng Việt; không bao giờ dùng ảnh đó** (kiểm tra xong mới chuyển ảnh).
- Thu nhỏ về rộng 1600 px, định dạng webp bằng ffmpeg vào `public/pictures/met-<objectId>.webp`; đọc `width`/`height` bằng ffprobe. ffmpeg/ffprobe lấy từ biến `FFMPEG_PATH`/`FFPROBE_PATH`, rồi PATH, rồi thư mục cài WinGet (`Gyan.FFmpeg`).
- Ghi `inbox/images/<objectId>.draft.json` chỉ gồm các trường API: `title`, `artistDisplayName`, `objectDate`, `medium`, `dimensions`, `department`, `culture`, `period`, `creditLine`, `objectURL`.

Bước 2, viết nội dung (làm trong cuộc trò chuyện với Claude, không tự động):
- Claude đọc từng draft và viết `inbox/images/<objectId>.content.json` gồm `description` (tiếng Việt, 3–5 câu, không nêu kích thước), `commentary` (bắt buộc), `intro` (tiếng Anh A1, 3–5 câu, <= 10 từ, thì hiện tại đơn) và `alt` (tiếng Việt). Định dạng:
  ```json
  {
    "alt": "Bức tranh sơn dầu trên vải tên …",
    "description": ["Câu 1.", "Câu 2.", "Câu 3."],
    "commentary": {
      "story": "Chuyện gì đang diễn ra trong cảnh.",
      "view": "Họa sĩ thể hiện thế nào, nên chú ý gì.",
      "takeaway": "Một câu rút ra (không ghi nhãn \"Rút ra\")."
    },
    "intro": ["This picture is called …", "The artist is …", "It is from …"]
  }
  ```
  `byline` ("tác giả · năm") không cần viết tay: công cụ tự tạo từ `artistDisplayName` và `objectDate` của draft. `commentary` mô tả điều nhìn thấy trong tranh và ý nghĩa của nó; không thêm sự kiện lịch sử hay tiểu sử ngoài draft. Thiếu hoặc rỗng `commentary` thì bước ghép từ chối và không ghi `index.json`.
- **Chỉ dùng dữ kiện có trong draft; không bịa, không thêm kiến thức nền.** `alt` chỉ mô tả cảnh khi rõ từ tên tác phẩm/chất liệu; nếu không rõ thì bỏ trống để dùng `alt` trung tính "Tác phẩm <title>".

Bước 3, ghép (`npm run ingest:pictures -- --merge`):
- Với mỗi draft có file nội dung: dựng `Picture` (id `met-<objectId>`, `src` `pictures/met-<objectId>.webp`, kích thước đo bằng ffprobe, `credit.url = objectURL`), kiểm tra bằng `parsePicturesFile` và `contentIssues`, rồi ghép vào mảng `pictures` của `public/pictures/index.json` (cùng id thì thay thế).
- Credit tiếng Việt: `<artistDisplayName>, "<title>", <objectDate>. The Metropolitan Museum of Art, <creditLine>. Ảnh thuộc phạm vi công cộng (Met Open Access).` (bỏ phần tác giả khi rỗng; hàm thuần `buildCreditText`).
- **Chỉ ghi `index.json` khi toàn bộ danh mục hợp lệ**; nếu có lỗi thì in lỗi và giữ nguyên file. Ghi qua file tạm rồi đổi tên. File được ghi lại với thụt lề 2 dấu cách.

### E5. Test
- `pictures.ts`: `shuffle` (hoán vị, xác định theo nguồn ngẫu nhiên), `isPermutation`, `revealedTiles`, bài thưởng, `contentIssues` (3–5 câu, 10 từ).
- `progress.ts`: `loadProgress` với dữ liệu cũ/hợp lệ/sai; `recordLessonDone`; `pickNextPicture` (chưa xong, vòng mới tránh tranh vừa xong, một tranh duy nhất, id không còn trong catalog); `ensureActivePicture`; `recordPicturePass` (dưới/đúng ngưỡng 60, mở từng mảnh theo `order`, hoàn chỉnh ở mảnh 6, tranh mới sau khi hoàn chỉnh, không trùng trong `picturesDone`, không sửa đầu vào).
- `catalog.ts`: tranh hợp lệ/thiếu trường/sai kiểu/trùng id, khóa `series` cũ bị bỏ qua.
- `ingest.ts`: tên file, `isPublicDomain` (chỉ `true`), `pickDraftFields` (chỉ 10 trường), `buildCreditText` (có/không tác giả), `parseContent`, `buildPicture`, `mergePicture`, `mergeIntoCatalog` (không ghi khi sai).
- Dữ liệu thật (`shippedCatalog.test.ts`): cả hai file `index.json` không có cảnh báo, mọi tranh có file ảnh trong `public/pictures/`, đúng quy tắc nội dung, credit là credit Met bằng tiếng Việt.

---

## Việc người dùng tự làm (Claude Code không làm thay)
1. **Chọn tranh** ở https://www.metmuseum.org: bật lọc Open Access, tải ảnh về, đổi tên thành `<objectId>.jpg` (số cuối link trang tác phẩm) và đặt vào `inbox/images/`. Chạy `npm run ingest:pictures`; nhờ Claude viết file nội dung từ các file `.draft.json`; đọc lại cho đúng rồi chạy `npm run ingest:pictures -- --merge`.
2. **Nạp bài VOA bằng Python** (xem mục "Nạp bài bằng Python" trong README): cắt audio nếu cần (`ffmpeg -ss <bắt đầu> -to <kết thúc> -i bai.mp4 -vn l01.mp3`), đặt `<id>.mp3` và `<id>.txt` (transcript, có thể kèm phần đầu title/url/topic/level/order) vào `inbox/lessons/`, chạy `python process_lesson.py --id <id> --dry-run` để xem bảng câu rồi chạy không có `--dry-run`. Đối chiếu transcript với trang VOA, nghe thử từng câu và sửa mốc thời gian trong `public/lessons/index.json` nếu lệch. (Cách cũ vẫn dùng được: nạp ở màn hình "Tải file" → "Xem lại các câu" → "Xuất bài (JSON)" rồi dán vào mảng `lessons` của `public/lessons/index.json`; hiện mục "Tải file" ẩn trừ khi mở bằng `?admin`.)
3. Chỉ lấy chữ và audio VOA, không lấy ảnh của họ. Giữ dòng ghi nguồn "Voice of America · public domain".

---

## Task H — Nạp bài bằng Python (`process_lesson.py`)

Script độc lập ở thư mục gốc, Python 3.10+ chỉ dùng thư viện chuẩn, gọi ffmpeg/ffprobe qua `subprocess`; không đụng vào mã TypeScript của app.

- **Đầu vào**: `inbox/lessons/<id>.(mp3|m4a|wav)` + `<id>.txt` cùng tên; `<id>` (chỉ `a-z`, `0-9`, `-`) là mã bài. Phần đầu tùy chọn `title`, `url`, `topic`, `level` (thuộc `LEVELS` trong `src/lib/types.ts`), `order`, kết thúc bằng dòng `---`. Mặc định: title = id, level A1, topic "Daily English", nguồn "Voice of America" / "public domain", url trang chung kèm CẢNH BÁO.
- **Làm sạch transcript**: nháy cong thành nháy thẳng, bỏ nháy kép, "..." và "…" thành khoảng trắng, bỏ nhãn người nói ở đầu dòng (tối đa 2 từ), nối dòng bằng khoảng trắng; dòng không kết thúc bằng `. ! ?` được thêm dấu chấm (script liệt kê các dòng đó). Dòng kết thúc bằng `, ; :` coi như câu còn tiếp, trừ dòng cuối (đổi thành dấu chấm).
- **Tách câu, im lặng, căn thời điểm**: bản port trung thực của `splitSentences`, `findSilences`, `alignSentences` trong `src/lib/segment.ts` (cùng hằng số; `round2` làm tròn nửa lên như `Math.round`). Audio được chuyển bằng `ffmpeg -ac 1 -b:a 48k -map_metadata -1` vào `public/lessons/voa/<id>.mp3`; độ dài đo bằng ffprobe trên file đã chuyển; quãng im lặng tìm trên bản giải mã mono 16 kHz.
- **Bài tạo ra** đúng lược đồ `parseStaticLesson` (id, kind, title, langId, createdAt, audioUrl, duration, sentences với id `<id>-<n>`, level, topic, source, và `order` nếu có), được kiểm tra trong Python trước khi ghi.
- **Ghi `index.json` an toàn**: giữ nguyên mọi thứ khác (kể cả các khóa lạ), chỉ thêm bài (thay bài cùng id khi `--force`, không thì bỏ qua); luôn sao lưu `index.json.bak`; ghi file tạm cùng thư mục rồi `os.replace`; thụt lề 2 dấu cách, UTF-8, có xuống dòng cuối. File gốc được chuyển sang `inbox/lessons/done/`; script không bao giờ xóa file người dùng.
- **Cờ**: `--id`, `--force`, `--dry-run` (không chuyển audio, không ghi gì; đo từ file gốc), `--keep-inbox`. Mã thoát 1 nếu có bài lỗi. Mọi thông báo bằng tiếng Việt; sau mỗi bài in bảng `n, start, end, text` và cảnh báo (câu > 16 từ, câu < 0,6 giây, câu kết thúc bằng dấu phẩy, im lặng đầu/cuối > 2 giây, không tìm thấy quãng im lặng nào).
- **Test**: `tests/test_process_lesson.py` (`npm run test:py`), đối chiếu với code TypeScript qua `tests/segment_vectors.json` (sinh bằng `node tests/gen_segment_vectors.mjs`); phần chạy thật với ffmpeg tự bỏ qua nếu máy không có ffmpeg.

## Task I — Tách danh mục tranh khỏi danh mục bài

Chỉ tổ chức lại dữ liệu và bộ nạp; không đổi giao diện, lối chơi hay nội dung.

- **Hai file danh mục**: `public/lessons/index.json` = `{ "version": 1, "lessons": [...] }` (bài có sẵn; `process_lesson.py` và "Xuất bài (JSON)" ghi/dán vào đây, mảng `lessons`) và `public/pictures/index.json` = `{ "version": 1, "pictures": [...] }` (tranh; `npm run ingest:pictures -- --merge` ghi vào đây, tự tạo file nếu chưa có). `image.src` vẫn tính từ `public/` (`pictures/met-<id>.webp`).
- **Bộ nạp** (`src/lib/catalog.ts`): `parseLessonsFile` và `parsePicturesFile` (cùng cách kiểm tra như trước: version, từng mục, id trùng bị bỏ và có cảnh báo tiếng Việt). Khóa cũ `pictures` hay `series` trong file bài bị bỏ qua. `parseCatalog` đã bỏ. Hằng số `LESSONS_INDEX`, `PICTURES_INDEX`.
- **`loadCatalog()`** tải song song hai file (`Promise.allSettled`), không bao giờ ném lỗi; một file hỏng không làm mất file kia. Lỗi file bài: `lessons = []` và `error` như cũ; lỗi file tranh: `pictures = []` và cảnh báo "Không tải được danh sách tranh.".
- **Test**: `shippedCatalog.test.ts` đọc cả hai file thật (không cảnh báo, ảnh tồn tại, quy tắc nội dung và credit); `catalog.test.ts` có test `loadCatalog` khi một file lỗi và khi file bài còn mảng `pictures` cũ; `test_process_lesson.py` có test file bài không có khóa `pictures`.

## Task K — Nhóm bài theo trình độ/chủ đề; form xuất bài tối giản

- **Nhóm bài trên Home**: trình độ (theo thứ tự `LEVELS`) → chủ đề (theo thứ tự xuất hiện đầu tiên trong danh mục) → bài sắp theo `order` (thiếu `order` thì xuống cuối, bằng nhau giữ thứ tự danh mục). Hàm thuần `groupStaticLessons` trong `src/lib/lessonGroups.ts` trả về `LevelGroup { level, topics: { topic, lessons }[] }`. Tiêu đề trình độ chỉ hiện khi có từ hai trình độ; tiêu đề chủ đề luôn hiện (nhỏ, màu mờ).
- **`seriesId` không còn**: đã bỏ khỏi kiểu `StaticLesson`, bộ nạp, xuất bài và form. Khóa `seriesId` cũ trong file JSON bị bỏ qua, không cảnh báo và không được chép vào bài đã nạp. `order` nay là thứ tự trong cùng trình độ và chủ đề.
- **Mỗi dòng bài trên Home**: tên bài, "N câu" (mờ), bên phải "Đã qua · điểm cao nhất" hoặc dấu `›` khi chưa qua, và nút "Luyện tập". Không còn dòng "Nguồn: … · giấy phép" và không còn thẻ level/topic trên từng dòng. Dữ liệu `source` vẫn nằm trong JSON và kiểu dữ liệu, chỉ không hiển thị.
- **Form xuất bài (admin, màn Review)**: khối "Phân loại" luôn hiện, chỉ có "Trình độ" (bắt buộc), "Chủ đề" (bắt buộc, gợi ý bằng `<datalist>` từ các chủ đề đang có trong danh mục) và nút "Xuất bài (JSON)". Giá trị tự suy ra (hàm thuần có test trong `src/lib/export.ts`): `id` = tên file audio bỏ đuôi, chữ thường a-z, 0-9 và gạch ngang (không ra được thì báo lỗi bảo đổi tên file); `audioUrl` = `lessons/voa/<id>.mp3`; `order` = giữ `order` của bài cùng `id` trong danh mục, nếu không thì (`order` lớn nhất trong cùng trình độ và chủ đề) + 1, hoặc 1; `source` lấy từ hằng số `DEFAULT_LESSON_SOURCE` trong `src/lib/sources.ts` (Voice of America, https://learningenglish.voanews.com/, public domain). Bài mở lại từ "Bài của bạn" không còn nhớ tên file gốc nên lấy `id` từ tên bài.
- Sau khi xuất, app báo tên file JSON, nơi đặt audio (`public/<audioUrl>`) và dán JSON vào mảng `lessons` của `public/lessons/index.json`.

## Task M — Lịch sử các lần luyện (ô vuông màu trên dòng bài)

- **Dữ liệu** (`src/lib/progress.ts`): `Progress.history: Record<lessonId, number[]>` lưu điểm trung bình của mỗi lần hoàn thành bài (đạt hay không, kể cả luyện lại), cũ nhất trước, giữ tối đa `HISTORY_LIMIT` = 30 lần gần nhất. Hàm thuần `recordAttempt`; `finishLesson` gọi nó trước `recordLessonDone`. `lessonsDone` (điểm cao nhất) giữ nguyên. `loadProgress` tương thích ngược: thiếu `history` thì rỗng (không bịa lần luyện cho bài đã làm trước đó), mục sai (không phải mảng, điểm ngoài 0–100 hoặc không phải số) bị bỏ, không bao giờ ném lỗi.
- **Hiển thị** (`Home.tsx`): dưới dòng "N câu" của mỗi bài, một hàng ô vuông 10×10 px (bo 3 px, cách 3 px), cũ bên trái, mới bên phải; tối đa 10 ô gần nhất, nếu nhiều hơn thì có "+N" mờ phía trước (N = số lần − 10). Màu theo điểm lần đó: dưới `PASS_SCORE` (60) = `var(--bad)` mờ, 60–89 = `var(--accent)`, từ 90 = `var(--ok)`. Mỗi ô có `title` và `aria-label` ("Lần 3: 84 điểm"), cả hàng có `aria-label` "N lần luyện". Bài chưa có lịch sử thì không hiện gì.

## Task P — Hosting tĩnh, giới thiệu, ủng hộ, ghi chú nơi lưu tiến độ

- **Hosting**: `vite.config.ts` đặt `base` từ `VITE_BASE` qua `normalizeBase` (`scripts/base.ts`, có test; chỉ nhận `/` hoặc đường dẫn con như `/fam/`, giá trị lạ báo lỗi tiếng Việt). `npm run build:pages` (`scripts/build-pages.ts`, không thêm thư viện, chạy được trên PowerShell) build với `VITE_BASE` mặc định `/fam/`. `.github/workflows/deploy.yml` triển khai lên GitHub Pages khi push `main` (test → build → đăng `dist`), không đặt `VITE_ADMIN_TOKEN`. Hiện app chưa có cơ chế token nên `?admin` vẫn là tiện ích không phải bảo mật.
- **Màn "Giới thiệu và nguồn"** (`About.tsx`) mở từ liên kết ở chân Home: giới thiệu FAM (FAMILY, "farm", phi lợi nhuận), nguồn VOA và Met Open Access (liên kết mở tab mới, `rel="noreferrer noopener"`), email mời hợp tác (`mailto:`) và nút "Ủng hộ dự án".
- **Màn "Ủng hộ FAM"** (`Donate.tsx`) mở từ chân Home hoặc từ màn giới thiệu (nút quay lại về đúng nơi đã mở): lời kêu gọi tiếng Việt và tiếng Anh, ảnh QR `public/images/support-qr.jpg` (tối đa ~280 px; lỗi tải thì hiện "Mã QR sẽ được cập nhật. / The QR code will be added soon."), chủ tài khoản, ngân hàng, nội dung chuyển khoản, nút sao chép (`navigator.clipboard`, im lặng nếu không dùng được) và email. App không thu tiền hay dữ liệu cá nhân; số tài khoản hiển thị công khai theo `ACCOUNT_NUMBER` trong `siteInfo.ts`.
- **Ghi chú nơi lưu tiến độ** (đã bỏ nút trên Home ở Task R, nay là dòng trong thẻ "Sao lưu tiến độ" ở màn Giới thiệu).
- **Chỉnh nội dung**: tất cả văn bản công khai và hằng số (`SITE_NAME`, `OWNER_NAME`, `BANK_NAME`, `TRANSFER_NOTE`, `CONTACT_EMAIL`) nằm trong `src/lib/siteInfo.ts`.

## Task Q — PWA offline và sao lưu tiến độ

- **Service worker** (`public/sw.js`, viết tay, không thêm thư viện): scope lấy từ `self.registration.scope`. Lưu sẵn vỏ app khi cài đặt; điều hướng ưu tiên mạng, mất mạng dùng `index.html`; hai danh mục stale-while-revalidate; `assets/` và `pictures/` ưu tiên cache; audio ưu tiên cache và xử lý Range (206). Cache `fam-static-v2`, `fam-media-v2`, `fam-data-v2`, xóa cache `fam-` cũ khi kích hoạt. `skipWaiting`/`clients.claim` chỉ chạy khi trang gửi `{type:'SKIP_WAITING'}`.
- **Đăng ký** (`src/lib/pwa.ts`, gọi ở `src/main.tsx`): chỉ ở production, URL `${BASE_URL}sw.js`. `UpdateBanner` hiện "Có bản mới / Tải lại" và chỉ tải lại khi người học bấm. `requestPersistence()` đã được `App` gọi lúc khởi động. Manifest thêm `id` và `scope` (vẫn dùng đường dẫn tương đối).
- **Sao lưu**: `src/lib/backup.ts` (`exportProgress`, `parseBackup`, giới hạn 1 MB, từ chối app/kind/version sai) dùng `parseProgress` tách từ `loadProgress` (bỏ khóa `__proto__`); `src/lib/backupFile.ts` lo chia sẻ/tải xuống và đọc file; thẻ "Sao lưu tiến độ" và dòng hướng dẫn cài đặt (Android/iPhone) nằm ở `About.tsx`, chữ ở `siteInfo.ts` (`BACKUP`, `INSTALL_HINT`).
- **Test**: `backup.test.ts` (đi vòng, file sai, dữ liệu rác, `__proto__`) và `sw.test.ts` (nạp `public/sw.js` bằng `?raw`, kiểm `parseRange`/`sliceResponse`). Thử tay: xem mục "PWA và chạy offline" trong README.

## Task R — Đơn giản hóa phần đầu Home

- Bỏ công tắc "Sáng | Tối | Theo hệ thống" và nút "Tiến độ được lưu ở đâu?". Chỉ còn hàng XP/chuỗi ngày và một nút tròn 🌕 (`theme-toggle`) đổi giao diện: đang tối thì sang sáng, đang sáng thì sang tối. Khi chưa chọn, giao diện theo hệ thống; chạm lần đầu thì lưu lựa chọn rõ ràng (`fam.theme`). Logic thuần: `resolveTheme`, `toggledMode` trong `src/lib/theme.ts` (có test).

## Task S — Home có ba tab: Đang học | Bài tập | Albums

- Dưới header là một dòng tab (`role="tablist"`, tab đang chọn có đường kẻ chân bằng màu chính; ← / → đổi tab). Tab nhớ trong phiên (state ở `App`), mặc định "Đang học".
- **Đang học**: bài để học tiếp (bài đầu tiên chưa qua theo thứ tự danh sách, hết bài chưa qua thì bài cuối; hàm thuần `currentLesson` trong `src/lib/homeTabs.ts`) và bức tranh bí ẩn hiện tại.
- **Bài tập**: chỉ danh sách bài (có tiêu đề trình độ nếu từ hai trình độ trở lên; không còn tên chủ đề). Với admin/người đã có bài tải lên vẫn thấy "Chọn nguồn bài" và "Bài của bạn" ở tab này.
- **Albums**: tranh đã sưu tập (lưới, bấm vào xem chi tiết với ‹ ›). Màn hình `album` riêng và thẻ "Album" trên Home đã bỏ.
- Đã bỏ các tiêu đề "Bài có sẵn", "Bức tranh của bạn", "Album" và tên chủ đề.

## Task T — Dọn thư mục public/

- Xóa `public/brand/` (bản sao thừa của `fam-brand/`) và `public/icons.svg` (file mẫu của Vite), đã kiểm tra không nơi nào tham chiếu.
- Icon ứng dụng chuyển vào `public/icons/` bằng `git mv` (favicon.svg, favicon-16/32/48, apple-touch-icon, icon-192/512, icon-maskable-512); `favicon.ico`, `sw.js`, `site.webmanifest` ở lại gốc `public/`. Ảnh QR chuyển sang `public/images/support-qr.jpg` (`QR_IMAGE = 'images/support-qr.jpg'`, vẫn qua `assetUrl`).
- Đã cập nhật `index.html`, `site.webmanifest` (đường dẫn tương đối `icons/...`), danh sách precache trong `sw.js` và tăng `CACHE_VERSION` lên 2 để máy đã cài làm mới cache, cùng README và `fam-brand/`.
