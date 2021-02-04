"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.L1IngestionService = void 0;
const service_base_1 = require("@eth-optimism/service-base");
const providers_1 = require("@ethersproject/providers");
const safe_1 = __importDefault(require("colors/safe"));
const db_1 = require("../../db/db");
const utils_1 = require("../../utils");
const codec_1 = require("./codec");
class L1IngestionService extends service_base_1.BaseService {
    constructor() {
        super(...arguments);
        this.name = 'L1 Ingestion Service';
        this.defaultOptions = {
            confirmations: 12,
            pollingInterval: 5000,
            logsPerPollingInterval: 2000,
            dangerouslyCatchAllErrors: false,
        };
        this.state = {};
    }
    async _init() {
        if (!this.options.db.isOpen()) {
            await this.options.db.open();
        }
        this.state.db = new db_1.TransportDB(this.options.db);
        this.state.l1RpcProvider = new providers_1.JsonRpcProvider(this.options.l1RpcEndpoint);
        this.state.contracts = await utils_1.loadOptimismContracts(this.state.l1RpcProvider, this.options.addressManager);
        this.state.startingL1BlockNumber = (await this.state.contracts.Lib_AddressManager.queryFilter(this.state.contracts.Lib_AddressManager.filters.AddressSet()))[0].blockNumber;
    }
    async _start() {
        while (this.running) {
            try {
                const highestSyncedL1Block = (await this.state.db.getHighestSyncedL1Block()) ||
                    this.state.startingL1BlockNumber;
                const currentL1Block = await this.state.l1RpcProvider.getBlockNumber();
                const targetL1Block = Math.min(highestSyncedL1Block + this.options.logsPerPollingInterval, currentL1Block - this.options.confirmations);
                if (highestSyncedL1Block === targetL1Block) {
                    await utils_1.sleep(this.options.pollingInterval);
                    continue;
                }
                this.logger.info(`Synchronizing events from Layer 1 (Ethereum) from block ${safe_1.default.yellow(`${highestSyncedL1Block}`)} to block ${safe_1.default.yellow(`${targetL1Block}`)}`);
                await this._syncEvents('OVM_CanonicalTransactionChain', 'TransactionEnqueued', this._handleEventsTransactionEnqueued.bind(this), highestSyncedL1Block, targetL1Block);
                await this._syncEvents('OVM_CanonicalTransactionChain', 'SequencerBatchAppended', this._handleEventsSequencerBatchAppended.bind(this), highestSyncedL1Block, targetL1Block);
                await this._syncEvents('OVM_StateCommitmentChain', 'StateBatchAppended', this._handleEventsStateBatchAppended.bind(this), highestSyncedL1Block, targetL1Block);
                await this.state.db.setHighestSyncedL1Block(targetL1Block);
                if (currentL1Block - highestSyncedL1Block <
                    this.options.logsPerPollingInterval) {
                    await utils_1.sleep(this.options.pollingInterval);
                }
            }
            catch (err) {
                if (this.running && this.options.dangerouslyCatchAllErrors) {
                    this.logger.error(`Caught an unhandled error: ${err}`);
                    await utils_1.sleep(this.options.pollingInterval);
                }
                else {
                    throw err;
                }
            }
        }
    }
    async _syncEvents(contractName, eventName, handler, fromL1Block, toL1Block) {
        if (!this.state.contracts[contractName]) {
            throw new Error(`Contract ${contractName} does not exist.`);
        }
        if (!this.state.contracts[contractName].filters[eventName]) {
            throw new Error(`Event ${eventName} does not exist on contract ${contractName}`);
        }
        const addressSetEvents = (await this.state.contracts.Lib_AddressManager.queryFilter(this.state.contracts.Lib_AddressManager.filters.AddressSet(), fromL1Block, toL1Block)).filter((event) => {
            return event.args._name === contractName;
        });
        const eventRanges = [];
        let l1BlockRangeStart = fromL1Block;
        for (const addressSetEvent of addressSetEvents) {
            eventRanges.push({
                address: await this._getContractAddressAtBlock(contractName, addressSetEvent.blockNumber),
                fromBlock: l1BlockRangeStart,
                toBlock: addressSetEvent.blockNumber,
            });
            l1BlockRangeStart = addressSetEvent.blockNumber;
        }
        eventRanges.push({
            address: await this._getContractAddressAtBlock(contractName, toL1Block),
            fromBlock: l1BlockRangeStart,
            toBlock: toL1Block,
        });
        for (const eventRange of eventRanges) {
            const events = await this.state.contracts[contractName]
                .attach(eventRange.address)
                .queryFilter(this.state.contracts[contractName].filters[eventName](), eventRange.fromBlock, eventRange.toBlock);
            if (events.length > 0) {
                const tick = Date.now();
                await handler(events);
                const tock = Date.now();
                this.logger.success(`Processed ${safe_1.default.magenta(`${events.length}`)} ${safe_1.default.cyan(eventName)} events in ${safe_1.default.red(`${tock - tick}ms`)}.`);
            }
        }
    }
    async _getContractAddressAtBlock(contractName, blockNumber) {
        const relevantAddressSetEvents = (await this.state.contracts.Lib_AddressManager.queryFilter(this.state.contracts.Lib_AddressManager.filters.AddressSet())).filter((event) => {
            return (event.args._name === contractName && event.blockNumber < blockNumber);
        });
        if (relevantAddressSetEvents.length > 0) {
            return relevantAddressSetEvents[relevantAddressSetEvents.length - 1].args
                ._newAddress;
        }
        else {
            return utils_1.ZERO_ADDRESS;
        }
    }
    async _handleEventsTransactionEnqueued(events) {
        const enqueueEntries = events.map((event) => {
            return codec_1.parseEventTransactionEnqueued(event);
        });
        await this.state.db.putEnqueueEntries(enqueueEntries);
    }
    async _handleEventsSequencerBatchAppended(events) {
        const gasLimit = await this.state.contracts.OVM_ExecutionManager.getMaxTransactionGasLimit();
        for (const event of events) {
            const eventBlock = await this.state.l1RpcProvider.getBlock(event.blockNumber);
            const batchSubmissionEvent = (await this.state.contracts.OVM_CanonicalTransactionChain.attach(event.address).queryFilter(this.state.contracts.OVM_CanonicalTransactionChain.filters.TransactionBatchAppended(), eventBlock.number, eventBlock.number)).find((foundEvent) => {
                return (foundEvent.transactionHash === event.transactionHash &&
                    foundEvent.logIndex === event.logIndex - 1);
            });
            if (!batchSubmissionEvent) {
                throw new Error(`Well, this really shouldn't happen. A SequencerBatchAppended event doesn't have a corresponding TransactionBatchAppended event.`);
            }
            const { transactionBatchEntry, transactionEntries, } = await codec_1.parseEventSequencerBatchAppended(gasLimit.toNumber(), eventBlock, batchSubmissionEvent, event);
            await this.state.db.putTransactionBatchEntries([transactionBatchEntry]);
            await this.state.db.putTransactionEntries(transactionEntries);
        }
    }
    async _handleEventsStateBatchAppended(events) {
        for (const event of events) {
            const eventBlock = await this.state.l1RpcProvider.getBlock(event.blockNumber);
            const { stateRootBatchEntry, stateRootEntries, } = await codec_1.parseEventStateBatchAppended(eventBlock, event);
            await this.state.db.putStateRootBatchEntries([stateRootBatchEntry]);
            await this.state.db.putStateRootEntries(stateRootEntries);
        }
    }
}
exports.L1IngestionService = L1IngestionService;
//# sourceMappingURL=service.js.map