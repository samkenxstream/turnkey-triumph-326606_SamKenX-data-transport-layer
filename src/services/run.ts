/* Imports: External */
import * as dotenv from 'dotenv'
import Config from 'bcfg' // TODO: Add some types for bcfg if we get the chance.

/* Imports: Internal */
import { L1DataTransportService } from './main/service'

// TODO: Temporary way to assign defaults. We need to merge service-base#1 so that `null` is
// treated as an empty value and assigns defaults properly.
const orDefault = (val: any, defaultVal: any): any => {
  if (val === undefined || val === null) {
    return defaultVal
  } else {
    return val
  }
}

;(async () => {
  try {
    dotenv.config()

    const config = new Config('data-transport-layer')
    config.load({
      env: true,
      argv: true,
    })

    const service = new L1DataTransportService({
      db: orDefault(config.str('dbPath'), './db'),
      port: orDefault(config.uint('serverPort'), '7878'),
      hostname: orDefault(config.str('serverHostname'), 'localhost'),
      confirmations: orDefault(config.uint('confirmations'), 12),
      l1RpcProvider: config.str('l1RpcEndpoint'),
      addressManager: config.str('addressManager'),
      pollingInterval: orDefault(config.uint('pollingInterval'), 5000),
      logsPerPollingInterval: orDefault(
        config.uint('logsPerPollingInterval'),
        2000
      ),
      dangerouslyCatchAllErrors: orDefault(
        config.bool('dangerouslyCatchAllErrors'),
        false
      ),
      l2RpcProvider: config.str('l2RpcEndpoint'),
      l2ChainId: orDefault(config.uint('l2ChainId'), 69),
      syncFromL1: orDefault(config.bool('syncFromL1'), true),
      syncFromL2: orDefault(config.bool('syncFromL2'), false),
      showUnconfirmedTransactions: orDefault(config.bool('syncFromL2'), false),
      transactionsPerPollingInterval: orDefault(
        config.uint('transactionsPerPollingInterval'),
        1000
      ),
    })

    await service.start()
  } catch (err) {
    console.error(
      `Well, that's that. We ran into a fatal error. Here's the dump. Goodbye!`
    )

    throw err
  }
})()
