"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.L1TransportServer = void 0;
const service_base_1 = require("@eth-optimism/service-base");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ethers_1 = require("ethers");
const providers_1 = require("@ethersproject/providers");
const db_1 = require("../../db/db");
class L1TransportServer extends service_base_1.BaseService {
    constructor() {
        super(...arguments);
        this.name = 'L1 Transport Server';
        this.defaultOptions = {
            port: 7878,
        };
        this.state = {};
    }
    async _init() {
        if (!this.options.db.isOpen()) {
            await this.options.db.open();
        }
        this.state.db = new db_1.TransportDB(this.options.db);
        this.state.l1RpcProvider = new providers_1.JsonRpcProvider(this.options.l1RpcEndpoint);
        this.state.app = express_1.default();
        this.state.app.use(cors_1.default());
        this.state.app.get('/eth/context/latest', async (req, res) => {
            try {
                const blockNumber = (await this.state.l1RpcProvider.getBlockNumber()) -
                    this.options.confirmations;
                const timestamp = (await this.state.l1RpcProvider.getBlock(blockNumber))
                    .timestamp;
                res.json({
                    blockNumber,
                    timestamp,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/enqueue/latest', async (req, res) => {
            try {
                const enqueue = await this.state.db.getLatestEnqueue();
                if (enqueue === null) {
                    return res.json(null);
                }
                res.json(enqueue);
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/enqueue/index/:index', async (req, res) => {
            const index = ethers_1.BigNumber.from(req.params.index).toNumber();
            try {
                const enqueue = await this.state.db.getEnqueueByIndex(index);
                if (enqueue === null) {
                    return res.json(null);
                }
                res.json(enqueue);
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/transaction/latest', async (req, res) => {
            try {
                const transaction = await this.state.db.getLatestFullTransaction();
                if (transaction === null) {
                    return res.json({
                        transaction: null,
                        batch: null,
                    });
                }
                const batch = await this.state.db.getTransactionBatchByIndex(transaction.batchIndex);
                res.json({
                    transaction,
                    batch,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString });
            }
        });
        this.state.app.get('/transaction/index/:index', async (req, res) => {
            const index = ethers_1.BigNumber.from(req.params.index).toNumber();
            try {
                const transaction = await this.state.db.getFullTransactionByIndex(index);
                if (transaction === null) {
                    return res.json({
                        transaction: null,
                        batch: null,
                    });
                }
                const batch = await this.state.db.getTransactionBatchByIndex(transaction.batchIndex);
                res.json({
                    transaction,
                    batch,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/batch/transaction/latest', async (req, res) => {
            try {
                const batch = await this.state.db.getLatestTransactionBatch();
                if (batch === null) {
                    return res.json({
                        batch: null,
                        transactions: [],
                    });
                }
                const transactions = await this.state.db.getFullTransactionsByIndexRange(ethers_1.BigNumber.from(batch.prevTotalElements).toNumber(), ethers_1.BigNumber.from(batch.prevTotalElements).toNumber() +
                    ethers_1.BigNumber.from(batch.size).toNumber());
                if (transactions === null) {
                    return res.json({
                        batch: null,
                        transactions: [],
                    });
                }
                res.json({
                    batch,
                    transactions,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/batch/transaction/index/:index', async (req, res) => {
            const index = ethers_1.BigNumber.from(req.params.index).toNumber();
            try {
                const batch = await this.state.db.getTransactionBatchByIndex(index);
                if (batch === null) {
                    return res.json({
                        batch: null,
                        transactions: [],
                    });
                }
                const transactions = await this.state.db.getFullTransactionsByIndexRange(ethers_1.BigNumber.from(batch.prevTotalElements).toNumber(), ethers_1.BigNumber.from(batch.prevTotalElements).toNumber() +
                    ethers_1.BigNumber.from(batch.size).toNumber());
                if (transactions === null) {
                    return res.json({
                        batch: null,
                        transactions: [],
                    });
                }
                res.json({
                    batch,
                    transactions,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/stateroot/latest', async (req, res) => {
            try {
                const stateRoot = await this.state.db.getLatestStateRoot();
                if (stateRoot === null) {
                    return res.json({
                        stateRoot: null,
                        batch: null,
                    });
                }
                const batch = await this.state.db.getStateRootBatchByIndex(stateRoot.batchIndex);
                res.json({
                    stateRoot,
                    batch,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/stateroot/index/:index', async (req, res) => {
            const index = ethers_1.BigNumber.from(req.params.index).toNumber();
            try {
                const stateRoot = await this.state.db.getStateRootByIndex(index);
                if (stateRoot === null) {
                    return res.json({
                        stateRoot: null,
                        batch: null,
                    });
                }
                const batch = await this.state.db.getStateRootBatchByIndex(stateRoot.batchIndex);
                res.json({
                    stateRoot,
                    batch,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/batch/stateroot/latest', async (req, res) => {
            try {
                const batch = await this.state.db.getLatestStateRootBatch();
                if (batch === null) {
                    res.json({
                        batch: null,
                        stateRoots: [],
                    });
                }
                const stateRoots = await this.state.db.getStateRootsByIndexRange(ethers_1.BigNumber.from(batch.prevTotalElements).toNumber(), ethers_1.BigNumber.from(batch.prevTotalElements).toNumber() +
                    ethers_1.BigNumber.from(batch.size).toNumber());
                res.json({
                    batch,
                    stateRoots,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
        this.state.app.get('/batch/stateroot/index/:index', async (req, res) => {
            const index = ethers_1.BigNumber.from(req.params.index).toNumber();
            try {
                const batch = await this.state.db.getStateRootBatchByIndex(index);
                if (batch === null) {
                    res.json({
                        batch: null,
                        stateRoots: [],
                    });
                }
                const stateRoots = await this.state.db.getStateRootsByIndexRange(ethers_1.BigNumber.from(batch.prevTotalElements).toNumber(), ethers_1.BigNumber.from(batch.prevTotalElements).toNumber() +
                    ethers_1.BigNumber.from(batch.size).toNumber());
                res.json({
                    batch,
                    stateRoots,
                });
            }
            catch (e) {
                res.status(400);
                res.json({ error: e.toString() });
            }
        });
    }
    async _start() {
        this.state.server = this.state.app.listen(this.options.port);
    }
    async _stop() {
        this.state.server.close();
    }
}
exports.L1TransportServer = L1TransportServer;
//# sourceMappingURL=service.js.map