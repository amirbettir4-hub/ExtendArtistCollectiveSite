import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-screen">
          <div className="error-screen__card">
            <span className="kicker">Something broke</span>
            <h1>Well that's not supposed to happen.</h1>
            <p>{this.state.message || "Unknown error."}</p>
            <div className="error-screen__actions">
              <button
                className="button"
                onClick={() => {
                  this.setState({ hasError: false, message: "" });
                  window.location.hash = "#/wall/grid";
                }}
              >
                Reload the Wall
              </button>
              <button className="button button--outline" onClick={() => window.location.reload()}>
                Full reload
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}