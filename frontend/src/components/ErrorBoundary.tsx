import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { EXPLORER } from "../lib/config";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render and lifecycle throws.
 *
 * Without this, a single bad hook took the entire app down to a blank white
 * page with nothing on screen to say so -- which is indistinguishable from a
 * dead deployment. CORD's whole posture is that the UI never shows a state it
 * cannot justify; a blank page is the worst version of that.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CORD: unrecoverable render error", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">
          Something broke in the interface
        </h1>
        <p className="text-sm opacity-80">
          This is a bug in the app, not a verdict about any grant. Nothing on
          chain has changed. Reload to try again; if it keeps happening, read
          the contract state directly on the explorer.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs">
          {error.message}
        </pre>
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-3 py-1.5"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <a
            className="rounded-lg border border-white/20 px-3 py-1.5"
            href={EXPLORER}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open explorer
          </a>
        </div>
      </div>
    );
  }
}
