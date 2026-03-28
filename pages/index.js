import { useEffect } from 'react';
import { useRouter } from 'next/router';

// หน้า login ไม่จำเป็นแล้ว — ใช้ FeedConnector extension แทน
// redirect ตรงไปหน้า tool เลย
export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace('/tool'); }, []);
  return null;
}
