import * as dotenv from 'dotenv'
import { L1IngestionService } from '../l1-ingestion/service'

const main = async () => {
  dotenv.config()

  const service = new L1IngestionService({
    db: process.env.L1_TRANSPORT__DB_PATH,
    addressManager: process.env.L1_TRANSPORT__ADDRESS_MANAGER,
    confirmations: parseInt(process.env.L1_TRANSPORT__CONFIRMATIONS, 10),
    l1RpcEndpoint: process.env.L1_TRANSPORT__L1_RPC_ENDPOINT,
    pollingInterval: parseInt(process.env.L1_TRANSPORT__POLLING_INTERVAL, 10),
    logsPerPollingInterval: parseInt(
      process.env.L1_TRANSPORT__LOGS_PER_POLLING_INTERVAL,
      10
    ),
  })

  await service.start()
}

main()
