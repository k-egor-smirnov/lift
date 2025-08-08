import React, { useEffect, useState, useCallback } from "react";
import {
  TaskImageService,
  thumbhashToDataUrl,
} from "../../../../shared/infrastructure/services/TaskImageService";
import {
  TodoDatabase,
  TaskImageRecord,
} from "../../../../shared/infrastructure/database/TodoDatabase";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";

interface Props {
  taskId: string;
}

export const TaskImages: React.FC<Props> = ({ taskId }) => {
  const [images, setImages] = useState<TaskImageRecord[]>([]);
  const service = new TaskImageService(new TodoDatabase());

  const load = useCallback(async () => {
    const imgs = await service.getImages(taskId);
    setImages(imgs);
  }, [service, taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    await service.addImages(taskId, Array.from(files));
    await load();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    await handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div onDragOver={handleDragOver} onDrop={handleDrop} className="mt-2">
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        id={`task-image-input-${taskId}`}
      />
      <label
        htmlFor={`task-image-input-${taskId}`}
        className="cursor-pointer text-sm text-blue-600 hover:underline"
      >
        Add images
      </label>
      {images.length > 0 && (
        <PhotoProvider>
          <div className="flex gap-2 flex-wrap mt-2">
            {images.map((img) => {
              const src = thumbhashToDataUrl(img.thumbhash);
              return (
                <PhotoView key={img.id} src={URL.createObjectURL(img.data)}>
                  <img
                    src={src}
                    alt=""
                    className="w-20 h-20 object-cover rounded border"
                  />
                </PhotoView>
              );
            })}
          </div>
        </PhotoProvider>
      )}
    </div>
  );
};
