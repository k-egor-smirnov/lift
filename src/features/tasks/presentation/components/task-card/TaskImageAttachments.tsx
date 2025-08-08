import React, { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { container } from "tsyringe";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { TaskImageRepository } from "../../../../shared/infrastructure/repositories/TaskImageRepository";
import { TaskImageRecord } from "../../../../shared/infrastructure/database/TodoDatabase";

interface TaskImageAttachmentsProps {
  taskId: string;
}

export const TaskImageAttachments: React.FC<TaskImageAttachmentsProps> = ({
  taskId,
}) => {
  const repo = container.resolve(TaskImageRepository);
  const [images, setImages] = useState<TaskImageRecord[]>([]);

  useEffect(() => {
    repo.getImages(taskId).then(setImages);
  }, [repo, taskId]);

  const onDrop = async (accepted: File[]) => {
    await repo.addImages(taskId, accepted);
    setImages(await repo.getImages(taskId));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  return (
    <div
      {...getRootProps()}
      className={`mt-2 p-2 rounded border text-sm ${
        isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-200"
      }`}
    >
      <input {...getInputProps()} />
      {images.length === 0 && (
        <p className="text-gray-500">Drop images or click to upload</p>
      )}
      {images.length > 0 && (
        <PhotoProvider
          overlayRender={(props) => (
            <div {...props} className="react-photo-view__overlay" />
          )}
        >
          <div className="flex gap-2 flex-wrap">
            {images.map((img) => {
              const url = URL.createObjectURL(img.blob);
              return (
                <PhotoView key={img.id} src={url}>
                  <img
                    src={url}
                    alt=""
                    className="w-20 h-20 object-cover rounded cursor-pointer"
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
