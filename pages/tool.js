import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
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
  pending:  { bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400',   label: 'รอ' },
  posting:  { bg: 'bg-blue-50',    text: 'text-blue-600',   dot: 'bg-blue-400 animate-pulse', label: 'กำลังโพสต์...' },
  done:     { bg: 'bg-green-50',   text: 'text-green-600',  dot: 'bg-green-500',  label: 'Done' },
  failed:   { bg: 'bg-red-50',     text: 'text-red-600',    dot: 'bg-red-500',    label: 'Failed' },
};

export default function Tool() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const imageHashCache = useRef({}); // cache image hash ต่อ session

  // Auth
  const [token, setToken]   = useState('');
  const [user, setUser]     = useState(null);

  // Pages
  const [pages, setPages]           = useState([]);
  const [selectedPages, setSelected] = useState([]);
  const [activeTab, setActiveTab]   = useState(null);

  // Ad Account
  const [adAccountId, setAdAccountId] = useState('');

  // Post settings
  const [primaryText, setPrimary]   = useState('');
  const [delay, setDelay]           = useState(5);
  const [buttonType, setButtonType] = useState('LEARN_MORE');
  const [saveAsDraft, setSaveDraft] = useState(false);
  const [hidePost, setHide]         = useState(false);
  const [scheduleOn, setScheduleOn] = useState(false);
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
  const [libView, setLibView] = useState('grid'); // 'grid' | 'list'

  // Status
  const [postStatus, setPostStatus] = useState([]);
  const [isPosting, setIsPosting]   = useState(false);

  // ─── Init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = sessionStorage.getItem('fb_long_token');
    if (!t) { router.replace('/'); return; }
    setToken(t);

    // โหลด image library และ ad account จาก localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('fb_image_library') || '[]');
      setImageLibrary(saved);
    } catch {}
    const savedAd = localStorage.getItem('fb_ad_account_id');
    if (savedAd) setAdAccountId(savedAd);

    // ดึงข้อมูลผู้ใช้ + Pages
    fetchUserAndPages(t);
  }, []);

  const fetchUserAndPages = async (t) => {
    try {
      const [uRes, pRes] = await Promise.all([
        fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture.type(large)&access_token=${t}`),
        fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,picture,access_token&limit=100&access_token=${t}`),
      ]);
      const uData = await uRes.json();
      const pData = await pRes.json();

      if (uData.id)  setUser(uData);
      if (pData.data) {
        setPages(pData.data);
      }
    } catch (err) {
      console.error('fetch error', err);
    }
  };

  const handleLogout = () => {
    sessionStorage.clear();
    router.replace('/');
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
    // เก็บเฉพาะ URL จริง (ไม่เก็บ base64 เพราะ localStorage มีขนาดจำกัด)
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

      // แสดงรูป preview พร้อม loading ก่อน
      setImageLibrary(prev => [
        { id: tempId, url: previewUrl, name: file.name, loading: true },
        ...prev
      ]);

      if (!pageToken || !pageId) {
        // ยังไม่มี page token — เก็บแค่ preview ไว้ก่อน
        setImageLibrary(prev => prev.map(i => i.id === tempId ? { ...i, loading: false } : i));
        continue;
      }

      try {
        // อัปโหลดรูปขึ้น Facebook (unpublished)
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
          // ดึง URL จริงจาก Facebook
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
        // ถ้า error ให้แสดง preview ไว้ก่อน
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
  // วิธีนี้ใช้ proxy page บน Vercel ของเราเอง เพื่อให้ Facebook
  // scrape รูป+ชื่อ+คำบรรยายจาก domain ที่เราเป็นเจ้าของได้
  const handlePost = async () => {
    if (selectedPages.length === 0) return alert('กรุณาเลือก Page อย่างน้อย 1 หน้า');
    if (!card.destinationUrl) return alert('กรุณากรอก Destination URL');
    if (!card.imageUrl) return alert('กรุณาเลือกหรือกรอก URL รูปภาพ');
    if (card.imageUrl.startsWith('blob:')) return alert('รูปนี้ยังอัปโหลดไม่สำเร็จ กรุณารอสักครู่');

    if (scheduleOn) {
      if (!scheduleDate) return alert('กรุณาเลือกวันและเวลา');
      const diff = new Date(scheduleDate).getTime() - Date.now();
      if (diff < 10 * 60 * 1000) return alert('ต้องตั้งเวลาล่วงหน้าอย่างน้อย 10 นาที');
      if (diff > 30 * 24 * 60 * 60 * 1000) return alert('ตั้งเวลาล่วงหน้าได้สูงสุด 30 วัน');
    }

    setIsPosting(true);
    setPostStatus(selectedPages.map(p => ({ page: p, status: 'pending', error: '' })));

    // สร้าง proxy URL บน domain ของเรา (fb-carousel-scheduler.vercel.app)
    // Facebook จะ scrape OG tags จากหน้านี้ → ได้รูป+ชื่อ+คำบรรยายที่เราตั้งไว้
    // พอผู้ใช้กดคลิก → redirect ไปหน้าสินค้าจริง
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://fb-carousel-scheduler.vercel.app';
    // ใช้ชื่อ param สั้นๆ เพื่อไม่ให้ Facebook scraper ตาม URL ปลายทาง → ป้องกัน collage
    const proxyUrl = `${base}/p?t=${Date.now()}`
      + `&img=${encodeURIComponent(card.imageUrl)}`
      + `&ti=${encodeURIComponent(card.title || '')}`
      + `&de=${encodeURIComponent(card.displayLinkDescription || '')}`
      + `&r=${encodeURIComponent(card.destinationUrl)}`;

    // Force Facebook scrape proxy URL ก่อนโพสต์ แล้วรอให้ scrape เสร็จ
    try {
      await fetch(`https://graph.facebook.com/v19.0/?id=${encodeURIComponent(proxyUrl)}&scrape=true&access_token=${token}`, {
        method: 'POST',
      });
    } catch {}
    // รอ 3 วินาทีให้ Facebook cache OG data จาก proxy page
    await new Promise(r => setTimeout(r, 3000));

    for (let i = 0; i < selectedPages.length; i++) {
      const page = selectedPages[i];
      if (i > 0 && delay > 0) await new Promise(r => setTimeout(r, delay * 1000));
      setPostStatus(prev => prev.map(s => s.page.id === page.id ? { ...s, status: 'posting' } : s));

      try {
        const postParams = new URLSearchParams();
        postParams.append('message', primaryText);
        postParams.append('link', proxyUrl);
        postParams.append('access_token', page.access_token);

        if (buttonType !== 'NO_BUTTON') {
          postParams.append('call_to_action', JSON.stringify({
            type: buttonType,
            value: { link: proxyUrl },
          }));
        }

        if (scheduleOn && scheduleDate) {
          postParams.append('published', 'false');
          postParams.append('scheduled_publish_time', String(Math.floor(new Date(scheduleDate).getTime() / 1000)));
        } else if (saveAsDraft || hidePost) {
          postParams.append('published', 'false');
        } else {
          postParams.append('published', 'true');
        }

        const postRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}/feed`, {
          method: 'POST', body: postParams,
        });
        const postData = await postRes.json();
        if (!postData.id) throw new Error(postData.error?.message || 'Post failed');

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
        <title>FB Post Scheduler</title>
      </Head>

      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* ══════ LEFT PANEL ══════ */}
        <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-hidden shadow-sm">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">

            {/* ACCOUNT */}
            <div className="section-card">
              <p className="label">Account</p>
              {user ? (
                <div className="flex items-center gap-2.5">
                  <img
                    src={user.picture?.data?.url || `https://graph.facebook.com/${user.id}/picture?type=square`}
                    className="w-9 h-9 rounded-full object-cover border-2 border-teal-200"
                    alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user.id}</p>
                  </div>
                  <div className="w-5 h-5 bg-green-400 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse"/>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-100 rounded animate-pulse mb-1.5"/>
                    <div className="h-2.5 bg-gray-100 rounded animate-pulse w-2/3"/>
                  </div>
                </div>
              )}
            </div>

            {/* FACEBOOK PAGES */}
            <div className="section-card">
              <div className="flex items-center justify-between mb-2">
                <p className="label mb-0">Facebook Pages</p>
                <div className="flex gap-1.5">
                  <button onClick={selectAllPages} className="text-xs text-teal-600 hover:text-teal-700 font-medium">ทั้งหมด</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={clearAllPages} className="text-xs text-gray-400 hover:text-gray-600">ล้าง</button>
                </div>
              </div>

              {pages.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">ไม่พบ Page...</p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {pages.map(page => {
                    const checked = !!selectedPages.find(p => p.id === page.id);
                    return (
                      <label key={page.id} className="flex items-center gap-2.5 cursor-pointer group p-1.5 rounded-lg hover:bg-gray-50 transition">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePage(page)}
                          className="w-4 h-4 rounded accent-teal-500 flex-shrink-0"
                        />
                        <img
                          src={page.picture?.data?.url || `https://graph.facebook.com/${page.id}/picture?type=square`}
                          className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
                          alt=""
                        />
                        <span className="text-sm text-gray-700 truncate">{page.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AD ACCOUNT */}
            <div className="section-card">
              <p className="label">Ad Account</p>
              <input
                type="text"
                value={adAccountId}
                onChange={e => {
                  setAdAccountId(e.target.value);
                  localStorage.setItem('fb_ad_account_id', e.target.value);
                }}
                placeholder="เช่น 703427483646694"
                className="input text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">ดูได้ที่ Facebook Ads Manager → แถบบน</p>
            </div>

            {/* SETTINGS */}
            <div className="section-card">
              <p className="label">Settings</p>

              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Primary Text</p>
                <textarea
                  value={primaryText}
                  onChange={e => setPrimary(e.target.value)}
                  rows={4}
                  placeholder="ข้อความโพสต์..."
                  className="input resize-none text-sm"
                />
              </div>

              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Delay between pages (sec)</p>
                <input
                  type="number"
                  value={delay}
                  onChange={e => setDelay(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  className="input"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Card Button</p>
                <div className="relative">
                  <select
                    value={buttonType}
                    onChange={e => setButtonType(e.target.value)}
                    className="input appearance-none pr-8"
                  >
                    {BUTTON_TYPES.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* OPTIONS */}
            <div className="section-card">
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={saveAsDraft} onChange={e => setSaveDraft(e.target.checked)}
                    className="w-4 h-4 rounded accent-teal-500"/>
                  <span className="text-sm text-gray-700">Save as Draft</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={hidePost} onChange={e => setHide(e.target.checked)}
                    className="w-4 h-4 rounded accent-teal-500"/>
                  <span className="text-sm text-gray-700">Hide Post</span>
                </label>
              </div>

              {/* SCHEDULE */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Schedule</p>
                  <button
                    onClick={() => handleScheduleToggle(!scheduleOn)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${scheduleOn ? 'bg-teal-500' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${scheduleOn ? 'translate-x-5' : ''}`}/>
                  </button>
                </div>
                {scheduleOn && (
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)}
                    className="input text-sm"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Logout */}
          <div className="p-3 border-t border-gray-100">
            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-red-500 py-2 hover:bg-red-50 rounded-lg transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
              ออกจากระบบ
            </button>
          </div>
        </aside>

        {/* ══════ MAIN CONTENT ══════ */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Top Bar: Page Tabs + Post Button */}
          <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-2 overflow-x-auto shadow-sm flex-shrink-0">
            <div className="flex items-center gap-2 flex-1 overflow-x-auto">
              {selectedPages.length === 0 ? (
                <p className="text-sm text-gray-400 italic">เลือก Page จากซ้ายมือ...</p>
              ) : (
                selectedPages.map(page => (
                  <button
                    key={page.id}
                    onClick={() => setActiveTab(page.id)}
                    className={`page-tab flex-shrink-0 ${activeTab === page.id ? 'page-tab-active' : 'page-tab-inactive'}`}
                  >
                    <img
                      src={page.picture?.data?.url || `https://graph.facebook.com/${page.id}/picture?type=square`}
                      className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                      alt=""
                    />
                    <span className="max-w-[100px] truncate">{page.name}</span>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={handlePost}
              disabled={isPosting || selectedPages.length === 0}
              className="btn-primary flex-shrink-0 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPosting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  กำลังโพสต์...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  {scheduleOn ? 'Schedule' : 'Post Now'}
                </>
              )}
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── CARD PREVIEW ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="label mb-3">Card Preview</p>
              <div className="max-w-sm mx-auto border-2 border-teal-400 rounded-xl overflow-hidden shadow-md">
                {/* Preview Image */}
                <div className="relative bg-gray-100 aspect-video flex items-center justify-center overflow-hidden">
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt="card preview"
                      className="w-full h-full object-cover"
                      onError={e => { e.target.style.display='none'; }}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-300">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                      </svg>
                      <p className="text-xs">เลือกรูปจาก Image Library</p>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-teal-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                    Selected
                  </div>
                </div>
                {/* Card Bottom */}
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between border-t border-gray-200">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500 uppercase font-medium truncate">
                      {card.displayLink || 'www.example.com'}
                    </p>
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {card.title || 'Card Title'}
                    </p>
                  </div>
                  {buttonType !== 'NO_BUTTON' && (
                    <button className="ml-2 flex-shrink-0 bg-white border border-gray-300 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-gray-50 transition">
                      {BUTTON_TYPES.find(b => b.value === buttonType)?.label || 'Learn More'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── CARD DETAILS ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="label mb-3">Card Details</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Card Title</p>
                  <input type="text" value={card.title}
                    onChange={e => setCard(c => ({...c, title: e.target.value}))}
                    placeholder="หัวข้อการ์ด..." className="input"/>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Destination URL</p>
                  <input type="url" value={card.destinationUrl}
                    onChange={e => setCard(c => ({...c, destinationUrl: e.target.value}))}
                    placeholder="https://..." className="input"/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Display Link</p>
                    <input type="text" value={card.displayLink}
                      onChange={e => setCard(c => ({...c, displayLink: e.target.value}))}
                      placeholder="www.example.com" className="input"/>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Link Description</p>
                    <input type="text" value={card.displayLinkDescription}
                      onChange={e => setCard(c => ({...c, displayLinkDescription: e.target.value}))}
                      placeholder="คำอธิบาย..." className="input"/>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Image URL (ใส่ URL รูป หรือเลือกจาก Library)</p>
                  <input type="url" value={card.imageUrl}
                    onChange={e => setCard(c => ({...c, imageUrl: e.target.value}))}
                    placeholder="https://example.com/image.jpg" className="input"/>
                </div>
              </div>
            </div>

            {/* ── IMAGE LIBRARY ── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="label mb-0">Image Library ({imageLibrary.length})</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLibView('grid')}
                    className={`p-1.5 rounded ${libView==='grid' ? 'bg-teal-100 text-teal-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/>
                    </svg>
                  </button>
                  <button onClick={() => setLibView('list')}
                    className={`p-1.5 rounded ${libView==='list' ? 'bg-teal-100 text-teal-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                    Upload
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple
                    className="hidden" onChange={handleFileUpload}/>
                </div>
              </div>

              {/* Add by URL */}
              <div className="flex gap-2 mb-3">
                <input
                  type="url"
                  placeholder="วาง URL รูปภาพแล้วกด +"
                  className="input flex-1 text-xs"
                  onKeyDown={e => {
                    if (e.key === 'Enter') { addImageUrl(e.target.value); e.target.value = ''; }
                  }}
                  id="img-url-input"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('img-url-input');
                    if (input?.value) { addImageUrl(input.value); input.value = ''; }
                  }}
                  className="btn-secondary px-3 text-lg font-bold leading-none">
                  +
                </button>
              </div>

              {imageLibrary.length === 0 ? (
                <div className="text-center py-8 text-gray-300">
                  <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <p className="text-sm">ยังไม่มีรูปภาพ</p>
                  <p className="text-xs mt-1">อัปโหลดหรือวาง URL รูปภาพ</p>
                </div>
              ) : libView === 'grid' ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {imageLibrary.map(img => (
                    <div
                      key={img.id}
                      className={`relative group aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition ${card.imageUrl === img.url ? 'border-teal-500 shadow-md' : 'border-transparent hover:border-teal-300'}`}
                      onClick={() => !img.loading && selectImage(img.url)}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover"/>
                      {img.loading && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                          <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                          <span className="text-white text-xs">กำลังอัปโหลด...</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                        <button
                          onClick={e => { e.stopPropagation(); removeImage(img.id); }}
                          className="hidden group-hover:flex w-6 h-6 bg-red-500 rounded-full items-center justify-center text-white"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                      {card.imageUrl === img.url && (
                        <div className="absolute top-1 left-1 w-4 h-4 bg-teal-500 rounded-full flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {imageLibrary.map(img => (
                    <div
                      key={img.id}
                      onClick={() => selectImage(img.url)}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition ${card.imageUrl === img.url ? 'border-teal-400 bg-teal-50' : 'border-gray-100 hover:bg-gray-50'}`}
                    >
                      <img src={img.url} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0"/>
                      <p className="text-xs text-gray-600 truncate flex-1">{img.name || img.url}</p>
                      <button
                        onClick={e => { e.stopPropagation(); removeImage(img.id); }}
                        className="flex-shrink-0 text-gray-300 hover:text-red-500 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>{/* end scrollable */}
        </main>

        {/* ══════ RIGHT STATUS PANEL ══════ */}
        {postStatus.length > 0 && (
          <aside className="w-56 flex-shrink-0 bg-white border-l border-gray-100 flex flex-col shadow-sm">
            <div className="p-3 border-b border-gray-100">
              <p className="label mb-0">สถานะการโพสต์</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {postStatus.map(({ page, status, error }) => {
                const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
                return (
                  <div key={page.id} className={`${s.bg} rounded-lg p-2.5`}>
                    <div className="flex items-center gap-2">
                      <img
                        src={page.picture?.data?.url || `https://graph.facebook.com/${page.id}/picture?type=square`}
                        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                        alt=""
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">{page.name}</p>
                        <p className="text-xs text-gray-500 truncate">{page.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`}/>
                      <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
                    </div>
                    {error && (
                      <p className="text-xs text-red-500 mt-1 leading-tight">{error}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {!isPosting && (
              <div className="p-3 border-t border-gray-100">
                <button onClick={() => setPostStatus([])} className="w-full btn-secondary text-xs">
                  ล้างสถานะ
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
