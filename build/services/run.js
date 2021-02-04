"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const service_1 = require("./main/service");
const main = async () => {
    dotenv.config();
    const service = new service_1.L1DataTransportService({
        db: process.env.L1_TRANSPORT__DB_PATH,
        port: parseInt(process.env.L1_TRANSPORT__SERVER_PORT, 10),
        confirmations: parseInt(process.env.L1_TRANSPORT__CONFIRMATIONS, 10),
        l1RpcEndpoint: process.env.L1_TRANSPORT__L1_RPC_ENDPOINT,
        addressManager: process.env.L1_TRANSPORT__ADDRESS_MANAGER,
        pollingInterval: parseInt(process.env.L1_TRANSPORT__POLLING_INTERVAL, 10),
        logsPerPollingInterval: parseInt(process.env.L1_TRANSPORT__LOGS_PER_POLLING_INTERVAL, 10),
        dangerouslyCatchAllErrors: process.env.L1_TRANSPORT__DANGEROUSLY_CATCH_ALL_ERRORS === 'true',
    });
    await service.start();
};
main();
//# sourceMappingURL=run.js.map