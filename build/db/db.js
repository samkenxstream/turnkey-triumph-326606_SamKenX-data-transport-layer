"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportDB = void 0;
const ethers_1 = require("ethers");
class TransportDB {
    constructor(db) {
        this.db = db;
    }
    async putEnqueueEntries(entries) {
        if (entries.length === 0) {
            return;
        }
        await this._putBatch(`enqueue:index`, entries);
        await this.db.put(`enqueue:latest`, entries[entries.length - 1].index);
    }
    async putTransactionEntries(entries) {
        if (entries.length === 0) {
            return;
        }
        await this._putBatch(`transaction:index`, entries);
        await this.db.put(`transaction:latest`, entries[entries.length - 1].index);
    }
    async putTransactionBatchEntries(entries) {
        if (entries.length === 0) {
            return;
        }
        await this._putBatch(`batch:transaction:index`, entries);
        await this.db.put(`batch:transaction:latest`, entries[entries.length - 1].index);
    }
    async putStateRootEntries(entries) {
        if (entries.length === 0) {
            return;
        }
        await this._putBatch(`stateroot:index`, entries);
        await this.db.put(`stateroot:latest`, entries[entries.length - 1].index);
    }
    async putStateRootBatchEntries(entries) {
        if (entries.length === 0) {
            return;
        }
        await this._putBatch(`batch:stateroot:index`, entries);
        await this.db.put(`batch:stateroot:latest`, entries[entries.length - 1].index);
    }
    async getEnqueueByIndex(index) {
        return this._get(`enqueue:index`, index);
    }
    async getTransactionByIndex(index) {
        return this._get(`transaction:index`, index);
    }
    async getFullTransactionByIndex(index) {
        const transaction = await this.getTransactionByIndex(index);
        if (transaction === null) {
            return null;
        }
        if (transaction.queueOrigin === 'l1') {
            const enqueue = await this.getEnqueueByIndex(transaction.queueIndex);
            if (enqueue === null) {
                return null;
            }
            return Object.assign(Object.assign({}, transaction), {
                blockNumber: enqueue.blockNumber,
                timestamp: enqueue.timestamp,
                gasLimit: enqueue.gasLimit,
                target: enqueue.target,
                origin: enqueue.origin,
                data: enqueue.data,
            });
        }
        else {
            return transaction;
        }
    }
    async getTransactionsByIndexRange(start, end) {
        return this._values(`transaction:index`, start, end);
    }
    async getFullTransactionsByIndexRange(start, end) {
        const transactions = await this.getTransactionsByIndexRange(start, end);
        if (transactions === null) {
            return null;
        }
        const fullTransactions = [];
        for (const transaction of transactions) {
            if (transaction.queueOrigin === 'l1') {
                const enqueue = await this.getEnqueueByIndex(transaction.queueIndex);
                if (enqueue === null) {
                    return null;
                }
                fullTransactions.push(Object.assign(Object.assign({}, transaction), {
                    blockNumber: enqueue.blockNumber,
                    timestamp: enqueue.timestamp,
                    gasLimit: enqueue.gasLimit,
                    target: enqueue.target,
                    origin: enqueue.origin,
                    data: enqueue.data,
                }));
            }
            else {
                fullTransactions.push(transaction);
            }
        }
        return fullTransactions;
    }
    async getTransactionBatchByIndex(index) {
        return this._get(`batch:transaction:index`, index);
    }
    async getStateRootByIndex(index) {
        return this._get(`stateroot:index`, index);
    }
    async getStateRootsByIndexRange(start, end) {
        return this._values(`stateroot:index`, start, end);
    }
    async getStateRootBatchByIndex(index) {
        return this._get(`batch:stateroot:index`, index);
    }
    async getLatestEnqueue() {
        return this.getEnqueueByIndex(await this.db.get(`enqueue:latest`));
    }
    async getLatestTransaction() {
        return this.getTransactionByIndex(await this.db.get(`transaction:latest`));
    }
    async getLatestFullTransaction() {
        return this.getFullTransactionByIndex(await this.db.get(`transaction:latest`));
    }
    async getLatestTransactionBatch() {
        return this.getTransactionBatchByIndex(await this.db.get(`batch:transaction:latest`));
    }
    async getLatestStateRoot() {
        return this.getStateRootByIndex(await this.db.get(`stateroot:latest`));
    }
    async getLatestStateRootBatch() {
        return this.getStateRootBatchByIndex(await this.db.get(`batch:stateroot:latest`));
    }
    async getHighestSyncedL1Block() {
        try {
            return ethers_1.BigNumber.from(await this.db.get(`synced:highest`)).toNumber();
        }
        catch (err) {
            return null;
        }
    }
    async setHighestSyncedL1Block(block) {
        return this.db.put(`synced:highest`, block);
    }
    async _values(key, start, end) {
        return new Promise((resolve, reject) => {
            const entries = [];
            this.db
                .createValueStream({
                gte: this._makeKey(key, start),
                lt: this._makeKey(key, end),
            })
                .on('data', (transaction) => {
                entries.push(JSON.parse(transaction));
            })
                .on('error', (err) => {
                resolve(null);
            })
                .on('close', () => {
                resolve(entries);
            })
                .on('end', () => {
                resolve(entries);
            });
        });
    }
    async _get(key, index) {
        try {
            return JSON.parse(await this.db.get(this._makeKey(key, index)));
        }
        catch (err) {
            return null;
        }
    }
    async _putBatch(key, elements) {
        return this.db.batch(elements.map((element) => {
            return {
                type: 'put',
                key: this._makeKey(key, element.index),
                value: JSON.stringify(element),
            };
        }));
    }
    _makeKey(key, index) {
        return `${key}:${ethers_1.BigNumber.from(index).toString().padStart(32, '0')}`;
    }
}
exports.TransportDB = TransportDB;
//# sourceMappingURL=db.js.map