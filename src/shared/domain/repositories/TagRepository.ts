import { Tag } from "../entities/Tag";

export interface TagRepository {
  findAll(): Promise<Tag[]>;
  findById(id: string): Promise<Tag | null>;
  save(tag: Tag): Promise<void>;
  delete(id: string): Promise<void>;
}
