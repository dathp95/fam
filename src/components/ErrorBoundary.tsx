import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Shows a message instead of a blank screen when rendering fails. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="wrap stack" role="alert">
        <h2>Có lỗi xảy ra</h2>
        <p className="muted">Ứng dụng gặp lỗi khi hiển thị màn hình này. Tiến độ của bạn đã được lưu.</p>
        <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>
          {error.message}
        </pre>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      </div>
    )
  }
}
