import { ethers } from 'ethers';
export declare type TypedEthersEvent<T> = ethers.Event & {
    args: T;
};
export declare type EventAddressSet = TypedEthersEvent<{
    _name: string;
    _newAddress: string;
}>;
export declare type EventTransactionEnqueued = TypedEthersEvent<{
    _l1TxOrigin: string;
    _target: string;
    _gasLimit: ethers.BigNumber;
    _data: string;
    _queueIndex: ethers.BigNumber;
    _timestamp: ethers.BigNumber;
}>;
export declare type EventTransactionBatchAppended = TypedEthersEvent<{
    _batchIndex: ethers.BigNumber;
    _batchRoot: string;
    _batchSize: ethers.BigNumber;
    _prevTotalElements: ethers.BigNumber;
    _extraData: string;
}>;
export declare type EventStateBatchAppended = TypedEthersEvent<{
    _batchIndex: ethers.BigNumber;
    _batchRoot: string;
    _batchSize: ethers.BigNumber;
    _prevTotalElements: ethers.BigNumber;
    _extraData: string;
}>;
export declare type EventSequencerBatchAppended = TypedEthersEvent<{
    _startingQueueIndex: ethers.BigNumber;
    _numQueueElements: ethers.BigNumber;
    _totalElements: ethers.BigNumber;
}>;
