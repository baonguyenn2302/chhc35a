# Quiz Học Tập

Trang luyện tập tĩnh đọc dữ liệu từ hai tệp Markdown trong `topic/`. Mỗi lần chọn một chủ đề, trang tạo ngẫu nhiên 7 đề riêng, mỗi đề có 30 câu và không trộn câu hỏi giữa các chủ đề. Reload trang rồi vào lại chủ đề (hoặc quay về trang chủ và chọn lại) sẽ tạo bộ đề mới; các đáp án đúng được cân bằng vị trí, và các câu nhắc đến vị trí lựa chọn được giữ nguyên thứ tự phương án.

Trong lúc làm bài, toàn bộ câu hỏi hiển thị theo chiều dọc để cuộn liên tục; bảng số câu bên cạnh có thể dùng để cuộn nhanh đến câu cần làm.

Các tab của từng chủ đề cũng có bảng đáp án chi tiết theo câu nguồn và 7 đề, ngân hàng câu hỏi gốc có tìm kiếm/lọc theo chủ đề, và báo cáo kiểm tra dữ liệu. Có thể làm lại đề hiện tại hoặc tải đề/bảng đáp án dưới dạng tệp văn bản. Mở các màn hình tra cứu sẽ tạm dừng đồng hồ; câu trả lời đang làm được giữ lại khi quay về đề.

## Tạo dữ liệu đề

```sh
python3 generate_quizzes.py
```

Chạy kiểm thử bộ phân tích và bộ sinh đề:

```sh
python3 -m unittest -v
```

Mở `index.html` trực tiếp hoặc chạy máy chủ tĩnh tại thư mục này:

```sh
python3 -m http.server 8000
```

Sau khi cập nhật tệp Markdown, chạy lại bộ sinh đề để cập nhật `quiz_data.js`.
Tệp dữ liệu được tạo gồm cả đề luyện tập và ngân hàng câu hỏi gốc để nội dung tra cứu khớp với Markdown.
