// src/utils/aiAdapter.js
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Call AI Service with Smart Adapter (Google Gemini / OpenAI ChatGPT / Fallback URL)
 * @param {string} prompt 
 * @param {Array} history 
 * @param {string} fallbackUrl 
 * @returns {Promise<{response: string}>}
 */
export async function callAIService(prompt, history = [], fallbackUrl, additionalContext = "") {
  try {
    // 1. Lấy cấu hình AI từ Firestore
    const docRef = doc(db, "settings", "ai_config");
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const config = snap.data();
      const { provider, model, apiKey, systemInstruction, trainedDocs } = config;

      // Kết hợp chỉ dẫn hệ thống với các tài liệu đã huấn luyện để làm tri thức nền
      const DEFAULT_SYSTEM_INSTRUCTION = "Bạn là một nhân viên thuộc bộ phận EHS (An toàn, Sức khỏe và Môi trường) của nhà máy SafeOne. Hãy xưng hô và trả lời một cách tự nhiên, thân thiện và chân thực như một người đồng nghiệp thật sự.\n\n" +
        "Nguyên tắc trả lời:\n" +
        "1. Lối nói ngắn gọn, súc tích, dễ hiểu và đi thẳng vào vấn đề. Tránh dài dòng hoặc quá phức tạp.\n" +
        "2. Sử dụng tiếng Việt lịch sự, thể hiện tinh thần hỗ trợ và trách nhiệm cao về an toàn lao động.\n" +
        "3. Khi trả lời, hãy ưu tiên tuyệt đối dựa trên các thông tin được cung cấp trong phần tài liệu huấn luyện (Knowledge Base) nếu có.\n\n" +
        "Xử lý khi thông tin vượt ngoài phạm vi huấn luyện:\n" +
        "- Nếu câu hỏi của người dùng nằm ngoài các tài liệu đã được huấn luyện hoặc chỉ dẫn an toàn nội bộ:\n" +
        "  * Hãy gợi ý một cách lịch sự rằng họ nên liên hệ trực tiếp với bộ phận EHS của nhà máy để nhận được hướng dẫn chính thức và rõ ràng nhất.\n" +
        "  * Đồng thời, hãy gợi ý thêm rằng trong thời gian chờ đợi phản hồi trực tiếp từ bộ phận EHS, bạn (với vai trò chatbot hỗ trợ) vẫn có thể cung cấp cho họ một số thông tin tham khảo nhanh dựa trên cơ sở dữ liệu AI tổng hợp của mình.";

      let fullSystemInstruction = systemInstruction && systemInstruction.trim() !== "" ? systemInstruction : DEFAULT_SYSTEM_INSTRUCTION;
      if (additionalContext) {
        fullSystemInstruction += "\n\n" + additionalContext;
      }
      if (Array.isArray(trainedDocs) && trainedDocs.length > 0) {
        fullSystemInstruction += "\n\n=== TÀI LIỆU HUẤN LUYỆN KHÁCH HÀNG / KNOWLEDGE BASE ===\n";
        trainedDocs.forEach(d => {
          fullSystemInstruction += `\n[Tài liệu: ${d.name}]\n${d.content}\n[Kết thúc tài liệu: ${d.name}]\n`;
        });
        fullSystemInstruction += "\nBạn hãy sử dụng các thông tin và tài liệu hướng dẫn trên để trả lời các câu hỏi của người dùng một cách chính xác nhất. Nếu thông tin không có trong tài liệu và cũng không có trong chỉ dẫn của bạn, hãy trả lời dựa trên kiến thức chung nhưng phải lịch sự và chuyên nghiệp.";
      }

      // Nếu có đầy đủ API Key và Nhà cung cấp hợp lệ
      if (apiKey && apiKey.trim() !== "" && apiKey !== "MOCKED_SAVED_KEY") {
        if (provider === 'google') {
          // Gọi API chính thức của Google Gemini
          let geminiModel = model || 'gemini-2.5-flash';
          
          // Tự động chuyển đổi các mô hình cũ đã bị Google ngừng hỗ trợ sang mô hình mới hơn
          if (geminiModel === 'gemini-2.0-flash' || geminiModel === 'gemini-1.5-flash') {
            geminiModel = 'gemini-2.5-flash';
          } else if (geminiModel === 'gemini-1.5-pro') {
            geminiModel = 'gemini-2.5-pro';
          }

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

          // Format tin nhắn từ history sang Gemini format
          const contents = history.map(h => ({
            role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
            parts: Array.isArray(h.parts) ? h.parts : [{ text: h.parts?.[0]?.text || h.text || "" }]
          }));

          // Thêm tin nhắn hiện tại vào
          contents.push({
            role: "user",
            parts: [{ text: prompt }]
          });

          const reqBody = { contents };
          if (fullSystemInstruction && fullSystemInstruction.trim() !== "") {
            reqBody.systemInstruction = {
              parts: [{ text: fullSystemInstruction }]
            };
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
          });

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Google API returned ${response.status}: ${errBody}`);
          }

          const resData = await response.json();
          const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return { response: text };
        } else if (provider === 'openai') {
          // Gọi API chính thức của OpenAI
          const openaiModel = model || 'gpt-4o-mini';
          
          // Format tin nhắn từ history sang OpenAI format
          const messages = [];

          // Thêm system instruction ở đầu nếu có
          if (fullSystemInstruction && fullSystemInstruction.trim() !== "") {
            messages.push({
              role: "system",
              content: fullSystemInstruction
            });
          }

          // Thêm lịch sử trò chuyện
          history.forEach(h => {
            messages.push({
              role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
              content: typeof h.text === 'string' ? h.text : (h.parts?.[0]?.text || "")
            });
          });

          // Thêm tin nhắn hiện tại
          messages.push({
            role: "user",
            content: prompt
          });

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: openaiModel,
              messages: messages
            })
          });

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`OpenAI API returned ${response.status}: ${errBody}`);
          }

          const resData = await response.json();
          const text = resData?.choices?.[0]?.message?.content || '';
          return { response: text };
        }
      }
    }
  } catch (error) {
    console.error("Lỗi trong Bộ chuyển đổi AI (Adapter):", error);
    // Nếu có lỗi khi gọi trực tiếp, tự động chuyển về fallback bên dưới
  }

  // 2. Fallback: Nếu không có cấu hình, thiếu API Key, lỗi hoặc không khớp nhà cung cấp
  console.log("Không có cấu hình API Key tùy chỉnh hoặc xảy ra lỗi. Đang sử dụng Fallback Cloud Function:", fallbackUrl);
  
  // Format lịch sử về dạng chuẩn của Cloud Function ban đầu
  const standardHistory = history.map(h => {
    const text = typeof h.text === 'string' ? h.text : (h.parts?.[0]?.text || "");
    const role = h.role === 'model' || h.role === 'assistant' ? 'model' : 'user';
    return {
      role,
      parts: [{ text }]
    };
  });

  const response = await fetch(fallbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: additionalContext ? `${additionalContext}\n\nUser Prompt: ${prompt}` : prompt,
      history: standardHistory
    }),
  });

  if (!response.ok) {
    throw new Error(`Fallback Cloud Function returned ${response.status}`);
  }

  return await response.json();
}
