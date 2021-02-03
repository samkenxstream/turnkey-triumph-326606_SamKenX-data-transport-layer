import { expect } from '../setup'
import rimraf from 'rimraf'
import { L1DataTransportService } from '../../src/services/main/service'
import { sleep } from '../../src/utils'
import { getContractFactory } from '@eth-optimism/contracts'
import { Contract, Signer } from 'ethers'
import { ethers } from 'hardhat'

const DEFAULT_TEST_OPTIONS = {
  db: './db',
  port: 7878,
  confirmations: 0,
  l1RpcEndpoint: 'http://localhost:8545',
  pollingInterval: 10,
  logsPerPollingInterval: 2000,
}

// TODO: We'll likely have some code repetition here until we see the larger patterns. We'll
// eventually want some sort of framework for these tests.
describe('[L1 Data Transport Layer]: Basic Tests', () => {
  let signer: Signer
  before(async () => {
    ;[signer] = await ethers.getSigners()
  })

  let Lib_AddressManager: Contract
  beforeEach(async () => {
    Lib_AddressManager = await getContractFactory('Lib_AddressManager')
      .connect(signer)
      .deploy()
  })

  let service: L1DataTransportService
  beforeEach(async () => {
    if (service) {
      await service.stop()
    }

    rimraf.sync(DEFAULT_TEST_OPTIONS.db)

    service = new L1DataTransportService({
      ...DEFAULT_TEST_OPTIONS,
      addressManager: Lib_AddressManager.address,
    })

    // TODO: We really need better feedback to figure out when the service is started.
    service.start()
    await sleep(1000)
  })

  describe('Handling TransactionEnqueued events', () => {
    it('should be able to handle a single event', async () => {
      expect(true).to.equal(true)
    })

    it('should be able to handle multiple events in the same block', async () => {})

    it('should be able to handle multiple events in different blocks', async () => {})

    it('should be able to handle events from multiple different addresses', async () => {})
  })
})
