# SafeOne 🛡️

**SafeOne** là hệ thống quản lý vận hành số hóa nhà xưởng toàn diện, tập trung vào công tác Giám sát An toàn, Sức khỏe, Môi trường (EHS), đánh giá Gemba, và quản lý quy trình hành chính (Báo cơm, Lịch làm việc) theo thời gian thực. Dự án được tối ưu hóa giao diện trực quan cao cấp, hiệu ứng mượt mà và tích hợp Trợ lý ảo AI EHS thông minh.

---

## 🇻🇳 TIẾNG VIỆT - HƯỚNG DẪN DỰ ÁN

### 🌟 Tính năng chính
1. **Gemba Checklist & Tự Gemba**: Ghi nhận và chấm điểm lỗi trực quan, chụp ảnh báo cáo vi phạm/cải tiến an toàn, xuất báo cáo CAP (Corrective Action Plan) theo khoảng ngày linh hoạt.
2. **Bộ đàm & Giám sát Giải lao (Bodam & GiamSatGiaiLao)**: Kênh truyền thông tin liên lạc và trao đổi nội bộ thời gian thực cho nhân viên và ban giám sát.
3. **Báo cơm (BaoCom)**: Luồng kiểm duyệt 2 chiều chắt chẽ giữa **Bộ phận (gửi)** ➡️ **EHS (duyệt & chuyển tiếp)** ➡️ **Nhà ăn (xác nhận chốt suất)**.
4. **Giám sát chuyên biệt**: Theo dõi vi phạm hút thuốc ngoài khu vực quy định (`GiamSatHutThuoc`) và quản lý vệ sinh khu vực rác thải sản xuất (`GiamSatNhaRac`).
5. **Trợ lý ảo EHS AI Chatbot**: Sử dụng mô hình **Gemini 2.5 Flash** tiên tiến, được huấn luyện bằng tài liệu kiến thức EHS chuẩn chỉnh của nhà máy và hướng dẫn sử dụng website.

### 🛠️ Công nghệ cốt lõi
* **Frontend**: React 19 (Vite), CSS Custom Theme (Harmonious Palette), React Icons, `@hello-pangea/dnd` (Kéo thả), `exceljs` & `xlsx` (Xuất báo cáo Excel chuyên nghiệp).
* **Backend & Cơ sở dữ liệu**: Firebase v11 (Authentication, Firestore Database, Cloud Storage để lưu trữ hình ảnh).
* **AI Backend**: Firebase Cloud Functions (Node.js) kết nối trực tiếp với Gemini API thông qua `@google/generative-ai`.

### 🚀 Hướng dẫn khởi chạy cục bộ & Triển khai đám mây (Local & Cloud Deployment)

#### 1. Hướng dẫn khởi chạy dự án trên máy Local hoặc Máy chủ thuê (VPS/Server)

Nếu bạn muốn sao chép toàn bộ dự án này sang một máy tính local mới hoặc máy chủ thuê (VPS) để chạy và phát triển:

* **Bước 1: Chuẩn bị môi trường**
  * Tải và cài đặt **Node.js** phiên bản LTS mới nhất (v18+ hoặc v22+) trên máy chủ/máy trạm.
* **Bước 2: Giải nén mã nguồn & Chạy script khởi tạo**
  * Giải nén mã nguồn vào thư mục làm việc của máy chủ thuê.
  * Mở terminal tại thư mục gốc và chạy file script khởi tạo tự động (script sẽ tạo các thư mục cấu trúc cần thiết, tạo file `.env` mẫu, và cài đặt toàn bộ dependencies):
    * **Trên máy chủ Linux (Ubuntu/CentOS):**
      ```bash
      chmod +x init_folders.sh
      ./init_folders.sh
      ```
    * **Trên máy chủ Windows Server:** Mở chạy tệp `init_folders.bat` bằng cách double-click hoặc chạy trong CMD.
* **Bước 3: Cấu hình biến môi trường**
  * Chỉnh sửa tệp `.env` vừa tạo để điền chính xác API keys và endpoint dịch vụ AI của bạn.
* **Bước 4: Khởi chạy local / Chạy nền trên máy chủ**
  * Chạy server local thời gian thực:
    ```bash
    npm run dev
    ```
  * Mở trình duyệt truy cập `http://localhost:5173`.
  * **Để chạy nền liên tục trên máy chủ thuê (VPS) không bị tắt khi ngắt terminal**, bạn nên dùng PM2:
    ```bash
    npm install -g pm2
    pm2 start npm --name "safeone-app" -- run dev
    ```

* **Bước 5: Khởi tạo tài khoản Admin đầu tiên**
  * SafeOne áp dụng cơ chế tự động phát hiện cơ sở dữ liệu trống thay vì tự động tạo tài khoản admin mặc định.
  * Trong lần đầu tiên chạy ứng dụng local khi bảng `users` trống, trình duyệt sẽ tự động hiển thị màn hình **Khởi Tạo Hệ Thống** thay vì form login thông thường.
  * Nhập Tên Admin, Email, và Mật khẩu theo ý muốn rồi bấm "Khởi Tạo & Đăng Ký Admin" để thiết lập. Sau khi đăng ký thành công, bạn sẽ quay lại màn hình đăng nhập chuẩn để đăng nhập bằng tài khoản vừa tạo.


---

#### 2. Hướng dẫn đẩy bản cập nhật lên trang web (Firebase Hosting & Cloud Functions)

Hệ thống được thiết kế để triển khai trực tuyến vô cùng đơn giản lên nền t sản **Firebase Cloud Platform**:

* **Bước 1: Cài đặt Firebase CLI (Nếu chưa có)**
  * Chạy lệnh sau ở dòng lệnh máy tính để cài đặt bộ công cụ Firebase toàn cầu:
    ```bash
    npm install -g firebase-tools
    ```
* **Bước 2: Đăng nhập & Chọn Project**
  * Đăng nhập tài khoản Firebase của bạn:
    ```bash
    firebase login
    ```
  * Chọn đúng dự án của bạn bằng cách liên kết hoặc kiểm tra tên dự án trong tệp `.firebaserc`.
* **Bước 3: Biên dịch sản phẩm tối ưu (Build)**
  * Tạo bản build production tối ưu hóa dung lượng:
    ```bash
    npm run build
    ```
* **Bước 4: Cấu hình biến môi trường & API Key cho Chatbot AI**
  * Tạo tệp cấu hình `.env` ở thư mục gốc nếu bạn dùng Cloud Functions để chạy fallback chatbot:
    ```env
    VITE_ASKAI_URL=https://<region>-<project-id>.cloudfunctions.net/askAI
    ```
  * Cấu hình khóa bí mật (Secret API Key) cho Cloud Functions gọi đến Gemini API:
    ```bash
    firebase functions:secrets:set GOOGLE_APIKEY="API_KEY_GEMINI_CUA_BAN"
    ```
* **Bước 5: Triển khai trực tuyến (Deploy)**
  * Triển khai tất cả lên cloud chỉ với một câu lệnh:
    ```bash
    firebase deploy
    ```
  * Hoặc nếu bạn chỉ muốn deploy phần Hosting:
    ```bash
    firebase deploy --only hosting
    ```
  * Sau khi hoàn tất, hệ thống sẽ cấp cho bạn một đường dẫn trực tuyến (ví dụ: `https://acp360.web.app`).

---

#### 3. Cấu hình Luật bảo mật trên Firebase (Security Rules)

Để đảm bảo hệ thống có thể kết nối và ghi nhận dữ liệu chính xác trên máy chủ đám mây mới hoặc tên miền khác, bạn cần sao chép các cấu hình luật bảo mật dưới đây và dán vào tab **Rules** trên bảng điều khiển Firebase:

##### 🔒 Luật bảo mật Cơ sở dữ liệu (Firestore Security Rules)
Truy cập **Firebase Console ➔ Firestore Database ➔ tab Rules** và cấu hình như sau để cho phép tất cả các tài khoản đã xác thực có quyền đọc và ghi dữ liệu:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Yêu cầu người dùng phải đăng nhập thông qua Firebase Auth để đọc/ghi dữ liệu
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // --- NEW: RULES FOR LOCKERS AND LICENSES (EHS Committee new sub tabs) ---
    match /lockers/{docId} {
      allow read, write: if request.auth != null;
    }
    match /licenses/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

##### 📂 Luật bảo mật Lưu trữ Hình ảnh (Firebase Storage Security Rules)
Truy cập **Firebase Console ➔ Storage ➔ tab Rules** và cấu hình như sau để cho phép lưu trữ và hiển thị ảnh cải tiến Gemba:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

##### 🌐 Trỏ tên miền riêng tùy chỉnh (Custom Domain)
Nếu bạn muốn đổi từ tên miền mặc định của Firebase (`.web.app` / `.firebaseapp.com`) sang tên miền riêng của doanh nghiệp:
1. Truy cập **Firebase Console ➔ Hosting ➔ bấm nút "Add custom domain"**.
2. Nhập tên miền của bạn (ví dụ: `safeone.mycompany.com`).
3. Firebase sẽ cấp cho bạn bản ghi **TXT** để xác minh quyền sở hữu và bản ghi **A** (IP Address).
4. Bạn chỉ cần truy cập vào trang quản lý DNS tên miền của mình, thêm các bản ghi tương ứng và đợi khoảng 10 - 30 phút để Cloudflare/Firebase tự động kích hoạt chứng chỉ SSL (HTTPS) miễn phí.

---

## 🇬🇧 ENGLISH - PROJECT GUIDE

### 🌟 Key Features
1. **Gemba & Self-Gemba Checklists**: Real-time safety/quality observation logger with dynamic scoring, photo attachments, and selective date-range CAP (Corrective Action Plan) Excel exports.
2. **Walkie-Talkie & Break Chat (Bodam & GiamSatGiaiLao)**: Instant interior communication channels for field coordinators and staff.
3. **Meal Registration (BaoCom)**: Structured 2-way approval pipeline: **Department (Request)** ➡️ **EHS (Approve & Forward)** ➡️ **Canteen (Confirm)**.
4. **Targeted Safety Compliance**: Monitoring illegal smoking zones (`GiamSatHutThuoc`) and factory waste station cleanliness (`GiamSatNhaRac`).
5. **AI Chatbot EHS Assistant**: Powered by **Gemini 2.5 Flash**, natively fine-tuned with rigorous factory EHS handbooks and software layout guides.

### 🛠️ Technology Stack
* **Frontend**: React 19, Vite 7, Tailored CSS Design Tokens, React Icons, `@hello-pangea/dnd`, `exceljs` & `xlsx` (Excel export engines).
* **Backend / DB**: Firebase v11 (Authentication, Firestore, Cloud Storage).
* **Serverless Backend (AI)**: Firebase Cloud Functions running on Node 22, linked with `@google/generative-ai`.

### 🚀 Step-by-Step Setup

#### 1. Prerequisites
* **Node.js**: v18+ (v22 recommended).
* A Firebase account and project initialized.

#### 2. Install Dependencies
Run in the root folder:
```bash
npm install
```
Install functions dependencies (optional, for AI assistant backend):
```bash
cd functions
npm install
cd ..
```

#### 3. Configure Environment Variables
Create a `.env` file in the root folder:
```env
VITE_ASKAI_URL=https://<region>-<project-id>.cloudfunctions.net/askAI
```
Configure your Gemini API key secret for Cloud Functions:
```bash
firebase functions:secrets:set GOOGLE_APIKEY="YOUR_GEMINI_API_KEY"
```

#### 4. Run Locally
Start the development server:
```bash
npm run dev
```
Open your browser and visit: `http://localhost:5173`.

#### 5. Initialize the First Admin Account (Local Env)
* SafeOne automatically detects an empty database instead of auto-seeding a default admin.
* Upon first access when no users exist, the browser will display the **System Initialization** page.
* Fill in the Admin's Name, Email, and Password, then submit the registration. Once complete, you will be redirected to the standard login form to log in.


#### 5. Build for Production
To bundle and optimize the project for deployment:
```bash
npm run build
```

---

## 📝 Nhật ký đổi tên (Migration Log)
Dự án được đổi tên từ **ACP360** sang **SafeOne** vào tháng 05/2026. 
* Toàn bộ nhãn UI, tiêu đề trang HTML, bản quyền chân trang và dữ liệu chỉ dẫn đào tạo AI Chatbot đều được đồng bộ hóa thống nhất dưới tên thương hiệu **SafeOne**.
* Các liên kết kỹ thuật và cơ sở dữ liệu Firebase Firestore vẫn tiếp tục kế thừa từ hạ tầng hiện tại để bảo toàn tính toàn vẹn của dữ liệu cũ mà không gây gián đoạn hệ thống.
