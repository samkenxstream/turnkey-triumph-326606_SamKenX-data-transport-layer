import { Contract, Signer } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
export declare const loadContract: (name: string, address: string, provider: JsonRpcProvider) => Contract;
export declare const loadProxyFromManager: (name: string, proxy: string, Lib_AddressManager: Contract, provider: JsonRpcProvider) => Promise<Contract>;
export interface OptimismContracts {
    Lib_AddressManager: Contract;
    OVM_StateCommitmentChain: Contract;
    OVM_CanonicalTransactionChain: Contract;
    OVM_ExecutionManager: Contract;
}
export declare const loadOptimismContracts: (l1RpcProvider: JsonRpcProvider, addressManagerAddress: string, signer?: Signer) => Promise<OptimismContracts>;
