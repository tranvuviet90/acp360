import React from 'react';

/**
 * Hàm parse Markdown đơn giản sang React elements không cần thư viện ngoài
 * Hỗ trợ: **bold**, `inline code`, ```code blocks```, lists (- hoặc *), links [text](url)
 * @param {string} text 
 * @returns {React.ReactNode}
 */
export function parseMarkdown(text) {
  if (!text) return "";
  
  // Tách các đoạn code block trước
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const code = part.slice(3, -3);
      // Lấy dòng đầu làm ngôn ngữ nếu có
      const lines = code.split("\n");
      const firstLine = lines[0].trim();
      const isLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
      const codeText = isLang ? lines.slice(1).join("\n") : code;
      
      return (
        <pre key={index} style={{ 
          background: "#1e1e1e", 
          color: "#d4d4d4", 
          padding: "12px", 
          borderRadius: "6px", 
          overflowX: "auto",
          fontFamily: "monospace",
          fontSize: "13px",
          margin: "8px 0"
        }}>
          <code>{codeText}</code>
        </pre>
      );
    }
    
    // Parse inline elements (bold, inline code, lists, links)
    const lines = part.split("\n");
    return (
      <div key={index}>
        {lines.map((line, lIdx) => {
          let cleanLine = line;
          
          // Xử lý list item dạng gạch đầu dòng
          const isBullet = /^\s*[-*+]\s+(.*)/.exec(cleanLine);
          if (isBullet) {
            return (
              <li key={lIdx} style={{ marginLeft: "16px", marginBottom: "4px" }}>
                {renderInlineMarkdown(isBullet[1])}
              </li>
            );
          }
          
          // Xử lý list item dạng số
          const isNum = /^\s*(\d+)\.\s+(.*)/.exec(cleanLine);
          if (isNum) {
            return (
              <div key={lIdx} style={{ marginLeft: "16px", marginBottom: "4px", display: "flex", gap: "6px" }}>
                <span>{isNum[1]}.</span>
                <div>{renderInlineMarkdown(isNum[2])}</div>
              </div>
            );
          }
          
          return (
            <p key={lIdx} style={{ margin: "4px 0", minHeight: "1.2em" }}>
              {renderInlineMarkdown(cleanLine)}
            </p>
          );
        })}
      </div>
    );
  });
}

function renderInlineMarkdown(text) {
  if (!text) return "";
  // Tách theo regex để bắt bold, inline code, và links
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g);
  
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={idx} style={{ 
        background: "#f0f0f0", 
        padding: "2px 4px", 
        borderRadius: "4px", 
        fontFamily: "monospace",
        fontSize: "0.9em",
        color: "#d63384"
      }}>{part.slice(1, -1)}</code>;
    }
    const linkMatch = /^\[(.*?)\]\((.*?)\)$/.exec(part);
    if (linkMatch) {
      return (
        <a 
          key={idx} 
          href={linkMatch[2]} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ color: "#0066cc", textDecoration: "underline" }}
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}
