import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { db, functions } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useToast } from './LightboxSwipeOnly';

const ALL_ROLES = [
  "admin", "ehs", "ehs committee", "manager", "Nhà Ăn",
  "G_Cutting","G_Rolling","G_Finishing","G_Dipping","G_Buffing","G_Graphics",
  "G_QC","A_QC","QC_Management","Kayak","A_Rolling","A_Cosmetics","Planning",
  "Kho VW","WH_SK","WH_FG","WH_EM","WH_AG","Apple","MTN","Paint Blending",
  "Engineering","MFG","Bảo Vệ","Tạp Vụ","Office"
];

export default function UserManager({ user, isMobile }) {
  const { t } = useI18n();
  const { pushToast } = useToast();
  
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'requests'
  const [loading, setLoading] = useState(false);
  
  // Tab Users
  const [users, setUsers] = useState([]);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Tab Requests
  const [requests, setRequests] = useState([]);

  // Modals
  const [resetPassModal, setResetPassModal] = useState(null); // UID
  const [newPassword, setNewPassword] = useState('');
  const [roleModal, setRoleModal] = useState(null); // { uid, currentRoles }
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [createAccountModal, setCreateAccountModal] = useState(false);
  const [newAccountData, setNewAccountData] = useState({ name: '', email: '', password: '', role: 'Nhà Ăn', customRole: '' });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const listUsers = httpsCallable(functions, 'listUsers');
      const result = await listUsers();
      setUsers(result.data.users);
    } catch (err) {
      console.error(err);
      pushToast('Lỗi khi tải danh sách người dùng.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'role_requests'), where('status', '==', 'pending'));
      const snap = await getDocs(q);
      const reqs = [];
      snap.forEach(doc => {
        reqs.push({ id: doc.id, ...doc.data() });
      });
      setRequests(reqs);
    } catch (err) {
      console.error(err);
      pushToast('Lỗi khi tải yêu cầu chức vụ.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(); // Luôn load requests khi mount để hiện badge số lượng
    if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'requests') fetchRequests();
  }, [activeTab]);

  const handleAdminAction = async (action, targetUid, data = {}) => {
    if (action === 'delete' && !window.confirm(t('manager.confirm.delete'))) return;
    
    const toastId = pushToast('Đang xử lý...', 'info');
    try {
      const adminUserAction = httpsCallable(functions, 'adminUserAction');
      await adminUserAction({ action, targetUid, data });
      pushToast('Thành công!', 'success');
      
      // Refresh data
      if (['createUser', 'resetPassword', 'changeRole', 'disable', 'enable', 'delete'].includes(action)) {
        setResetPassModal(null);
        setRoleModal(null);
        fetchUsers();
      } else {
        fetchRequests();
      }
    } catch (err) {
      console.error(err);
      pushToast(err.message || 'Có lỗi xảy ra.', 'error');
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(users.length / pageSize);
  const currentUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #eee' };
  const thStyle = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #ccc', background: '#f9f9f9', position: 'sticky', top: 0 };
  const btnStyle = { padding: '4px 8px', margin: '2px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'white' };

  return (
    <div style={{ padding: isMobile ? 10 : 20, maxWidth: 1000, margin: '0 auto', background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginTop: 20 }}>
      <h2 style={{ color: '#222', marginTop: 0, borderBottom: '2px solid #E88E2E', paddingBottom: 10 }}>{t('manager.title')}</h2>
      
      {/* Tabs Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={() => setActiveTab('users')}
            style={{ padding: '8px 16px', background: activeTab === 'users' ? '#E88E2E' : '#f0f0f0', color: activeTab === 'users' ? 'white' : '#333', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}
          >
            {t('manager.tab.users')}
          </button>
          <button 
            onClick={() => setActiveTab('requests')}
            style={{ padding: '8px 16px', background: activeTab === 'requests' ? '#E88E2E' : '#f0f0f0', color: activeTab === 'requests' ? 'white' : '#333', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}
          >
            {t('manager.tab.requests')}
            {requests.length > 0 && <span style={{ background: 'red', color: 'white', borderRadius: 10, padding: '2px 6px', fontSize: 12, marginLeft: 6 }}>{requests.length}</span>}
          </button>
        </div>
        <button
          onClick={() => setCreateAccountModal(true)}
          style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}
        >
          + Tạo tài khoản
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>{t('common.loading')}...</div>}

      {/* Tab: USERS */}
      {!loading && activeTab === 'users' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              Hiển thị: 
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} style={{ marginLeft: 8, padding: 4 }}>
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>Tổng: {users.length} users</div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t('manager.table.email')}</th>
                  <th style={thStyle}>{t('manager.table.name')}</th>
                  <th style={thStyle}>{t('manager.table.role')}</th>
                  <th style={thStyle}>{t('manager.table.status')}</th>
                  <th style={thStyle}>{t('manager.table.action')}</th>
                </tr>
              </thead>
              <tbody>
                {currentUsers.map(u => (
                  <tr key={u.uid} style={{ background: u.disabled ? '#fff0f0' : 'inherit' }}>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>{u.name}</td>
                    <td style={tdStyle}><strong>{u.role}</strong></td>
                    <td style={tdStyle}>
                      <span style={{ color: u.disabled ? 'red' : 'green', fontWeight: 600 }}>
                        {u.disabled ? t('manager.status.disabled') : t('manager.status.active')}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => setResetPassModal(u.uid)} style={{ ...btnStyle, background: '#f59e0b' }}>{t('manager.action.resetPass')}</button>
                      <button onClick={() => { setRoleModal({ uid: u.uid, currentRoles: u.role }); setSelectedRoles(u.role ? (Array.isArray(u.role) ? u.role : [u.role]) : []); }} style={{ ...btnStyle, background: '#3b82f6' }}>{t('manager.action.changeRole')}</button>
                      
                      {u.disabled ? (
                        <button onClick={() => handleAdminAction('enable', u.uid)} style={{ ...btnStyle, background: '#10b981' }}>{t('manager.action.enable')}</button>
                      ) : (
                        <button onClick={() => handleAdminAction('disable', u.uid)} style={{ ...btnStyle, background: '#6b7280' }}>{t('manager.action.disable')}</button>
                      )}
                      
                      <button onClick={() => handleAdminAction('delete', u.uid)} style={{ ...btnStyle, background: '#ef4444' }}>{t('manager.action.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 15 }}>
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}>&lt;</button>
              <span style={{ padding: '4px 10px', fontWeight: 'bold' }}>{currentPage} / {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}>&gt;</button>
            </div>
          )}
        </>
      )}

      {/* Tab: REQUESTS */}
      {!loading && activeTab === 'requests' && (
        <div style={{ overflowX: 'auto' }}>
          {requests.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>Không có yêu cầu nào.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Tên (Email)</th>
                  <th style={thStyle}>Quyền hiện tại</th>
                  <th style={thStyle}>Quyền muốn đổi</th>
                  <th style={thStyle}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id}>
                    <td style={tdStyle}>{req.name} <br/><span style={{ color: '#666', fontSize: 12 }}>{req.email}</span></td>
                    <td style={tdStyle}>{req.currentRole}</td>
                    <td style={tdStyle}><strong style={{ color: '#E88E2E' }}>{req.requestedRole}</strong></td>
                    <td style={tdStyle}>
                      <button onClick={() => handleAdminAction('approveRoleRequest', req.uid, { requestId: req.id, newRole: req.requestedRole })} style={{ ...btnStyle, background: '#10b981' }}>{t('manager.action.approve')}</button>
                      <button onClick={() => handleAdminAction('rejectRoleRequest', req.uid, { requestId: req.id })} style={{ ...btnStyle, background: '#ef4444' }}>{t('manager.action.reject')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* MODALS */}
      {createAccountModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 12, width: '90%', maxWidth: 400 }}>
            <h3>Tạo tài khoản mới</h3>
            
            <p style={{ margin: '10px 0 5px', fontSize: 14, fontWeight: 'bold' }}>Tên hiển thị:</p>
            <input type="text" value={newAccountData.name} onChange={e => setNewAccountData({...newAccountData, name: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="Nhập tên..." />
            
            <p style={{ margin: '10px 0 5px', fontSize: 14, fontWeight: 'bold' }}>Email:</p>
            <input type="email" value={newAccountData.email} onChange={e => setNewAccountData({...newAccountData, email: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="user@example.com" />
            
            <p style={{ margin: '10px 0 5px', fontSize: 14, fontWeight: 'bold' }}>Mật khẩu (≥ 6 ký tự):</p>
            <input type="text" value={newAccountData.password} onChange={e => setNewAccountData({...newAccountData, password: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="Mật khẩu..." />
            
            <p style={{ margin: '10px 0 5px', fontSize: 14, fontWeight: 'bold' }}>Chức vụ:</p>
            <select value={newAccountData.role} onChange={e => setNewAccountData({...newAccountData, role: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}>
              {ALL_ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="Khác (Tạo mới)">Khác (Tạo mới)</option>
            </select>
            
            {newAccountData.role === 'Khác (Tạo mới)' && (
              <div style={{ marginTop: 10 }}>
                <input type="text" value={newAccountData.customRole} onChange={e => setNewAccountData({...newAccountData, customRole: e.target.value})} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="Nhập tên chức vụ mới..." />
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setCreateAccountModal(false)} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Hủy</button>
              <button 
                onClick={() => {
                  const finalRole = newAccountData.role === 'Khác (Tạo mới)' ? newAccountData.customRole : newAccountData.role;
                  handleAdminAction('createUser', null, { 
                    email: newAccountData.email, 
                    password: newAccountData.password, 
                    name: newAccountData.name,
                    role: finalRole 
                  });
                  setCreateAccountModal(false);
                  setNewAccountData({ name: '', email: '', password: '', role: 'Nhà Ăn', customRole: '' });
                }} 
                disabled={!newAccountData.email || newAccountData.password.length < 6 || (newAccountData.role === 'Khác (Tạo mới)' && !newAccountData.customRole)} 
                style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#E88E2E', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Tạo
              </button>
            </div>
          </div>
        </div>
      )}
      {resetPassModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 12, width: '90%', maxWidth: 400 }}>
            <h3>Đặt lại mật khẩu</h3>
            <p>Nhập mật khẩu mới (ít nhất 6 ký tự):</p>
            <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', marginBottom: 20, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setResetPassModal(null)} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Hủy</button>
              <button onClick={() => handleAdminAction('resetPassword', resetPassModal, { newPassword })} disabled={newPassword.length < 6} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#E88E2E', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {roleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 12, width: '90%', maxWidth: 440 }}>
            <h3 style={{ marginTop: 0 }}>Đổi chức vụ</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Chọn một hoặc nhiều chức vụ cho người dùng này:</p>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 8, padding: '8px 0' }}>
              {ALL_ROLES.map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', background: selectedRoles.includes(r) ? '#fff6ea' : 'white' }}>
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(r)}
                    onChange={e => {
                      if (e.target.checked) setSelectedRoles(prev => [...prev, r]);
                      else setSelectedRoles(prev => prev.filter(x => x !== r));
                    }}
                    style={{ width: 16, height: 16, accentColor: '#E88E2E', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14, color: selectedRoles.includes(r) ? '#E88E2E' : '#333', fontWeight: selectedRoles.includes(r) ? 700 : 400 }}>{r}</span>
                </label>
              ))}
            </div>
            {selectedRoles.length > 0 && (
              <p style={{ fontSize: 13, color: '#E88E2E', fontWeight: 600, marginTop: 10, marginBottom: 0 }}>
                Đã chọn ({selectedRoles.length}): {selectedRoles.join(', ')}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button onClick={() => setRoleModal(null)} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Hủy</button>
              <button
                onClick={() => handleAdminAction('changeRole', roleModal.uid, { newRole: selectedRoles.length === 1 ? selectedRoles[0] : selectedRoles.join(', ') })}
                disabled={selectedRoles.length === 0}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#E88E2E', color: 'white', fontWeight: 'bold', cursor: 'pointer', opacity: selectedRoles.length === 0 ? 0.5 : 1 }}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
