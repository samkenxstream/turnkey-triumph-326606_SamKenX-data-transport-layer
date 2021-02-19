/* Imports: External */
import * as dotenv from 'dotenv'
import Config from 'bcfg' // TODO: Add some types for bcfg if we get the chance.

/* Imports: Internal */
import { L1DataTransportService } from './main/service'
;(async () => {
  try {
    dotenv.config()

    const config = new Config('data-transport-layer')
    config.load({
      env: true,
      argv: true,
    })

    // TODO: Or syntax (||) used here as a temporary way to assign defaults. We need to merge
    // service-base#1 so that `null` is treated as an empty value and assigns defaults properly.
    const service = new L1DataTransportService({
      db: config.str('dbPath') || './db',
      port: config.uint('serverPort') || '7878',
      hostname: config.str('serverHostname') || 'localhost',
      confirmations: config.uint('confirmations') || 12,
      l1RpcProvider: config.str('l1RpcEndpoint'),
      addressManager: config.str('addressManager'),
      pollingInterval: config.uint('pollingInterval') || 5000,
      logsPerPollingInterval: config.uint('logsPerPollingInterval') || 2000,
      dangerouslyCatchAllErrors:
        config.bool('dangerouslyCatchAllErrors') || false,
      l2RpcProvider: config.str('l2RpcEndpoint'),
      l2ChainId: config.uint('l2ChainId') || 69,
      syncFromL1: config.bool('syncFromL1') || true,
      syncFromL2: config.bool('syncFromL2') || false, // Same as above.
      showUnconfirmedTransactions: config.bool('syncFromL2') || false, // Same as above.
      transactionsPerPollingInterval:
        config.uint('transactionsPerPollingInterval') || 1000,
    })

    await service.start()
  } catch (err) {
    console.error(
      `Well, that's that. We ran into a fatal error. Here's the dump. Goodbye!`
    )

    throw err
  }
})()
