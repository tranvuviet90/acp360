import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

function Login({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      setLoading(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const appUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: userData.name,
            role: userData.role,
        };

        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        setUser(appUser);
      } else {
        throw new Error("Không tìm thấy thông tin người dùng.");
      }

    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Email hoặc mật khẩu không chính xác.');
      } else {
        setError('Đã xảy ra lỗi. Vui lòng thử lại.');
        console.error("Lỗi đăng nhập:", err);
      }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #FFE0CB 0%, #E88E2E 100%)',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <form onSubmit={handleLogin} style={{
        background: 'white',
        padding: '40px 50px',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        boxSizing: 'border-box'
      }}>
        <h2 style={{
          color: '#222',
          marginBottom: '10px',
          fontWeight: '700',
          fontSize: '28px'
        }}>Đăng Nhập</h2>
        <p style={{
            color: '#555',
            marginBottom: '30px',
            fontSize: '16px'
        }}>Chào mừng trở lại!</p>

        {error && <p style={{ color: 'red', marginBottom: '20px' }}>{error}</p>}
        
        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: '#333',
            fontWeight: '600'
          }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 15px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: '#333',
            fontWeight: '600'
          }}>Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 15px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          fontSize: '14px'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', color: '#555', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ marginRight: '8px', accentColor: '#E88E2E' }}
            />
            Ghi nhớ đăng nhập
          </label>
          <a href="#" style={{ color: '#E88E2E', textDecoration: 'none', fontWeight: '600' }} onClick={(e) => { e.preventDefault(); alert("Chức năng khôi phục mật khẩu đang được phát triển."); }}>
            Quên mật khẩu?
          </a>
        </div>
        
        <button type="submit" disabled={loading} style={{
          width: '100%',
          padding: '15px',
          borderRadius: '8px',
          border: 'none',
          background: '#E88E2E',
          color: 'white',
          fontSize: '18px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(232, 142, 46, 0.4)',
          opacity: loading ? 0.7 : 1
        }}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}

export default Login;