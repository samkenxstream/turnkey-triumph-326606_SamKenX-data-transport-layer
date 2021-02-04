import { BaseService } from '@eth-optimism/service-base';
export interface L1IngestionServiceOptions {
    db: any;
    addressManager: string;
    confirmations: number;
    l1RpcEndpoint: string;
    pollingInterval: number;
    logsPerPollingInterval: number;
    dangerouslyCatchAllErrors?: boolean;
}
export declare class L1IngestionService extends BaseService<L1IngestionServiceOptions> {
    protected name: string;
    protected defaultOptions: {
        confirmations: number;
        pollingInterval: number;
        logsPerPollingInterval: number;
        dangerouslyCatchAllErrors: boolean;
    };
    private state;
    protected _init(): Promise<void>;
    protected _start(): Promise<void>;
    private _syncEvents;
    private _getContractAddressAtBlock;
    private _handleEventsTransactionEnqueued;
    private _handleEventsSequencerBatchAppended;
    private _handleEventsStateBatchAppended;
}
