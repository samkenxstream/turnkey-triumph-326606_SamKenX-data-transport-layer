import { BaseService } from '@eth-optimism/service-base';
import { L1IngestionServiceOptions } from '../l1-ingestion/service';
import { L1TransportServerOptions } from '../server/service';
declare type L1DataTransportServiceOptions = L1IngestionServiceOptions & L1TransportServerOptions;
export declare class L1DataTransportService extends BaseService<L1DataTransportServiceOptions> {
    protected name: string;
    private state;
    protected _init(): Promise<void>;
    protected _start(): Promise<void>;
    protected _stop(): Promise<void>;
}
export {};
