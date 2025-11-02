// src/components/Chatbot.jsx
import React, { useState, useEffect, useRef } from 'react';
import './Chatbot.css';
import chatIcon from '../assets/favicon.png'; // <-- 1. Import icon

function Chatbot() {
    // 2. Thêm state để quản lý trạng thái đóng/mở
    const [isOpen, setIsOpen] = useState(false);

    const [messages, setMessages] = useState([{ text: 'Xin chào! Tôi có thể giúp gì cho bạn?', type: 'ai' }]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatBodyRef = useRef(null);

    // Tự động cuộn xuống khi có tin nhắn mới
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    const CLOUD_FUNCTION_URL = 'https://askai-zvblqnzylq-as.a.run.app';

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
            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: inputValue, history: history }),
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();
            setMessages(prev => [...prev, { text: data.response, type: 'ai' }]);
        } catch (error) {
            console.error('Error:', error);
            setMessages(prev => [...prev, { text: 'Rất tiếc, đã có lỗi xảy ra. Vui lòng thử lại.', type: 'ai' }]);
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
                        <h2>Trợ lý ảo</h2>
                        {/* Thêm nút đóng cửa sổ chat */}
                        <button className="close-btn" onClick={toggleChat}>×</button>
                    </div>
                    <div id="chat-body" ref={chatBodyRef}>
                        {messages.map((msg, index) => (
                            <div key={index} className={`message ${msg.type}`}>{msg.text}</div>
                        ))}
                        {isLoading && <div className="message loading"><span></span><span></span><span></span></div>}
                    </div>
                    <div id="chat-footer">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Nhập câu hỏi..."
                        />
                        <button onClick={handleSendMessage}>Gửi</button>
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