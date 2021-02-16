/* Imports: External */
import level from 'level'
import { BaseService } from '@eth-optimism/service-base'

/* Imports: Internal */
import {
  L1IngestionService,
  L1IngestionServiceOptions,
} from '../l1-ingestion/service'
import { L1TransportServer, L1TransportServerOptions } from '../server/service'
import {
  L2IngestionService,
  L2IngestionServiceOptions,
} from '../l2-ingestion/service'

type L1DataTransportServiceOptions = L1IngestionServiceOptions &
  L1TransportServerOptions &
  Partial<L2IngestionServiceOptions> & {
    syncFromL2?: boolean
  }

export class L1DataTransportService extends BaseService<L1DataTransportServiceOptions> {
  protected name = 'L1 Data Transport Service'

  private state: {
    db: any
    l1IngestionService: L1IngestionService
    l1TransportServer: L1TransportServer
    l2IngestionService?: L2IngestionService
  } = {} as any

  protected async _init(): Promise<void> {
    this.state.db = level(this.options.db)
    await this.state.db.open()

    this.state.l1IngestionService = new L1IngestionService({
      ...this.options,
      db: this.state.db,
    })

    this.state.l1TransportServer = new L1TransportServer({
      ...this.options,
      db: this.state.db,
    })

    // Optionally enable sync from L2.
    if (this.options.syncFromL2) {
      this.state.l2IngestionService = new L2IngestionService({
        ...(this.options as any), // TODO: Correct thing to do here is to assert this type.
        db: this.state.db,
      })
    }

    await this.state.l1IngestionService.init()
    await this.state.l1TransportServer.init()

    if (this.options.syncFromL2) {
      await this.state.l2IngestionService.init()
    }
  }

  protected async _start(): Promise<void> {
    await Promise.all([
      this.state.l1IngestionService.start(),
      this.state.l1TransportServer.start(),
    ])
  }

  protected async _stop(): Promise<void> {
    await Promise.all([
      this.state.l1IngestionService.stop(),
      this.state.l1TransportServer.stop(),
    ])

    await this.state.db.close()
  }
}
