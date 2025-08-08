import React, { useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageViewerProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  images,
  initialIndex,
  onClose,
}) => {
  const [index, setIndex] = useState(initialIndex);

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <button className="absolute top-4 right-4 text-white" onClick={onClose}>
        <X className="w-6 h-6" />
      </button>
      {images.length > 1 && (
        <>
          <button className="absolute left-4 text-white" onClick={prev}>
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button className="absolute right-4 text-white" onClick={next}>
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}
      <TransformWrapper>
        <TransformComponent>
          <img src={images[index]} className="max-h-[90vh] object-contain" />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
};
