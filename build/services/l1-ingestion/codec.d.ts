/// <reference types="node" />
import { EventSequencerBatchAppended, EventStateBatchAppended, EventTransactionBatchAppended, EventTransactionEnqueued, EnqueueEntry, StateRootBatchEntry, StateRootEntry, TransactionBatchEntry, TransactionEntry, DecodedSequencerBatchTransaction } from '../../types';
export interface SequencerBatchContext {
    numSequencedTransactions: number;
    numSubsequentQueueTransactions: number;
    timestamp: number;
    blockNumber: number;
}
export declare const parseNumContexts: (calldata: Buffer) => number;
export declare const parseSequencerBatchContext: (calldata: Buffer, offset: number) => SequencerBatchContext;
export declare const parseSequencerBatchTransaction: (calldata: Buffer, offset: number) => Buffer;
export declare const maybeDecodeSequencerBatchTransaction: (transaction: Buffer) => {
    decoded: DecodedSequencerBatchTransaction | null;
    type: 'EIP155' | 'ETH_SIGN' | null;
};
export declare const parseStateRoots: (calldata: string) => string[];
export declare const parseEventTransactionEnqueued: (event: EventTransactionEnqueued) => EnqueueEntry;
export declare const parseEventStateBatchAppended: (eventBlock: any, event: EventStateBatchAppended) => Promise<{
    stateRootBatchEntry: StateRootBatchEntry;
    stateRootEntries: StateRootEntry[];
}>;
export declare const parseEventSequencerBatchAppended: (gasLimit: number, eventBlock: any, eventA: EventTransactionBatchAppended, eventB: EventSequencerBatchAppended) => Promise<{
    transactionBatchEntry: TransactionBatchEntry;
    transactionEntries: TransactionEntry[];
}>;
