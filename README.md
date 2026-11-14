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

Xem mục Task E trong `docs/TASKS.md`. Tóm tắt: đặt ảnh `<objectId>.jpg` vào `inbox/images/`, chạy `npm run ingest:pictures` (chỉ nhận tác phẩm public domain; cần ffmpeg), viết file `<objectId>.content.json` từ file `.draft.json`, rồi chạy `npm run ingest:pictures -- --merge`.

## Cấu trúc

- `src/lib/`: logic thuần (ngôn ngữ, so sánh từ và tính điểm, tách câu và căn thời điểm, XP/streak, tranh, danh mục bài, lưu trữ IndexedDB).
- `src/components/`: màn hình (Home, NewLesson, Review, Practice, Result, TopBar, PictureCard).
- `src/hooks/`: `useSegmentPlayer`, `useTheme`.
- `src/workers/`: chỗ dành cho nhận dạng giọng nói (Whisper) ở bước sau; hiện chỉ có kiểu dữ liệu.
- `scripts/`: công cụ dòng lệnh (`ingest-pictures.ts`).
- `public/lessons/index.json`: danh mục bài và tranh; `public/pictures/`: ảnh tranh.
