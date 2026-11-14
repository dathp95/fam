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
  seriesId?: string
  /** Thứ tự trong chuỗi (bắt đầu từ 1). */
  order?: number
}
// Lesson = SampleLesson | MediaLesson | StaticLesson
```
`seriesId` và `order` của bài học chỉ còn dùng để nhóm và sắp xếp bài trên Home; chúng không liên quan đến tranh (xem Task E).

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
- Nhóm "Bài có sẵn" nằm trên cùng (dưới "Chọn nguồn bài" nếu đang hiện): một danh sách phẳng, không có tiêu đề nhóm, sắp theo `seriesId` rồi `order`; mỗi bài có nhãn `level`, chủ đề, số câu và dòng nguồn ("Nguồn: Voice of America · public domain") lấy từ `source`. Bài đã qua (có điểm trong `lessonsDone`) có nền xanh nhẹ (`--ok-bg`) và nhãn "Đã qua · điểm".
- Nhóm "Bài của bạn": bài `media` như hiện nay (Chỉnh sửa/Xóa).
- Không còn bài mẫu TTS trên Home (đã bỏ).
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

## Task C — Chuỗi tranh mở dần (ĐÃ BỊ THAY THẾ bởi Task E)

Thiết kế cũ: mỗi chuỗi (`series`) gắn với một danh sách `lessonIds`, lưới `cols × rows` bằng số bài, `revealOrder` cố định trong JSON, mở mảnh khi qua đúng các bài của chuỗi. **Không còn dùng.** Đã gỡ khỏi code: kiểu `Series`, `src/lib/series.ts`, khóa `series` trong `index.json`, `lessonIds`, `revealOrder`, `grid` theo từng tranh.

Những gì được giữ lại trong Task E: `PASS_SCORE = 60`, lưới ô che phủ lên ảnh, hiệu ứng mờ dần ~600 ms và `prefers-reduced-motion`, bài thưởng đọc chính tả các câu giới thiệu bằng TTS, và bức tranh Hokusai (nay là `met-39799`). Chi tiết thiết kế cũ nằm trong lịch sử git.

---

## Task E — Bộ sưu tập tranh ngẫu nhiên

### E1. Dữ liệu (`public/lessons/index.json` → `pictures`)
```ts
export interface PictureCredit { text: string; url: string }   // text tiếng Việt, hiển thị nguyên văn
export interface Picture {
  id: string                  // "met-<objectId>"
  title: string
  image: { src: string; width: number; height: number; alt: string; credit: PictureCredit }
  description: string[]       // tiếng Việt, 3–5 câu, hiện cho người dùng khi tranh hoàn chỉnh
  intro: string[]             // tiếng Anh A1, 3–5 câu, <= 10 từ/câu, thì hiện tại đơn; dùng cho bài thưởng
}
export interface PictureProgress { id: string; opened: number; order: number[] }
```
- `image.src` là đường dẫn tương đối `pictures/met-<objectId>.webp` (file nằm trong `public/pictures/`), `alt` tiếng Việt.
- **Lưới là hằng số**, không lưu theo từng tranh: `PICTURE_COLS = 3`, `PICTURE_ROWS = 2`, `PICTURE_TILES = 6` (trong `src/lib/pictures.ts`). Không có `lessonIds`, `revealOrder`, `grid`, `level` trong tranh.
- `parseCatalog` kiểm tra cấu trúc (id, title, image đủ trường, `description` và `intro` là danh sách chuỗi không rỗng, id không trùng). Tranh sai bị bỏ qua kèm cảnh báo, không làm hỏng bài học.
- Quy tắc nội dung (hàm thuần `contentIssues` trong `src/lib/pictures.ts`, dùng ở công cụ ingest và test dữ liệu thật, **không** dùng ở parser để một câu dài không làm ẩn cả bức tranh): `description` và `intro` mỗi loại 3–5 câu; mỗi câu `intro` tối đa 10 từ. Nên tránh chữ có dấu trong `intro` (vd. "Cézanne"), vì trình chấm tiếng Anh chỉ giữ ký tự `a-z`, người học gõ "Cezanne" sẽ bị chấm sai.
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
- Mọi bài hoàn thành đều tính (bài có sẵn, bài của người dùng, bài mẫu) **trừ bài thưởng** (`bonus:<pictureId>`), vì bài thưởng chỉ dành cho tranh đã hoàn chỉnh. Việc ghi điểm cao nhất của bài vào `lessonsDone` do `recordLessonDone` đảm nhiệm, tách khỏi việc mở mảnh.

### E3. Giao diện
- **Home**: mục "Bức tranh của bạn" hiện tranh đang mở (`PictureCard`): ảnh nằm dưới, 6 ô che phủ lên theo `opened`/`order` (ô đã mở trong suốt), chú thích "Đã mở x/6 mảnh". Khi chưa hoàn chỉnh, tiêu đề là "Bức tranh bí ẩn" kèm dòng hướng dẫn mở mảnh. Ảnh đặt `role="img"` với `aria-label` từ `alt`; ô che có `aria-hidden`.
- **Khi hoàn chỉnh**: hiện tiêu đề tác phẩm, ảnh đầy đủ, `description` (tiếng Việt), dòng "Nguồn ảnh: <credit.text>" cùng link tới bảo tàng (chỉ khi là http/https), nút "Bài thưởng: chép chính tả về bức tranh". Lần qua bài tiếp theo bắt đầu tranh mới.
- **Result** khi qua bài: "Bạn vừa mở mảnh thứ k/6" và ảnh với ô vừa mở được làm nổi (viền nhấn và hiệu ứng mờ dần ~600 ms; tắt hiệu ứng khi `prefers-reduced-motion`, viền vẫn giữ). Nếu vừa bắt đầu tranh mới: "Một bức tranh mới bắt đầu!". Khi vừa hoàn chỉnh: nhắc về trang chính để xem giới thiệu và làm bài thưởng. Điểm < `PASS_SCORE`: "Cần điểm trung bình từ 60 để mở mảnh tranh" và nút "Luyện lại".
- **Bài thưởng**: bài `tts` dựng từ `picture.intro` (hàm thuần `buildBonusLesson` trong `pictures.ts`; id `bonus:<pictureId>`, `langId: 'en'`), chép chính tả các câu tiếng Anh. Hoàn thành thì ghi điểm vào `lessonsDone` với khóa `bonus:<pictureId>`, nhận XP như thường, không mở mảnh.
- Toàn bộ chữ trên giao diện là tiếng Việt, trừ `intro`.

### E4. Công cụ nạp tranh (`npm run ingest:pictures`)
Mã: `scripts/ingest-pictures.ts` (chạy bằng `node`, không thêm thư viện); phần thuần nằm ở `src/lib/ingest.ts` và có test. Thư mục `inbox/` đã được gitignore.

Bước 1, chuyển ảnh (`npm run ingest:pictures`):
- Đầu vào: `inbox/images/<objectId>.(jpg|jpeg|png)`, trong đó `<objectId>` là số ở cuối link Met.
- Với mỗi file, gọi `https://collectionapi.metmuseum.org/public/collection/v1/objects/<objectId>` (không cần API key). **Nếu `isPublicDomain` không phải đúng `true` thì bỏ qua và báo bằng tiếng Việt; không bao giờ dùng ảnh đó** (kiểm tra xong mới chuyển ảnh).
- Thu nhỏ về rộng 1600 px, định dạng webp bằng ffmpeg vào `public/pictures/met-<objectId>.webp`; đọc `width`/`height` bằng ffprobe. ffmpeg/ffprobe lấy từ biến `FFMPEG_PATH`/`FFPROBE_PATH`, rồi PATH, rồi thư mục cài WinGet (`Gyan.FFmpeg`).
- Ghi `inbox/images/<objectId>.draft.json` chỉ gồm các trường API: `title`, `artistDisplayName`, `objectDate`, `medium`, `dimensions`, `department`, `culture`, `period`, `creditLine`, `objectURL`.

Bước 2, viết nội dung (làm trong cuộc trò chuyện với Claude, không tự động):
- Claude đọc từng draft và viết `inbox/images/<objectId>.content.json` gồm `description` (tiếng Việt, 3–5 câu), `intro` (tiếng Anh A1, 3–5 câu, <= 10 từ, thì hiện tại đơn) và `alt` (tiếng Việt).
- **Chỉ dùng dữ kiện có trong draft; không bịa, không thêm kiến thức nền.** `alt` chỉ mô tả cảnh khi rõ từ tên tác phẩm/chất liệu; nếu không rõ thì bỏ trống để dùng `alt` trung tính "Tác phẩm <title>".

Bước 3, ghép (`npm run ingest:pictures -- --merge`):
- Với mỗi draft có file nội dung: dựng `Picture` (id `met-<objectId>`, `src` `pictures/met-<objectId>.webp`, kích thước đo bằng ffprobe, `credit.url = objectURL`), kiểm tra bằng `parseCatalog` và `contentIssues`, rồi ghép vào mảng `pictures` (cùng id thì thay thế).
- Credit tiếng Việt: `<artistDisplayName>, "<title>", <objectDate>. The Metropolitan Museum of Art, <creditLine>. Ảnh thuộc phạm vi công cộng (Met Open Access).` (bỏ phần tác giả khi rỗng; hàm thuần `buildCreditText`).
- **Chỉ ghi `index.json` khi toàn bộ danh mục hợp lệ**; nếu có lỗi thì in lỗi và giữ nguyên file. Ghi qua file tạm rồi đổi tên. File được ghi lại với thụt lề 2 dấu cách.

### E5. Test
- `pictures.ts`: `shuffle` (hoán vị, xác định theo nguồn ngẫu nhiên), `isPermutation`, `revealedTiles`, bài thưởng, `contentIssues` (3–5 câu, 10 từ).
- `progress.ts`: `loadProgress` với dữ liệu cũ/hợp lệ/sai; `recordLessonDone`; `pickNextPicture` (chưa xong, vòng mới tránh tranh vừa xong, một tranh duy nhất, id không còn trong catalog); `ensureActivePicture`; `recordPicturePass` (dưới/đúng ngưỡng 60, mở từng mảnh theo `order`, hoàn chỉnh ở mảnh 6, tranh mới sau khi hoàn chỉnh, không trùng trong `picturesDone`, không sửa đầu vào).
- `catalog.ts`: tranh hợp lệ/thiếu trường/sai kiểu/trùng id, khóa `series` cũ bị bỏ qua.
- `ingest.ts`: tên file, `isPublicDomain` (chỉ `true`), `pickDraftFields` (chỉ 10 trường), `buildCreditText` (có/không tác giả), `parseContent`, `buildPicture`, `mergePicture`, `mergeIntoCatalog` (không ghi khi sai).
- Dữ liệu thật (`shippedCatalog.test.ts`): `index.json` không có cảnh báo, mọi tranh có file ảnh trong `public/pictures/`, đúng quy tắc nội dung, credit là credit Met bằng tiếng Việt.

---

## Việc người dùng tự làm (Claude Code không làm thay)
1. **Chọn tranh** ở https://www.metmuseum.org: bật lọc Open Access, tải ảnh về, đổi tên thành `<objectId>.jpg` (số cuối link trang tác phẩm) và đặt vào `inbox/images/`. Chạy `npm run ingest:pictures`; nhờ Claude viết file nội dung từ các file `.draft.json`; đọc lại cho đúng rồi chạy `npm run ingest:pictures -- --merge`.
2. **Cắt audio VOA**: `ffmpeg -ss <bắt đầu> -to <kết thúc> -i bai.mp4 -vn -ac 1 -b:a 48k l01.mp3`, đặt vào `public/lessons/voa/`. Đối chiếu transcript trên trang VOA, nạp vào màn hình "Tải file" → "Xem lại các câu" → "Xuất bài (JSON)" rồi thêm vào `public/lessons/index.json`.
3. Chỉ lấy chữ và audio VOA, không lấy ảnh của họ. Giữ dòng ghi nguồn "Voice of America · public domain".
