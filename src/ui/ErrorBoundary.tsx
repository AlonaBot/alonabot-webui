import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { AdminAPIError } from '../api/client';
import { StatusPage } from '../features/errors/StatusPage';
import { useUI } from '../i18n/UI';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Disclosure } from './Disclosure';

type State = { error: Error | null };

/** 隔离单个页面的渲染错误：外壳与导航保持可用，403 错误自动切换专属无权页，其余显示错误与重试。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error instanceof AdminAPIError && this.state.error.status === 403) {
      return <StatusPage code={403} />;
    }
    if (this.state.error) return <Fallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

function Fallback({ error, onRetry }: { error: Error; onRetry: () => void }): JSX.Element {
  const ui = useUI();
  return <EmptyState tone="error" icon={<TriangleAlert size={22} />} title={ui.pageCrashed}
    description={<Disclosure summary={error.message}><pre style={{ textAlign: 'left', fontSize: 12 }}>{error.stack}</pre></Disclosure>}
    action={<Button variant="primary" onClick={onRetry}>{ui.retry}</Button>} />;
}
