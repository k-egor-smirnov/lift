import React, {
  useCallback,
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { CollaborativeTextViewModel } from "../view-models/CollaborativeTextViewModel";

export interface CollaborativeTextEditorHandle {
  readonly flush: () => Promise<void>;
  readonly focus: () => void;
}

export interface CollaborativeTextEditorProps {
  readonly viewModel: CollaborativeTextViewModel;
  readonly label: string;
  readonly placeholder?: string;
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly controlClassName?: string;
  readonly labelClassName?: string;
  readonly retryLabel?: string;
  readonly onKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
}

interface Selection {
  readonly start: number;
  readonly end: number;
  readonly direction: "forward" | "backward" | "none";
}

const readSelection = (
  element: HTMLInputElement | HTMLTextAreaElement
): Selection => ({
  start: element.selectionStart ?? element.value.length,
  end: element.selectionEnd ?? element.value.length,
  direction: element.selectionDirection ?? "none",
});

export const CollaborativeTextEditor = forwardRef<
  CollaborativeTextEditorHandle,
  CollaborativeTextEditorProps
>(function CollaborativeTextEditor(
  {
    viewModel,
    label,
    placeholder,
    autoFocus = false,
    className = "",
    controlClassName = "",
    labelClassName = "",
    retryLabel = "Retry",
    onKeyDown,
  },
  forwardedRef
) {
  const snapshot = useSyncExternalStore(
    viewModel.subscribe,
    viewModel.getSnapshot,
    viewModel.getSnapshot
  );
  const controlRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
    null
  );
  const selectionRef = useRef<Selection | null>(null);
  const compositionTextRef = useRef<string | null>(null);
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const value = compositionText ?? snapshot.text;

  const finalizeComposition = useCallback(
    (finalText?: string) => {
      const activeComposition = compositionTextRef.current;
      if (activeComposition === null) return;

      const composedText = finalText ?? activeComposition;
      compositionTextRef.current = null;
      setCompositionText(null);
      viewModel.setText(composedText);
    },
    [viewModel]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      flush: async () => {
        finalizeComposition();
        await viewModel.flush();
      },
      focus: () => controlRef.current?.focus(),
    }),
    [finalizeComposition, viewModel]
  );

  useEffect(() => {
    if (!autoFocus) return;
    controlRef.current?.focus();
  }, [autoFocus]);

  useLayoutEffect(() => {
    const control = controlRef.current;
    const selection = selectionRef.current;
    if (!control || !selection || document.activeElement !== control) return;
    const end = control.value.length;
    control.setSelectionRange(
      Math.min(selection.start, end),
      Math.min(selection.end, end),
      selection.direction
    );
  }, [value]);

  const rememberSelection = (
    element: HTMLInputElement | HTMLTextAreaElement
  ) => {
    selectionRef.current = readSelection(element);
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    rememberSelection(event.currentTarget);
    if (compositionTextRef.current !== null) {
      compositionTextRef.current = event.currentTarget.value;
      setCompositionText(compositionTextRef.current);
      return;
    }
    viewModel.setText(event.currentTarget.value);
  };

  const sharedProps = {
    id: inputId,
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      controlRef.current = element;
    },
    value,
    placeholder,
    className: controlClassName,
    "aria-invalid": snapshot.error !== null,
    "aria-describedby": snapshot.error ? errorId : undefined,
    "aria-busy": snapshot.saving,
    onChange: handleChange,
    onFocus: () => viewModel.focus(),
    onBlur: (
      event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      rememberSelection(event.currentTarget);
      void viewModel.blur().catch(() => undefined);
    },
    onSelect: (
      event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => rememberSelection(event.currentTarget),
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
        return;
      }
      onKeyDown?.(event);
    },
    onCompositionStart: (
      event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      rememberSelection(event.currentTarget);
      compositionTextRef.current = event.currentTarget.value;
      setCompositionText(compositionTextRef.current);
    },
    onCompositionEnd: (
      event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      const composedText = event.currentTarget.value;
      rememberSelection(event.currentTarget);
      finalizeComposition(composedText);
    },
  };

  return (
    <div className={className} data-collaborative-text-path={snapshot.path}>
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>
      {snapshot.path === "title" ? (
        <input {...sharedProps} type="text" />
      ) : (
        <textarea {...sharedProps} />
      )}
      {snapshot.error && (
        <div id={errorId} role="alert" className="mt-1 text-xs text-red-600">
          <span>{snapshot.error}</span>
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => void viewModel.retry().catch(() => undefined)}
          >
            {retryLabel}
          </button>
        </div>
      )}
    </div>
  );
});
