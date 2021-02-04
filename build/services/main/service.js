"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.L1DataTransportService = void 0;
const level_1 = __importDefault(require("level"));
const service_base_1 = require("@eth-optimism/service-base");
const service_1 = require("../l1-ingestion/service");
const service_2 = require("../server/service");
class L1DataTransportService extends service_base_1.BaseService {
    constructor() {
        super(...arguments);
        this.name = 'L1 Data Transport Service';
        this.state = {};
    }
    async _init() {
        this.state.db = level_1.default(this.options.db);
        await this.state.db.open();
        this.state.l1IngestionService = new service_1.L1IngestionService(Object.assign(Object.assign({}, this.options), { db: this.state.db }));
        this.state.l1TransportServer = new service_2.L1TransportServer(Object.assign(Object.assign({}, this.options), { db: this.state.db }));
        await this.state.l1IngestionService.init();
        await this.state.l1TransportServer.init();
    }
    async _start() {
        await Promise.all([
            this.state.l1IngestionService.start(),
            this.state.l1TransportServer.start(),
        ]);
    }
    async _stop() {
        await Promise.all([
            this.state.l1IngestionService.stop(),
            this.state.l1TransportServer.stop(),
        ]);
        await this.state.db.close();
    }
}
exports.L1DataTransportService = L1DataTransportService;
//# sourceMappingURL=service.js.map