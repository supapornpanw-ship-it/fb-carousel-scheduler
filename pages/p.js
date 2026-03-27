import Head from 'next/head';
import { useEffect } from 'react';

// หน้านี้ทำหน้าที่ 2 อย่าง:
// 1. ให้ Facebook scrape OG tags (รูป+ชื่อ+คำบรรยาย) ของเราได้
// 2. Redirect ผู้ใช้ไปยัง URL ปลายทางจริง
export async function getServerSideProps({ query }) {
  const { img = '', title = '', desc = '', url = '', t = '' } = query;
  return { props: { img, title, desc, url, t } };
}

export default function ProxyPage({ img, title, desc, url }) {
  useEffect(() => {
    if (url) window.location.href = url;
  }, [url]);

  return (
    <>
      <Head>
        <title>{title || 'Loading...'}</title>
        <meta name="description" content={desc} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:image" content={img} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
      </Head>
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', fontFamily: 'sans-serif', color: '#555'
      }}>
        <p style={{ fontSize: 16 }}>กำลังพาคุณไปยังหน้าสินค้า...</p>
      </div>
    </>
  );
}
