import type { MouseEvent, ReactNode } from "react";
import { useRouterShimStore } from "./navigation";

interface LinkProps {
  href: string;
  children: ReactNode;
  target?: string;
  rel?: string;
  className?: string;
  onClick?: (e: MouseEvent) => void;
}

export function Link({ href, children, target, rel, className, onClick }: LinkProps) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={target}
      rel={rel ?? (external ? "noopener noreferrer" : undefined)}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (external || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        useRouterShimStore.getState().navigateFn?.(href);
      }}
    >
      {children}
    </a>
  );
}

export default Link;
