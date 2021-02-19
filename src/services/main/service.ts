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
import { validators } from '../../utils'

type L1DataTransportServiceOptions = L1IngestionServiceOptions &
  L1TransportServerOptions &
  L2IngestionServiceOptions & {
    syncFromL1: boolean
    syncFromL2: boolean
  }

export class L1DataTransportService extends BaseService<L1DataTransportServiceOptions> {
  protected name = 'L1 Data Transport Service'

  protected optionSettings = {
    syncFromL1: {
      default: true,
      validate: validators.isBoolean,
    },
    syncFromL2: {
      default: false,
      validate: validators.isBoolean,
    },
  }

  private state: {
    db: any
    l1IngestionService?: L1IngestionService
    l2IngestionService?: L2IngestionService
    l1TransportServer: L1TransportServer
  } = {} as any

  protected async _init(): Promise<void> {
    this.state.db = level(this.options.db)
    await this.state.db.open()

    this.state.l1TransportServer = new L1TransportServer({
      ...this.options,
      db: this.state.db,
    })

    // Optionally enable sync from L1.
    if (this.options.syncFromL1) {
      this.state.l1IngestionService = new L1IngestionService({
        ...this.options,
        db: this.state.db,
      })
    }

    // Optionally enable sync from L2.
    if (this.options.syncFromL2) {
      this.state.l2IngestionService = new L2IngestionService({
        ...(this.options as any), // TODO: Correct thing to do here is to assert this type.
        db: this.state.db,
      })
    }

    await this.state.l1TransportServer.init()

    if (this.options.syncFromL1) {
      await this.state.l1IngestionService.init()
    }

    if (this.options.syncFromL2) {
      await this.state.l2IngestionService.init()
    }
  }

  protected async _start(): Promise<void> {
    await Promise.all([
      this.state.l1TransportServer.start(),
      this.options.syncFromL1 ? this.state.l1IngestionService.start() : null,
      this.options.syncFromL2 ? this.state.l2IngestionService.start() : null,
    ])
  }

  protected async _stop(): Promise<void> {
    await Promise.all([
      this.state.l1TransportServer.stop(),
      this.options.syncFromL1 ? this.state.l1IngestionService.stop() : null,
      this.options.syncFromL2 ? this.state.l2IngestionService.stop() : null,
    ])

    await this.state.db.close()
  }
}
