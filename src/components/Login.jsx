import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useI18n } from '../i18n/I18nProvider';

function Login({ setUser }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // States for system initialization form
  const [showInitForm, setShowInitForm] = useState(false);
  const [initName, setInitName] = useState('');
  const [initEmail, setInitEmail] = useState('');
  const [initPassword, setInitPassword] = useState('');
  const [initConfirmPassword, setInitConfirmPassword] = useState('');

  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) { setEmail(rememberedEmail); setRememberMe(true); }

    // Check system initialization (only on local mockup env)
    const checkInit = async () => {
      if (auth.isMock && typeof auth.checkSystemInit === 'function') {
        try {
          const res = await auth.checkSystemInit();
          if (res && res.initialized === false) {
            setShowInitForm(true);
          }
        } catch (e) {
          console.warn("Check system init failed:", e);
        }
      }
    };
    checkInit();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    if (!email || !password) { setError(t('login.error.empty')); setLoading(false); return; }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const appUser = { uid: firebaseUser.uid, email: firebaseUser.email, name: userData.name, role: userData.role };
        if (rememberMe) { localStorage.setItem('rememberedEmail', email); } else { localStorage.removeItem('rememberedEmail'); }
        setUser(appUser);
      } else { throw new Error("User not found."); }
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError(t('login.error.invalid'));
      } else { setError(t('login.error.generic')); console.error("Lỗi đăng nhập:", err); }
    } finally { setLoading(false); }
  };

  const handleInitAdmin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!initName.trim() || !initEmail.trim() || !initPassword || !initConfirmPassword) {
      setError("Vui lòng điền đầy đủ các thông tin yêu cầu.");
      setLoading(false);
      return;
    }

    if (initPassword !== initConfirmPassword) {
      setError("Mật khẩu xác nhận không trùng khớp.");
      setLoading(false);
      return;
    }

    try {
      if (auth.isMock && typeof auth.initAdmin === 'function') {
        await auth.initAdmin(initEmail.trim(), initPassword, initName.trim());
        alert("Khởi tạo tài khoản Admin đầu tiên thành công! Bạn có thể đăng nhập ngay bây giờ.");
        setShowInitForm(false);
        setEmail(initEmail.trim());
        setPassword('');
      } else {
        throw new Error("Môi trường này không hỗ trợ đăng ký admin động.");
      }
    } catch (err) {
      setError(err.message || "Đăng ký admin thất bại");
    } finally {
      setLoading(false);
    }
  };

  if (showInitForm) {
    return (
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', width:'100vw', background:'linear-gradient(135deg, #A9D9D4 0%, #466E73 100%)', padding:'20px', boxSizing:'border-box' }}>
        <form onSubmit={handleInitAdmin} style={{ background:'white', padding:'40px 50px', borderRadius:'16px', boxShadow:'0 10px 30px rgba(0,0,0,0.1)', width:'100%', maxWidth:'450px', textAlign:'center', boxSizing:'border-box' }}>
          <h2 style={{ color:'#222', marginBottom:'10px', fontWeight:'700', fontSize:'26px' }}>Khởi Tạo Hệ Thống</h2>
          <p style={{ color:'#e74c3c', marginBottom:'25px', fontSize:'14px', lineHeight:'1.5', fontWeight:'500', padding:'10px', background:'#fadbd8', borderRadius:'8px' }}>
            Hệ thống chưa có người dùng nào. Vui lòng tạo tài khoản Admin đầu tiên để thiết lập cấu hình.
          </p>
          {error && <p style={{ color:'red', marginBottom:'20px', fontSize:'14px', fontWeight:'500' }}>{error}</p>}
          
          <div style={{ marginBottom:'18px', textAlign:'left' }}>
            <label style={{ display:'block', marginBottom:'6px', color:'#333', fontWeight:'600', fontSize:'14px' }}>Tên người quản trị (Admin Name)</label>
            <input type="text" value={initName} onChange={e => setInitName(e.target.value)} placeholder="Ví dụ: Super Admin" required style={{ width:'100%', padding:'12px 15px', borderRadius:'8px', border:'1px solid #ddd', fontSize:'15px', boxSizing:'border-box' }} />
          </div>

          <div style={{ marginBottom:'18px', textAlign:'left' }}>
            <label style={{ display:'block', marginBottom:'6px', color:'#333', fontWeight:'600', fontSize:'14px' }}>Email Admin</label>
            <input type="email" value={initEmail} onChange={e => setInitEmail(e.target.value)} placeholder="admin@domain.com" required style={{ width:'100%', padding:'12px 15px', borderRadius:'8px', border:'1px solid #ddd', fontSize:'15px', boxSizing:'border-box' }} />
          </div>

          <div style={{ marginBottom:'18px', textAlign:'left' }}>
            <label style={{ display:'block', marginBottom:'6px', color:'#333', fontWeight:'600', fontSize:'14px' }}>Mật khẩu</label>
            <input type="password" value={initPassword} onChange={e => setInitPassword(e.target.value)} required style={{ width:'100%', padding:'12px 15px', borderRadius:'8px', border:'1px solid #ddd', fontSize:'15px', boxSizing:'border-box' }} />
          </div>

          <div style={{ marginBottom:'25px', textAlign:'left' }}>
            <label style={{ display:'block', marginBottom:'6px', color:'#333', fontWeight:'600', fontSize:'14px' }}>Nhập lại mật khẩu</label>
            <input type="password" value={initConfirmPassword} onChange={e => setInitConfirmPassword(e.target.value)} required style={{ width:'100%', padding:'12px 15px', borderRadius:'8px', border:'1px solid #ddd', fontSize:'15px', boxSizing:'border-box' }} />
          </div>

          <button type="submit" disabled={loading} style={{ width:'100%', padding:'15px', borderRadius:'8px', border:'none', background:'#e74c3c', color:'white', fontSize:'16px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(231,76,60,0.3)', opacity: loading ? 0.7 : 1, transition:'all 0.2s ease-in-out' }}>
            {loading ? "Đang đăng ký..." : "Khởi Tạo & Đăng Ký Admin"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', width:'100vw', background:'linear-gradient(135deg, #A9D9D4 0%, #466E73 100%)', padding:'20px', boxSizing:'border-box' }}>
      <form onSubmit={handleLogin} style={{ background:'white', padding:'40px 50px', borderRadius:'16px', boxShadow:'0 10px 30px rgba(0,0,0,0.1)', width:'100%', maxWidth:'400px', textAlign:'center', boxSizing:'border-box' }}>
        <h2 style={{ color:'#222', marginBottom:'10px', fontWeight:'700', fontSize:'28px' }}>{t('login.title')}</h2>
        <p style={{ color:'#555', marginBottom:'30px', fontSize:'16px' }}>{t('login.subtitle')}</p>
        {error && <p style={{ color:'red', marginBottom:'20px' }}>{error}</p>}
        <div style={{ marginBottom:'20px', textAlign:'left' }}>
          <label style={{ display:'block', marginBottom:'8px', color:'#333', fontWeight:'600' }}>{t('login.email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width:'100%', padding:'12px 15px', borderRadius:'8px', border:'1px solid #ddd', fontSize:'16px', boxSizing:'border-box' }} />
        </div>
        <div style={{ marginBottom:'20px', textAlign:'left' }}>
          <label style={{ display:'block', marginBottom:'8px', color:'#333', fontWeight:'600' }}>{t('login.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width:'100%', padding:'12px 15px', borderRadius:'8px', border:'1px solid #ddd', fontSize:'16px', boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px', fontSize:'14px' }}>
          <label style={{ display:'flex', alignItems:'center', color:'#555', cursor:'pointer' }}>
            <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ marginRight:'8px', accentColor:'#466E73' }} />
            {t('login.remember')}
          </label>
          <a href="#" style={{ color:'#466E73', textDecoration:'none', fontWeight:'600' }}
            onClick={e => { e.preventDefault(); alert(t('login.forgot.dev')); }}>
            {t('login.forgot')}
          </a>
        </div>
        <button type="submit" disabled={loading} style={{ width:'100%', padding:'15px', borderRadius:'8px', border:'none', background:'#466E73', color:'white', fontSize:'18px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(70,110,115,0.4)', opacity: loading ? 0.7 : 1 }}>
          {loading ? t('login.logging') : t('login.button')}
        </button>
      </form>
    </div>
  );
}

export default Login;