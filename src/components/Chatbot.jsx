// src/components/Chatbot.jsx
import React, { useState, useEffect, useRef } from 'react';
import './Chatbot.css';
import chatIcon from '../assets/favicon.png'; // <-- 1. Import icon
import { useI18n } from '../i18n/I18nProvider';
import { callAIService } from '../utils/aiAdapter';
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { normalizeRole } from '../utils/string';
import { parseMarkdown } from '../utils/markdown';

function Chatbot({ user }) {
    const { t } = useI18n();
    // 2. Thêm state để quản lý trạng thái đóng/mở
    const [isOpen, setIsOpen] = useState(false);

    const [messages, setMessages] = useState([{ text: t("chatbot.welcome"), type: 'ai' }]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatBodyRef = useRef(null);

    const [sopDocs, setSopDocs] = useState([]);
    const [msdsDocs, setMsdsDocs] = useState([]);
    const allDocs = [...sopDocs, ...msdsDocs];

    useEffect(() => {
        if (!user) {
            setSopDocs([]);
            setMsdsDocs([]);
            return;
        }
        const userRoles = user?.role ? (Array.isArray(user.role) ? user.role.map(normalizeRole) : String(user.role).split(',').map(normalizeRole)) : [];
        const canViewMSDS = userRoles.some(r => ["admin", "ehs", "manager"].includes(r));
        const canViewSOP = userRoles.some(r => ["admin", "ehs", "ehs committee", "trainer", "manager"].includes(r));

        let unsubSOP = null;
        let unsubMSDS = null;

        if (canViewSOP) {
            const qSop = query(
                collection(db, "documents"),
                where("type", "in", ["sop", "quytrinh", "bieumau"])
            );
            unsubSOP = onSnapshot(qSop, (snapshot) => {
                const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setSopDocs(list);
            }, (error) => {
                console.error("Lỗi tải SOP cho chatbot:", error);
            });
        } else {
            setSopDocs([]);
        }

        if (canViewMSDS) {
            const qMsds = query(
                collection(db, "documents"),
                where("type", "==", "msds")
            );
            unsubMSDS = onSnapshot(qMsds, (snapshot) => {
                const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setMsdsDocs(list);
            }, (error) => {
                console.error("Lỗi tải MSDS cho chatbot:", error);
            });
        } else {
            setMsdsDocs([]);
        }

        return () => {
            if (unsubSOP) unsubSOP();
            if (unsubMSDS) unsubMSDS();
        };
    }, [user]);

    // Tự động cuộn xuống khi có tin nhắn mới
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    const CLOUD_FUNCTION_URL = import.meta.env.VITE_ASKAI_URL || 'https://askai-zvblqnzylq-as.a.run.app';



    const getDocAccess = (docItem, currentUser) => {
        const userRoles = currentUser?.role ? (Array.isArray(currentUser.role) ? currentUser.role.map(normalizeRole) : String(currentUser.role).split(',').map(normalizeRole)) : [];
        const canView = userRoles.some(r => ["admin", "ehs", "ehs committee", "trainer", "manager"].includes(r));
        const canViewMSDS = userRoles.some(r => ["admin", "ehs", "manager"].includes(r));

        if (!canView) {
            return { hasAccess: false, reason: "Tài khoản của bạn không có quyền truy cập hệ thống tài liệu. Yêu cầu các vai trò như Admin, EHS, EHS Committee, Trainer hoặc Manager." };
        }

        if (docItem.type === "msds" && !canViewMSDS) {
            return { hasAccess: false, reason: "Tài liệu thuộc danh mục MSDS yêu cầu quyền truy cập của Admin, EHS hoặc Manager. Vai trò hiện tại của bạn không được phép xem tài liệu này." };
        }

        return { hasAccess: true };
    };

    const constructDocContext = () => {
        const userRoleName = user?.role || "Khách";
        let context = `=== VAI TRÒ & QUYỀN TRUY CẬP CỦA NGƯỜI DÙNG ===
Người dùng hiện tại: ${user?.name || "Khách"}
Vai trò: ${userRoleName}

=== DANH SÁCH TÀI LIỆU EHS TRONG HỆ THỐNG ===
Dưới đây là danh sách các tài liệu EHS hiện có trong cơ sở dữ liệu nhà máy và trạng thái quyền hạn của người dùng đối với từng tài liệu. 
BẠN PHẢI TUÂN THỦ TUYỆT ĐỐI QUYỀN HẠN NÀY KHI TRẢ LỜI NGƯỜI DÙNG:
`;

        allDocs.forEach((docItem, i) => {
            const access = getDocAccess(docItem, user);
            context += `\n[Tài liệu ${i + 1}]:\n`;
            context += `- Tên tài liệu: ${docItem.title}\n`;
            context += `- Danh mục: ${docItem.type.toUpperCase()}\n`;
            
            if (access.hasAccess) {
                context += `- Trạng thái quyền truy cập: ĐƯỢC PHÉP TRUY CẬP\n`;
                if (docItem.fileUrlVi || docItem.fileUrl) {
                    context += `- Đường dẫn tải/xem Tiếng Việt (VN): ${docItem.fileUrlVi || docItem.fileUrl}\n`;
                }
                if (docItem.fileUrlEn) {
                    context += `- Đường dẫn tải/xem Tiếng Anh (EN): ${docItem.fileUrlEn}\n`;
                }
            } else {
                context += `- Trạng thái quyền truy cập: BỊ TỪ CHỐI TRUY CẬP\n`;
                context += `- Lý do từ chối: ${access.reason}\n`;
            }
        });

        context += `
NGUYÊN TẮC QUAN TRỌNG KHI CUNG CẤP TÀI LIỆU:
1. Chỉ cung cấp đường dẫn tải/xem (link) của tài liệu nếu trạng thái quyền truy cập là "ĐƯỢC PHÉP TRUY CẬP". Khi cung cấp, hãy tạo liên kết markdown đẹp mắt dạng: [Tên tài liệu](URL). Ví dụ: "Dưới đây là tài liệu bạn yêu cầu: [MSDS của hóa chất R3333](https://example.com/pdf)".
2. Nếu người dùng yêu cầu tài liệu mà trạng thái quyền truy cập là "BỊ TỪ CHỐI TRUY CẬP", bạn KHÔNG ĐƯỢC CUNG CẤP bất kỳ link nào, và PHẢI thông báo rõ ràng cho người dùng lý do họ không truy cập được (dựa trên trường "Lý do từ chối" ở trên). Hãy khuyên họ liên hệ Admin/EHS nếu cần thiết.
3. Nếu người dùng hỏi xin tài liệu không có trong danh sách trên, hãy trả lời rằng tài liệu này hiện chưa có trong cơ sở dữ liệu của hệ thống EHS, và khuyên họ liên hệ Admin hoặc bộ phận EHS để được hỗ trợ.
4. Trình bày câu trả lời ngắn gọn, lịch sự, đúng trọng tâm.
`;
        return context;
    };

    const handleSendMessage = async () => {
        if (inputValue.trim() === '' || isLoading) return;

        const newMessages = [...messages, { text: inputValue, type: 'user' }];
        setMessages(newMessages);
        setInputValue('');
        setIsLoading(true);

        const history = messages.map(msg => ({
            role: msg.type === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.text }],
        }));

        try {
            const additionalContext = constructDocContext();
            const data = await callAIService(inputValue, history, CLOUD_FUNCTION_URL, additionalContext);
            setMessages(prev => [...prev, { text: data.response, type: 'ai' }]);
        } catch (error) {
            console.error('Error:', error);
            setMessages(prev => [...prev, { text: t("chatbot.error"), type: 'ai' }]);
        } finally {
            setIsLoading(false);
        }
    };

    // 3. Hàm để bật/tắt cửa sổ chat
    const toggleChat = () => {
        setIsOpen(!isOpen);
    };

    return (
        <>
            {/* 4. Chỉ hiển thị cửa sổ chat khi isOpen là true */}
            {isOpen && (
                <div id="chat-widget">
                    <div id="chat-header">
                        <h2>{t("chatbot.title")}</h2>
                        {/* Thêm nút đóng cửa sổ chat */}
                        <button className="close-btn" onClick={toggleChat}>×</button>
                    </div>
                    <div id="chat-body" ref={chatBodyRef}>
                        {messages.map((msg, index) => (
                            <div key={index} className={`message ${msg.type}`}>
                                {msg.type === 'ai' ? parseMarkdown(msg.text) : msg.text}
                            </div>
                        ))}
                        {isLoading && <div className="message loading"><span></span><span></span><span></span></div>}
                    </div>
                    <div id="chat-footer">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder={t("chatbot.placeholder")}
                        />
                        <button onClick={handleSendMessage}>{t("common.send")}</button>
                    </div>
                </div>
            )}

            {/* 5. Icon nổi luôn hiển thị */}
            <button id="chat-icon-button" onClick={toggleChat}>
                <img src={chatIcon} alt="Chat Icon" />
            </button>
        </>
    );
}

export default Chatbot;