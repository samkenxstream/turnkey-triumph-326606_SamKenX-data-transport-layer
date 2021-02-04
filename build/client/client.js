"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.L1DataTransportClient = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
class L1DataTransportClient {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }
    async getEnqueueByIndex(index) {
        const response = await node_fetch_1.default(`${this.endpoint}/enqueue/index/${index}`);
        return response.json();
    }
}
exports.L1DataTransportClient = L1DataTransportClient;
//# sourceMappingURL=client.js.map