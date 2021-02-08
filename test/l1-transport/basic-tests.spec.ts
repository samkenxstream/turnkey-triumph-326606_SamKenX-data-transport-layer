import { expect } from '../setup'

/* Imports: External */
import rimraf from 'rimraf'
import { getContractFactory } from '@eth-optimism/contracts'
import { encodeAppendSequencerBatch, ctcCoder } from '@eth-optimism/core-utils'
import { Contract, providers, Signer } from 'ethers'
import { ethers } from 'hardhat'

/* Imports: Internal */
import { L1DataTransportService } from '../../src/services/main/service'
import { L1DataTransportClient } from '../../src/client/client'
import { sleep } from '../../src/utils'

const DEFAULT_TEST_OPTIONS = {
  db: './db',
  port: 7878,
  confirmations: 0,
  l1RpcProvider: ethers.provider,
  pollingInterval: 10,
  logsPerPollingInterval: 2000,
}

// TODO: We'll likely have some code repetition here until we see the larger patterns. We'll
// eventually want some sort of framework for these tests.
describe('[L1 Data Transport Layer]: Integration Tests', () => {
  let signer: Signer
  before(async () => {
    ;[signer] = await ethers.getSigners()
  })

  let Lib_AddressManager: Contract
  let Mock_CanonicalTransactionChain: Contract
  let Mock_StateCommitmentChain: Contract
  let Mock_ExecutionManager: Contract
  beforeEach(async () => {
    Lib_AddressManager = await getContractFactory('Lib_AddressManager')
      .connect(signer)
      .deploy()

    Mock_CanonicalTransactionChain = await (
      await ethers.getContractFactory('Mock_CanonicalTransactionChain')
    )
      .connect(signer)
      .deploy()

    Mock_StateCommitmentChain = await (
      await ethers.getContractFactory('Mock_StateCommitmentChain')
    )
      .connect(signer)
      .deploy()

    Mock_ExecutionManager = await (
      await ethers.getContractFactory('Mock_ExecutionManager')
    )
      .connect(signer)
      .deploy()

    await Lib_AddressManager.setAddress(
      'OVM_CanonicalTransactionChain',
      Mock_CanonicalTransactionChain.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_StateCommitmentChain',
      Mock_StateCommitmentChain.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ExecutionManager',
      Mock_ExecutionManager.address
    )
  })

  let service: L1DataTransportService
  beforeEach(async () => {
    if (service) {
      await service.stop()
      await sleep(1000)
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

  let client: L1DataTransportClient
  beforeEach(async () => {
    client = new L1DataTransportClient(
      `http://localhost:${DEFAULT_TEST_OPTIONS.port}`
    )
  })

  describe('Handling TransactionEnqueued events', () => {
    for (const enqueues of [1, 2, 4, 8, 16, 32, 64]) {
      it(`should be able to process ${enqueues} TransactionEnqueued event(s)`, async () => {
        const target = '0x1111111111111111111111111111111111111111' // Fixed target address.
        const gasLimit = 5_000_000 // Fixed gas limit.
        const data = '0x' + '12'.repeat(420) // Fixed data size.

        const timestamps = []
        const blocks = []
        for (let i = 0; i < enqueues; i++) {
          timestamps.push(Math.floor(Date.now() / 1000))

          const response = await Mock_CanonicalTransactionChain.emitTransactionEnqueued(
            {
              l1TxOrigin: await signer.getAddress(),
              target: target,
              gasLimit: gasLimit,
              data: data,
              queueIndex: i,
              timestamp: timestamps[i],
            }
          )

          const receipt = await response.wait()
          const block = await ethers.provider.getBlock(receipt.blockNumber)
          blocks.push(block)
        }

        await sleep(1000)

        for (let i = 0; i < enqueues; i++) {
          expect(await client.getEnqueueByIndex(i)).to.deep.equal({
            index: i,
            target: target,
            data: data,
            gasLimit: gasLimit,
            origin: await signer.getAddress(),
            blockNumber: blocks[i].number,
            timestamp: timestamps[i],
          })
        }
      })
    }
  })

  describe('Handling multiple ingestion of TransactionEnqueued events', () => {
    for (const enqueues of [1, 2, 4, 8, 16]) {
      it(`should be able to process ${enqueues} TransactionEnqueued event(s)`, async () => {
        const target = '0x1111111111111111111111111111111111111111' // Fixed target address.
        const gasLimit = 5_000_000 // Fixed gas limit.
        const data = '0x' + '12'.repeat(420) // Fixed data size.

        const timestamp = Math.floor(Date.now() / 1000)
        const origin = await signer.getAddress()

        const response = await Mock_CanonicalTransactionChain.emitMultipleTransactionEnqueued(
          [...Array(enqueues)].map(() => {
            return {
              l1TxOrigin: origin,
              target: target,
              gasLimit: gasLimit,
              data: data,
              queueIndex: 0,
              timestamp: timestamp,
            }
          })
        )

        const receipt = await response.wait()
        const block = await ethers.provider.getBlock(receipt.blockNumber)

        await sleep(1000)

        expect(await client.getEnqueueByIndex(0)).to.deep.equal({
          index: 0,
          target: target,
          data: data,
          gasLimit: gasLimit,
          origin: await signer.getAddress(),
          blockNumber: block.number,
          timestamp: timestamp,
        })

        for (let i = 1; i < enqueues; i++) {
          expect(await client.getEnqueueByIndex(i)).to.deep.equal(null)
        }
      })
    }
  })
})
