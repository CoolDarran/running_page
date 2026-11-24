import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';

const NotFoundPage = () => {
  return (
    <Layout>
      <div className="space-y-3 py-8">
        <h1 className="font-mono-num text-5xl font-bold tracking-tight">404</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          页面不存在，可能已被移动或链接有误。
        </p>
        <Link
          to="/"
          className="inline-block text-sm font-medium underline underline-offset-4 hover:opacity-80"
        >
          返回首页
        </Link>
      </div>
    </Layout>
  );
};

export default NotFoundPage;
