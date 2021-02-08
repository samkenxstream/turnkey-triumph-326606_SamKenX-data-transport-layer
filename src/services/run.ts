/* Imports: External */
import * as dotenv from 'dotenv'

/* Imports: Internal */
import { L1DataTransportService } from './main/service'

// TODO: Maybe throw this into its own service instead of doing this here.
const main = async () => {
  dotenv.config()

  const service = new L1DataTransportService({
    db: process.env.L1_TRANSPORT__DB_PATH,
    port: parseInt(process.env.L1_TRANSPORT__SERVER_PORT, 10),
    confirmations: parseInt(process.env.L1_TRANSPORT__CONFIRMATIONS, 10),
    l1RpcProvider: process.env.L1_TRANSPORT__L1_RPC_ENDPOINT,
    addressManager: process.env.L1_TRANSPORT__ADDRESS_MANAGER,
    pollingInterval: parseInt(process.env.L1_TRANSPORT__POLLING_INTERVAL, 10),
    logsPerPollingInterval: parseInt(
      process.env.L1_TRANSPORT__LOGS_PER_POLLING_INTERVAL,
      10
    ),
    dangerouslyCatchAllErrors:
      process.env.L1_TRANSPORT__DANGEROUSLY_CATCH_ALL_ERRORS === 'true',
  })

  await service.start()
}

main()
