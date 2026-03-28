import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

const BUTTON_TYPES = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BOOK_TRAVEL', label: 'Book Now' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'APPLY_NOW', label: 'Apply Now' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'GET_QUOTE', label: 'Get Quote' },
  { value: 'WATCH_MORE', label: 'Watch More' },
  { value: 'NO_BUTTON', label: '(ไม่มีปุ่ม)' },
];

const STATUS_COLORS = {
  pending:  { bg: 'bg-slate-700',    text: 'text-slate-400',   dot: 'bg-slate-500',              label: 'รอ' },
  posting:  { bg: 'bg-blue-900/40',  text: 'text-blue-400',    dot: 'bg-blue-400 animate-pulse',  label: 'กำลังโพสต์...' },
  done:     { bg: 'bg-teal-900/40',  text: 'text-teal-400',    dot: 'bg-teal-400',               label: 'Done' },
  failed:   { bg: 'bg-red-900/40',   text: 'text-red-400',     dot: 'bg-red-500',                label: 'Failed' },
};

// ── FeedConnector Extension Bridge ────────────────────────────────
// ส่งข้อความไปหา FeedConnector extension ผ่าน content script bridge
// extension จะ inject Facebook cookies + Origin: business.facebook.com
// ทำให้โพสต์ link card พร้อม custom picture/name ได้โดยไม่ติด #100
function sendExtensionMessage(message) {
  return new Promise((resolve, reject) => {
    const messageId = Date.now() + Math.random();
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('FeedConnector extension ไม่ตอบสนอง'));
    }, 10000);
    function handler(event) {
      if (event.data?.direction === 'from-content-script' && event.data?.messageId === messageId) {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        const resp = event.data.response;
        if (resp?.success) resolve(resp.data);
        else reject(new Error(resp?.error || 'Extension error'));
      }
    }
    window.addEventListener('message', handler);
    window.postMessage({ direction: 'from-page-script', message, messageId }, '*');
  });
}

export default function Tool() {
  const fileInputRef = useRef(null);
  const imageHashCache = useRef({});

  // Auth via Extension (ไม่ใช้ OAuth แล้ว)
  const [user, setUser]             = useState(null);
  const [extAvailable, setExtAvailable] = useState(false);
  const [extLoading, setExtLoading] = useState(true);  // กำลังเชื่อมต่อ extension
  const [extError, setExtError]     = useState(false); // extension ไม่พร้อม

  // Pages
  const [pages, setPages]             = useState([]);
  const [selectedPages, setSelected]  = useState([]);
  const [activeTab, setActiveTab]     = useState(null);

  // Ad Account
  const [adAccountId, setAdAccountId] = useState('');

  // Post settings
  const [primaryText, setPrimary]     = useState('');
  const [delay, setDelay]             = useState(5);
  const [buttonType, setButtonType]   = useState('LEARN_MORE');
  const [saveAsDraft, setSaveDraft]   = useState(false);
  const [hidePost, setHide]           = useState(false);
  const [scheduleOn, setScheduleOn]   = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Card
  const [card, setCard] = useState({
    title: '',
    destinationUrl: '',
    displayLink: '',
    displayLinkDescription: '',
    imageUrl: '',
  });

  // Image library (stored in localStorage)
  const [imageLibrary, setImageLibrary] = useState([]);
  const [libView, setLibView] = useState('grid');

  // Status
  const [postStatus, setPostStatus] = useState([]);
  const [isPosting, setIsPosting]   = useState(false);

  // ─── Init ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('fb_image_library') || '[]');
      setImageLibrary(saved);
    } catch {}
    const savedAd = localStorage.getItem('fb_ad_account_id');
    if (savedAd) setAdAccountId(savedAd);

    // รอให้ content script inject เสร็จก่อน แล้วค่อย connect
    const t = setTimeout(() => initFromExtension(), 800);
    return () => clearTimeout(t);
  }, []);

  // เชื่อมต่อผ่าน Extension — ไม่ต้องใช้ Facebook OAuth เลย
  // Extension inject session cookie → API ทำงานเหมือนล็อกอิน Meta Business Suite
  const initFromExtension = async () => {
    setExtLoading(true);
    setExtError(false);
    try {
      await sendExtensionMessage({ type: 'PREPARE_COOKIES' });
      setExtAvailable(true);

      const [uData, pData] = await Promise.all([
        sendExtensionMessage({ type: 'FB_API', url: 'https://graph.facebook.com/v19.0/me?fields=id,name,picture.type(large)' }),
        sendExtensionMessage({ type: 'FB_API', url: 'https://graph.facebook.com/v19.0/me/accounts?fields=id,name,picture,access_token&limit=100' }),
      ]);

      if (uData?.id) setUser(uData);
      if (pData?.data) setPages(pData.data);
      else if (pData?.error) throw new Error(pData.error.message);
    } catch (err) {
      console.error('Extension error:', err);
      setExtError(true);
    } finally {
      setExtLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null); setPages([]); setSelected([]);
    initFromExtension();
  };

  // ─── Page Selection ───────────────────────────────────────────────
  const togglePage = (page) => {
    setSelected(prev => {
      const exists = prev.find(p => p.id === page.id);
      const next = exists ? prev.filter(p => p.id !== page.id) : [...prev, page];
      if (next.length > 0 && (!activeTab || !next.find(p => p.id === activeTab)))
        setActiveTab(next[0].id);
      if (next.length === 0) setActiveTab(null);
      return next;
    });
  };

  const selectAllPages = () => {
    setSelected(pages);
    if (pages.length > 0) setActiveTab(pages[0].id);
  };

  const clearAllPages = () => {
    setSelected([]);
    setActiveTab(null);
  };

  // ─── Image Library ────────────────────────────────────────────────
  const saveLibrary = (lib) => {
    setImageLibrary(lib);
    try {
      const urlOnly = lib.filter(i => !i.url.startsWith('data:'));
      localStorage.setItem('fb_image_library', JSON.stringify(urlOnly));
    } catch (e) {
      console.warn('localStorage full, skipping save');
    }
  };

  const addImageUrl = (url) => {
    if (!url || imageLibrary.find(i => i.url === url)) return;
    const newLib = [{ url, id: Date.now() }, ...imageLibrary];
    saveLibrary(newLib);
  };

  const removeImage = (id) => {
    saveLibrary(imageLibrary.filter(i => i.id !== id));
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    const pageToken = pages[0]?.access_token;
    const pageId = pages[0]?.id;

    for (const file of files) {
      const tempId = Date.now() + Math.random();
      const previewUrl = URL.createObjectURL(file);

      setImageLibrary(prev => [
        { id: tempId, url: previewUrl, name: file.name, loading: true },
        ...prev
      ]);

      if (!pageToken || !pageId) {
        setImageLibrary(prev => prev.map(i => i.id === tempId ? { ...i, loading: false } : i));
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('source', file);
        formData.append('published', 'false');
        formData.append('access_token', pageToken);

        const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (uploadData.id) {
          const infoRes = await fetch(
            `https://graph.facebook.com/v19.0/${uploadData.id}?fields=images&access_token=${pageToken}`
          );
          const infoData = await infoRes.json();
          const fbUrl = infoData.images?.[0]?.source;

          if (fbUrl) {
            setImageLibrary(prev => {
              const updated = prev.map(i =>
                i.id === tempId ? { id: tempId, url: fbUrl, name: file.name, fbId: uploadData.id, loading: false } : i
              );
              try {
                const urlOnly = updated.filter(i => !i.loading && !i.url.startsWith('blob:'));
                localStorage.setItem('fb_image_library', JSON.stringify(urlOnly));
              } catch (err) {}
              return updated;
            });
          } else {
            setImageLibrary(prev => prev.map(i => i.id === tempId ? { ...i, loading: false } : i));
          }
        } else {
          throw new Error(uploadData.error?.message || 'Upload failed');
        }
      } catch (err) {
        console.error('Upload error:', err);
        setImageLibrary(prev => prev.map(i =>
          i.id === tempId ? { ...i, loading: false, uploadError: true } : i
        ));
      }
    }
  };

  const selectImage = (url) => {
    setCard(c => ({ ...c, imageUrl: url }));
  };

  // ─── Post / Schedule ──────────────────────────────────────────────
  const handlePost = async () => {
    if (selectedPages.length === 0) return alert('กรุณาเลือก Page อย่างน้อย 1 หน้า');
    if (!card.imageUrl) return alert('กรุณาเลือกหรือกรอก URL รูปภาพ');
    if (card.imageUrl.startsWith('blob:')) return alert('รูปนี้ยังอัปโหลดไม่สำเร็จ กรุณารอสักครู่');
    if (!card.destinationUrl) return alert('กรุณากรอก Destination URL');

    if (scheduleOn) {
      if (!scheduleDate) return alert('กรุณาเลือกวันและเวลา');
      const diff = new Date(scheduleDate).getTime() - Date.now();
      if (diff < 10 * 60 * 1000) return alert('ต้องตั้งเวลาล่วงหน้าอย่างน้อย 10 นาที');
      if (diff > 30 * 24 * 60 * 60 * 1000) return alert('ตั้งเวลาล่วงหน้าได้สูงสุด 30 วัน');
    }

    setIsPosting(true);
    setPostStatus(selectedPages.map(p => ({ page: p, status: 'pending', error: '' })));

    // ─── ลองใช้ FeedConnector extension ก่อน ───────────────────────
    let useExtension = false;
    try {
      await sendExtensionMessage({ type: 'PREPARE_COOKIES' });
      useExtension = true;
    } catch {
      // extension ไม่มี → ใช้ proxy URL fallback
    }

    // ─── Proxy URL (fallback) ─────────────────────────────────────
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const proxyUrl = `${base}/p?${new URLSearchParams({
      img: card.imageUrl,
      ti: card.title || '.',
      de: card.displayLinkDescription || '',
      r: card.destinationUrl,
    }).toString()}`;

    for (let i = 0; i < selectedPages.length; i++) {
      const page = selectedPages[i];
      if (i > 0 && delay > 0) await new Promise(r => setTimeout(r, delay * 1000));
      setPostStatus(prev => prev.map(s => s.page.id === page.id ? { ...s, status: 'posting' } : s));

      try {
        let postData;

        if (useExtension) {
          // ── วิธี 1: Extension cookie approach ───────────────────
          // Facebook เห็น Origin: business.facebook.com → อนุญาต custom picture/name
          // ไม่ใส่ access_token เพราะ extension ใช้ session cookie แทน
          const feedParams = new URLSearchParams();
          feedParams.append('message', primaryText || '');
          feedParams.append('link', card.destinationUrl);
          feedParams.append('picture', card.imageUrl);
          if (card.title) feedParams.append('name', card.title);
          if (card.displayLinkDescription) feedParams.append('description', card.displayLinkDescription);

          if (buttonType && buttonType !== 'NO_BUTTON') {
            feedParams.append('call_to_action', JSON.stringify({
              type: buttonType,
              value: { link: card.destinationUrl },
            }));
          }
          if (scheduleOn && scheduleDate) {
            feedParams.append('published', 'false');
            feedParams.append('scheduled_publish_time', String(Math.floor(new Date(scheduleDate).getTime() / 1000)));
          } else if (saveAsDraft || hidePost) {
            feedParams.append('published', 'false');
          } else {
            feedParams.append('published', 'true');
          }

          postData = await sendExtensionMessage({
            type: 'FB_API',
            url: `https://graph.facebook.com/v19.0/${page.id}/feed`,
            body: feedParams.toString(),
          });

        } else {
          // ── วิธี 2: Proxy URL fallback ───────────────────────────
          try {
            await fetch(
              `https://graph.facebook.com/v19.0/?id=${encodeURIComponent(proxyUrl)}&scrape=true&access_token=${page.access_token}`,
              { method: 'POST' }
            );
          } catch {}

          const feedParams = new URLSearchParams();
          feedParams.append('message', primaryText || '');
          feedParams.append('link', proxyUrl);
          feedParams.append('access_token', page.access_token);

          if (buttonType && buttonType !== 'NO_BUTTON') {
            feedParams.append('call_to_action', JSON.stringify({
              type: buttonType,
              value: { link: card.destinationUrl },
            }));
          }
          if (scheduleOn && scheduleDate) {
            feedParams.append('published', 'false');
            feedParams.append('scheduled_publish_time', String(Math.floor(new Date(scheduleDate).getTime() / 1000)));
          } else if (saveAsDraft || hidePost) {
            feedParams.append('published', 'false');
          } else {
            feedParams.append('published', 'true');
          }

          const res = await fetch(`https://graph.facebook.com/v19.0/${page.id}/feed`, {
            method: 'POST', body: feedParams,
          });
          postData = await res.json();
        }

        if (!postData?.id) throw new Error(postData?.error?.message || 'Post failed');
        setPostStatus(prev => prev.map(s => s.page.id === page.id ? { ...s, status: 'done' } : s));

      } catch (err) {
        setPostStatus(prev => prev.map(s =>
          s.page.id === page.id ? { ...s, status: 'failed', error: err.message } : s
        ));
      }
    }

    setIsPosting(false);
  };

  // ─── Default schedule datetime (now + 30 min) ─────────────────────
  const defaultSchedule = () => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  };

  const handleScheduleToggle = (val) => {
    setScheduleOn(val);
    if (val && !scheduleDate) setScheduleDate(defaultSchedule());
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Bulk Poster</title>
      </Head>

      <style>{`
        body { background: #0f172a; }
        .dark-input {
          width: 100%;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 7px 10px;
          color: #e2e8f0;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s;
        }
        .dark-input::placeholder { color: #475569; }
        .dark-input:focus { border-color: #2dd4bf; }
        .dark-section {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 14px;
        }
        .dark-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          margin-bottom: 8px;
        }
        .toggle-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          width: 40px;
          height: 22px;
          border-radius: 9999px;
          transition: background-color 0.2s;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }
        .toggle-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 9999px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          transition: transform 0.2s;
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {/* ══════ LEFT PANEL (fixed, w-64) ══════ */}
        <aside style={{ width: 256, flexShrink: 0, background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ACCOUNT */}
            <div className="dark-section">
              <p className="dark-label">Account</p>
              {user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src={user.picture?.data?.url || `https://graph.facebook.com/${user.id}/picture?type=square`}
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #2dd4bf', flexShrink: 0 }}
                    alt=""
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user.name}</p>
                    <p style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user.id}</p>
                  </div>
                  <div style={{ width: 20, height: 20, background: '#2dd4bf', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="11" height="11" fill="none" stroke="white" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                </div>
              ) : extLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" stroke="#2dd4bf" strokeWidth="4" style={{ opacity: 0.25 }}/>
                    <path fill="#2dd4bf" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>กำลังเชื่อมต่อ...</span>
                </div>
              ) : extError ? (
                <div>
                  <p style={{ fontSize: 11, color: '#f87171', marginBottom: 8, lineHeight: 1.5 }}>ไม่พบ Extension — ล็อกอิน Facebook ใน Chrome ไว้ก่อน แล้วกด Retry</p>
                  <button onClick={initFromExtension} style={{ width: '100%', background: '#0d9488', color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Retry
                  </button>
                </div>
              ) : null}
            </div>

            {/* FACEBOOK PAGES */}
            <div className="dark-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p className="dark-label" style={{ margin: 0 }}>Facebook Pages</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={selectAllPages} style={{ fontSize: 11, color: '#2dd4bf', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>เลือกทั้งหมด</button>
                  <span style={{ color: '#334155' }}>|</span>
                  <button onClick={clearAllPages} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>ยกเลิกทั้งหมด</button>
                </div>
              </div>

              {pages.length === 0 ? (
                <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '12px 0', margin: 0 }}>ไม่พบ Page...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 176, overflowY: 'auto' }}>
                  {pages.map(page => {
                    const checked = !!selectedPages.find(p => p.id === page.id);
                    return (
                      <label key={page.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 8px', borderRadius: 8, background: checked ? 'rgba(45,212,191,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePage(page)}
                          style={{ width: 14, height: 14, flexShrink: 0, accentColor: '#2dd4bf', cursor: 'pointer' }}
                        />
                        <img
                          src={page.picture?.data?.url || `https://graph.facebook.com/${page.id}/picture?type=square`}
                          style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                          alt=""
                        />
                        <span style={{ fontSize: 12, color: checked ? '#e2e8f0' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SETTINGS */}
            <div className="dark-section">
              <p className="dark-label">Settings</p>

              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4, marginTop: 0 }}>Delay between pages (sec)</p>
                <input
                  type="number"
                  value={delay}
                  onChange={e => setDelay(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  className="dark-input"
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4, marginTop: 0 }}>Card Button</p>
                <div style={{ position: 'relative' }}>
                  <select
                    value={buttonType}
                    onChange={e => setButtonType(e.target.value)}
                    className="dark-input"
                    style={{ appearance: 'none', paddingRight: 28, cursor: 'pointer' }}
                  >
                    {BUTTON_TYPES.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                  <div style={{ pointerEvents: 'none', position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={saveAsDraft} onChange={e => setSaveDraft(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: '#2dd4bf', cursor: 'pointer' }}/>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Save as Draft</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={hidePost} onChange={e => setHide(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: '#2dd4bf', cursor: 'pointer' }}/>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Hide Post</span>
                </label>
              </div>
            </div>

          </div>

          {/* Extension Status */}
          <div style={{ margin: '0 12px 8px', padding: '8px 12px', borderRadius: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, background: extAvailable ? 'rgba(20,184,166,0.12)' : 'rgba(234,179,8,0.10)', color: extAvailable ? '#2dd4bf' : '#fbbf24' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: extAvailable ? '#2dd4bf' : '#fbbf24', animation: extAvailable ? 'none' : 'pulse 1.5s infinite' }}/>
            <span style={{ lineHeight: 1.4 }}>
              {extAvailable ? 'FeedConnector พร้อม' : 'ไม่พบ FeedConnector — ใช้ proxy mode'}
            </span>
          </div>

          {/* Logout */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #334155' }}>
            <button onClick={handleLogout}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: 8, transition: 'color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'none'; }}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
              ออกจากระบบ
            </button>
          </div>
        </aside>

        {/* ══════ MAIN CONTENT ══════ */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Top Bar */}
          <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>Bulk Poster</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: extAvailable ? 'rgba(45,212,191,0.15)' : 'rgba(251,191,36,0.12)', color: extAvailable ? '#2dd4bf' : '#fbbf24', border: `1px solid ${extAvailable ? 'rgba(45,212,191,0.3)' : 'rgba(251,191,36,0.25)'}` }}>
                {extAvailable ? 'Extension ON' : 'Proxy Mode'}
              </span>
            </div>

            {/* Page tabs */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', minWidth: 0 }}>
              {selectedPages.length === 0 ? (
                <p style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', margin: 0, whiteSpace: 'nowrap' }}>เลือก Page จากแผงซ้าย...</p>
              ) : (
                selectedPages.map(page => (
                  <button
                    key={page.id}
                    onClick={() => setActiveTab(page.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: `1px solid ${activeTab === page.id ? '#2dd4bf' : '#334155'}`, background: activeTab === page.id ? 'rgba(45,212,191,0.12)' : 'transparent', color: activeTab === page.id ? '#2dd4bf' : '#94a3b8', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s' }}
                  >
                    <img
                      src={page.picture?.data?.url || `https://graph.facebook.com/${page.id}/picture?type=square`}
                      style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      alt=""
                    />
                    <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{page.name}</span>
                  </button>
                ))
              )}
            </div>

            {/* Schedule toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>Schedule</span>
              <button
                className="toggle-btn"
                onClick={() => handleScheduleToggle(!scheduleOn)}
                style={{ background: scheduleOn ? '#0d9488' : '#334155' }}
              >
                <span className="toggle-knob" style={{ transform: scheduleOn ? 'translateX(18px)' : 'translateX(0)' }}/>
              </button>
              {scheduleOn && (
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="dark-input"
                  style={{ width: 180, fontSize: 12 }}
                />
              )}
            </div>

            {/* Post Now button */}
            <button
              onClick={handlePost}
              disabled={isPosting || selectedPages.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: (isPosting || selectedPages.length === 0) ? '#1e3a3a' : '#0d9488', color: (isPosting || selectedPages.length === 0) ? '#2dd4bf60' : 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (isPosting || selectedPages.length === 0) ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'background 0.15s' }}
            >
              {isPosting ? (
                <>
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}/>
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" style={{ opacity: 0.75 }}/>
                  </svg>
                  กำลังโพสต์...
                </>
              ) : (
                <>
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {scheduleOn ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    )}
                  </svg>
                  {scheduleOn ? 'Schedule' : 'Post Now'}
                </>
              )}
            </button>
          </div>

          {/* Scrollable Right Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── POST MESSAGE ── */}
            <div className="dark-section">
              <p className="dark-label">Post Message</p>
              <textarea
                value={primaryText}
                onChange={e => setPrimary(e.target.value)}
                rows={4}
                placeholder="ข้อความโพสต์..."
                className="dark-input"
                style={{ resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            {/* ── CARD DETAILS ── */}
            <div className="dark-section">
              <p className="dark-label">Card Details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4, marginTop: 0 }}>Destination URL</p>
                  <input type="url" value={card.destinationUrl}
                    onChange={e => setCard(c => ({...c, destinationUrl: e.target.value}))}
                    placeholder="https://..." className="dark-input"/>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4, marginTop: 0 }}>Card Title</p>
                  <input type="text" value={card.title}
                    onChange={e => setCard(c => ({...c, title: e.target.value}))}
                    placeholder="หัวข้อการ์ด..." className="dark-input"/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4, marginTop: 0 }}>Display Link</p>
                    <input type="text" value={card.displayLink}
                      onChange={e => setCard(c => ({...c, displayLink: e.target.value}))}
                      placeholder="www.example.com" className="dark-input"/>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4, marginTop: 0 }}>CTA Description</p>
                    <input type="text" value={card.displayLinkDescription}
                      onChange={e => setCard(c => ({...c, displayLinkDescription: e.target.value}))}
                      placeholder="คำอธิบาย..." className="dark-input"/>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4, marginTop: 0 }}>Image URL</p>
                  <input type="url" value={card.imageUrl}
                    onChange={e => setCard(c => ({...c, imageUrl: e.target.value}))}
                    placeholder="https://example.com/image.jpg" className="dark-input"/>
                </div>
              </div>
            </div>

            {/* ── IMAGE LIBRARY ── */}
            <div className="dark-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p className="dark-label" style={{ margin: 0 }}>Image Library ({imageLibrary.length})</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setLibView('grid')}
                    style={{ padding: '5px', borderRadius: 6, border: 'none', cursor: 'pointer', background: libView === 'grid' ? 'rgba(45,212,191,0.15)' : 'transparent', color: libView === 'grid' ? '#2dd4bf' : '#64748b' }}>
                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/>
                    </svg>
                  </button>
                  <button onClick={() => setLibView('list')}
                    style={{ padding: '5px', borderRadius: 6, border: 'none', cursor: 'pointer', background: libView === 'list' ? 'rgba(45,212,191,0.15)' : 'transparent', color: libView === 'list' ? '#2dd4bf' : '#64748b' }}>
                    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#0d9488', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                    Upload
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple
                    style={{ display: 'none' }} onChange={handleFileUpload}/>
                </div>
              </div>

              {/* Add by URL */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <input
                  type="url"
                  placeholder="วาง URL รูปภาพแล้วกด Enter หรือ +"
                  className="dark-input"
                  style={{ flex: 1, fontSize: 12 }}
                  id="img-url-input"
                  onKeyDown={e => {
                    if (e.key === 'Enter') { addImageUrl(e.target.value); e.target.value = ''; }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('img-url-input');
                    if (input?.value) { addImageUrl(input.value); input.value = ''; }
                  }}
                  style={{ padding: '7px 12px', background: '#1e293b', border: '1px solid #334155', color: '#2dd4bf', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>
                  +
                </button>
              </div>

              {imageLibrary.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#334155' }}>
                  <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: '0 auto 8px', display: 'block' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <p style={{ fontSize: 13, margin: '0 0 4px', color: '#475569' }}>ยังไม่มีรูปภาพ</p>
                  <p style={{ fontSize: 11, margin: 0, color: '#334155' }}>อัปโหลดหรือวาง URL รูปภาพ</p>
                </div>
              ) : libView === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                  {imageLibrary.map(img => (
                    <div
                      key={img.id}
                      style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', cursor: img.loading ? 'default' : 'pointer', border: `2px solid ${card.imageUrl === img.url ? '#2dd4bf' : 'transparent'}`, boxShadow: card.imageUrl === img.url ? '0 0 0 1px #2dd4bf40' : 'none', transition: 'border-color 0.15s' }}
                      onClick={() => !img.loading && selectImage(img.url)}
                    >
                      <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                      {img.loading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite', color: 'white' }}>
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}/>
                            <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" style={{ opacity: 0.75 }}/>
                          </svg>
                          <span style={{ color: 'white', fontSize: 9 }}>อัปโหลด...</span>
                        </div>
                      )}
                      {!img.loading && (
                        <div className="img-overlay" style={{ position: 'absolute', inset: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.35)'; e.currentTarget.querySelector('button').style.display = 'flex'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.querySelector('button').style.display = 'none'; }}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); removeImage(img.id); }}
                            style={{ display: 'none', width: 22, height: 22, background: '#ef4444', borderRadius: '50%', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: 'white' }}
                          >
                            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                      )}
                      {card.imageUrl === img.url && (
                        <div style={{ position: 'absolute', top: 4, left: 4, width: 16, height: 16, background: '#0d9488', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="10" height="10" fill="none" stroke="white" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {imageLibrary.map(img => (
                    <div
                      key={img.id}
                      onClick={() => selectImage(img.url)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${card.imageUrl === img.url ? '#2dd4bf' : '#334155'}`, background: card.imageUrl === img.url ? 'rgba(45,212,191,0.07)' : 'transparent', transition: 'all 0.15s' }}
                    >
                      <img src={img.url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}/>
                      <p style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, margin: 0 }}>{img.name || img.url}</p>
                      <button
                        onClick={e => { e.stopPropagation(); removeImage(img.id); }}
                        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', padding: 4, borderRadius: 4, transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#475569'}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Card Preview */}
              {card.imageUrl && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #334155' }}>
                  <p className="dark-label">Card Preview</p>
                  <div style={{ maxWidth: 340, margin: '0 auto', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
                    <div style={{ position: 'relative', background: '#0f172a', aspectRatio: '1.91/1', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={card.imageUrl}
                        alt="card preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    </div>
                    <div style={{ background: '#242f3d', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 10, color: '#8899a6', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {card.displayLink || 'www.example.com'}
                        </p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {card.title || 'Card Title'}
                        </p>
                        {card.displayLinkDescription && (
                          <p style={{ fontSize: 11, color: '#8899a6', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {card.displayLinkDescription}
                          </p>
                        )}
                      </div>
                      {buttonType !== 'NO_BUTTON' && (
                        <button style={{ flexShrink: 0, background: '#3d4f61', border: '1px solid #4a6278', color: '#e2e8f0', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'default' }}>
                          {BUTTON_TYPES.find(b => b.value === buttonType)?.label || 'Learn More'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>

        {/* ══════ RIGHT STATUS PANEL ══════ */}
        {postStatus.length > 0 && (
          <aside style={{ width: 220, flexShrink: 0, background: '#1e293b', borderLeft: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #334155' }}>
              <p className="dark-label" style={{ margin: 0 }}>สถานะการโพสต์</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {postStatus.map(({ page, status, error }) => {
                const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
                return (
                  <div key={page.id} style={{ padding: '10px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img
                        src={page.picture?.data?.url || `https://graph.facebook.com/${page.id}/picture?type=square`}
                        style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        alt=""
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{page.name}</p>
                        <p style={{ fontSize: 10, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{page.id}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: s.dot.includes('animate') ? '#60a5fa' : s.dot.replace('bg-', '').replace('teal-400', '#2dd4bf').replace('slate-500', '#64748b').replace('red-500', '#ef4444') }} className={s.dot}/>
                      <span style={{ fontSize: 11, fontWeight: 600, color: s.text.includes('teal') ? '#2dd4bf' : s.text.includes('blue') ? '#60a5fa' : s.text.includes('red') ? '#f87171' : '#64748b' }}>{s.label}</span>
                    </div>
                    {error && (
                      <p style={{ fontSize: 10, color: '#f87171', marginTop: 4, lineHeight: 1.4, wordBreak: 'break-word' }}>{error}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {!isPosting && (
              <div style={{ padding: '10px', borderTop: '1px solid #334155' }}>
                <button onClick={() => setPostStatus([])}
                  style={{ width: '100%', padding: '7px', background: 'transparent', border: '1px solid #334155', color: '#64748b', borderRadius: 8, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#475569'; e.currentTarget.style.color = '#94a3b8'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#64748b'; }}
                >
                  ล้างสถานะ
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
        select option { background: #1e293b; color: #e2e8f0; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </>
  );
}
