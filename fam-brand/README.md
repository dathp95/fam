# FAM — bộ nhận diện (hướng A: mái nhà nảy mầm)

```
tokens/   theme.css (biến màu sáng/tối)  ·  tokens.json (cho công cụ khác)
logo/     SVG dùng biến CSS: fam-mark, fam-wordmark, fam-app-icon
          bản mono (currentColor): fam-mark-mono, fam-wordmark-mono
png/      xuất sẵn nền trong suốt: bản light (xanh) và dark (kem), mark 512/1024, wordmark 600/1200
favicon/  favicon.svg, favicon.ico, 16/32/48, apple-touch-icon, icon-192/512, icon-maskable-512,
          site.webmanifest, head-snippet.html
react/    FamLogo.tsx
```

## Cách đổi màu không sửa logo
1. Import `tokens/theme.css` một lần ở gốc app.
2. Logo đọc 5 biến: `--fam-logo-body`, `--fam-logo-leaf`, `--fam-logo-tile`, `--fam-logo-on-tile`, `--fam-logo-leaf-on-tile`.
3. Đổi theme: `<html data-theme="dark">` (hoặc để tự theo hệ thống). Muốn thêm theme mới (vd. "tết", "mùa gặt"), thêm khối `[data-theme="..."]` ghi đè các biến `--fam-*`.

## Lưu ý
- SVG dùng biến CSS chỉ đổi màu khi **nhúng inline** (hoặc dùng `FamLogo.tsx`). Khi dùng `<img src="...svg">` hoặc làm favicon, trình duyệt dùng màu dự phòng (xanh/vàng ở bản sáng).
- PNG là màu cố định (xuất từ theme sáng và tối).
- Chữ FAM là hình vẽ, không cần cài phông.
