# FAM

Website nghe chép chính tả kiểu game cho người mới học tiếng Anh. Tải audio/video ngắn (khoảng 5 phút, tối đa 10 phút), dán transcript, tách câu, chỉnh lại thời điểm, rồi luyện từng câu và nhận điểm, XP, level, streak. Bài học (kể cả file audio) được lưu trong IndexedDB của trình duyệt.

## Cách chạy

```bash
npm install
npm run dev      # chạy thử, mở địa chỉ Vite in ra
npm run build    # kiểm tra kiểu và đóng gói
```

## Cấu trúc `src/`

- `lib/`: logic thuần (ngôn ngữ, so sánh từ và tính điểm, tách câu và căn thời điểm, XP/streak, lưu trữ IndexedDB).
- `components/`: màn hình (Home, NewLesson, Review, Practice, Result, TopBar).
- `hooks/`: `useSegmentPlayer`, `useTheme`.
- `workers/`: chỗ dành cho nhận dạng giọng nói (Whisper) ở bước sau; hiện chỉ có kiểu dữ liệu.
