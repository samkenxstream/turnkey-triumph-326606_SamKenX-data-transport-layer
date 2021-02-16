/* Imports: External */
import * as dotenv from 'dotenv'

/* Imports: Internal */
import { L1DataTransportService } from './main/service'

// TODO: Maybe throw this into its own service instead of doing this here.
;(async () => {
  try {
    dotenv.config()

    const service = new L1DataTransportService({
      db: process.env.DATA_TRANSPORT_LAYER__DB_PATH,
      port: parseInt(process.env.DATA_TRANSPORT_LAYER__SERVER_PORT, 10),
      hostname: process.env.DATA_TRANSPORT_LAYER__SERVER_HOSTNAME,
      confirmations: parseInt(
        process.env.DATA_TRANSPORT_LAYER__CONFIRMATIONS,
        10
      ),
      l1RpcProvider: process.env.DATA_TRANSPORT_LAYER__L1_RPC_ENDPOINT,
      addressManager: process.env.DATA_TRANSPORT_LAYER__ADDRESS_MANAGER,
      pollingInterval: parseInt(
        process.env.DATA_TRANSPORT_LAYER__POLLING_INTERVAL,
        10
      ),
      logsPerPollingInterval: parseInt(
        process.env.DATA_TRANSPORT_LAYER__LOGS_PER_POLLING_INTERVAL,
        10
      ),
      dangerouslyCatchAllErrors:
        process.env.DATA_TRANSPORT_LAYER__DANGEROUSLY_CATCH_ALL_ERRORS ===
        'true',
      l2RpcProvider: process.env.DATA_TRANSPORT_LAYER__L2_RPC_ENDPOINT,
      syncFromL2: process.env.DATA_TRANSPORT_LAYER__SYNC_FROM_L2 === 'true',
      showUnconfirmedTransactions:
        process.env.DATA_TRANSPORT_LAYER__SYNC_FROM_L2 === 'true',
      transactionsPerPollingInterval: parseInt(
        process.env.DATA_TRANSPORT_LAYER__TRANSACTIONS_PER_POLLING_INTERVAL,
        10
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
