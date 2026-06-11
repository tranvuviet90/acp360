#!/bin/bash
# Script khởi tạo các thư mục và môi trường chạy SafeOne trên máy chủ thuê Linux
echo "=== Kích hoạt script khởi tạo SafeOne ==="

# 1. Tạo các thư mục cần thiết
echo "1. Tạo cấu trúc thư mục dự án..."
mkdir -p src/components
mkdir -p src/i18n
mkdir -p src/utils
mkdir -p src/assets
mkdir -p src/constants
mkdir -p dist
mkdir -p functions/node_modules

# 2. Khởi tạo file môi trường nếu chưa có
echo "2. Khởi tạo tệp cấu hình môi trường (.env)..."
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "-> Đã tạo .env từ .env.example. Vui lòng cập nhật API keys của bạn trong tệp .env!"
  else
    cat <<EOT >> .env
VITE_ASKAI_URL=https://asia-southeast1-acp360.cloudfunctions.net/askAI
EOT
    echo "-> Đã tạo tệp .env mới với cấu hình mặc định."
  fi
else
  echo "-> Tệp .env đã tồn tại, bỏ qua."
fi

# 3. Cài đặt các gói npm phụ thuộc
echo "3. Cài đặt npm dependencies..."
npm install

echo "=== Hoàn tất khởi tạo SafeOne ==="
echo "Để chạy local: npm run dev"
echo "Để build production: npm run build"
