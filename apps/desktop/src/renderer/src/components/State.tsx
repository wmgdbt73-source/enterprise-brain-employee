import type { DesktopApiError } from '../../../shared/enterprise-brain.js';

export function State({ title, text }: { title: string; text: string }) {
  return (
    <section className="state">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

export function ErrorState({
  error,
  retry
}: {
  error: DesktopApiError;
  retry: () => void;
}) {
  const offline = error.code === 'API_UNAVAILABLE';
  return (
    <section className="state error">
      <p className="eyebrow">RECOVERABLE ERROR</p>
      <h2>{offline ? '无法连接 Employee API' : error.message}</h2>
      <p>
        {offline
          ? 'Desktop 已启动。请启动 Employee API 后重试。'
          : `请求未完成（${error.code}）。请检查输入或当前项目访问范围后重试。`}
      </p>
      <button className="primary" onClick={retry}>
        重试
      </button>
    </section>
  );
}
