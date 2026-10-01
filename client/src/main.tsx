import { StrictMode, Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";

/** A render error anywhere must never leave a blank screen — show something recoverable in the brand style. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="state" role="alert">
        <h1 className="state__title">Something went wrong</h1>
        <p className="state__msg">ArcTV hit an unexpected problem. Reloading usually fixes it — your library is safe in your account.</p>
        <div className="state__actions">
          <button type="button" className="tvs mbtn" data-variant="filled" onClick={() => location.assign("/")}>
            <span className="mbtn__inner">Reload</span>
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
