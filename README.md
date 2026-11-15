# FAM

Website nghe chép chính tả kiểu game cho người mới học tiếng Anh. Tải audio/video ngắn (khoảng 5 phút, tối đa 10 phút), dán transcript, tách câu, chỉnh lại thời điểm, rồi luyện từng câu và nhận điểm, XP, level, streak. Bài học (kể cả file audio) được lưu trong IndexedDB của trình duyệt. Mỗi lần qua bài (điểm trung bình từ 60) mở thêm một mảnh của một bức tranh ngẫu nhiên trong bộ sưu tập (Met Open Access); mở đủ 6 mảnh thì xem mô tả và làm bài thưởng.

## Cách chạy

```bash
npm install
npm run dev      # chạy thử, mở địa chỉ Vite in ra
npm run build    # kiểm tra kiểu và đóng gói
npm test         # chạy test (Vitest)
```

## Thêm tranh vào bộ sưu tập

Tranh nằm trong `public/pictures/index.json` (tách khỏi danh mục bài `public/lessons/index.json`). Xem mục Task E và Task I trong `docs/TASKS.md`. Tóm tắt: đặt ảnh `<objectId>.jpg` vào `inbox/images/`, chạy `npm run ingest:pictures` (chỉ nhận tác phẩm public domain; cần ffmpeg), viết file `<objectId>.content.json` từ file `.draft.json`, rồi chạy `npm run ingest:pictures -- --merge` (ghi vào `public/pictures/index.json`, tự tạo nếu chưa có).

## Nạp bài bằng Python

`process_lesson.py` biến một file audio và một file chữ thành bài có sẵn, không cần thao tác nào trong app: tách câu, chuyển audio (mono, 48 kbps), tìm quãng im lặng, căn thời điểm, kiểm tra và thêm vào `public/lessons/index.json`. Cần Python 3.10+ (chỉ dùng thư viện chuẩn) và ffmpeg (`winget install --id Gyan.FFmpeg -e`; script tự tìm cả khi chưa nằm trong PATH).

```text
inbox/lessons/voa-l02-at-home.mp3   audio gốc (.mp3, .m4a hoặc .wav)
inbox/lessons/voa-l02-at-home.txt   transcript, cùng tên file
```

Tên file là mã bài: chỉ chữ thường a-z, số 0-9 và dấu gạch ngang. File `.txt` có thể bắt đầu bằng phần đầu (tùy chọn), kết thúc bằng một dòng chỉ có `---`:

```text
title: Lesson 2: At home
url: https://learningenglish.voanews.com/a/...
topic: Daily life
level: A1
order: 2
---
Anna: This is my home.
It has two rooms.
```

Khi thiếu: `title` lấy theo mã bài, `level` A1, `topic` "Daily English", nguồn "Voice of America · public domain", `url` là trang chung (script in CẢNH BÁO, hãy điền url của trang bài học).

```bash
python process_lesson.py --id voa-l02-at-home --dry-run   # xem trước bảng câu, chưa ghi gì
python process_lesson.py --id voa-l02-at-home             # nạp thật
python process_lesson.py                                  # nạp mọi cặp audio + txt trong inbox/lessons
```

Tùy chọn: `--force` (thay bài đã có cùng mã), `--dry-run`, `--keep-inbox` (giữ file gốc, mặc định chuyển vào `inbox/lessons/done/`). Script luôn sao lưu `index.json.bak` trước khi ghi và không bao giờ xóa file. Sau khi chạy: nghe thử từng câu, sửa mốc thời gian trong `public/lessons/index.json` nếu lệch, rồi `npm run build` và `npm test`.

Kiểm thử script: `npm run test:py` (hoặc `python -m unittest discover -s tests`). Phần tách câu, tìm im lặng và căn thời điểm được đối chiếu với chính code TypeScript qua `tests/segment_vectors.json`; sau khi sửa `src/lib/segment.ts`, chạy `node tests/gen_segment_vectors.mjs` để sinh lại.

## Bài có sẵn và xuất bài (admin)

Trên Home, bài có sẵn được nhóm theo trình độ (A1, A2), rồi chủ đề, rồi `order` (tăng dần; thiếu `order` thì xuống cuối). `seriesId` không còn (khóa cũ trong JSON bị bỏ qua) và Home không hiện dòng nguồn của bài; dữ liệu `source` vẫn nằm trong JSON.

Để tạo bài bằng giao diện, mở app với `?admin`, tải file và dán chữ, rồi ở màn "Xem lại các câu" chọn "Trình độ" và "Chủ đề" trong khối "Phân loại" và bấm "Xuất bài (JSON)". Mã bài là tên file audio (chữ thường, gạch ngang), `audioUrl` là `lessons/voa/<id>.mp3`, `order` tự lấy số kế tiếp trong cùng trình độ và chủ đề, nguồn lấy mặc định ở `DEFAULT_LESSON_SOURCE` (`src/lib/sources.ts`). Đặt audio vào `public/<audioUrl>` và dán JSON vào mảng `lessons` của `public/lessons/index.json`.

## Tiến độ và lịch sử luyện

Tiến độ lưu trong localStorage (`fam.prog`): XP, streak, điểm cao nhất của từng bài (`lessonsDone`), tranh đang mở, album, và `history`: điểm trung bình của từng lần hoàn thành bài (tối đa 30 lần gần nhất mỗi bài). Trên Home, mỗi bài đã luyện hiện tối đa 10 ô vuông nhỏ (cũ trái, mới phải; "+N" nếu nhiều hơn): đỏ nhạt dưới 60 điểm, màu chính từ 60 đến 89, xanh lá từ 90. Bài chưa có lịch sử thì không hiện ô nào.

## Đưa lên hosting tĩnh (GitHub Pages, Cloudflare Pages)

App là web tĩnh (không máy chủ). Đường dẫn gốc lấy từ biến `VITE_BASE` (mặc định `/`); mọi đường dẫn bài, tranh, audio, ảnh QR và favicon đều đi qua đó nên chạy được ở thư mục con.

- **Build cho thư mục con**: `npm run build:pages` (mặc định `/fam/`). Đổi bằng biến môi trường, ví dụ PowerShell: `$env:VITE_BASE = "/ten-repo/"; npm run build:pages`; bash: `VITE_BASE=/ten-repo/ npm run build:pages`. (Git Bash trên Windows tự đổi `/ten-repo/` thành đường dẫn Windows; nếu gặp lỗi "VITE_BASE không hợp lệ" hãy thêm `MSYS_NO_PATHCONV=1` hoặc dùng PowerShell.) Xem thử: `npm run build:pages` rồi `npx vite preview` với cùng `VITE_BASE`, mở `http://localhost:4173/fam/`.
- **GitHub Pages**: workflow `.github/workflows/deploy.yml` chạy khi push lên `main`: `npm ci`, `npm test`, build với `VITE_BASE=/<tên repo>/`, rồi đăng thư mục `dist`. Bật một lần: Settings → Pages → Source: **GitHub Actions**.
- **Cloudflare Pages**: build command `npm run build`, output `dist`, không đặt `VITE_BASE` (chạy ở gốc tên miền).
- **Bản public không có `VITE_ADMIN_TOKEN`**: workflow và `build:pages` đều không đặt biến này (`build:pages` còn xóa nó khỏi môi trường). Lưu ý: hiện app chưa dùng token nào; chế độ `?admin` chỉ là tiện ích, không phải bảo mật (xem `src/lib/features.ts`).

## Trang giới thiệu, ủng hộ và ảnh QR

Chân trang Home có hai liên kết nhỏ: "Giới thiệu và nguồn" (giới thiệu, nguồn VOA và Met, email hợp tác, nút "Ủng hộ dự án") và "Ủng hộ" (lời kêu gọi song ngữ, mã QR, tên chủ tài khoản, ngân hàng, nội dung chuyển khoản, nút sao chép). Mọi văn bản công khai nằm trong `src/lib/siteInfo.ts` (`OWNER_NAME`, `BANK_NAME`, `TRANSFER_NOTE`, `CONTACT_EMAIL`, ...); số tài khoản (`ACCOUNT_NUMBER`) cũng nằm ở đó và hiển thị công khai trên màn Ủng hộ; muốn ẩn thì xóa dòng này và dòng hiển thị tương ứng.

Ảnh QR đặt ở `public/support-qr.jpg` (khoảng 600×600 px; app luôn tìm đúng tên file này). Nếu thiếu file hoặc không tải được, màn hình hiện dòng "Mã QR sẽ được cập nhật." thay cho ảnh. Trên Home còn nút nhỏ "Tiến độ được lưu ở đâu?" (bấm để hiện ghi chú: tiến độ chỉ lưu trong trình duyệt; không nhớ trạng thái đóng/mở).

## PWA và chạy offline

`public/sw.js` là service worker viết tay (không thêm thư viện). Chỉ đăng ký ở bản production (`import.meta.env.PROD`), không bao giờ ở `npm run dev`; mọi đường dẫn suy ra từ scope của worker nên chạy được ở `/` lẫn `/fam/`.

- **Chiến lược**: khi cài đặt, lưu sẵn `index.html`, manifest, icon và các file JS/CSS trong `assets/` mà `index.html` dùng, cùng hai danh mục (`lessons/index.json`, `pictures/index.json`). Điều hướng: ưu tiên mạng, mất mạng thì dùng `index.html` đã lưu. Hai danh mục: stale-while-revalidate (bài mới hiện sau một lần tải lại). `assets/`, `pictures/` và audio `.mp3`: ưu tiên bản đã lưu, lưu lần đầu được tải. Audio hỗ trợ Range (trả 206 từ file đã lưu, cần cho Safari). Chỉ xử lý GET cùng nguồn; Google Fonts và các nguồn ngoài không bị lưu.
- **Phiên bản cache**: `fam-static-v1`, `fam-media-v1`, `fam-data-v1`. Khi đổi luật lưu trong `sw.js`, tăng `CACHE_VERSION` ở đầu file; lúc kích hoạt, mọi cache `fam-` cũ bị xóa.
- **Cập nhật**: worker mới chờ đến khi người học bấm "Tải lại" ở thanh "Có bản mới"; app không tự tải lại (nhất là khi đang luyện). Chỉ cần đổi nội dung file `sw.js` hoặc build mới là trình duyệt tự phát hiện bản mới.
- **Thử offline**: `npm run build` (hoặc `build:pages`), `npx vite preview`, mở trang, tải lại một lần để worker nắm quyền, nghe một bài, rồi DevTools → Network → Offline và tải lại.

## Sao lưu tiến độ

Màn "Giới thiệu và nguồn" có thẻ "Sao lưu tiến độ": "Xuất tiến độ" tải về `fam-progress-YYYY-MM-DD.json` (trên máy có bảng chia sẻ file như iPhone thì mở bảng chia sẻ để lưu vào Tệp) và "Nhập tiến độ" đọc file đó. Nhập sẽ **thay thế** tiến độ hiện tại sau khi xác nhận; file sai (không phải JSON, sai `app`/`kind`, phiên bản mới hơn, lớn hơn 1 MB) bị từ chối bằng thông báo tiếng Việt và không đổi gì. Dữ liệu nhập được làm sạch bằng cùng hàm `parseProgress` với dữ liệu đọc từ localStorage. Bài tự tải lên (IndexedDB) không nằm trong file sao lưu.

## Cấu trúc

- `src/lib/`: logic thuần (ngôn ngữ, so sánh từ và tính điểm, tách câu và căn thời điểm, XP/streak, tranh, danh mục bài, lưu trữ IndexedDB).
- `src/components/`: màn hình (Home, NewLesson, Review, Practice, Result, TopBar, PictureCard).
- `src/hooks/`: `useSegmentPlayer`, `useTheme`.
- `src/workers/`: chỗ dành cho nhận dạng giọng nói (Whisper) ở bước sau; hiện chỉ có kiểu dữ liệu.
- `scripts/`: công cụ dòng lệnh (`ingest-pictures.ts`, `build-pages.ts`, `base.ts` chuẩn hóa `VITE_BASE`).
- `process_lesson.py`, `tests/`: nạp bài bằng Python và test của nó.
- `public/lessons/index.json`: danh mục bài (`{ version, lessons }`); dán bài xuất từ màn Review ("Xuất bài (JSON)") vào mảng `lessons` ở đây. `process_lesson.py` ghi vào file này.
- `public/pictures/index.json`: danh mục tranh (`{ version, pictures }`), do `npm run ingest:pictures -- --merge` ghi; `public/pictures/*.webp`: ảnh tranh.
