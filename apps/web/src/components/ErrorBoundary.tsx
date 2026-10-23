import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-fg">The page hit an unexpected error. Your data is safe — try reloading.</p>
        <button className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg" onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>Back to dashboard</button>
      </div>
    );
  }
}
