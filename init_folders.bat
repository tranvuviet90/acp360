@echo off
:: Script khởi tạo các thư mục và môi trường chạy SafeOne trên máy chủ thuê Windows
echo === Kich hoat script khoi tao SafeOne ===

:: 1. Tao cac thu muc can thiet
echo 1. Tao cau truc thu muc du an...
if not exist src\components mkdir src\components
if not exist src\i18n mkdir src\i18n
if not exist src\utils mkdir src\utils
if not exist src\assets mkdir src\assets
if not exist src\constants mkdir src\constants
if not exist dist mkdir dist
if not exist functions\node_modules mkdir functions\node_modules

:: 2. Khoi tao file moi truong neu chua co
echo 2. Khoi tao tep cau hinh moi truong (.env)...
if not exist .env (
    if exist .env.example (
        copy .env.example .env
        echo -^> Da tao .env tu .env.example. Vui loang cap nhat API keys trong tep .env!
    ) else (
        echo VITE_ASKAI_URL=https://asia-southeast1-acp360.cloudfunctions.net/askAI > .env
        echo -^> Da tao tep .env moi voi cau hinh mac dinh.
    )
) else (
    echo -^> Tep .env da ton tai, bo qua.
)

:: 3. Cai dat cac goi npm phu thuoc
echo 3. Cai dat npm dependencies...
call npm install

echo === Hoan tat khoi tao SafeOne ===
echo De chay local: npm run dev
echo De build production: npm run build
pause
