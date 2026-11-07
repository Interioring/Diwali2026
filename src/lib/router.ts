import { useEffect, useState } from "react";

export function navigate(path: string, state?: unknown) {
  window.history.pushState(state ?? null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: state ?? null }));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}
