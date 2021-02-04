"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadOptimismContracts = exports.loadProxyFromManager = exports.loadContract = void 0;
const ethers_1 = require("ethers");
const contract_defs_1 = require("@eth-optimism/contracts/build/src/contract-defs");
const constants_1 = require("./constants");
const loadContract = (name, address, provider) => {
    return new ethers_1.Contract(address, contract_defs_1.getContractInterface(name), provider);
};
exports.loadContract = loadContract;
const loadProxyFromManager = async (name, proxy, Lib_AddressManager, provider) => {
    const address = await Lib_AddressManager.getAddress(proxy);
    if (address === constants_1.ZERO_ADDRESS) {
        throw new Error(`Lib_AddressManager does not have a record for a contract named: ${proxy}`);
    }
    return exports.loadContract(name, address, provider);
};
exports.loadProxyFromManager = loadProxyFromManager;
const loadOptimismContracts = async (l1RpcProvider, addressManagerAddress, signer) => {
    const Lib_AddressManager = exports.loadContract('Lib_AddressManager', addressManagerAddress, l1RpcProvider);
    const inputs = [
        {
            name: 'OVM_StateCommitmentChain',
            interface: 'iOVM_StateCommitmentChain',
        },
        {
            name: 'OVM_CanonicalTransactionChain',
            interface: 'iOVM_CanonicalTransactionChain',
        },
        {
            name: 'OVM_ExecutionManager',
            interface: 'iOVM_ExecutionManager',
        },
    ];
    const contracts = {};
    for (const input of inputs) {
        contracts[input.name] = await exports.loadProxyFromManager(input.interface, input.name, Lib_AddressManager, l1RpcProvider);
        if (signer) {
            contracts[input.name] = contracts[input.name].connect(signer);
        }
    }
    contracts['Lib_AddressManager'] = Lib_AddressManager;
    return contracts;
};
exports.loadOptimismContracts = loadOptimismContracts;
//# sourceMappingURL=contracts.js.map