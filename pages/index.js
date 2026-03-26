import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    // ตรวจสอบว่า login อยู่แล้วหรือเปล่า
    const token = sessionStorage.getItem('fb_long_token');
    if (token) {
      router.replace('/tool');
      return;
    }

    // โหลด Facebook JS SDK
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_FB_APP_ID,
        cookie: true,
        xfbml: false,
        version: 'v19.0',
      });
      setSdkReady(true);
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else {
      setSdkReady(true);
    }
  }, []);

  const handleLogin = () => {
    if (!sdkReady || !window.FB) return;
    setLoading(true);

    window.FB.login(
      async (response) => {
        if (response.authResponse) {
          const shortToken = response.authResponse.accessToken;
          const userId = response.authResponse.userID;

          // แลก short token เป็น long-lived token
          try {
            const res = await fetch('/api/exchange-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ shortToken }),
            });
            const data = await res.json();
            const longToken = data.access_token || shortToken;

            sessionStorage.setItem('fb_long_token', longToken);
            sessionStorage.setItem('fb_user_id', userId);
            router.push('/tool');
          } catch {
            sessionStorage.setItem('fb_long_token', shortToken);
            sessionStorage.setItem('fb_user_id', userId);
            router.push('/tool');
          }
        } else {
          setLoading(false);
        }
      },
      {
        scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content,ads_management,ads_read',
      }
    );
  };

  return (
    <>
      <Head>
        <title>FB Post Scheduler</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
          {/* Logo */}
          <div className="w-16 h-16 bg-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-teal-200">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-1">FB Post Scheduler</h1>
          <p className="text-sm text-gray-500 mb-7">ตั้งเวลาโพสต์บน Facebook Page ของคุณได้เลย</p>

          <button
            onClick={handleLogin}
            disabled={loading || !sdkReady}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-xl transition text-sm shadow-lg shadow-blue-200"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            )}
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Facebook'}
          </button>

          {!sdkReady && (
            <p className="text-xs text-gray-400 mt-3">กำลังโหลด Facebook SDK...</p>
          )}

          <p className="text-xs text-gray-400 mt-5 leading-relaxed">
            ระบบจะขอสิทธิ์เข้าถึง Pages ของคุณเพื่อโพสต์และตั้งเวลาโพสต์
          </p>
        </div>
      </div>
    </>
  );
}
