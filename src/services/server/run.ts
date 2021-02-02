/* Imports: External */
import * as dotenv from 'dotenv'

/* Imports: Internal */
import { L1TransportServer } from './service'

const main = async () => {
  dotenv.config()

  const service = new L1TransportServer({
    db: process.env.L1_TRANSPORT__DB_PATH,
    port: parseInt(process.env.L1_TRANSPORT__SERVER_PORT, 10),
    confirmations: parseInt(process.env.L1_TRANSPORT__CONFIRMATIONS, 10),
    l1RpcEndpoint: process.env.L1_TRANSPORT__L1_RPC_ENDPOINT,
  })

  await service.start()
}

main()
