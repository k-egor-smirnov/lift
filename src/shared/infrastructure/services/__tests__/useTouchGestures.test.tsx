import React, { useEffect, useRef } from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { useTouchGestures } from "../useTouchGestures";

beforeAll(() => {
  class FakeTouchEvent extends Event {
    touches: any;
    changedTouches: any;
    targetTouches: any;
    constructor(type: string, params: any = {}) {
      super(type, params);
      this.touches = params.touches || [];
      this.changedTouches = params.changedTouches || [];
      this.targetTouches = params.targetTouches || [];
    }
  }
  // @ts-ignore
  global.TouchEvent = FakeTouchEvent;
});

describe("useTouchGestures", () => {
  const setup = (onTap: () => void) => {
    const TestComponent = () => {
      const ref = useRef<HTMLDivElement>(null);
      const { attachGestures } = useTouchGestures({ onTap });
      useEffect(() => {
        return attachGestures(ref.current);
      }, [attachGestures]);
      return (
        <div ref={ref}>
          <button>Action</button>
          <div data-testid="content">Content</div>
        </div>
      );
    };
    render(<TestComponent />);
  };

  it("ignores taps on interactive elements", () => {
    const onTap = vi.fn();
    setup(onTap);
    const button = screen.getByText("Action");
    fireEvent.touchStart(button, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(button, {
      changedTouches: [{ clientX: 0, clientY: 0 }],
    });
    expect(onTap).not.toHaveBeenCalled();
  });

  it("detects taps on non-interactive elements", () => {
    const onTap = vi.fn();
    setup(onTap);
    const content = screen.getByTestId("content");
    fireEvent.touchStart(content, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 0, clientY: 0 }],
    });
    expect(onTap).toHaveBeenCalled();
  });
});
