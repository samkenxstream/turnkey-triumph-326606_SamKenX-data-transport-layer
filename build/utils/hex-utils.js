"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toHexString = exports.fromHexString = void 0;
const ethers_1 = require("ethers");
const fromHexString = (buf) => {
    if (typeof buf === 'string' && buf.startsWith('0x')) {
        return Buffer.from(buf.slice(2), 'hex');
    }
    return Buffer.from(buf);
};
exports.fromHexString = fromHexString;
const toHexString = (buf) => {
    if (typeof buf === 'number') {
        return ethers_1.BigNumber.from(buf).toHexString();
    }
    else {
        return '0x' + exports.fromHexString(buf).toString('hex');
    }
};
exports.toHexString = toHexString;
//# sourceMappingURL=hex-utils.js.map