# BT-02 — Website cá nhân với Node.js, Express và Docker

Project mẫu phục vụ bài tập BT-02. Ứng dụng có đúng một trang chủ giới thiệu, form gửi thông điệp tới điện thoại thông qua Pushbullet và một URL quản trị riêng để cập nhật top banner từ điện thoại.

## 1. Cấu trúc

```text
BT-02-NodeJS-Docker/
├── public/
│   ├── index.html       # Trang chủ duy nhất
│   ├── styles.css       # Giao diện responsive
│   ├── app.js           # Form gửi tin, tự tải banner mỗi 8 giây
│   ├── avatar.svg       # Minh họa mẫu; có thể thay bằng ảnh cá nhân
│   └── admin.html       # Bảng quản trị riêng, tối ưu điện thoại
├── data/banner.json     # Banner mặc định khi chạy local
├── server.js            # Express APIs + Pushbullet
├── Dockerfile
├── compose.yaml
├── .env.example
└── package.json
```

## 2. Cá nhân hóa trang chủ

Mở `public/index.html`, thay `Tên của bạn`, phần giới thiệu, sở thích/kỹ năng và câu châm ngôn bằng nội dung của bạn. Có thể thay `public/avatar.svg` bằng ảnh cá nhân; nếu thay ảnh, cập nhật thuộc tính `src` của thẻ `<img>` trong `index.html` cho khớp tên file.

## 3. Cấu hình Pushbullet

1. Cài ứng dụng Pushbullet trên điện thoại và đăng nhập tài khoản của bạn.
2. Lấy Access Token từ phần Account Settings của Pushbullet.
3. Sao chép `.env.example` thành `.env`, rồi đặt `PUSHBULLET_ACCESS_TOKEN` và một `ADMIN_PASSWORD` mạnh.
4. Không đưa `.env` lên Git, Docker Hub hoặc ảnh chụp màn hình báo cáo.

Mỗi lượt gửi thành công, backend gọi `POST https://api.pushbullet.com/v2/pushes` với header `Access-Token` và nội dung `type: note`. Token chỉ nằm ở backend, không gửi xuống trình duyệt.

## 4. Chạy nhanh bằng Docker Compose

Cài Docker Engine và plugin Docker Compose trên Ubuntu Server 22.04 trước. Trong thư mục project:

```bash
cp .env.example .env
nano .env
# sửa token và mật khẩu, lưu lại

docker compose up -d --build
docker compose ps
curl http://localhost:3000/health
```

Mở `http://IP_CUA_UBUNTU_VM:3000`. Nếu truy cập từ laptop cùng mạng LAN, dùng IP LAN của Ubuntu VM và đảm bảo firewall cho phép cổng 3000. `admin.html` nằm ở `/admin.html`.

Không chạy `docker compose config` khi chụp màn hình nếu `.env` chứa token thật vì đầu ra có thể làm lộ biến môi trường.

## 5. Đưa image lên Docker Hub

1. Tạo repository public có tên `bt02-personal-website` trên Docker Hub.
2. Sửa `DOCKERHUB_USERNAME` hoặc tên image bên dưới bằng namespace thật của bạn.
3. Đăng nhập và build/push:

```bash
docker login -u YOUR_DOCKERHUB_USERNAME
docker build -t YOUR_DOCKERHUB_USERNAME/bt02-personal-website:1.0.0 .
docker push YOUR_DOCKERHUB_USERNAME/bt02-personal-website:1.0.0
```

Khi triển khai lại từ image đã push, dùng:

```bash
docker pull YOUR_DOCKERHUB_USERNAME/bt02-personal-website:1.0.0
# có thể sửa image trong compose.yaml thành image đã push và bỏ phần build:
docker compose up -d
```

**Lưu ý:** Docker image chứa mã ứng dụng, không chứa token thật. Thư mục dữ liệu banner và `.env` phải được cung cấp riêng lúc triển khai. Volume `website-data` giữ banner mới sau khi container được tạo lại.

## 6. Phát hành công khai qua Internet

### Tuỳ chọn dễ làm demo: Cloudflare Quick Tunnel

Giữ container chạy, cài `cloudflared` theo hướng dẫn chính thức, sau đó trên Ubuntu chạy:

```bash
cloudflared tunnel --url http://localhost:3000
```

Mở URL `https://....trycloudflare.com` mà chương trình in ra. Đây là URL tạm cho demo; URL có thể đổi khi chạy lại tunnel và dịch vụ không có cam kết uptime. Để có hostname ổn định, tạo Cloudflare Tunnel gắn với tên miền bạn sở hữu. Nếu dùng IP public/router port forwarding thay tunnel, phải kiểm tra ISP có cấp public IP và cấu hình NAT/firewall an toàn.

## 7. Demo và kiểm thử

```bash
# Healthcheck
curl -i http://localhost:3000/health

# Xem banner hiện tại
curl http://localhost:3000/api/banner

# Gửi một thông điệp thử (sẽ gửi notification thật nếu token hợp lệ)
curl -i -X POST http://localhost:3000/api/messages \
  -H 'Content-Type: application/json' \
  -d '{"name":"Khách thử nghiệm","message":"Xin chào, đây là thông điệp kiểm thử."}'

# Xem trạng thái container và log

docker compose ps
docker compose logs --tail=100 personal-website
```

Để thử banner: truy cập `/admin.html` trên điện thoại hoặc laptop, nhập `ADMIN_PASSWORD`, gửi lời nhắn, sau đó kiểm tra trang chủ. Banner tự cập nhật mỗi khoảng 8 giây.

## 8. An toàn và giới hạn

- Luôn giữ `.env` riêng tư; thay token nếu vô tình làm lộ.
- Dùng mật khẩu quản trị đủ dài; nếu sử dụng trên Internet, ưu tiên HTTPS và hostname ổn định.
- Form giới hạn thông điệp 500 ký tự, banner 240 ký tự và có giới hạn gửi cơ bản theo IP. Rate limit đang lưu trong RAM nên sẽ reset khi restart; đây là bài tập học tập chứ không phải hệ thống production quy mô lớn.
- Banner dùng Docker named volume nên tồn tại khi recreate container, nhưng hãy sao lưu volume nếu cần phục hồi dữ liệu.
- Cloudflare Quick Tunnel chỉ phù hợp demo; không coi đó là dịch vụ uptime 24/7 được đảm bảo.
