import { EnqueueEntry, StateRootBatchEntry, StateRootEntry, TransactionBatchEntry, TransactionEntry } from './database-types';
export declare type EnqueueResponse = EnqueueEntry;
export interface TransactionResponse {
    batch: TransactionBatchEntry;
    transaction: TransactionEntry;
}
export interface TransactionBatchResponse {
    batch: TransactionBatchEntry;
    transactions: TransactionEntry[];
}
export interface StateRootResponse {
    batch: StateRootBatchEntry;
    stateRoot: StateRootEntry;
}
export interface StateRootBatchResponse {
    batch: StateRootBatchEntry;
    stateRoots: StateRootEntry[];
}
