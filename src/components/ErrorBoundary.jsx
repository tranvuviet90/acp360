// src/components/ErrorBoundary.jsx
import React from 'react';
import { colors } from '../theme';

/**
 * Error Boundary component — bắt lỗi runtime trong cây component con
 * và hiển thị UI fallback thay vì crash toàn bộ app.
 * 
 * Sử dụng:
 *   <ErrorBoundary fallbackTitle="Lỗi tải module">
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallbackTitle = 'Đã xảy ra lỗi' } = this.props;

      return (
        <div style={{
          padding: '40px 24px',
          textAlign: 'center',
          background: '#fff8f8',
          border: `1px solid ${colors.error || '#D9534F'}`,
          borderRadius: 16,
          margin: '20px auto',
          maxWidth: 560,
        }}>
          {/* Error Icon */}
          <div style={{
            width: 64,
            height: 64,
            margin: '0 auto 16px',
            background: `${colors.error || '#D9534F'}15`,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
          }}>
            ⚠️
          </div>

          <h3 style={{
            margin: '0 0 8px',
            color: colors.error || '#D9534F',
            fontSize: 20,
            fontWeight: 700,
          }}>
            {fallbackTitle}
          </h3>

          <p style={{
            color: colors.textSecondary || '#5A6F72',
            fontSize: 14,
            margin: '0 0 20px',
            lineHeight: 1.5,
          }}>
            Một lỗi không mong muốn đã xảy ra trong module này.
            Vui lòng thử lại hoặc liên hệ quản trị viên nếu lỗi tiếp diễn.
          </p>

          {/* Error details (collapsed) */}
          {this.state.error && (
            <details style={{
              textAlign: 'left',
              margin: '0 0 20px',
              padding: '12px 16px',
              background: '#f8f9fa',
              borderRadius: 8,
              fontSize: 12,
              color: '#666',
              border: '1px solid #e2e8f0',
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#333', marginBottom: 8 }}>
                Chi tiết lỗi kỹ thuật
              </summary>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: 1.4,
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack && (
                  `\n\nComponent Stack:${this.state.errorInfo.componentStack}`
                )}
              </pre>
            </details>
          )}

          <button
            onClick={this.handleRetry}
            style={{
              background: colors.primary || '#466E73',
              color: '#fff',
              border: 'none',
              padding: '10px 28px',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 2px 8px ${colors.primary || '#466E73'}44`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary || '#466E73'}66`;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 2px 8px ${colors.primary || '#466E73'}44`;
            }}
          >
            🔄 Thử lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
