// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export interface StorageWrite {
    readonly table: string;
    readonly id: string;
    readonly value: unknown;
}

export interface IStorage {
    createDBIfNeeded(database: string, tables: string[]): Promise<void>;
    get(database: string, table: string, id: string): Promise<any>;
    put(database: string, table: string, id: string, value: any): Promise<boolean>;
    /** Commit all records atomically; reject on failure, resolve only after commit. */
    putMany(database: string, records: readonly StorageWrite[]): Promise<void>;
    delete(database: string, table: string, id: string): Promise<boolean>;
    page(database: string, table: string, page: number): Promise<any[]>;
}
