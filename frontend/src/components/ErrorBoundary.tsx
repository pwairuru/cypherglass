import { Component, type ReactNode } from "react";

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return <Boundary>{children}</Boundary>;
}

type S = { error: Error | null };

class Boundary extends Component<{ children: ReactNode }, S> {
  state: S = { error: null };

  static getDerivedStateFromError(error: Error): S {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("UI error", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ padding: 24 }}>
          <h1>Something went wrong</h1>
          <p role="alert">The view crashed. Reload or go back.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </main>
      );
    }
    return this.props.children;
  }
}
