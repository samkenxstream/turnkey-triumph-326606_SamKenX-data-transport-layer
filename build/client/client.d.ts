import { EnqueueEntry } from '../types';
export declare class L1DataTransportClient {
    private endpoint;
    constructor(endpoint: string);
    getEnqueueByIndex(index: number): Promise<EnqueueEntry>;
}
