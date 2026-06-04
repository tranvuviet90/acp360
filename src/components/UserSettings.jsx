import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { auth, functions } from '../firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { IoSettingsOutline } from 'react-icons/io5';
import { useToast } from './LightboxSwipeOnly';
import LanguageSwitcher from './LanguageSwitcher';

const ALL_ROLES = [
  "admin", "ehs", "ehs committee", "trainer", "manager", "Nhà Ăn",
  "G_Cutting","G_Rolling","G_Finishing","G_Dipping","G_Buffing","G_Graphics",
  "G_QC","A_QC","QC_Management","Kayak","A_Rolling","A_Cosmetics","Planning",
  "Kho VW","WH_SK","WH_FG","WH_EM","WH_AG","Apple","MTN","Paint Blending",
  "Engineering","MFG","Bảo Vệ","Tạp Vụ","Office"
];

export default function UserSettings({ user, onLogout }) {
  const { t } = useI18n();
  const { pushToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'password' | 'role' | null
  const menuRef = useRef(null);

  // Mật khẩu state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  // Quyền state
  const [requestedRole, setRequestedRole] = useState(ALL_ROLES[0]);
  const [isRequestingRole, setIsRequestingRole] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      pushToast(t('login.error.empty'), 'error');
      return;
    }
    setIsUpdatingPass(true);
    try {
      const currentUser = auth.currentUser;
      const credential = EmailAuthProvider.credential(currentUser.email, oldPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      pushToast(t('common.success'), 'success');
      setModalType(null);
      setOldPassword('');
      setNewPassword('');
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        pushToast(t('login.error.invalid'), 'error');
      } else {
        pushToast(error.message, 'error');
      }
    } finally {
      setIsUpdatingPass(false);
    }
  };

  const handleRequestRole = async (e) => {
    e.preventDefault();
    setIsRequestingRole(true);
    try {
      const submitRoleRequest = httpsCallable(functions, 'submitRoleRequest');
      await submitRoleRequest({
        requestedRole,
        currentRole: user.role,
        name: user.name,
        email: user.email
      });
      pushToast(t('settings.requestRole.pending'), 'success');
      setModalType(null);
    } catch (error) {
      console.error(error);
      pushToast(t('common.error'), 'error');
    } finally {
      setIsRequestingRole(false);
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'inherit'
        }}
        title={t('settings.title')}
      >
        <IoSettingsOutline size={24} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          background: 'white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          borderRadius: 8,
          padding: '8px 0',
          minWidth: 200,
          zIndex: 100
        }}>
          <button 
            onClick={() => { setModalType('password'); setIsOpen(false); }}
            style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 14, color: '#333' }}
            onMouseOver={(e) => e.target.style.background = '#f5f5f5'}
            onMouseOut={(e) => e.target.style.background = 'none'}
          >
            {t('settings.changePassword')}
          </button>
          <button 
            onClick={() => { setModalType('role'); setIsOpen(false); }}
            style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 14, color: '#333' }}
            onMouseOver={(e) => e.target.style.background = '#f5f5f5'}
            onMouseOut={(e) => e.target.style.background = 'none'}
          >
            {t('settings.requestRole')}
          </button>
          
          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '6px 0' }} />
          
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 16px' }}>
            <LanguageSwitcher />
          </div>
          
          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '6px 0' }} />
          
          <button 
            onClick={() => { onLogout && onLogout(); setIsOpen(false); }}
            style={{ 
              width: '100%', 
              padding: '10px 16px', 
              background: 'none', 
              border: 'none', 
              textAlign: 'left', 
              cursor: 'pointer', 
              fontSize: 14, 
              color: '#ef4444', 
              fontWeight: '600' 
            }}
            onMouseOver={(e) => e.target.style.background = '#fee2e2'}
            onMouseOut={(e) => e.target.style.background = 'none'}
          >
            {t('logout')}
          </button>
        </div>
      )}

      {/* Modal Change Password */}
      {modalType === 'password' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <form onSubmit={handleChangePassword} style={{ background: 'white', padding: 24, borderRadius: 12, width: '90%', maxWidth: 400 }}>
            <h3 style={{ marginTop: 0, color: '#333' }}>{t('settings.changePassword')}</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: '#555' }}>{t('settings.oldPassword')}</label>
              <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: '#555' }}>{t('settings.newPassword')}</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setModalType(null)} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#e0e0e0', cursor: 'pointer' }}>{t('common.cancel')}</button>
              <button type="submit" disabled={isUpdatingPass} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#E88E2E', color: 'white', fontWeight: 'bold', cursor: 'pointer', opacity: isUpdatingPass ? 0.7 : 1 }}>
                {isUpdatingPass ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Request Role */}
      {modalType === 'role' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <form onSubmit={handleRequestRole} style={{ background: 'white', padding: 24, borderRadius: 12, width: '90%', maxWidth: 400 }}>
            <h3 style={{ marginTop: 0, color: '#333' }}>{t('settings.requestRole')}</h3>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>{t('settings.requestRole.desc')}</p>
            <div style={{ marginBottom: 20 }}>
              <select value={requestedRole} onChange={e => setRequestedRole(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}>
                {ALL_ROLES.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setModalType(null)} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#e0e0e0', cursor: 'pointer' }}>{t('common.cancel')}</button>
              <button type="submit" disabled={isRequestingRole} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#10b981', color: 'white', fontWeight: 'bold', cursor: 'pointer', opacity: isRequestingRole ? 0.7 : 1 }}>
                {isRequestingRole ? t('common.loading') : t('common.send')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
