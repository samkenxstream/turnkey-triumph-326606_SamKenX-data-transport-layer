"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEventSequencerBatchAppended = exports.parseEventStateBatchAppended = exports.parseEventTransactionEnqueued = exports.parseStateRoots = exports.maybeDecodeSequencerBatchTransaction = exports.parseSequencerBatchTransaction = exports.parseSequencerBatchContext = exports.parseNumContexts = void 0;
const core_utils_1 = require("@eth-optimism/core-utils");
const contracts_1 = require("@eth-optimism/contracts");
const ethers_1 = require("ethers");
const parseNumContexts = (calldata) => {
    return ethers_1.BigNumber.from(calldata.slice(12, 15)).toNumber();
};
exports.parseNumContexts = parseNumContexts;
const parseSequencerBatchContext = (calldata, offset) => {
    return {
        numSequencedTransactions: ethers_1.BigNumber.from(calldata.slice(offset, offset + 3)).toNumber(),
        numSubsequentQueueTransactions: ethers_1.BigNumber.from(calldata.slice(offset + 3, offset + 6)).toNumber(),
        timestamp: ethers_1.BigNumber.from(calldata.slice(offset + 6, offset + 11)).toNumber(),
        blockNumber: ethers_1.BigNumber.from(calldata.slice(offset + 11, offset + 16)).toNumber(),
    };
};
exports.parseSequencerBatchContext = parseSequencerBatchContext;
const parseSequencerBatchTransaction = (calldata, offset) => {
    const transactionLength = ethers_1.BigNumber.from(calldata.slice(offset, offset + 3)).toNumber();
    return calldata.slice(offset + 3, offset + 3 + transactionLength);
};
exports.parseSequencerBatchTransaction = parseSequencerBatchTransaction;
const maybeDecodeSequencerBatchTransaction = (transaction) => {
    let decoded = null;
    let type = null;
    try {
        const txType = transaction.slice(0, 1).readUInt8();
        if (txType === core_utils_1.TxType.EIP155) {
            type = 'EIP155';
            decoded = core_utils_1.ctcCoder.eip155TxData.decode(transaction.toString('hex'));
        }
        else if (txType === core_utils_1.TxType.EthSign) {
            type = 'ETH_SIGN';
            decoded = core_utils_1.ctcCoder.ethSignTxData.decode(transaction.toString('hex'));
        }
        else {
            throw new Error(`Unknown sequencer transaction type.`);
        }
    }
    catch (err) {
    }
    return {
        decoded,
        type,
    };
};
exports.maybeDecodeSequencerBatchTransaction = maybeDecodeSequencerBatchTransaction;
const iOVM_StateCommitmentChain = contracts_1.getContractInterface('iOVM_StateCommitmentChain');
const parseStateRoots = (calldata) => {
    return iOVM_StateCommitmentChain.decodeFunctionData('appendStateBatch', calldata)[0];
};
exports.parseStateRoots = parseStateRoots;
const parseEventTransactionEnqueued = (event) => {
    return {
        index: event.args._queueIndex.toNumber(),
        target: event.args._target,
        data: event.args._data,
        gasLimit: event.args._gasLimit.toNumber(),
        origin: event.args._l1TxOrigin,
        blockNumber: event.blockNumber,
        timestamp: event.args._timestamp.toNumber(),
    };
};
exports.parseEventTransactionEnqueued = parseEventTransactionEnqueued;
const parseEventStateBatchAppended = async (eventBlock, event) => {
    const l1Transaction = await event.getTransaction();
    const rawStateRoots = exports.parseStateRoots(l1Transaction.data);
    const stateRootEntries = [];
    for (let i = 0; i < rawStateRoots.length; i++) {
        stateRootEntries.push({
            index: event.args._prevTotalElements.toNumber() + i,
            batchIndex: event.args._batchIndex.toNumber(),
            value: rawStateRoots[i],
        });
    }
    const stateRootBatchEntry = {
        index: event.args._batchIndex.toNumber(),
        blockNumber: eventBlock.number,
        timestamp: eventBlock.timestamp,
        submitter: l1Transaction.from,
        size: event.args._batchSize.toNumber(),
        root: event.args._batchRoot,
        prevTotalElements: event.args._prevTotalElements.toNumber(),
        extraData: event.args._extraData,
        l1TransactionHash: l1Transaction.hash
    };
    return {
        stateRootBatchEntry,
        stateRootEntries,
    };
};
exports.parseEventStateBatchAppended = parseEventStateBatchAppended;
const parseEventSequencerBatchAppended = async (gasLimit, eventBlock, eventA, eventB) => {
    const transactionEntries = [];
    const l1Transaction = await eventA.getTransaction();
    const calldata = core_utils_1.fromHexString(l1Transaction.data);
    const numContexts = exports.parseNumContexts(calldata);
    let transactionIndex = 0;
    let enqueuedCount = 0;
    let nextTxPointer = 15 + 16 * numContexts;
    for (let i = 0; i < numContexts; i++) {
        const contextPointer = 15 + 16 * i;
        const context = exports.parseSequencerBatchContext(calldata, contextPointer);
        for (let j = 0; j < context.numSequencedTransactions; j++) {
            const sequencerTransaction = exports.parseSequencerBatchTransaction(calldata, nextTxPointer);
            const { decoded, type } = exports.maybeDecodeSequencerBatchTransaction(sequencerTransaction);
            transactionEntries.push({
                index: eventA.args._prevTotalElements.toNumber() + transactionIndex,
                batchIndex: eventA.args._batchIndex.toNumber(),
                blockNumber: context.blockNumber,
                timestamp: context.timestamp,
                gasLimit,
                target: '0x4200000000000000000000000000000000000005',
                origin: '0x0000000000000000000000000000000000000000',
                data: core_utils_1.toHexString(sequencerTransaction),
                queueOrigin: 'sequencer',
                type,
                queueIndex: null,
                decoded,
            });
            nextTxPointer += 3 + sequencerTransaction.length;
            transactionIndex++;
        }
        for (let j = 0; j < context.numSubsequentQueueTransactions; j++) {
            const queueIndex = eventB.args._startingQueueIndex.toNumber() + enqueuedCount;
            transactionEntries.push({
                index: eventA.args._prevTotalElements.toNumber() + transactionIndex,
                batchIndex: eventA.args._batchIndex.toNumber(),
                blockNumber: 0,
                timestamp: 0,
                gasLimit: 0,
                target: '0x0000000000000000000000000000000000000000',
                origin: '0x0000000000000000000000000000000000000000',
                data: '0x',
                queueOrigin: 'l1',
                type: 'EIP155',
                queueIndex,
                decoded: null,
            });
            enqueuedCount++;
            transactionIndex++;
        }
    }
    const transactionBatchEntry = {
        index: eventA.args._batchIndex.toNumber(),
        root: eventA.args._batchRoot,
        size: eventA.args._batchSize.toNumber(),
        prevTotalElements: eventA.args._prevTotalElements.toNumber(),
        extraData: eventA.args._extraData,
        blockNumber: ethers_1.BigNumber.from(eventBlock.number).toNumber(),
        timestamp: ethers_1.BigNumber.from(eventBlock.timestamp).toNumber(),
        submitter: l1Transaction.from,
        l1TransactionHash: l1Transaction.hash
    };
    return {
        transactionBatchEntry,
        transactionEntries,
    };
};
exports.parseEventSequencerBatchAppended = parseEventSequencerBatchAppended;
//# sourceMappingURL=codec.js.map