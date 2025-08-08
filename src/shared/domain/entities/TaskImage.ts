export interface TaskImage {
  id: string;
  taskId: string;
  data: ArrayBuffer;
  thumbhash: string;
  createdAt: Date;
}
