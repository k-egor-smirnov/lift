import { inject, injectable } from "tsyringe";
import { Tag } from "../../domain/entities/Tag";
import { TagRepository } from "../../domain/repositories/TagRepository";
import { TodoDatabase, TagRecord } from "../database/TodoDatabase";
import * as tokens from "../di/tokens";

@injectable()
export class TagRepositoryImpl implements TagRepository {
  constructor(
    @inject(tokens.DATABASE_TOKEN) private readonly db: TodoDatabase
  ) {}

  async findAll(): Promise<Tag[]> {
    const records = await this.db.tags.orderBy("name").toArray();
    return records.map((record) => this.mapRecordToEntity(record));
  }

  async findById(id: string): Promise<Tag | null> {
    const record = await this.db.tags.get(id);
    return record ? this.mapRecordToEntity(record) : null;
  }

  async save(tag: Tag): Promise<void> {
    await this.db.tags.put({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.tags.delete(id);
  }

  private mapRecordToEntity(record: TagRecord): Tag {
    return new Tag(
      record.id,
      record.name,
      record.color,
      record.createdAt,
      record.updatedAt
    );
  }
}
