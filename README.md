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

## Cấu trúc

- `src/lib/`: logic thuần (ngôn ngữ, so sánh từ và tính điểm, tách câu và căn thời điểm, XP/streak, tranh, danh mục bài, lưu trữ IndexedDB).
- `src/components/`: màn hình (Home, NewLesson, Review, Practice, Result, TopBar, PictureCard).
- `src/hooks/`: `useSegmentPlayer`, `useTheme`.
- `src/workers/`: chỗ dành cho nhận dạng giọng nói (Whisper) ở bước sau; hiện chỉ có kiểu dữ liệu.
- `scripts/`: công cụ dòng lệnh (`ingest-pictures.ts`).
- `process_lesson.py`, `tests/`: nạp bài bằng Python và test của nó.
- `public/lessons/index.json`: danh mục bài (`{ version, lessons }`); dán bài xuất từ màn Review ("Xuất bài (JSON)") vào mảng `lessons` ở đây. `process_lesson.py` ghi vào file này.
- `public/pictures/index.json`: danh mục tranh (`{ version, pictures }`), do `npm run ingest:pictures -- --merge` ghi; `public/pictures/*.webp`: ảnh tranh.
