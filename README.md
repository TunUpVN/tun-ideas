# 💡 Tun Ideas

**Phòng họp nơi các AI tranh luận về ý tưởng của bạn.**

Bạn là chủ phòng: đặt một chủ đề, các AI (Claude, Gemini, GPT…) lần lượt phát biểu, nhận xét và phản biện nhau. Có thể cho chạy một số vòng cố định, hoặc để các AI **bỏ phiếu đến khi đồng thuận**, mỗi phiếu đều kèm lý do.

- Dùng AI và API key **của chính bạn**. Key chỉ lưu trên thiết bị của bạn.
- Miễn phí: Gemini và các model miễn phí trên OpenRouter không tốn tiền.
- Gán cá tính cho từng AI (người phản biện, nhà đầu tư khó tính, khách hàng…), có sẵn 30 mẫu.
- Lưu lịch sử phòng họp, tải biên bản thảo luận.

---

## 💻 Cài trên Windows

1. Vào mục **[Releases](../../releases/latest)** và tải file `TunIdeas-Setup-x.y.z.exe`.
2. Mở file vừa tải. Nếu Windows hiện **"Windows protected your PC"**, bấm **More info**, rồi **Run anyway**. Cảnh báo này hiện ra vì app miễn phí, chưa mua chứng chỉ ký số.
3. Làm theo trình cài đặt. Xong sẽ có biểu tượng **Tun Ideas** ngoài Desktop.
4. Lần đầu mở app, màn hình **Kết nối AI** sẽ hướng dẫn bạn lấy key từng bước.

Bản Windows dùng được **Claude bằng gói Claude của bạn** (Pro/Max) thông qua Claude Code. Bước Claude trong app có hướng dẫn cài.

## 📱 Dùng trên điện thoại Android

1. Mở bằng **Chrome**: **https://tunupvn.github.io/tun-ideas/**
2. Bấm menu **⋮**, chọn **Thêm vào màn hình chính** (hoặc **Cài đặt ứng dụng**).
3. Mở Tun Ideas từ màn hình chính và làm theo màn hình **Kết nối AI**.

Trên điện thoại, Claude chỉ dùng được bằng API key trả phí của Anthropic. Gemini và OpenRouter vẫn miễn phí.

---

## 🔑 Key lấy ở đâu?

| AI | Chi phí | Lấy key |
|---|---|---|
| Gemini | Miễn phí (có giới hạn lượt) | https://aistudio.google.com/apikey |
| GPT-OSS, Llama, Qwen… qua OpenRouter | Miễn phí với model `:free` (~50 lượt/ngày) | https://openrouter.ai/settings/keys |
| Claude (bản Windows) | Theo gói Claude Pro/Max của bạn | Cài Claude Code, không cần key |
| Claude qua API | Trả phí | https://console.anthropic.com/settings/keys |
| GPT qua OpenAI API | Trả phí | https://platform.openai.com/api-keys |

Với OpenRouter, bạn cần bật **"Allow free endpoints that train on request data"** tại https://openrouter.ai/settings/privacy thì mới dùng được model miễn phí. Lưu ý: model miễn phí có thể dùng nội dung để huấn luyện, nên đừng thảo luận thông tin nhạy cảm.

---

## 🛠 Dành cho người phát triển

- `web/`: giao diện (một file `index.html`), đồng thời là web app cài được (PWA). Khi chạy trên web, app gọi thẳng API của các nhà cung cấp từ trình duyệt.
- `desktop/`: bản Windows (Electron). `server.js` chạy máy chủ nội bộ để gọi AI, kể cả Claude Code.
- `npm install`, rồi `npm start` để chạy bản desktop. `npm run serve` để chạy bằng Node trong trình duyệt.
- Mỗi lần đưa mã lên nhánh `main`, GitHub Actions sẽ tự đăng web app lên GitHub Pages và tự đóng gói file cài Windows vào mục Releases. Muốn phát hành bản mới thì tăng `version` trong `package.json`.
