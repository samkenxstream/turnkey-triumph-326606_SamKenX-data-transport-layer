import { BaseService } from '@eth-optimism/service-base';
export interface L1TransportServerOptions {
    db: any;
    port: number;
    confirmations: number;
    l1RpcEndpoint: string;
}
export declare class L1TransportServer extends BaseService<L1TransportServerOptions> {
    protected name: string;
    protected defaultOptions: {
        port: number;
    };
    private state;
    protected _init(): Promise<void>;
    protected _start(): Promise<void>;
    protected _stop(): Promise<void>;
}
