import { useState, useEffect } from "react";

/**
 * Hook to detect device pointer/hover capabilities
 * Uses CSS media queries to detect fine pointer (mouse) and hover support
 */
export const usePointerCapability = () => {
  const [hasHover, setHasHover] = useState(false);
  const [hasFinePointer, setHasFinePointer] = useState(false);

  useEffect(() => {
    // Check for hover capability
    const hoverQuery = window.matchMedia("(hover: hover)");
    setHasHover(hoverQuery.matches);

    const handleHoverChange = (e: MediaQueryListEvent) => {
      setHasHover(e.matches);
    };

    hoverQuery.addEventListener("change", handleHoverChange);

    // Check for fine pointer (mouse-like) capability
    const pointerQuery = window.matchMedia("(pointer: fine)");
    setHasFinePointer(pointerQuery.matches);

    const handlePointerChange = (e: MediaQueryListEvent) => {
      setHasFinePointer(e.matches);
    };

    pointerQuery.addEventListener("change", handlePointerChange);

    return () => {
      hoverQuery.removeEventListener("change", handleHoverChange);
      pointerQuery.removeEventListener("change", handlePointerChange);
    };
  }, []);

  return {
    hasHover,
    hasFinePointer,
    // Convenience flag for mouse-like interaction
    hasMouseLikePointer: hasHover && hasFinePointer,
  };
};

/**
 * Utility function to detect pointer capability without React hook
 */
export const getPointerCapability = () => {
  if (typeof window === "undefined") {
    return {
      hasHover: false,
      hasFinePointer: false,
      hasMouseLikePointer: false,
    };
  }

  const hasHover = window.matchMedia("(hover: hover)").matches;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;

  return {
    hasHover,
    hasFinePointer,
    hasMouseLikePointer: hasHover && hasFinePointer,
  };
};
